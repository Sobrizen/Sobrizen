-- Apply after the matching frontend and its versioned service worker are live.
-- Earlier RPC/RLS migration remains backward compatible during rollout.
begin;
revoke select on public.user_settings from public, anon, authenticated;
revoke select (support_name,support_phone,risky_situation,response_plan)
  on public.user_settings from public, anon, authenticated;
grant select (user_id,privacy_ack_at,health_data_consent_at,
  health_data_consent_version,health_data_consent_revoked_at,hidden_authors,
  reminder_time,updated_at) on public.user_settings to authenticated;
notify pgrst,'reload schema';
commit;
