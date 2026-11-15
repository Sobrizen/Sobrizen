-- Local CLI-generated migration. Apply before the matching versioned client.
-- Legacy upserts remain supported; their writes also advance the server revision.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.program_progress add column if not exists revision integer not null default 1;
alter table public.program_progress add column if not exists updated_at timestamptz not null default now();
alter table public.program_progress add constraint program_progress_revision_positive check (revision > 0);

create or replace function private.touch_program_progress_version()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or new.step is distinct from old.step then
      raise exception using errcode='22023',message='L’identité de cette étape ne peut pas être modifiée.';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
    new.completed_at := old.completed_at;
  else
    new.revision := 1;
    new.updated_at := clock_timestamp();
    new.completed_at := new.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function private.touch_program_progress_version() from public, anon, authenticated;
create trigger program_progress_server_version before insert or update on public.program_progress
for each row execute function private.touch_program_progress_version();

create or replace function public.save_program_progress(
  p_expected_user_id uuid,p_step integer,p_reflection text,p_expected_revision integer
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare uid uuid := auth.uid(); saved public.program_progress%rowtype;
begin
  if uid is null or p_expected_user_id is distinct from uid then
    raise exception using errcode='42501',message='Reconnecte-toi avant d’enregistrer cette étape.';
  end if;
  if p_step is null or p_step<1 or p_step>30 or p_expected_revision is null or p_expected_revision<0
    or char_length(p_reflection)>2000 then
    raise exception using errcode='22023',message='Étape ou réflexion invalide.';
  end if;
  -- Serialize with consent withdrawal without changing the user's consent.
  perform s.user_id from public.user_settings s where s.user_id=uid
    and s.health_data_consent_at is not null and s.health_data_consent_revoked_at is null for share;
  if not found then
    raise exception using errcode='42501',message='Active le consentement au suivi pour enregistrer cette étape.';
  end if;
  if p_expected_revision=0 then
    insert into public.program_progress(user_id,step,reflection)
      values(uid,p_step,nullif(btrim(p_reflection),''))
      on conflict(user_id,step) do nothing returning * into saved;
  else
    update public.program_progress p set reflection=nullif(btrim(p_reflection),'')
      where p.user_id=uid and p.step=p_step and p.revision=p_expected_revision
      returning p.* into saved;
  end if;
  if not found then
    raise exception using errcode='40001',message='Cette étape a changé. Recharge la version enregistrée avant de réessayer.';
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_program_progress(uuid,integer,text,integer) from public, anon;
grant execute on function public.save_program_progress(uuid,integer,text,integer) to authenticated;

commit;
