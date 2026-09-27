-- Atomic date and baseline update. Existing owner RLS remains in force.
-- NULL p_expected_settings_updated_at means the client loaded no settings row.
create or replace function public.save_journey_reference(
  p_started_on date,
  p_timezone text,
  p_baseline_units_week numeric,
  p_baseline_cost_week numeric,
  p_expected_journey_updated_at timestamptz,
  p_expected_settings_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_started_at timestamptz;
  v_journey public.sobriety_journeys%rowtype;
  v_settings public.progress_settings%rowtype;
  v_has_settings boolean;
  v_note text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Connecte-toi pour modifier ton point de départ.';
  end if;

  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names as tz where tz.name = p_timezone
  ) then
    raise exception using errcode = '22023', message = 'Fuseau horaire invalide.';
  end if;

  if p_started_on is null or not pg_catalog.isfinite(p_started_on)
    or p_started_on < date '1900-01-01'
    or p_started_on > (pg_catalog.statement_timestamp() at time zone p_timezone)::date
  then
    raise exception using errcode = '22023', message = 'Choisis une date passée ou aujourd’hui, à partir de 1900.';
  end if;

  -- Accept zero, reject missing, out-of-range, nonfinite, and overprecise values.
  if p_baseline_units_week is null
    or not (p_baseline_units_week between 0 and 7000)
    or p_baseline_units_week <> pg_catalog.round(p_baseline_units_week, 2)
  then
    raise exception using errcode = '22023', message = 'Indique une consommation hebdomadaire entre 0 et 7 000, avec deux décimales au maximum.';
  end if;
  if p_baseline_cost_week is null
    or not (p_baseline_cost_week between 0 and 7000000)
    or p_baseline_cost_week <> pg_catalog.round(p_baseline_cost_week, 2)
  then
    raise exception using errcode = '22023', message = 'Indique une dépense hebdomadaire entre 0 et 7 000 000 €, avec deux décimales au maximum.';
  end if;

  -- Match the application's local-noon convention; never infer the date from UTC.
  v_started_at := (p_started_on + time '12:00:00') at time zone p_timezone;
  if (v_started_at at time zone p_timezone) <> (p_started_on + time '12:00:00') then
    raise exception using errcode = '22023', message = 'Cette date n’existe pas dans ce fuseau horaire.';
  end if;
  v_note := 'Estimation des habitudes avant le début déclaré du ' || pg_catalog.to_char(p_started_on, 'YYYY-MM-DD') || '.';

  -- Fixed lock order serializes this workflow and protects optimistic checks.
  select j.* into v_journey
  from public.sobriety_journeys as j
  where j.user_id = v_uid
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'Ton parcours est introuvable. Actualise l’application.';
  end if;
  if p_expected_journey_updated_at is distinct from v_journey.updated_at then
    raise exception using errcode = 'PT409', message = 'Ton parcours a changé sur un autre écran. Actualise avant de réessayer.';
  end if;

  select s.* into v_settings
  from public.progress_settings as s
  where s.user_id = v_uid
  for update;
  v_has_settings := found;
  if (v_has_settings and p_expected_settings_updated_at is distinct from v_settings.updated_at)
    or (not v_has_settings and p_expected_settings_updated_at is not null)
  then
    raise exception using errcode = 'PT409', message = 'Tes repères ont changé sur un autre écran. Actualise avant de réessayer.';
  end if;

  update public.sobriety_journeys as j
  set started_at = v_started_at,
      weekly_spend_estimate = p_baseline_cost_week
  where j.user_id = v_uid
  returning j.* into v_journey;

  if v_has_settings then
    update public.progress_settings as s
    set baseline_units_week = p_baseline_units_week,
        baseline_cost_week = p_baseline_cost_week,
        baseline_note = v_note
    where s.user_id = v_uid
    returning s.* into v_settings;
  else
    begin
      insert into public.progress_settings (
        user_id, baseline_units_week, baseline_cost_week, baseline_note
      ) values (
        v_uid, p_baseline_units_week, p_baseline_cost_week, v_note
      )
      returning * into v_settings;
    exception when unique_violation then
      -- A concurrent settings insert cancels the journey update as well.
      raise exception using errcode = 'PT409', message = 'Tes repères ont changé sur un autre écran. Actualise avant de réessayer.';
    end;
  end if;

  return pg_catalog.jsonb_build_object(
    'journey', pg_catalog.to_jsonb(v_journey),
    'progress_settings', pg_catalog.to_jsonb(v_settings)
  );
end;
$function$;

revoke all on function public.save_journey_reference(date, text, numeric, numeric, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.save_journey_reference(date, text, numeric, numeric, timestamptz, timestamptz)
  to authenticated;
comment on function public.save_journey_reference(date, text, numeric, numeric, timestamptz, timestamptz)
  is 'Atomically correct the owner’s declared stop date and pre-stop weekly estimates. Preserves subscription anchors, check-ins, goal history and reasons. NULL settings version asserts no existing settings row.';
notify pgrst, 'reload schema';

