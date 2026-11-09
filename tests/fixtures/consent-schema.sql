-- Test-only empty schema: column metadata read from production 2026-11-09.
-- No production data. Domain/FK constraints and auth/storage services are not emulated.
create table public."daily_checkins" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "checkin_date" date default CURRENT_DATE not null,
  "sober_today" boolean default true not null,
  "mood" smallint,
  "craving" smallint,
  "note" text,
  "trigger_tags" text[] default '{}'::text[] not null,
  "created_at" timestamp with time zone default now() not null,
  "sleep_hours" numeric(3,1),
  "energy" smallint,
  "alcohol_units" numeric(9,2),
  "alcohol_cost_eur" numeric(12,2),
  "quantity_method" text,
  "drink_details" jsonb
);
create table public."health_checkins" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "checkin_date" date not null,
  "mood" smallint,
  "energy" smallint,
  "sleep_quality" smallint,
  "anxiety" smallint,
  "concentration" smallint,
  "physical_comfort" smallint,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."journal_entries" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "entry_date" date default CURRENT_DATE not null,
  "title" text not null,
  "body" text not null,
  "kind" text default 'reflection'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "image_path" text,
  "image_alt" text,
  "shared_post_id" uuid
);
create table public."journey_timelines" (
  "user_id" uuid not null,
  "document" jsonb not null,
  "revision" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."profiles" (
  "id" uuid not null,
  "username" text not null,
  "display_name" text default 'Nouveau membre'::text not null,
  "avatar_url" text,
  "bio" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "avatar_path" text
);
create table public."program_progress" (
  "user_id" uuid not null,
  "step" integer not null,
  "reflection" text,
  "completed_at" timestamp with time zone default now() not null
);
create table public."progress_chapters" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "effective_on" date default CURRENT_DATE not null,
  "mode" text not null,
  "weekly_limit" numeric(9,2),
  "daily_limit" numeric(9,2),
  "planned_action" text,
  "support_first" boolean default false not null,
  "origin" text default 'chosen'::text not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."progress_settings" (
  "user_id" uuid not null,
  "subscription_started_on" date,
  "baseline_units_week" numeric(9,2),
  "baseline_cost_week" numeric(12,2),
  "baseline_note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."reasons" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "title" text not null,
  "detail" text,
  "icon" text,
  "position" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."sobriety_journeys" (
  "user_id" uuid not null,
  "started_at" timestamp with time zone default now() not null,
  "weekly_spend_estimate" numeric(10,2) default 0 not null,
  "why_text" text,
  "goal_note" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."subscription_anchors" (
  "user_id" uuid not null,
  "started_on" date not null,
  "source" text not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."urge_events" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "intensity" smallint not null,
  "context" text,
  "strategy" text,
  "outcome" text,
  "created_at" timestamp with time zone default now() not null
);
create table public."user_settings" (
  "user_id" uuid not null,
  "support_name" text,
  "support_phone" text,
  "risky_situation" text,
  "response_plan" text,
  "reminder_time" time without time zone default '20:00:00'::time without time zone not null,
  "privacy_ack_at" timestamp with time zone,
  "hidden_authors" uuid[] default '{}'::uuid[] not null,
  "updated_at" timestamp with time zone default now() not null,
  "health_data_consent_at" timestamp with time zone,
  "health_data_consent_version" text,
  "health_data_consent_revoked_at" timestamp with time zone
);
