-- Operator-only decision references. No message body, email or health record is copied.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create table private.operations_review_log (
  id uuid primary key default gen_random_uuid(),
  queue text not null check(queue in ('billing_request','content_report')),
  source_id uuid not null,
  decision text not null check(decision in ('needs_follow_up','no_action','content_removed','request_completed','request_rejected')),
  reviewed_at timestamptz not null default clock_timestamp()
);
create index operations_review_source_time on private.operations_review_log(queue,source_id,reviewed_at desc);
alter table private.operations_review_log enable row level security;
revoke all on private.operations_review_log from public,anon,authenticated;
comment on table private.operations_review_log is 'Restricted operator decision log: references only, no copied content or customer identity. No client API access.';
commit;
