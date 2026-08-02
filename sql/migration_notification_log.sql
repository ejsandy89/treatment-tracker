-- ============================================================
-- Migration: notification log
--
-- A push notification that's missed or dismissed is gone for good on most
-- platforms — there's no reliable way to get it back from the OS. This adds
-- a simple in-app record of what's been sent to a household recently, so
-- "what was that notification about?" always has an answer inside the app
-- itself, not just in the OS notification tray.
--
-- Only written by the server-side functions (via the service-role key,
-- which bypasses RLS) — no client ever inserts into this directly.
--
-- Run this once, in full, in your Supabase project's SQL Editor.
-- Safe to run on an existing project — doesn't touch any existing data.
-- ============================================================

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  body text,
  url text,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_household_idx on notification_log(household_id, created_at desc);

alter table notification_log enable row level security;

create policy "members can read their household's notification log" on notification_log
  for select using (household_role(household_id) is not null);

-- No insert/update/delete policy for regular users at all — only the
-- service-role key (used server-side in send-notification.js and
-- appointment-reminders.mjs) can write to this table.
