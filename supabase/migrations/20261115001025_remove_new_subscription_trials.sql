-- New subscriptions are billed immediately. Do not rewrite any historical
-- attempt, subscription, trial entitlement or launch allocation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create or replace function public.billing_begin_checkout(p_user_id uuid,p_plan text,p_customer_id text,p_price_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing public.billing_checkout_attempts; created public.billing_checkout_attempts; available integer;
begin
 if p_plan not in ('monthly','annual','launch') then raise exception 'INVALID_PLAN'; end if;
 perform 1 from public.billing_launch_pool where id for update;
 if not exists(select 1 from public.billing_customers where user_id=p_user_id and stripe_customer_id=p_customer_id) then raise exception 'BILLING_CUSTOMER_MISMATCH'; end if;
 select * into existing from public.billing_checkout_attempts where user_id=p_user_id and status in ('reserved','open') for update;
 if found then
  if existing.plan<>p_plan then raise exception 'CHECKOUT_PLAN_PENDING'; end if;
  -- The handler reconciles and expires unconfirmed legacy sessions with Stripe.
  -- Never silently turn their promised free trial into an immediate payment.
  return to_jsonb(existing);
 end if;
 if p_plan='launch' then
  select public.billing_launch_remaining() into available;
  if available is null or available<=0 then raise exception 'LAUNCH_SOLD_OUT'; end if;
 end if;
 insert into public.billing_checkout_attempts(user_id,plan,stripe_customer_id,stripe_price_id,trial_enabled)
 values(p_user_id,p_plan,p_customer_id,p_price_id,false) returning * into created;
 return to_jsonb(created);
end; $$;
revoke all on function public.billing_begin_checkout(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.billing_begin_checkout(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
