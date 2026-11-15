-- READ ONLY. Run in the Supabase SQL editor as an authorized project operator.
-- Do not add this file to the public frontend allowlist.
-- Assumes the operations_review_log migration is applied.
begin transaction read only;

-- Support backlog: no customer identity, message body or health data is selected.
select r.id,r.kind,r.status,r.created_at,
  current_timestamp-r.created_at as age,
  coalesce(review.decision,'not_reviewed') as last_decision
from public.billing_requests r
left join lateral (
  select l.decision from private.operations_review_log l
  where l.queue='billing_request' and l.source_id=r.id
  order by l.reviewed_at desc,l.id desc limit 1
) review on true
where r.status not in ('completed','rejected')
order by r.created_at asc limit 100;

-- Moderation backlog. Opening a particular report/content requires a separate human review.
select r.id,r.post_id,r.comment_id,r.created_at,
  current_timestamp-r.created_at as age,
  coalesce(review.decision,'not_reviewed') as last_decision
from public.content_reports r
left join lateral (
  select l.decision from private.operations_review_log l
  where l.queue='content_report' and l.source_id=r.id
  order by l.reviewed_at desc,l.id desc limit 1
) review on true
where review.decision is null or review.decision='needs_follow_up'
order by r.created_at asc limit 100;

commit;
