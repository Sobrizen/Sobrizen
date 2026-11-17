create or replace function public.claim_notification_push(p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  -- A worker can terminate after sending its fifth attempt but before acknowledging it.
  update private.notification_push_queue set finished_at=now(),outcome='failed'
    where finished_at is null and attempts>=5 and (leased_until is null or leased_until<now());
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

