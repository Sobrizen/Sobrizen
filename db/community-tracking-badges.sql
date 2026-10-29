-- Additive migration: community_automatic_tracking_badges.
-- Existing posts retain their original declared duration and null provenance.
alter table public.posts
  add column abstinence_source text check (abstinence_source in ('tracking','declared')),
  add constraint posts_abstinence_source_requires_days check (abstinence_source is null or abstinence_days is not null);

comment on column public.posts.abstinence_days is 'Abstinence duration at publication. New app messages take the current active stop from the canonical tracking model after explicit sharing confirmation. Editing a message preserves its original snapshot. Legacy values may have been manually declared.';
comment on column public.posts.abstinence_source is 'Provenance of the publication-time duration: tracking for the current canonical stop, declared for explicitly declared demo/legacy values, null for older posts or no duration. This is not a medically verified abstinence claim.';

notify pgrst,'reload schema';
