-- Supabase's documented database-native scheduling; no separate paid service.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create function private.dispatch_notification_push() returns bigint language plpgsql security definer set search_path='' as $$
declare request_id bigint;token text;
begin
  if not exists(select 1 from private.notification_push_config where enabled) then return null;end if;
  if not exists(select 1 from private.notification_push_queue where finished_at is null and available_at<=now() and (leased_until is null or leased_until<now())) then return null;end if;
  select s.decrypted_secret into token from vault.decrypted_secrets s join private.notification_push_config c on c.dispatch_secret=s.id where c.enabled;
  if token is null then return null;end if;
  select net.http_post(
    url:='https://lnvtowdbbagwfbewnchz.supabase.co/functions/v1/sobrizen-notifications',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
    body:='{}'::jsonb,timeout_milliseconds:=60000
  ) into request_id;
  return request_id;
end;$$;
revoke all on function private.dispatch_notification_push() from public,anon,authenticated,service_role;
select cron.schedule('sobrizen-community-notifications','* * * * *','select private.dispatch_notification_push()');
