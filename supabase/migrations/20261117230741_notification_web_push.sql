-- Push endpoints and encryption material are never readable by a browser client.
create table private.notification_push_config (
  singleton boolean primary key default true check(singleton),
  public_key text not null,
  private_key_secret uuid not null,
  dispatch_secret uuid not null,
  enabled boolean not null default false
);
create table private.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);
create index notification_devices_user on private.notification_devices(user_id);
create table private.notification_push_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.user_notifications(id) on delete cascade,
  device_id uuid not null references private.notification_devices(id) on delete cascade,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  leased_until timestamptz,
  finished_at timestamptz,
  outcome text check(outcome in ('sent','expired','invalid_device','failed')),
  unique(notification_id,device_id)
);
create index notification_push_pending on private.notification_push_queue(available_at) where finished_at is null;
create index notification_push_device on private.notification_push_queue(device_id);
alter table private.notification_push_config enable row level security;
alter table private.notification_devices enable row level security;
alter table private.notification_push_queue enable row level security;
revoke all on private.notification_push_config,private.notification_devices,private.notification_push_queue from public,anon,authenticated,service_role;

create function public.notification_push_public_key() returns text language sql stable security definer set search_path='' as $$
  select public_key from private.notification_push_config where enabled and (select auth.uid()) is not null;
$$;
revoke all on function public.notification_push_public_key() from public,anon;
grant execute on function public.notification_push_public_key() to authenticated;

create function public.register_notification_device(p_subscription jsonb) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();ep text:=p_subscription->>'endpoint';pub text:=p_subscription#>>'{keys,p256dh}';secret text:=p_subscription#>>'{keys,auth}';
begin
  if uid is null then raise exception using errcode='42501',message='Connexion requise.';end if;
  if not exists(select 1 from private.notification_push_config where enabled) then raise exception 'Alertes momentanément indisponibles.';end if;
  -- Exact vendor hosts prevent SSRF through user-controlled endpoints. No URL credentials, port, fragment or redirect.
  if ep is null or length(ep)>2048 or ep !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[A-Za-z0-9_./?=&%:+~-]+$'
    or pub is null or pub !~ '^[A-Za-z0-9_-]{87}=?$' or secret is null or secret !~ '^[A-Za-z0-9_-]{22}={0,2}$'
    then raise exception 'Abonnement de notification invalide.';end if;
  if exists(select 1 from private.notification_devices where endpoint=ep and user_id<>uid) then
    -- A shared browser must first unregister from its previous account.
    raise exception 'Cet appareil est lié à un autre compte. Désactive ses alertes avant de changer de compte.';
  end if;
  if (select count(*) from private.notification_devices where user_id=uid)>=10 and not exists(select 1 from private.notification_devices where endpoint=ep and user_id=uid) then raise exception 'Dix appareils maximum. Désactive les alertes sur un ancien appareil.';end if;
  insert into private.notification_devices(user_id,endpoint,p256dh,auth_key) values(uid,ep,pub,secret)
    on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key where private.notification_devices.user_id=uid;
  insert into public.notification_preferences(user_id,push_enabled) values(uid,true)
    on conflict(user_id) do update set push_enabled=true;
end;$$;
revoke all on function public.register_notification_device(jsonb) from public,anon;
grant execute on function public.register_notification_device(jsonb) to authenticated;

create function public.unregister_notification_device(p_endpoint text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception using errcode='42501',message='Connexion requise.';end if;
  delete from private.notification_devices where endpoint=p_endpoint and user_id=uid;
  if not exists(select 1 from private.notification_devices where user_id=uid) then
    update public.notification_preferences set push_enabled=false where user_id=uid;
  end if;
end;$$;
revoke all on function public.unregister_notification_device(text) from public,anon;
grant execute on function public.unregister_notification_device(text) to authenticated;

create function public.unregister_other_notification_devices(p_keep_endpoint text default null) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception using errcode='42501',message='Connexion requise.';end if;
  delete from private.notification_devices where user_id=uid and endpoint is distinct from p_keep_endpoint;
  if not exists(select 1 from private.notification_devices where user_id=uid) then update public.notification_preferences set push_enabled=false where user_id=uid;end if;
end;$$;
revoke all on function public.unregister_other_notification_devices(text) from public,anon;
grant execute on function public.unregister_other_notification_devices(text) to authenticated;

create function private.enqueue_notification_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.notification_push_queue(notification_id,device_id)
    select new.id,d.id from private.notification_devices d
    join public.notification_preferences p on p.user_id=d.user_id and p.push_enabled
    where d.user_id=new.recipient_id on conflict do nothing;
  return new;
end;$$;
revoke all on function private.enqueue_notification_push() from public,anon,authenticated,service_role;
create trigger enqueue_notification_push after insert on public.user_notifications for each row execute function private.enqueue_notification_push();

-- Only the Edge Function service role can claim or complete a delivery.
create function public.notification_push_runtime() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('public_key',c.public_key,'private_key',k.decrypted_secret,'dispatch_token',d.decrypted_secret,'enabled',c.enabled)
    from private.notification_push_config c
    join vault.decrypted_secrets k on k.id=c.private_key_secret
    join vault.decrypted_secrets d on d.id=c.dispatch_secret;
$$;
revoke all on function public.notification_push_runtime() from public,anon,authenticated;
grant execute on function public.notification_push_runtime() to service_role;

create function public.claim_notification_push(p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  -- Suppress stale, already-read or disabled alerts, including changes after enqueueing.
  update private.notification_push_queue q set finished_at=now(),outcome='expired'
    where finished_at is null and exists(
      select 1 from public.user_notifications n left join public.notification_preferences p on p.user_id=n.recipient_id
      left join public.user_settings s on s.user_id=n.recipient_id
      where n.id=q.notification_id and (n.read_at is not null or n.created_at<now()-interval '24 hours'
        or not coalesce(p.push_enabled,false) or n.kind='like' and not coalesce(p.likes_enabled,true)
        or n.kind='comment' and not coalesce(p.comments_enabled,true) or n.actor_id=any(s.hidden_authors)));
  with picked as (
    select q.id from private.notification_push_queue q where q.finished_at is null and q.available_at<=now()
      and (q.leased_until is null or q.leased_until<now()) and q.attempts<5
    order by q.available_at,q.id limit greatest(1,least(p_limit,50)) for update skip locked
  ), claimed as (
    update private.notification_push_queue q set attempts=attempts+1,lease_token=gen_random_uuid(),leased_until=now()+interval '2 minutes'
      from picked where q.id=picked.id returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'lease_token',q.lease_token,'notification_id',q.notification_id,
      'endpoint',d.endpoint,'keys',jsonb_build_object('p256dh',d.p256dh,'auth',d.auth_key))), '[]'::jsonb)
    into result from claimed q join private.notification_devices d on d.id=q.device_id;
  return result;
end;$$;
revoke all on function public.claim_notification_push(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_push(integer) to service_role;

create function public.complete_notification_push(p_id uuid,p_lease_token uuid,p_status integer) returns void language plpgsql security definer set search_path='' as $$
declare device uuid;
begin
  if p_status in (404,410) then
    select device_id into device from private.notification_push_queue where id=p_id and lease_token=p_lease_token and finished_at is null;
    if device is not null then delete from private.notification_devices where id=device;end if;
  else
    update private.notification_push_queue set
      finished_at=case when p_status between 200 and 299 or attempts>=5 then now() end,
      outcome=case when p_status between 200 and 299 then 'sent' when attempts>=5 then 'failed' end,
      available_at=now()+interval '1 minute'*power(2,attempts),leased_until=null,lease_token=null
      where id=p_id and lease_token=p_lease_token and finished_at is null;
  end if;
end;$$;
revoke all on function public.complete_notification_push(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.complete_notification_push(uuid,uuid,integer) to service_role;

-- Activation is separate: configure Vault keys, deploy the worker, then enable its scheduler.
