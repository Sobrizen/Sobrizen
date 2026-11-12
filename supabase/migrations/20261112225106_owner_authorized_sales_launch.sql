begin;
alter table public.billing_config add column if not exists owner_launch_authorized boolean not null default false;
alter table public.billing_config add column if not exists owner_launch_authorized_at timestamptz;
comment on column public.billing_config.owner_launch_authorized is 'Explicit commercial launch decision by the owner; separate from legal_ready. Only server-side administration may change it.';
comment on column public.billing_config.owner_launch_authorized_at is 'Timestamp of explicit owner commercial authorization. Does not certify legal compliance.';
notify pgrst,'reload schema';
commit;
