-- Aggregate administration only. No member identity or sensitive tracking data is returned.
create schema if not exists sobrizen_admin;
revoke all on schema sobrizen_admin from public, anon, authenticated;
grant usage on schema sobrizen_admin to authenticated;

create table sobrizen_admin.operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table sobrizen_admin.operators enable row level security;
revoke all on sobrizen_admin.operators from public, anon, authenticated;
comment on table sobrizen_admin.operators is 'Server-managed allowlist for aggregate statistics. No self-enrollment or user_metadata authorization.';

create function sobrizen_admin.statistics(p_days integer)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_start timestamptz;
  v_end timestamptz;
  v_daily jsonb;
  v_plans jsonb;
  v_accounts jsonb;
  v_subscriptions jsonb;
begin
  if v_user is null or not exists (
    select 1 from sobrizen_admin.operators o join auth.users u on u.id=o.user_id
    where o.user_id=v_user and u.deleted_at is null and u.email_confirmed_at is not null
  ) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_days is null or p_days not in (7,30,90) then
    raise exception 'INVALID_PERIOD' using errcode='22023';
  end if;
  v_start := (v_today-(p_days-1))::timestamp at time zone 'Europe/Paris';
  v_end := (v_today+1)::timestamp at time zone 'Europe/Paris';

  select jsonb_build_object(
    'total', count(*),
    'confirmed', count(*) filter (where email_confirmed_at is not null),
    'today', count(*) filter (where created_at >= v_today::timestamp at time zone 'Europe/Paris' and created_at < v_end),
    'yesterday', count(*) filter (where created_at >= (v_today-1)::timestamp at time zone 'Europe/Paris' and created_at < v_today::timestamp at time zone 'Europe/Paris'),
    'period', count(*) filter (where created_at >= v_start and created_at < v_end)
  ) into v_accounts from auth.users where deleted_at is null and not coalesce(is_anonymous,false);

  with days as (select (v_today-n)::date as day from generate_series(0,p_days-1) n),
  counts as (
    select (created_at at time zone 'Europe/Paris')::date as day, count(*) as registrations
    from auth.users where deleted_at is null and not coalesce(is_anonymous,false) and created_at >= v_start and created_at < v_end
    group by 1
  )
  select jsonb_agg(jsonb_build_object('day',d.day,'registrations',coalesce(c.registrations,0)) order by d.day)
  into v_daily from days d left join counts c using(day);

  select jsonb_build_object(
    'active_paid',count(*) filter (where status='active' and paid_until>now() and not coalesce(access_blocked,false)),
    'trialing',count(*) filter (where status='trialing' and trial_until>now() and not coalesce(access_blocked,false)),
    'payment_pending',count(*) filter (where status in ('past_due','unpaid','incomplete')),
    'cancel_at_period_end',count(*) filter (where status='active' and paid_until>now() and not coalesce(access_blocked,false) and cancel_at_period_end)
  ) into v_subscriptions from public.billing_subscriptions;

  select coalesce(jsonb_agg(jsonb_build_object('plan',plan,'count',n) order by plan),'[]'::jsonb) into v_plans
  from (select coalesce(plan,'unknown') as plan,count(*) as n from public.billing_subscriptions
    where status='active' and paid_until>now() and not coalesce(access_blocked,false) group by 1) plans;

  return jsonb_build_object('version',1,'generated_at',now(),'timezone','Europe/Paris',
    'days',p_days,'from',(v_today-(p_days-1)),'through',v_today,
    'accounts',v_accounts,'daily',v_daily,'subscriptions',v_subscriptions,'plans',v_plans);
end;
$$;
revoke all on function sobrizen_admin.statistics(integer) from public, anon, authenticated;
grant execute on function sobrizen_admin.statistics(integer) to authenticated;

-- PostgREST exposes only this invoker wrapper. The privileged implementation stays private.
create function public.sobrizen_admin_statistics(p_days integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select sobrizen_admin.statistics(p_days); $$;
revoke all on function public.sobrizen_admin_statistics(integer) from public, anon, authenticated;
grant execute on function public.sobrizen_admin_statistics(integer) to authenticated;
comment on function public.sobrizen_admin_statistics(integer) is 'Aggregate statistics; verified auth.uid must be on the private server-managed operator allowlist.';
