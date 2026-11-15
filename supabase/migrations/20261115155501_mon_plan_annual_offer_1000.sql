-- New annual offer: 17.99 EUR, first 1,000 subscriptions, recurring price
-- preserved while that subscription remains active. Apply with sales closed,
-- then deploy the matching handler. Existing prices, trials and rows are retained.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.billing_annual_pool (
 id boolean primary key default true check(id),
 capacity integer not null default 1000 check(capacity=1000)
);
insert into public.billing_annual_pool(id,capacity) values(true,1000) on conflict(id) do nothing;
alter table public.billing_annual_pool enable row level security;
revoke all on public.billing_annual_pool from public,anon,authenticated;
grant all on public.billing_annual_pool to service_role;
create index if not exists billing_annual_offer_capacity on public.billing_checkout_attempts(status)
 where stripe_price_id='price_1Uc4WZB6h4U0FlMox1pwl1Lj';

-- Only a boolean leaves the service boundary. Completed allocations continue
-- counting after cancellation or account deletion; reservations require a
-- confirmed Stripe expiry, never just an elapsed local clock, before release.
create or replace function public.billing_annual_available() returns boolean
language sql stable security invoker set search_path='' as $$
 select (select count(*) from public.billing_checkout_attempts a
  where a.stripe_price_id='price_1Uc4WZB6h4U0FlMox1pwl1Lj' and a.status in ('reserved','open','completed')) < p.capacity
 from public.billing_annual_pool p where p.id;
$$;

create or replace function public.billing_begin_checkout(p_user_id uuid,p_plan text,p_customer_id text,p_price_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing public.billing_checkout_attempts; created public.billing_checkout_attempts; available boolean;
begin
 if p_plan is null or p_plan not in ('monthly','annual') then raise exception 'INVALID_PLAN'; end if;
 if p_price_id is distinct from (case p_plan when 'monthly' then 'price_1UZzodB6h4U0FlMoqyWxNKjy' else 'price_1Uc4WZB6h4U0FlMox1pwl1Lj' end) then raise exception 'PRICE_MISMATCH'; end if;
 -- A common row lock serializes all allocations across database connections.
 perform 1 from public.billing_annual_pool where id for update;
 if not found then raise exception 'ANNUAL_OFFER_UNAVAILABLE'; end if;
 if not exists(select 1 from public.billing_customers where user_id=p_user_id and stripe_customer_id=p_customer_id) then raise exception 'BILLING_CUSTOMER_MISMATCH'; end if;
 select * into existing from public.billing_checkout_attempts where user_id=p_user_id and status in ('reserved','open') for update;
 if found then
  if existing.plan<>p_plan or existing.stripe_price_id<>p_price_id then raise exception 'CHECKOUT_PLAN_PENDING'; end if;
  return to_jsonb(existing);
 end if;
 if p_plan='annual' then
  select public.billing_annual_available() into available;
  if available is not true then raise exception 'ANNUAL_SOLD_OUT'; end if;
 end if;
 insert into public.billing_checkout_attempts(user_id,plan,stripe_customer_id,stripe_price_id,trial_enabled)
 values(p_user_id,p_plan,p_customer_id,p_price_id,false) returning * into created;
 return to_jsonb(created);
end; $$;

-- Separate scheduled cancellation from the entitlement's verified paid end.
alter table public.billing_subscriptions add column if not exists currency text not null default 'eur' check(currency='eur');
alter table public.billing_subscriptions add column if not exists "interval" text check("interval" in ('month','year'));
alter table public.billing_subscriptions add column if not exists interval_count integer not null default 1 check(interval_count=1);
alter table public.billing_subscriptions add column if not exists current_period_start timestamptz;
alter table public.billing_subscriptions add column if not exists current_period_end timestamptz;
alter table public.billing_subscriptions add column if not exists cancel_at timestamptz;
update public.billing_subscriptions set "interval"=case when plan='monthly' then 'month' else 'year' end where "interval" is null;

create or replace function public.billing_save_snapshot_v2(p_user_id uuid,p_snapshot jsonb,p_checked_at timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s jsonb:=p_snapshot; started timestamptz; amount integer; period text;
begin
 if not exists(select 1 from public.billing_customers where user_id=p_user_id and stripe_customer_id=s->>'stripe_customer_id') then raise exception 'BILLING_CUSTOMER_MISMATCH'; end if;
 amount:=(s->>'unit_amount')::integer;
 if not coalesce(((s->>'plan'='monthly' and amount=299) or (s->>'plan'='annual' and amount in (1799,2999)) or (s->>'plan'='launch' and amount=1999)),false) then raise exception 'INVALID_PLAN'; end if;
 period:=case when s->>'plan'='monthly' then 'month' else 'year' end;
 if coalesce(s->>'currency','eur')<>'eur' or coalesce(s->>'interval',period)<>period or coalesce((s->>'interval_count')::integer,1)<>1 then raise exception 'INVALID_PLAN'; end if;
 started:=(s->>'original_started_at')::timestamptz;
 insert into public.billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,paid_until,trial_until,plan,unit_amount,stripe_price_id,access_blocked,cancel_at_period_end,original_started_at,checked_at,currency,"interval",interval_count,current_period_start,current_period_end,cancel_at)
 values(s->>'stripe_subscription_id',p_user_id,s->>'stripe_customer_id',s->>'status',(s->>'paid_until')::timestamptz,(s->>'trial_until')::timestamptz,s->>'plan',amount,s->>'stripe_price_id',coalesce((s->>'access_blocked')::boolean,false),coalesce((s->>'cancel_at_period_end')::boolean,false) or s->>'cancel_at' is not null,started,p_checked_at,'eur',period,1,(s->>'current_period_start')::timestamptz,(s->>'current_period_end')::timestamptz,(s->>'cancel_at')::timestamptz)
 on conflict(stripe_subscription_id) do update set status=excluded.status,paid_until=excluded.paid_until,trial_until=excluded.trial_until,plan=excluded.plan,unit_amount=excluded.unit_amount,stripe_price_id=excluded.stripe_price_id,access_blocked=excluded.access_blocked,cancel_at_period_end=excluded.cancel_at_period_end,checked_at=excluded.checked_at,updated_at=now(),currency=excluded.currency,"interval"=excluded."interval",interval_count=excluded.interval_count,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at=excluded.cancel_at
 where public.billing_subscriptions.user_id=excluded.user_id and public.billing_subscriptions.stripe_customer_id=excluded.stripe_customer_id and public.billing_subscriptions.checked_at<=excluded.checked_at;
 if s->>'trial_until' is not null or s->>'paid_until' is not null then
  update public.billing_customers set trial_used_at=coalesce(trial_used_at,now()) where user_id=p_user_id;
  insert into public.subscription_anchors(user_id,started_on,source) values(p_user_id,(started at time zone 'Europe/Paris')::date,'stripe_verified')
  on conflict(user_id) do update set started_on=least(public.subscription_anchors.started_on,excluded.started_on),source='stripe_verified';
 end if;
 return jsonb_build_object('ok',true);
end; $$;

-- Shared across Edge instances and tabs: explicit refresh may read Stripe at
-- most once per 30 seconds for each owner. Webhook processing is never throttled.
alter table public.billing_customers add column if not exists last_sync_requested_at timestamptz;
create or replace function public.billing_take_sync_slot(p_user_id uuid,p_cooldown_seconds integer default 30) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_cooldown_seconds is null or p_cooldown_seconds<30 or p_cooldown_seconds>300 then raise exception 'INVALID_SYNC_COOLDOWN'; end if;
 update public.billing_customers set last_sync_requested_at=now()
 where user_id=p_user_id and (last_sync_requested_at is null or last_sync_requested_at<=now()-make_interval(secs=>p_cooldown_seconds));
 return found;
end; $$;

revoke all on function public.billing_annual_available(),public.billing_begin_checkout(uuid,text,text,text),public.billing_save_snapshot_v2(uuid,jsonb,timestamptz),public.billing_take_sync_slot(uuid,integer) from public,anon,authenticated;
grant execute on function public.billing_annual_available(),public.billing_begin_checkout(uuid,text,text,text),public.billing_save_snapshot_v2(uuid,jsonb,timestamptz),public.billing_take_sync_slot(uuid,integer) to service_role;
update public.billing_config set terms_version='2026-11-15' where id;
comment on table public.billing_annual_pool is 'Service-owned first 1000 annual 17.99 EUR allocations. No exact count is exposed to members or anonymous visitors.';
notify pgrst,'reload schema';
commit;
