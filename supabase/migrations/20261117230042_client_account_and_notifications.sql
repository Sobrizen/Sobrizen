-- Additive account experience. Never backfill alerts from old community activity.
create schema if not exists private;

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  likes_enabled boolean not null default true,
  comments_enabled boolean not null default true,
  push_enabled boolean not null default false
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
create policy notification_preferences_owner on public.notification_preferences for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null constraint user_notifications_actor_id_fkey references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  kind text not null check (kind in ('like','comment')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (recipient_id<>actor_id),
  check ((kind='like' and comment_id is null) or (kind='comment' and comment_id is not null))
);
create unique index user_notifications_like_once on public.user_notifications(recipient_id,actor_id,post_id) where kind='like';
create unique index user_notifications_comment_once on public.user_notifications(comment_id) where kind='comment';
create index user_notifications_recipient_created on public.user_notifications(recipient_id,created_at desc,id desc);
create index user_notifications_unread on public.user_notifications(recipient_id) where read_at is null;
create index user_notifications_actor on public.user_notifications(actor_id);
create index user_notifications_post on public.user_notifications(post_id);
create index posts_author_created_id on public.posts(author_id,created_at desc,id desc);
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public,anon,authenticated;
grant select,update(read_at) on public.user_notifications to authenticated;
create policy notifications_read_owner on public.user_notifications for select to authenticated using ((select auth.uid())=recipient_id);
create policy notifications_mark_owner on public.user_notifications for update to authenticated
  using ((select auth.uid())=recipient_id) with check ((select auth.uid())=recipient_id);

create function public.mark_notifications_read(p_ids uuid[] default null,p_before timestamptz default now()) returns integer
language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Connexion requise.';end if;
  if cardinality(p_ids)>100 then raise exception 'Trop de notifications.';end if;
  update public.user_notifications set read_at=statement_timestamp()
    where recipient_id=(select auth.uid()) and read_at is null
    and created_at<=least(p_before,statement_timestamp()) and (p_ids is null or id=any(p_ids));
  get diagnostics changed=row_count;return changed;
end;$$;
revoke all on function public.mark_notifications_read(uuid[],timestamptz) from public,anon;
grant execute on function public.mark_notifications_read(uuid[],timestamptz) to authenticated;

create function private.notify_post_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;recipient uuid;enabled boolean;
begin
  if tg_table_name='post_likes' then actor:=new.user_id;else actor:=new.author_id;end if;
  if auth.uid() is not null and auth.uid()<>actor then raise exception using errcode='42501',message='Auteur invalide.';end if;
  select p.author_id into recipient from public.posts p where p.id=new.post_id;
  if recipient is null or recipient=actor then return new;end if;
  if exists(select 1 from public.user_settings s where s.user_id=recipient and actor=any(s.hidden_authors)) then return new;end if;
  if tg_table_name='post_likes' then
    select np.likes_enabled into enabled from public.notification_preferences np where np.user_id=recipient;
    if coalesce(enabled,true) then
      insert into public.user_notifications(recipient_id,actor_id,post_id,kind) values(recipient,actor,new.post_id,'like') on conflict do nothing;
    end if;
  else
    select np.comments_enabled into enabled from public.notification_preferences np where np.user_id=recipient;
    if coalesce(enabled,true) then
      insert into public.user_notifications(recipient_id,actor_id,post_id,comment_id,kind) values(recipient,actor,new.post_id,new.id,'comment') on conflict do nothing;
    end if;
  end if;
  return new;
end;$$;
revoke all on function private.notify_post_activity() from public,anon,authenticated,service_role;
create trigger notify_post_like after insert on public.post_likes for each row execute function private.notify_post_activity();
create trigger notify_post_comment after insert on public.comments for each row execute function private.notify_post_activity();

-- Realtime respects the recipient SELECT policy; polling remains a fallback.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end;$$;

-- Preserve every existing private export, and add only the member's own social data.
create or replace function public.export_personal_data() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();result jsonb;item record;rows jsonb;
begin
  if uid is null then raise exception using errcode='42501',message='Connecte-toi pour exporter tes données.';end if;
  result:=jsonb_build_object('version',6,'demo',false,'exported_at',statement_timestamp());
  for item in select * from (values
    ('profile','profiles','id',true),('journey','sobriety_journeys','user_id',true),
    ('settings','user_settings','user_id',true),('journey_timeline','journey_timelines','user_id',true),
    ('progress_settings','progress_settings','user_id',true),('subscription_anchor','subscription_anchors','user_id',true),
    ('checks','daily_checkins','user_id',false),('journal','journal_entries','user_id',false),
    ('urges','urge_events','user_id',false),('reasons','reasons','user_id',false),
    ('program','program_progress','user_id',false),('health_checkins','health_checkins','user_id',false),
    ('progress_chapters','progress_chapters','user_id',false),('agenda_items','agenda_items','user_id',false),
    ('game_records','game_records','user_id',false),('game_record_completions','game_record_completions','user_id',false),
    ('posts','posts','author_id',false),('comments','comments','author_id',false),('likes','post_likes','user_id',false),
    ('notification_preferences','notification_preferences','user_id',true),('notifications','user_notifications','recipient_id',false)
  ) as allowlist(export_key,table_name,owner_column,single_row) loop
    if to_regclass(format('public.%I',item.table_name)) is null then
      rows:=case when item.single_row then 'null'::jsonb else '[]'::jsonb end;
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where t.%I=$1',item.table_name,item.owner_column) into rows using uid;
      if item.single_row then rows:=coalesce(rows->0,'null'::jsonb);end if;
    end if;
    result:=result||jsonb_build_object(item.export_key,rows);
  end loop;
  return result;
end;$$;
revoke all on function public.export_personal_data() from public,anon;
grant execute on function public.export_personal_data() to authenticated;
