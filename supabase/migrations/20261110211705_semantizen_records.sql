-- Add only the SémantiZen ID; preserve all existing records, RLS and grants.
begin;
alter table public.game_records drop constraint game_records_game_id_check;
alter table public.game_records add constraint game_records_game_id_check check(game_id in ('snake','blocks','merge','sequence','memory','reaction','taps','ground','mosaic','gems','sort','bubbles','links','semantizen'));
alter table public.game_records add constraint game_records_semantizen_check check(game_id<>'semantizen' or (best_score between 990000 and 999999 and best_level=0 and best_time_ms is null and completed_sessions=0));
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
  if p_game_id is null or p_game_id not in ('snake','blocks','merge','sequence','memory','reaction','taps','ground','mosaic','gems','sort','bubbles','links','semantizen')
    or p_run_id is null or p_completed is null
    or p_score is null or p_score<0 or p_score>1000000000
    or p_level is null or p_level<0 or p_level>1000000
    or p_time_ms is not null and (p_time_ms<1 or p_time_ms>86400000)
    or p_game_id='reaction' and p_score>15
    or p_game_id='memory' and p_level>4
    or p_time_ms is not null and not (p_game_id='reaction' and p_score>0 or p_game_id='memory' and p_level=4 and p_completed)
    or p_game_id='semantizen' and (not p_completed or p_score<990000 or p_score>999999 or p_level<>0 or p_time_ms is not null)
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


notify pgrst,'reload schema';
commit;
