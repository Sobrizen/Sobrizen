-- PREPARED SQL ONLY. No production migration is executed by the implementation.
-- Apply after the server entitlement function public.sobrizen_has_premium().
-- General private organisation, independent from sensitive health-data consent.
-- Current Supabase guidance: explicit table grants + owner RLS, SECURITY INVOKER.
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- https://supabase.com/docs/guides/database/functions

begin;

create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('appointment','task','goal')),
  category text not null check (category in ('personal','work','wellbeing')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 2000),
  item_date date not null check (item_date between date '1900-01-01' and date '2199-12-31'),
  all_day boolean not null default true,
  time_zone text not null check (char_length(time_zone) between 1 and 100),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'open' check (status in ('open','done')),
  goal_target integer,
  goal_current integer,
  goal_unit text not null default '' check (char_length(goal_unit) <= 32),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_items_time_shape check (
    (all_day and starts_at is null and ends_at is null)
    or (kind='appointment' and not all_day and starts_at is not null and ends_at is not null
      and ends_at > starts_at and ends_at - starts_at <= interval '7 days')
  ),
  constraint agenda_items_goal_shape check (
    (kind='goal' and goal_target is not null and goal_current is not null
      and goal_target between 1 and 100000 and goal_current between 0 and goal_target
      and ((goal_current=goal_target and status='done') or (goal_current<goal_target and status='open')))
    or (kind<>'goal' and goal_target is null and goal_current is null and goal_unit='')
  )
);
create index agenda_items_owner_id on public.agenda_items(user_id,id);
create index agenda_items_owner_date on public.agenda_items(user_id,item_date);
comment on table public.agenda_items is 'Owner-private appointments, tasks and goals. No automated reminders, sharing or clinical interpretation.';
comment on column public.agenda_items.item_date is 'Civil start date for appointments, deadline for tasks/goals. Date-only entries never shift when travelling.';
comment on column public.agenda_items.version is 'Server-owned monotonically increasing CAS version for the application RPC.';

alter table public.agenda_items enable row level security;
revoke all on public.agenda_items from public,anon,authenticated;
grant select,delete on public.agenda_items to authenticated;
grant insert(id,user_id,kind,category,title,notes,item_date,all_day,time_zone,starts_at,ends_at,status,goal_target,goal_current,goal_unit)
  on public.agenda_items to authenticated;
grant update(kind,category,title,notes,item_date,all_day,time_zone,starts_at,ends_at,status,goal_target,goal_current,goal_unit)
  on public.agenda_items to authenticated;
grant all on public.agenda_items to service_role;

create policy agenda_items_read on public.agenda_items for select to authenticated
using ((select auth.uid())=user_id);
create policy agenda_items_insert on public.agenda_items for insert to authenticated
with check ((select auth.uid())=user_id and (select public.sobrizen_has_premium()));
create policy agenda_items_update on public.agenda_items for update to authenticated
using ((select auth.uid())=user_id and (select public.sobrizen_has_premium()))
with check ((select auth.uid())=user_id and (select public.sobrizen_has_premium()));
create policy agenda_items_delete on public.agenda_items for delete to authenticated
using ((select auth.uid())=user_id);

create function public.validate_and_touch_agenda_item()
returns trigger language plpgsql security invoker set search_path='' as $function$
begin
  if new.time_zone !~ '^[A-Za-z_][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$'
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then
    raise exception using errcode='22023',message='Le fuseau horaire est invalide.';
  end if;
  new.title:=pg_catalog.btrim(new.title); new.notes:=pg_catalog.btrim(new.notes); new.goal_unit:=pg_catalog.btrim(new.goal_unit);
  if new.title ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
    or new.notes ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
    or new.goal_unit ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception using errcode='22023',message='Le texte contient un caractère de contrôle.';
  end if;
  if new.starts_at is not null then
    if (new.starts_at at time zone new.time_zone)::date is distinct from new.item_date
      or (new.ends_at at time zone new.time_zone)::date not between date '1900-01-01' and date '2199-12-31'
      or pg_catalog.date_trunc('minute',new.starts_at at time zone new.time_zone) <> (new.starts_at at time zone new.time_zone)
      or pg_catalog.date_trunc('minute',new.ends_at at time zone new.time_zone) <> (new.ends_at at time zone new.time_zone) then
      raise exception using errcode='22023',message='Les dates et heures du rendez-vous sont incohérentes.';
    end if;
  end if;
  if tg_op='INSERT' then
    new.version:=1; new.created_at:=pg_catalog.clock_timestamp(); new.updated_at:=new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception using errcode='22023',message='Le propriétaire et l’identifiant ne peuvent pas être réattribués.';
    end if;
    new.version:=old.version+1; new.created_at:=old.created_at;
    new.updated_at:=greatest(pg_catalog.clock_timestamp(),old.updated_at+interval '1 microsecond');
  end if;
  return new;
end;
$function$;
revoke all on function public.validate_and_touch_agenda_item() from public,anon,authenticated,service_role;
create trigger agenda_items_validate_touch before insert or update on public.agenda_items
for each row execute function public.validate_and_touch_agenda_item();

create function public.save_agenda_item(p_id uuid,p_expected_version integer,p_payload jsonb)
returns public.agenda_items language plpgsql security invoker set search_path='' as $function$
declare
  v_uid uuid:=auth.uid();
  v_input public.agenda_items;
  v_saved public.agenda_items;
  v_key text;
  v_fields text[]:=array['kind','category','title','notes','item_date','all_day','time_zone','starts_at','ends_at','status','goal_target','goal_current','goal_unit'];
begin
  if v_uid is null or not public.sobrizen_has_premium() then
    raise exception using errcode='42501',message='Un accès Premium actif est nécessaire pour modifier l’agenda.';
  end if;
  if p_id is null or (p_expected_version is not null and p_expected_version<1) then
    raise exception using errcode='22023',message='L’identifiant ou la version est invalide.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
    or pg_catalog.octet_length(p_payload::text)>24000
    or (p_payload-v_fields)<>'{}'::jsonb
    or not (p_payload ?& v_fields) then
    raise exception using errcode='22023',message='Le format de l’élément est invalide.';
  end if;
  foreach v_key in array array['kind','category','title','notes','item_date','time_zone','status','goal_unit'] loop
    if pg_catalog.jsonb_typeof(p_payload->v_key) is distinct from 'string' then
      raise exception using errcode='22023',message='Un champ de texte est invalide.';
    end if;
  end loop;
  if pg_catalog.jsonb_typeof(p_payload->'all_day') is distinct from 'boolean'
    or (p_payload->>'item_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using errcode='22023',message='La date ou le choix de la journée est invalide.';
  end if;
  foreach v_key in array array['starts_at','ends_at'] loop
    if p_payload->v_key<>'null'::jsonb and (
      pg_catalog.jsonb_typeof(p_payload->v_key) is distinct from 'string'
      or (p_payload->>v_key) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    ) then
      raise exception using errcode='22023',message='Les heures doivent préciser un décalage UTC.';
    end if;
  end loop;
  foreach v_key in array array['goal_target','goal_current'] loop
    if p_payload->v_key<>'null'::jsonb and (
      pg_catalog.jsonb_typeof(p_payload->v_key) is distinct from 'number'
      or (p_payload->>v_key)::numeric<>pg_catalog.trunc((p_payload->>v_key)::numeric)
    ) then
      raise exception using errcode='22023',message='La progression doit contenir des nombres entiers.';
    end if;
  end loop;
  begin
    select * into v_input from pg_catalog.jsonb_populate_record(null::public.agenda_items,p_payload);
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception using errcode='22023',message='Les dates, heures ou nombres sont invalides.';
  end;
  if p_expected_version is null then
    insert into public.agenda_items(id,user_id,kind,category,title,notes,item_date,all_day,time_zone,starts_at,ends_at,status,goal_target,goal_current,goal_unit)
    values(p_id,v_uid,v_input.kind,v_input.category,v_input.title,v_input.notes,v_input.item_date,v_input.all_day,v_input.time_zone,
      v_input.starts_at,v_input.ends_at,v_input.status,v_input.goal_target,v_input.goal_current,v_input.goal_unit)
    on conflict(id) do nothing returning * into v_saved;
    if not found then
      -- Retrying an identical creation after a lost response is idempotent.
      -- A foreign owner remains invisible under RLS and yields the same conflict.
      select * into v_saved from public.agenda_items where id=p_id and user_id=v_uid;
      if not found or v_saved.version<>1 or
        (pg_catalog.to_jsonb(v_saved)-array['id','user_id','version','created_at','updated_at']) is distinct from
        (pg_catalog.to_jsonb(v_input)-array['id','user_id','version','created_at','updated_at']) then
        raise exception using errcode='PT409',message='Cet élément existe déjà ou a changé. Actualise l’agenda.';
      end if;
    end if;
  else
    update public.agenda_items set kind=v_input.kind,category=v_input.category,title=v_input.title,notes=v_input.notes,
      item_date=v_input.item_date,all_day=v_input.all_day,time_zone=v_input.time_zone,starts_at=v_input.starts_at,ends_at=v_input.ends_at,
      status=v_input.status,goal_target=v_input.goal_target,goal_current=v_input.goal_current,goal_unit=v_input.goal_unit
    where id=p_id and user_id=v_uid and version=p_expected_version returning * into v_saved;
    if not found then
      raise exception using errcode='PT409',message='Cet élément a changé ou a été supprimé. Actualise l’agenda.';
    end if;
  end if;
  return v_saved;
end;
$function$;
revoke all on function public.save_agenda_item(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_agenda_item(uuid,integer,jsonb) to authenticated;

create function public.delete_agenda_item(p_id uuid,p_expected_version integer)
returns uuid language plpgsql security invoker set search_path='' as $function$
declare v_deleted uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Connecte-toi pour supprimer cet élément.'; end if;
  if p_id is null or p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='La version à supprimer est invalide.';
  end if;
  delete from public.agenda_items where id=p_id and user_id=(select auth.uid()) and version=p_expected_version returning id into v_deleted;
  if not found then raise exception using errcode='PT409',message='Cet élément a changé ou a été supprimé. Actualise l’agenda.'; end if;
  return v_deleted;
end;
$function$;
revoke all on function public.delete_agenda_item(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.delete_agenda_item(uuid,integer) to authenticated;

commit;
