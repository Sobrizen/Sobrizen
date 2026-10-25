-- Private, optional self-reported health observations. No inferred medical state.
-- Additive: existing consumption records, timelines and consent records stay intact.
-- Apply as one migration after reviewing the existing public.user_settings schema.

create table public.health_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  anxiety smallint check (anxiety between 1 and 5),
  concentration smallint check (concentration between 1 and 5),
  physical_comfort smallint check (physical_comfort between 1 and 5),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_checkins_user_date_key unique(user_id,checkin_date),
  constraint health_checkins_date_floor check(checkin_date >= date '1900-01-01'),
  constraint health_checkins_at_least_one_observation check (
    mood is not null or energy is not null or sleep_quality is not null
    or anxiety is not null or concentration is not null or physical_comfort is not null
  )
);

comment on table public.health_checkins is
  'Owner-private, optional self-reported feelings, not clinical measurements or diagnoses. Independent of alcohol consumption declarations.';
comment on column public.health_checkins.anxiety is
  'Self-reported anxiety from 1 (little) to 5 (strong). Higher is more difficulty, unlike the other fields.';

alter table public.health_checkins enable row level security;
revoke all on table public.health_checkins from public,anon,authenticated;
grant select,delete on table public.health_checkins to authenticated;
grant insert(user_id,checkin_date,mood,energy,sleep_quality,anxiety,concentration,physical_comfort,note)
  on public.health_checkins to authenticated;
grant update(mood,energy,sleep_quality,anxiety,concentration,physical_comfort,note)
  on public.health_checkins to authenticated;
grant all on public.health_checkins to service_role;

-- Each operation checks both row ownership and the current sensitive-data consent.
-- The subquery is subject to user_settings' own owner-private RLS.
create policy health_checkins_read on public.health_checkins
for select to authenticated using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_settings s
    where s.user_id = (select auth.uid())
      and s.health_data_consent_at is not null
      and s.health_data_consent_revoked_at is null
  )
);

create policy health_checkins_insert on public.health_checkins
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_settings s
    where s.user_id = (select auth.uid())
      and s.health_data_consent_at is not null
      and s.health_data_consent_revoked_at is null
  )
);

create policy health_checkins_update on public.health_checkins
for update to authenticated using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_settings s
    where s.user_id = (select auth.uid())
      and s.health_data_consent_at is not null
      and s.health_data_consent_revoked_at is null
  )
) with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_settings s
    where s.user_id = (select auth.uid())
      and s.health_data_consent_at is not null
      and s.health_data_consent_revoked_at is null
  )
);

create policy health_checkins_delete on public.health_checkins
for delete to authenticated using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.user_settings s
    where s.user_id = (select auth.uid())
      and s.health_data_consent_at is not null
      and s.health_data_consent_revoked_at is null
  )
);

-- Apply date and metadata rules to RPC and direct Data API writes alike.
create function public.validate_and_touch_health_checkin()
returns trigger language plpgsql security invoker set search_path = '' as $function$
declare
  v_timezone text;
  v_today date;
begin
  select t.document->>'timezone' into v_timezone
  from public.journey_timelines t where t.user_id = new.user_id;
  if v_timezone is not null
    and exists(select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    v_today := (pg_catalog.statement_timestamp() at time zone v_timezone)::date;
  else
    -- Without a declared journey timezone, accept today's civil date anywhere.
    -- The browser additionally enforces its own local civil date.
    v_today := (pg_catalog.statement_timestamp() at time zone 'Pacific/Kiritimati')::date;
  end if;
  if new.checkin_date < date '1900-01-01' or new.checkin_date > v_today then
    raise exception using errcode='22023', message='La date du ressenti doit être passée ou correspondre à aujourd’hui.';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.clock_timestamp();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.checkin_date is distinct from old.checkin_date then
      raise exception using errcode='22023', message='Le propriétaire et la date du ressenti ne peuvent pas être réattribués.';
    end if;
    new.created_at := old.created_at;
    new.updated_at := greatest(pg_catalog.clock_timestamp(),old.updated_at + interval '1 microsecond');
  end if;
  return new;
end;
$function$;
revoke all on function public.validate_and_touch_health_checkin() from public,anon,authenticated,service_role;
create trigger health_checkins_validate_touch
before insert or update on public.health_checkins
for each row execute function public.validate_and_touch_health_checkin();

-- Compare-and-set API: a NULL version creates a date that does not exist yet;
-- an existing updated_at updates exactly that version. Never silently overwrite
-- a record saved by another device while the form was open.
create function public.save_health_checkin(p_record jsonb,p_expected_updated_at timestamptz default null)
returns public.health_checkins
language plpgsql security invoker set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_date date;
  v_key text;
  v_value jsonb;
  v_number numeric;
  v_saved public.health_checkins;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='Connecte-toi pour enregistrer ton ressenti.';
  end if;
  if not exists (
    select 1 from public.user_settings s
    where s.user_id=v_uid and s.health_data_consent_at is not null
      and s.health_data_consent_revoked_at is null
  ) then
    raise exception using errcode='42501',message='Le consentement au suivi sensible est nécessaire.';
  end if;
  if p_record is null or pg_catalog.jsonb_typeof(p_record) is distinct from 'object'
    or pg_catalog.octet_length(p_record::text) > 16000 then
    raise exception using errcode='22023',message='Le format du ressenti est invalide.';
  end if;
  if (p_record - array['checkin_date','mood','energy','sleep_quality','anxiety','concentration','physical_comfort','note']) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(p_record->'checkin_date') is distinct from 'string'
    or (p_record->>'checkin_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode='22023',message='La date ou les champs du ressenti sont invalides.';
  end if;
  begin
    v_date := (p_record->>'checkin_date')::date;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception using errcode='22023',message='La date du ressenti est invalide.';
  end;
  foreach v_key in array array['mood','energy','sleep_quality','anxiety','concentration','physical_comfort'] loop
    v_value := p_record->v_key;
    if v_value is not null and v_value <> 'null'::jsonb then
      if pg_catalog.jsonb_typeof(v_value) is distinct from 'number' then
        raise exception using errcode='22023',message='Chaque ressenti doit être un nombre entier de 1 à 5.';
      end if;
      v_number := (p_record->>v_key)::numeric;
      if v_number < 1 or v_number > 5 or v_number <> pg_catalog.trunc(v_number) then
        raise exception using errcode='22023',message='Chaque ressenti doit être un nombre entier de 1 à 5.';
      end if;
    end if;
  end loop;
  if p_record->'note' is not null and p_record->'note' <> 'null'::jsonb
    and (pg_catalog.jsonb_typeof(p_record->'note') is distinct from 'string'
      or pg_catalog.char_length(p_record->>'note') > 1000) then
    raise exception using errcode='22023',message='La note doit contenir au maximum 1 000 caractères.';
  end if;

  if p_expected_updated_at is null then
    begin
      insert into public.health_checkins(user_id,checkin_date,mood,energy,sleep_quality,anxiety,concentration,physical_comfort,note)
      values(v_uid,v_date,(p_record->>'mood')::numeric::smallint,(p_record->>'energy')::numeric::smallint,
        (p_record->>'sleep_quality')::numeric::smallint,(p_record->>'anxiety')::numeric::smallint,
        (p_record->>'concentration')::numeric::smallint,(p_record->>'physical_comfort')::numeric::smallint,
        nullif(pg_catalog.btrim(p_record->>'note'),''))
      returning * into v_saved;
    exception when unique_violation then
      raise exception using errcode='PT409',message='Un ressenti existe déjà pour cette date. Actualise avant de le modifier.';
    end;
  else
    update public.health_checkins set
      mood=(p_record->>'mood')::numeric::smallint, energy=(p_record->>'energy')::numeric::smallint,
      sleep_quality=(p_record->>'sleep_quality')::numeric::smallint, anxiety=(p_record->>'anxiety')::numeric::smallint,
      concentration=(p_record->>'concentration')::numeric::smallint,
      physical_comfort=(p_record->>'physical_comfort')::numeric::smallint,
      note=nullif(pg_catalog.btrim(p_record->>'note'),'')
    where user_id=v_uid and checkin_date=v_date and updated_at=p_expected_updated_at
    returning * into v_saved;
    if not found then
      raise exception using errcode='PT409',message='Ce ressenti a changé. Actualise avant de le modifier.';
    end if;
  end if;
  return v_saved;
end;
$function$;
revoke all on function public.save_health_checkin(jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.save_health_checkin(jsonb,timestamptz) to authenticated;
