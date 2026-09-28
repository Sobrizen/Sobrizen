-- Owner-private declared timeline. No existing user backfill or modification.
-- The document is canonical for the new interface; older tables are mirrors.

create function public.validate_journey_timeline_document(p_document jsonb)
returns void language plpgsql security invoker set search_path = '' as $function$
declare
  v_timezone text;
  v_today date;
  v_item jsonb;
  v_goal jsonb;
  v_value jsonb;
  v_row record;
  v_id uuid;
  v_ids uuid[] := array[]::uuid[];
  v_dates text[] := array[]::text[];
  v_previous text;
  v_day date;
  v_noon timestamptz;
  v_number numeric;
  v_units numeric;
  v_cost numeric;
begin
  if p_document is null or pg_catalog.jsonb_typeof(p_document) is distinct from 'object'
    or pg_catalog.octet_length(p_document::text) > 1048576 then
    raise exception using errcode='22023', message='Format ou taille du parcours invalide.';
  end if;
  if not (p_document ?& array['schema_version','timezone','baseline','events','occasions','goal'])
    or (p_document - array['schema_version','timezone','baseline','events','occasions','goal']) <> '{}'::jsonb
    or p_document->'schema_version' is distinct from '1'::jsonb
    or pg_catalog.jsonb_typeof(p_document->'timezone') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_document->'baseline') is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_document->'events') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_document->'occasions') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_document->'goal') is distinct from 'object' then
    raise exception using errcode='22023', message='Le parcours contient des champs manquants ou invalides.';
  end if;
  v_timezone := p_document->>'timezone';
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception using errcode='22023', message='Fuseau horaire invalide.';
  end if;
  v_today := (pg_catalog.statement_timestamp() at time zone v_timezone)::date;
  if pg_catalog.jsonb_array_length(p_document->'events') not between 1 and 500
    or pg_catalog.jsonb_array_length(p_document->'occasions') > 1000 then
    raise exception using errcode='22023', message='Le nombre de périodes ou d’occasions dépasse la limite.';
  end if;

  v_item := p_document->'baseline';
  if not(v_item ?& array['started_on','units_week','cost_week'])
    or (v_item - array['started_on','units_week','cost_week']) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(v_item->'started_on') is distinct from 'string' then
    raise exception using errcode='22023', message='La référence de départ est invalide.';
  end if;
  -- Baseline and event weekly values share exact numeric validation.
  for v_item in select p_document->'baseline' union all
    select value from pg_catalog.jsonb_array_elements(p_document->'events')
  loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_item->'units_week') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_item->'cost_week') is distinct from 'number' then
      raise exception using errcode='22023', message='Renseigne des nombres pour les estimations hebdomadaires.';
    end if;
    v_units := (v_item->>'units_week')::numeric;
    v_cost := (v_item->>'cost_week')::numeric;
    if not(v_units between 0 and 7000) or v_units <> pg_catalog.round(v_units,2)
      or not(v_cost between 0 and 7000000) or v_cost <> pg_catalog.round(v_cost,2) then
      raise exception using errcode='22023', message='Estimation hebdomadaire hors limites ou trop précise.';
    end if;
  end loop;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_document->'events') loop
    if not(v_item ?& array['id','started_on','state','units_week','cost_week','note'])
      or (v_item - array['id','started_on','state','units_week','cost_week','note']) <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_item->'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'started_on') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'state') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'note') is distinct from 'string'
      or pg_catalog.char_length(v_item->>'note') > 300 then
      raise exception using errcode='22023', message='Une période contient des champs invalides.';
    end if;
    if (v_item->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception using errcode='22023', message='Identifiant de période invalide.';
    end if;
    v_id := (v_item->>'id')::uuid;
    if v_id = any(v_ids) then
      raise exception using errcode='22023', message='Deux périodes portent le même identifiant.';
    end if;
    v_ids := pg_catalog.array_append(v_ids,v_id);
    if (v_previous is not null and v_item->>'started_on' <= v_previous)
      or v_item->>'started_on' < p_document->'baseline'->>'started_on' then
      raise exception using errcode='22023', message='Les périodes doivent suivre la référence dans l’ordre, sans date en double.';
    end if;
    v_previous := v_item->>'started_on';
    if (v_item->>'state') not in ('abstinent','drinking')
      or (v_item->>'state'='abstinent' and (v_item->>'units_week')::numeric <> 0)
      or (v_item->>'state'='drinking' and (v_item->>'units_week')::numeric <= 0) then
      raise exception using errcode='22023', message='La consommation ne correspond pas à l’état déclaré de la période.';
    end if;
  end loop;

  v_ids := array[]::uuid[];
  for v_item in select value from pg_catalog.jsonb_array_elements(p_document->'occasions') loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode='22023', message='Format d’occasion invalide.';
    end if;
    if not(v_item ?& array['id','date','units','cost'])
      or (v_item - array['id','date','units','cost']) <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_item->'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'date') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'units') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_item->'cost') is distinct from 'number' then
      raise exception using errcode='22023', message='Une occasion contient des champs invalides.';
    end if;
    if (v_item->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception using errcode='22023', message='Identifiant d’occasion invalide.';
    end if;
    v_id := (v_item->>'id')::uuid;
    if v_id = any(v_ids) or v_item->>'date' = any(v_dates)
      or v_item->>'date' < p_document->'baseline'->>'started_on' then
      raise exception using errcode='22023', message='Une seule occasion est possible par date, à partir de la référence.';
    end if;
    v_ids := pg_catalog.array_append(v_ids,v_id);
    v_dates := pg_catalog.array_append(v_dates,v_item->>'date');
    v_units := (v_item->>'units')::numeric;
    v_cost := (v_item->>'cost')::numeric;
    if not(v_units > 0 and v_units <= 1000) or v_units <> pg_catalog.round(v_units,2)
      or not(v_cost between 0 and 1000000) or v_cost <> pg_catalog.round(v_cost,2) then
      raise exception using errcode='22023', message='Consommation ou dépense de l’occasion hors limites ou trop précise.';
    end if;
  end loop;

  v_goal := p_document->'goal';
  if not(v_goal ?& array['mode','weekly_limit','daily_limit','target_on','why','triggers','support_first','planned_action'])
    or (v_goal - array['mode','weekly_limit','daily_limit','target_on','why','triggers','support_first','planned_action']) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(v_goal->'mode') is distinct from 'string'
    or (v_goal->>'mode') not in ('abstain','reduce','observe')
    or pg_catalog.jsonb_typeof(v_goal->'why') is distinct from 'string'
    or pg_catalog.char_length(v_goal->>'why') > 1000
    or pg_catalog.jsonb_typeof(v_goal->'planned_action') is distinct from 'string'
    or pg_catalog.char_length(v_goal->>'planned_action') > 500
    or pg_catalog.jsonb_typeof(v_goal->'support_first') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(v_goal->'triggers') is distinct from 'array' then
    raise exception using errcode='22023', message='Le cap contient des champs invalides.';
  end if;
  if pg_catalog.jsonb_array_length(v_goal->'triggers') > 12 then
    raise exception using errcode='22023', message='Douze situations au maximum peuvent être renseignées.';
  end if;
  for v_value in select value from pg_catalog.jsonb_array_elements(v_goal->'triggers') loop
    if pg_catalog.jsonb_typeof(v_value) is distinct from 'string'
      or pg_catalog.char_length(v_value #>> '{}') > 80 then
      raise exception using errcode='22023', message='Une situation contient un texte invalide ou trop long.';
    end if;
  end loop;
  for v_row in select * from (values ('weekly_limit',7000::numeric),('daily_limit',1000::numeric)) limits(field,maximum) loop
    v_value := v_goal->v_row.field;
    if v_value is distinct from 'null'::jsonb then
      if pg_catalog.jsonb_typeof(v_value) is distinct from 'number'
        or v_goal->>'mode' <> 'reduce' or (v_goal->>'support_first')::boolean then
        raise exception using errcode='22023', message='Les limites chiffrées sont facultatives et réservées au cap de réduction sans priorité de soutien.';
      end if;
      v_number := (v_value #>> '{}')::numeric;
      if not(v_number between 0 and v_row.maximum) or v_number <> pg_catalog.round(v_number,2) then
        raise exception using errcode='22023', message='Limite personnelle hors bornes ou trop précise.';
      end if;
    end if;
  end loop;
  if v_goal->'target_on' is distinct from 'null'::jsonb
    and pg_catalog.jsonb_typeof(v_goal->'target_on') is distinct from 'string' then
    raise exception using errcode='22023', message='Date d’objectif invalide.';
  end if;

  -- Validate every date after its JSON type; no PostgreSQL permissive date forms.
  for v_row in
    select p_document->'baseline'->>'started_on' as value, false as is_target
    union all select value->>'started_on',false from pg_catalog.jsonb_array_elements(p_document->'events')
    union all select value->>'date',false from pg_catalog.jsonb_array_elements(p_document->'occasions')
    union all select v_goal->>'target_on',true where v_goal->'target_on' <> 'null'::jsonb
  loop
    if v_row.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using errcode='22023', message='Utilise une date au format année-mois-jour.';
    end if;
    begin
      v_day := v_row.value::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='22023', message='Une date du parcours n’existe pas.';
    end;
    if not pg_catalog.isfinite(v_day) or v_day < date '1900-01-01'
      or v_day > (case when v_row.is_target then date '2100-12-31' else v_today end)
      or pg_catalog.to_char(v_day,'YYYY-MM-DD') <> v_row.value then
      raise exception using errcode='22023', message='Une date du parcours est hors limites.';
    end if;
    v_noon := (v_day + time '12:00:00') at time zone v_timezone;
    if (v_noon at time zone v_timezone) <> (v_day + time '12:00:00') then
      raise exception using errcode='22023', message='Une date n’existe pas dans ce fuseau horaire.';
    end if;
  end loop;
end;
$function$;
revoke all on function public.validate_journey_timeline_document(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.validate_journey_timeline_document(jsonb) to authenticated,service_role;

create table public.journey_timelines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null,
  revision integer not null default 1 check(revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_timeline_object check(jsonb_typeof(document)='object'),
  constraint journey_timeline_size check(octet_length(document::text)<=1048576)
);
alter table public.journey_timelines enable row level security;
revoke all on public.journey_timelines from public,anon,authenticated;
grant select on public.journey_timelines to authenticated;
grant insert(user_id,document), update(document) on public.journey_timelines to authenticated;
grant all on public.journey_timelines to service_role;
create policy journey_timelines_read on public.journey_timelines for select to authenticated using((select auth.uid())=user_id);
create policy journey_timelines_insert on public.journey_timelines for insert to authenticated with check((select auth.uid())=user_id);
create policy journey_timelines_update on public.journey_timelines for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

create function public.validate_and_touch_journey_timeline()
returns trigger language plpgsql security invoker set search_path='' as $function$
begin
  perform public.validate_journey_timeline_document(new.document);
  if tg_op='INSERT' then
    new.revision := 1;
    new.created_at := pg_catalog.clock_timestamp();
    new.updated_at := new.created_at;
  else
    if new.user_id is distinct from old.user_id then
      raise exception using errcode='42501',message='Le propriétaire du parcours ne peut pas être changé.';
    end if;
    if old.revision=2147483647 then
      raise exception using errcode='22023',message='La limite de versions de ce parcours est atteinte.';
    end if;
    new.revision := old.revision+1;
    new.created_at := old.created_at;
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$function$;
revoke all on function public.validate_and_touch_journey_timeline() from public,anon,authenticated,service_role;
create trigger journey_timeline_validate_touch before insert or update on public.journey_timelines for each row execute function public.validate_and_touch_journey_timeline();
comment on table public.journey_timelines is 'Owner-private declared history; canonical document for period-based tracking. Dates/estimates are self-reported. No daily records or subscription anchors are synthesized.';

create function public.save_journey_timeline(
  p_document jsonb,
  p_expected_revision integer,
  p_expected_journey_updated_at timestamptz,
  p_expected_settings_updated_at timestamptz,
  p_expected_chapter_id uuid
)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare
  v_uid uuid := auth.uid();
  v_journey public.sobriety_journeys%rowtype;
  v_settings public.progress_settings%rowtype;
  v_timeline public.journey_timelines%rowtype;
  v_chapter public.progress_chapters%rowtype;
  v_has_settings boolean;
  v_has_timeline boolean;
  v_goal jsonb;
  v_today date;
  v_started_at timestamptz;
  v_units numeric;
  v_cost numeric;
  v_weekly numeric;
  v_daily numeric;
  v_why text;
  v_note text;
  v_action text;
  v_support boolean;
  v_chapters jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='Connecte-toi pour enregistrer ton parcours.'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision=2147483647 then
    raise exception using errcode='22023',message='Version du parcours invalide.';
  end if;
  perform public.validate_journey_timeline_document(p_document);
  v_today := (pg_catalog.statement_timestamp() at time zone (p_document->>'timezone'))::date;
  v_goal := p_document->'goal';
  v_units := (p_document->'baseline'->>'units_week')::numeric;
  v_cost := (p_document->'baseline'->>'cost_week')::numeric;
  v_started_at := (((p_document->'events' -> -1 ->> 'started_on')::date)+time '12:00:00') at time zone (p_document->>'timezone');
  v_note := 'Estimation des habitudes à partir du ' || (p_document->'baseline'->>'started_on') || ', déclarée dans mon parcours.';
  v_why := nullif(v_goal->>'why','');
  v_action := nullif(v_goal->>'planned_action','');
  v_weekly := (v_goal->>'weekly_limit')::numeric;
  v_daily := (v_goal->>'daily_limit')::numeric;
  v_support := (v_goal->>'support_first')::boolean;

  -- Same lock order as save_journey_reference; no mutation before all CAS checks.
  select j.* into v_journey from public.sobriety_journeys j where j.user_id=v_uid for update;
  if not found then raise exception using errcode='PT404',message='Ton parcours est introuvable. Actualise l’application.'; end if;
  if p_expected_journey_updated_at is distinct from v_journey.updated_at then
    raise exception using errcode='PT409',message='Ton parcours a changé sur un autre écran. Actualise avant de réessayer.';
  end if;
  select s.* into v_settings from public.progress_settings s where s.user_id=v_uid for update;
  v_has_settings := found;
  if (v_has_settings and p_expected_settings_updated_at is distinct from v_settings.updated_at)
    or (not v_has_settings and p_expected_settings_updated_at is not null) then
    raise exception using errcode='PT409',message='Tes repères ont changé sur un autre écran. Actualise avant de réessayer.';
  end if;
  select t.* into v_timeline from public.journey_timelines t where t.user_id=v_uid for update;
  v_has_timeline := found;
  if (v_has_timeline and p_expected_revision <> v_timeline.revision)
    or (not v_has_timeline and p_expected_revision <> 0) then
    raise exception using errcode='PT409',message='Ton historique a changé sur un autre écran. Actualise avant de réessayer.';
  end if;
  select c.* into v_chapter from public.progress_chapters c where c.user_id=v_uid and c.effective_on<=v_today
    order by c.effective_on desc,c.created_at desc,c.id desc limit 1;
  if p_expected_chapter_id is distinct from v_chapter.id then
    raise exception using errcode='PT409',message='Ton cap a changé sur un autre écran. Actualise avant de réessayer.';
  end if;

  if v_journey.started_at is distinct from v_started_at
    or v_journey.weekly_spend_estimate is distinct from v_cost
    or v_journey.why_text is distinct from v_why then
    update public.sobriety_journeys j set started_at=v_started_at,weekly_spend_estimate=v_cost,why_text=v_why
      where j.user_id=v_uid returning j.* into v_journey;
  end if;
  if v_has_settings then
    if v_settings.baseline_units_week is distinct from v_units
      or v_settings.baseline_cost_week is distinct from v_cost
      or v_settings.baseline_note is distinct from v_note then
      update public.progress_settings s set baseline_units_week=v_units,baseline_cost_week=v_cost,baseline_note=v_note
        where s.user_id=v_uid returning s.* into v_settings;
    end if;
  else
    begin
      insert into public.progress_settings(user_id,baseline_units_week,baseline_cost_week,baseline_note)
        values(v_uid,v_units,v_cost,v_note) returning * into v_settings;
    exception when unique_violation then
      raise exception using errcode='PT409',message='Tes repères ont changé sur un autre écran. Actualise avant de réessayer.';
    end;
  end if;

  -- A drinking event or occasion never changes the chosen goal by itself.
  if v_chapter.id is null or v_chapter.mode is distinct from v_goal->>'mode'
    or v_chapter.weekly_limit is distinct from v_weekly or v_chapter.daily_limit is distinct from v_daily
    or v_chapter.support_first is distinct from v_support
    or nullif(v_chapter.planned_action,'') is distinct from v_action then
    insert into public.progress_chapters(user_id,effective_on,mode,weekly_limit,daily_limit,support_first,planned_action,origin,created_at)
      values(v_uid,v_today,v_goal->>'mode',v_weekly,v_daily,v_support,v_action,'chosen',pg_catalog.clock_timestamp());
  end if;

  if v_has_timeline then
    update public.journey_timelines t set document=p_document where t.user_id=v_uid and t.revision=p_expected_revision returning t.* into v_timeline;
    if not found then raise exception using errcode='PT409',message='Ton historique a changé. Actualise avant de réessayer.'; end if;
  else
    begin
      insert into public.journey_timelines(user_id,document) values(v_uid,p_document) returning * into v_timeline;
    exception when unique_violation then
      raise exception using errcode='PT409',message='Ton historique a changé sur un autre écran. Actualise avant de réessayer.';
    end;
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.effective_on,c.created_at,c.id),'[]'::jsonb)
    into v_chapters from public.progress_chapters c where c.user_id=v_uid;
  return pg_catalog.jsonb_build_object('journey',pg_catalog.to_jsonb(v_journey),'progress_settings',pg_catalog.to_jsonb(v_settings),'timeline',pg_catalog.to_jsonb(v_timeline),'chapters',v_chapters);
end;
$function$;
revoke all on function public.save_journey_timeline(jsonb,integer,timestamptz,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_journey_timeline(jsonb,integer,timestamptz,timestamptz,uuid) to authenticated;
comment on function public.save_journey_timeline(jsonb,integer,timestamptz,timestamptz,uuid) is 'Save a canonical owner-declared timeline with CAS. expected revision 0 asserts absence; nullable settings version/chapter ID assert absence. Atomically mirror references and append a current-day goal only when its semantics change. No check-ins or subscription anchors are altered.';
notify pgrst,'reload schema';
