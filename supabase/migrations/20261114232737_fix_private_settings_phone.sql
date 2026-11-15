-- Preserve consent, ownership and field guards; avoid backslash ambiguity in SQL regex.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create or replace function public.save_private_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); saved public.user_settings%rowtype; k text; max_length integer;
begin
  if uid is null then raise exception using errcode='42501',message='Connecte-toi pour enregistrer ton plan.'; end if;
  if p_settings is null or jsonb_typeof(p_settings)<>'object' then
    raise exception using errcode='22023',message='Plan personnel invalide.';
  end if;
  for k in select jsonb_object_keys(p_settings) loop
    if k not in ('support_name','support_phone','risky_situation','response_plan','reminder_time') then
      raise exception using errcode='22023',message='Champ de plan personnel non autorisé.';
    end if;
    if jsonb_typeof(p_settings->k) not in ('string','null') then
      raise exception using errcode='22023',message='Un champ du plan personnel est invalide.';
    end if;
    max_length := case k when 'support_name' then 80 when 'support_phone' then 30
      when 'risky_situation' then 1000 when 'response_plan' then 1500 else 8 end;
    if char_length(p_settings->>k)>max_length then
      raise exception using errcode='22023',message='Un champ du plan personnel est trop long.';
    end if;
  end loop;
  if nullif(btrim(p_settings->>'support_phone'),'') is not null
    and (p_settings->>'support_phone') !~ '^[+]?[0-9[:space:]().-]{5,30}$' then
    raise exception using errcode='22023',message='Le numéro de la personne de confiance est invalide.';
  end if;
  if p_settings ? 'reminder_time' and (
    p_settings->>'reminder_time' is null or
    (p_settings->>'reminder_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
  ) then raise exception using errcode='22023',message='Choisis une heure de rappel valide.'; end if;
  -- Serialize with grant/withdraw updates to the same owner settings row.
  select * into saved from public.user_settings s where s.user_id=uid for update;
  if not found or saved.health_data_consent_at is null or saved.health_data_consent_revoked_at is not null then
    raise exception using errcode='42501',message='Active le consentement au suivi pour enregistrer ton plan personnel.';
  end if;
  update public.user_settings s set
    support_name=case when p_settings?'support_name' then nullif(btrim(p_settings->>'support_name'),'') else s.support_name end,
    support_phone=case when p_settings?'support_phone' then nullif(btrim(p_settings->>'support_phone'),'') else s.support_phone end,
    risky_situation=case when p_settings?'risky_situation' then nullif(btrim(p_settings->>'risky_situation'),'') else s.risky_situation end,
    response_plan=case when p_settings?'response_plan' then nullif(btrim(p_settings->>'response_plan'),'') else s.response_plan end,
    reminder_time=case when p_settings?'reminder_time' then (p_settings->>'reminder_time')::time else s.reminder_time end,
    updated_at=clock_timestamp()
  where s.user_id=uid returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_private_settings(jsonb) from public, anon;
grant execute on function public.save_private_settings(jsonb) to authenticated;


commit;
