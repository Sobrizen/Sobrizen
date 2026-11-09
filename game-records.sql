-- Personal game records. Prepared for a versioned migration; not applied by this file.
-- Requires the existing public.sobrizen_has_premium() entitlement function.
-- At most 13 aggregate rows per account. Only completed "5 choses" sessions
-- retain one UUID receipt each, so retries cannot increment the counter twice.
begin;

create table if not exists public.game_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (game_id in ('snake','blocks','merge','sequence','memory','reaction','taps','ground','mosaic','gems','sort','bubbles','links')),
  best_score bigint not null default 0 check (best_score between 0 and 1000000000),
  best_level integer not null default 0 check (best_level between 0 and 1000000),
  best_time_ms integer check (best_time_ms between 1 and 86400000),
  completed_sessions bigint not null default 0 check (completed_sessions between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,game_id),
  check (game_id<>'reaction' or best_score<=15),
  check (game_id<>'memory' or best_level<=4),
  check (best_time_ms is null or game_id='reaction' and best_score>0 or game_id='memory' and best_level=4),
  check (game_id='ground' or completed_sessions=0),
  check (game_id<>'ground' or best_score=0 and best_level=0 and best_time_ms is null)
);
create table if not exists public.game_record_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id,run_id)
);
comment on table public.game_records is 'Private, client-reported leisure records; no clinical metric or public ranking.';
comment on table public.game_record_completions is 'Idempotency receipts for completed 5 choses sessions only; one UUID per completion.';

alter table public.game_records enable row level security;
alter table public.game_record_completions enable row level security;
revoke all on public.game_records,public.game_record_completions from public,anon,authenticated;
grant select,insert,update on public.game_records to authenticated;
grant select,insert on public.game_record_completions to authenticated;
grant all on public.game_records,public.game_record_completions to service_role;

create policy game_records_read_own on public.game_records for select to authenticated
  using ((select auth.uid())=user_id);
create policy game_records_insert_own on public.game_records for insert to authenticated
  with check ((select auth.uid())=user_id and (game_id in ('snake','blocks','ground') or (select public.sobrizen_has_premium())));
create policy game_records_update_own on public.game_records for update to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id and (game_id in ('snake','blocks','ground') or (select public.sobrizen_has_premium())));
create policy game_record_completions_read_own on public.game_record_completions for select to authenticated
  using ((select auth.uid())=user_id);
create policy game_record_completions_insert_own on public.game_record_completions for insert to authenticated
  with check ((select auth.uid())=user_id);

create or replace function public.keep_game_record_monotone()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if new.user_id<>old.user_id or new.game_id<>old.game_id then
    raise exception using errcode='22023',message='A personal record cannot change owner or game.';
  end if;
  new.best_score:=greatest(old.best_score,new.best_score);
  new.best_level:=greatest(old.best_level,new.best_level);
  new.best_time_ms:=case when old.best_time_ms is null then new.best_time_ms
    when new.best_time_ms is null then old.best_time_ms else least(old.best_time_ms,new.best_time_ms) end;
  new.completed_sessions:=greatest(old.completed_sessions,new.completed_sessions);
  new.created_at:=old.created_at;
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function public.keep_game_record_monotone() from public,anon,authenticated;
create or replace trigger game_records_monotone before update on public.game_records
  for each row execute function public.keep_game_record_monotone();

create or replace function public.save_game_record(
  p_game_id text,p_score bigint,p_level integer,p_time_ms integer,
  p_completed boolean,p_run_id uuid,p_expected_user_id uuid
)
returns public.game_records language plpgsql security invoker set search_path=''
as $$
declare
  uid uuid:=(select auth.uid());
  completion_increment bigint:=0;
  result public.game_records;
begin
  if uid is null or p_expected_user_id is distinct from uid then
    raise exception using errcode='42501',message='The game session no longer belongs to this account.';
  end if;
  if p_game_id is null or p_game_id not in ('snake','blocks','merge','sequence','memory','reaction','taps','ground','mosaic','gems','sort','bubbles','links')
    or p_run_id is null or p_completed is null
    or p_score is null or p_score<0 or p_score>1000000000
    or p_level is null or p_level<0 or p_level>1000000
    or p_time_ms is not null and (p_time_ms<1 or p_time_ms>86400000)
    or p_game_id='reaction' and p_score>15
    or p_game_id='memory' and p_level>4
    or p_time_ms is not null and not (p_game_id='reaction' and p_score>0 or p_game_id='memory' and p_level=4 and p_completed)
    or p_game_id='ground' and (p_score<>0 or p_level<>0 or p_time_ms is not null) then
    raise exception using errcode='22023',message='Invalid game result.';
  end if;
  if p_game_id not in ('snake','blocks','ground') and not public.sobrizen_has_premium() then
    raise exception using errcode='42501',message='Premium is required for this game.';
  end if;
  if p_game_id='ground' and p_completed then
    insert into public.game_record_completions(user_id,run_id) values(uid,p_run_id)
      on conflict(user_id,run_id) do nothing;
    get diagnostics completion_increment=row_count;
    if completion_increment=0 then
      select * into result from public.game_records where user_id=uid and game_id='ground';
      return result;
    end if;
  end if;

  insert into public.game_records as existing(user_id,game_id,best_score,best_level,best_time_ms,completed_sessions)
    values(uid,p_game_id,p_score,p_level,p_time_ms,completion_increment)
  on conflict(user_id,game_id) do update set
    best_score=greatest(existing.best_score,excluded.best_score),
    best_level=greatest(existing.best_level,excluded.best_level),
    best_time_ms=case when existing.best_time_ms is null then excluded.best_time_ms
      when excluded.best_time_ms is null then existing.best_time_ms else least(existing.best_time_ms,excluded.best_time_ms) end,
    completed_sessions=existing.completed_sessions+excluded.completed_sessions,
    updated_at=now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.save_game_record(text,bigint,integer,integer,boolean,uuid,uuid) from public,anon;
grant execute on function public.save_game_record(text,bigint,integer,integer,boolean,uuid,uuid) to authenticated;
commit;
