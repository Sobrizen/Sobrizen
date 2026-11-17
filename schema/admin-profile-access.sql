-- Permission discovery for the current signed-in account; returns no statistics or identity.
create function sobrizen_admin.has_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from sobrizen_admin.operators o join auth.users u on u.id=o.user_id
    where o.user_id=auth.uid() and u.deleted_at is null and u.email_confirmed_at is not null
  );
$$;
revoke all on function sobrizen_admin.has_access() from public, anon, authenticated;
grant execute on function sobrizen_admin.has_access() to authenticated;

create function public.sobrizen_admin_access()
returns boolean language sql stable security invoker set search_path = ''
as $$ select sobrizen_admin.has_access(); $$;
revoke all on function public.sobrizen_admin_access() from public, anon, authenticated;
grant execute on function public.sobrizen_admin_access() to authenticated;
comment on function public.sobrizen_admin_access() is 'Whether the current authenticated, confirmed account is allowed to open aggregate administration. No identity parameter or user_metadata authorization.';
