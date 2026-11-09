-- Premium v2. Service-owned billing state; no browser can grant an entitlement.
-- Run before the new edge function and frontend. Readiness is deliberately unchanged.
alter table public.billing_subscriptions add column if not exists trial_until timestamptz;
alter table public.billing_subscriptions add column if not exists plan text;
alter table public.billing_subscriptions add column if not exists unit_amount integer;
alter table public.billing_subscriptions add column if not exists stripe_price_id text;
alter table public.billing_subscriptions add column if not exists access_blocked boolean not null default false;
alter table public.billing_customers add column if not exists trial_used_at timestamptz;

create table if not exists public.billing_launch_pool (
 id boolean primary key default true check(id),
 capacity integer not null default 100 check(capacity=100)
);
insert into public.billing_launch_pool(id,capacity) values(true,100) on conflict(id) do nothing;
create table if not exists public.billing_checkout_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 plan text not null check(plan in ('monthly','annual','launch')),
 stripe_customer_id text not null check(stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 stripe_price_id text not null check(stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
 trial_enabled boolean not null,
 status text not null default 'reserved' check(status in ('reserved','open','completed','expired','failed')),
 stripe_session_id text unique,
 stripe_session_url text,
 stripe_subscription_id text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '1 hour'),
 settled_at timestamptz,
 check(expires_at>created_at)
);
create unique index if not exists billing_one_pending_checkout on public.billing_checkout_attempts(user_id) where status in ('reserved','open');
create index if not exists billing_launch_capacity on public.billing_checkout_attempts(status) where plan='launch';
create index if not exists billing_attempt_customer on public.billing_checkout_attempts(stripe_customer_id);
create table if not exists public.billing_risk_flags (
 stripe_charge_id text not null,
 reason text not null check(reason in ('dispute','early_fraud_warning')),
 stripe_subscription_id text not null,
 active boolean not null,
 updated_at timestamptz not null default now(),
 primary key(stripe_charge_id,reason)
);
create index if not exists billing_risk_subscription on public.billing_risk_flags(stripe_subscription_id) where active;

alter table public.billing_launch_pool enable row level security;
alter table public.billing_checkout_attempts enable row level security;
alter table public.billing_risk_flags enable row level security;
revoke all on public.billing_launch_pool,public.billing_checkout_attempts,public.billing_risk_flags from public,anon,authenticated;
grant all on public.billing_launch_pool,public.billing_checkout_attempts,public.billing_risk_flags to service_role;

create or replace function public.billing_launch_remaining() returns integer
language sql stable security invoker set search_path='' as $$
 select greatest(0,p.capacity-(select count(*)::integer from public.billing_checkout_attempts a where a.plan='launch' and a.status in ('reserved','open','completed'))) from public.billing_launch_pool p where p.id;
$$;

create or replace function public.billing_begin_checkout(p_user_id uuid,p_plan text,p_customer_id text,p_price_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing public.billing_checkout_attempts; created public.billing_checkout_attempts; available integer; eligible boolean;
begin
 if p_plan not in ('monthly','annual','launch') then raise exception 'INVALID_PLAN'; end if;
 -- All allocations use this single lock, including retries, to cap launch seats atomically.
 perform 1 from public.billing_launch_pool where id for update;
 if not exists(select 1 from public.billing_customers where user_id=p_user_id and stripe_customer_id=p_customer_id) then raise exception 'BILLING_CUSTOMER_MISMATCH'; end if;
 select * into existing from public.billing_checkout_attempts where user_id=p_user_id and status in ('reserved','open') for update;
 if found then
  if existing.plan<>p_plan then raise exception 'CHECKOUT_PLAN_PENDING'; end if;
  return to_jsonb(existing);
 end if;
 if p_plan='launch' then
  select public.billing_launch_remaining() into available;
  if available is null or available<=0 then raise exception 'LAUNCH_SOLD_OUT'; end if;
 end if;
 select c.trial_used_at is null and not exists(select 1 from public.billing_subscriptions s where s.user_id=p_user_id) into eligible from public.billing_customers c where c.user_id=p_user_id;
 insert into public.billing_checkout_attempts(user_id,plan,stripe_customer_id,stripe_price_id,trial_enabled)
 values(p_user_id,p_plan,p_customer_id,p_price_id,coalesce(eligible,false)) returning * into created;
 return to_jsonb(created);
end; $$;

create or replace function public.billing_attach_checkout(p_attempt_id uuid,p_session_id text,p_session_url text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.billing_checkout_attempts;
begin
 if p_session_id is null or p_session_url is null or p_session_id !~ '^cs_(live|test)_[A-Za-z0-9]+$' or p_session_url !~ '^https://checkout[.]stripe[.]com/' then raise exception 'INVALID_CHECKOUT'; end if;
 update public.billing_checkout_attempts set stripe_session_id=p_session_id,stripe_session_url=p_session_url,status=case when status='reserved' then 'open' else status end
 where id=p_attempt_id and status in ('reserved','open','completed') and (stripe_session_id is null or stripe_session_id=p_session_id) returning * into a;
 if not found then raise exception 'CHECKOUT_STATE_CONFLICT'; end if;
 return to_jsonb(a);
end; $$;

create or replace function public.billing_settle_checkout(p_attempt_id uuid,p_status text,p_session_id text default null,p_subscription_id text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.billing_checkout_attempts;
begin
 if p_status not in ('completed','expired','failed') then raise exception 'INVALID_CHECKOUT_STATUS'; end if;
 perform 1 from public.billing_launch_pool where id for update;
 select * into a from public.billing_checkout_attempts where id=p_attempt_id for update;
 if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 if a.stripe_session_id is not null and p_session_id is distinct from a.stripe_session_id then raise exception 'CHECKOUT_SESSION_MISMATCH'; end if;
 -- Never recycle a completed launch seat, including cancellation/account deletion.
 if a.status='completed' then return to_jsonb(a); end if;
 if a.status in ('expired','failed') then
  if a.status<>p_status then raise exception 'CHECKOUT_STATE_CONFLICT'; end if;
  return to_jsonb(a);
 end if;
 if p_status='completed' and (p_session_id is null or p_session_id !~ '^cs_(live|test)_[A-Za-z0-9]+$' or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9]+$') then raise exception 'INVALID_CHECKOUT_COMPLETION'; end if;
 if p_status='failed' and a.stripe_session_id is not null then raise exception 'CHECKOUT_EXPIRY_REQUIRED'; end if;
 update public.billing_checkout_attempts set status=p_status,stripe_session_id=coalesce(stripe_session_id,p_session_id),stripe_subscription_id=coalesce(p_subscription_id,stripe_subscription_id),settled_at=now() where id=a.id returning * into a;
 if p_status='completed' and a.trial_enabled then update public.billing_customers set trial_used_at=coalesce(trial_used_at,now()) where user_id=a.user_id; end if;
 return to_jsonb(a);
end; $$;

create or replace function public.billing_save_snapshot_v2(p_user_id uuid,p_snapshot jsonb,p_checked_at timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s jsonb:=p_snapshot; started timestamptz;
begin
 if not exists(select 1 from public.billing_customers where user_id=p_user_id and stripe_customer_id=s->>'stripe_customer_id') then raise exception 'BILLING_CUSTOMER_MISMATCH'; end if;
 if s->>'plan' not in ('monthly','annual','launch') or (s->>'unit_amount')::integer <> (case s->>'plan' when 'monthly' then 299 when 'annual' then 2999 else 1999 end) then raise exception 'INVALID_PLAN'; end if;
 started:=(s->>'original_started_at')::timestamptz;
 insert into public.billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,paid_until,trial_until,plan,unit_amount,stripe_price_id,access_blocked,cancel_at_period_end,original_started_at,checked_at)
 values(s->>'stripe_subscription_id',p_user_id,s->>'stripe_customer_id',s->>'status',(s->>'paid_until')::timestamptz,(s->>'trial_until')::timestamptz,s->>'plan',(s->>'unit_amount')::integer,s->>'stripe_price_id',coalesce((s->>'access_blocked')::boolean,false),coalesce((s->>'cancel_at_period_end')::boolean,false),started,p_checked_at)
 on conflict(stripe_subscription_id) do update set status=excluded.status,paid_until=excluded.paid_until,trial_until=excluded.trial_until,plan=excluded.plan,unit_amount=excluded.unit_amount,stripe_price_id=excluded.stripe_price_id,access_blocked=excluded.access_blocked,cancel_at_period_end=excluded.cancel_at_period_end,checked_at=excluded.checked_at,updated_at=now()
 where public.billing_subscriptions.user_id=excluded.user_id and public.billing_subscriptions.stripe_customer_id=excluded.stripe_customer_id and public.billing_subscriptions.checked_at<=excluded.checked_at;
 if s->>'trial_until' is not null or s->>'paid_until' is not null then
  update public.billing_customers set trial_used_at=coalesce(trial_used_at,now()) where user_id=p_user_id;
  insert into public.subscription_anchors(user_id,started_on,source) values(p_user_id,(started at time zone 'Europe/Paris')::date,'stripe_verified')
  on conflict(user_id) do update set started_on=least(public.subscription_anchors.started_on,excluded.started_on),source='stripe_verified';
 end if;
 return jsonb_build_object('ok',true);
end; $$;

-- Used by the browser's own RLS-visible records, and by agenda/game RPCs.
create or replace function public.sobrizen_has_premium() returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.billing_subscriptions s where s.user_id=(select auth.uid()) and not s.access_blocked and ((s.status in ('active','past_due') and s.paid_until>now()) or (s.status='trialing' and s.trial_until>now())))
 or exists(select 1 from public.premium_test_grants g where g.user_id=(select auth.uid()) and g.expires_at>now());
$$;
revoke all on function public.sobrizen_has_premium() from public,anon;
grant execute on function public.sobrizen_has_premium() to authenticated,service_role;
revoke all on function public.billing_launch_remaining(),public.billing_begin_checkout(uuid,text,text,text),public.billing_attach_checkout(uuid,text,text),public.billing_settle_checkout(uuid,text,text,text),public.billing_save_snapshot_v2(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_launch_remaining(),public.billing_begin_checkout(uuid,text,text,text),public.billing_attach_checkout(uuid,text,text),public.billing_settle_checkout(uuid,text,text,text),public.billing_save_snapshot_v2(uuid,jsonb,timestamptz) to service_role;

comment on table public.billing_checkout_attempts is 'Checkout reservations and permanent launch allocations. A clock alone never releases a reserved seat; Stripe must confirm expiration.';
comment on function public.sobrizen_has_premium() is 'Owner-only Premium entitlement including verified trials, paid periods and protected temporary grants.';
notify pgrst,'reload schema';
