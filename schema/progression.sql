-- Additive V3 upgrade. No deletion or reset of any pre-existing history.
alter table public.daily_checkins
 add column alcohol_units numeric(9,2),
 add column alcohol_cost_eur numeric(12,2),
 add column quantity_method text,
 add column drink_details jsonb,
 add constraint checkin_alcohol_units_range check (alcohol_units between 0 and 1000),
 add constraint checkin_alcohol_cost_range check (alcohol_cost_eur between 0 and 1000000),
 add constraint checkin_quantity_method check (quantity_method in ('standard','calculator')),
 add constraint checkin_quantity_consistency check (alcohol_units is null or (sober_today and alcohol_units=0) or (not sober_today and alcohol_units>0)),
 add constraint checkin_drink_array check (drink_details is null or case when jsonb_typeof(drink_details)='array' then jsonb_array_length(drink_details)<=20 else false end);

-- Compatibility with older installed clients: a change of status must not retain an old quantity.
create function public.normalize_checkin_quantity_v3() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.sober_today then
  new.alcohol_units:=0; new.quantity_method:='standard'; new.drink_details:=null;
 elsif tg_op='UPDATE' then
  if old.sober_today and new.alcohol_units is not distinct from old.alcohol_units then
   new.alcohol_units:=null; new.quantity_method:=null; new.drink_details:=null;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.normalize_checkin_quantity_v3() from public,anon,authenticated;
create trigger checkin_quantity_v3 before insert or update on public.daily_checkins for each row execute function public.normalize_checkin_quantity_v3();

create table public.progress_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 subscription_started_on date,
 baseline_units_week numeric(9,2) check (baseline_units_week between 0 and 7000),
 baseline_cost_week numeric(12,2) check (baseline_cost_week between 0 and 7000000),
 baseline_note text check (char_length(baseline_note)<=500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint progress_declared_date check (subscription_started_on between date '1900-01-01' and current_date+1)
);
comment on table public.progress_settings is 'Private self-reported comparison references. subscription_started_on is DECLARED, not billing proof or an entitlement.';
alter table public.progress_settings enable row level security;
revoke all on public.progress_settings from public,anon,authenticated;
grant select,insert,update on public.progress_settings to authenticated;
grant all on public.progress_settings to service_role;
create policy progress_settings_read on public.progress_settings for select to authenticated using ((select auth.uid())=user_id);
create policy progress_settings_insert on public.progress_settings for insert to authenticated with check ((select auth.uid())=user_id);
create policy progress_settings_update on public.progress_settings for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create function public.touch_progress_settings_v3() returns trigger language plpgsql security invoker set search_path='' as $$begin new.updated_at:=now();return new;end;$$;
revoke all on function public.touch_progress_settings_v3() from public,anon,authenticated;
create trigger progress_settings_touch before update on public.progress_settings for each row execute function public.touch_progress_settings_v3();

create table public.progress_chapters (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 effective_on date not null default current_date,
 mode text not null check (mode in ('abstain','reduce','observe')),
 weekly_limit numeric(9,2) check (weekly_limit between 0 and 7000),
 daily_limit numeric(9,2) check (daily_limit between 0 and 1000),
 planned_action text check (char_length(planned_action)<=500),
 support_first boolean not null default false,
 origin text not null default 'chosen' check (origin in ('chosen','legacy')),
 created_at timestamptz not null default now(),
 constraint chapter_targets check ((mode='reduce' and not support_first) or (weekly_limit is null and daily_limit is null)),
 constraint chapter_effective_date check (effective_on between date '1900-01-01' and current_date+1)
);
create index progress_chapters_user_date on public.progress_chapters(user_id,effective_on,created_at,id);
comment on table public.progress_chapters is 'Owner-private append-only goal history. Consumption and goal changes never erase prior chapters or achievements.';
alter table public.progress_chapters enable row level security;
revoke all on public.progress_chapters from public,anon,authenticated;
grant select,insert on public.progress_chapters to authenticated;
grant all on public.progress_chapters to service_role;
create policy progress_chapters_read on public.progress_chapters for select to authenticated using ((select auth.uid())=user_id);
create policy progress_chapters_insert on public.progress_chapters for insert to authenticated with check ((select auth.uid())=user_id and origin='chosen');

-- A verified subscription origin can only be supplied by trusted server-side billing integration.
-- No such integration or paid access is invented by this upgrade. Empty means unknown.
create table public.subscription_anchors (
 user_id uuid primary key references auth.users(id) on delete cascade,
 started_on date not null,
 source text not null check (char_length(source) between 1 and 80),
 created_at timestamptz not null default now(),
 constraint subscription_anchor_date check (started_on between date '1900-01-01' and current_date+1)
);
comment on table public.subscription_anchors is 'Verified original subscription start, server-write only. Not used to grant or revoke paid access.';
alter table public.subscription_anchors enable row level security;
revoke all on public.subscription_anchors from public,anon,authenticated;
grant select on public.subscription_anchors to authenticated;
grant all on public.subscription_anchors to service_role;
create policy subscription_anchor_read on public.subscription_anchors for select to authenticated using ((select auth.uid())=user_id);

-- Existing accounts keep their abstinence-oriented cap; new accounts choose their own cap.
insert into public.progress_chapters(user_id,effective_on,mode,origin,planned_action)
 select user_id,(created_at at time zone 'Europe/Paris')::date,'abstain','legacy','Continuer mon parcours. Mes bilans et mes étapes restent conservés.' from public.sobriety_journeys;
insert into public.progress_settings(user_id,baseline_cost_week,baseline_note)
 select user_id,case when weekly_spend_estimate>0 then weekly_spend_estimate else null end,
 case when weekly_spend_estimate>0 then 'Ancien budget hebdomadaire estimé, repris du parcours existant. À vérifier.' else null end from public.sobriety_journeys;
notify pgrst, 'reload schema';
