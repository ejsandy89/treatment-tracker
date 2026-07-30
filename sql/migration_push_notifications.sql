-- ============================================================
-- Migration: push notifications
--
-- Adds what's needed for browser push notifications: a table of each
-- device's push subscription, a table of per-person notification
-- preferences, and a small table tracking which appointment/treatment
-- reminders have already been sent (so the scheduled reminder function
-- doesn't send the same one twice).
--
-- Run this once, in full, in your Supabase project's SQL Editor.
-- Safe to run on an existing project — doesn't touch any existing data.
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_household_idx on push_subscriptions(household_id);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

create table if not exists notification_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  new_data_enabled boolean not null default true,
  reminders_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, household_id)
);

-- Tracks which appointment/treatment reminders have already been sent, so
-- the hourly scheduled function doesn't re-send the same 24-hour reminder
-- every time it runs during that window.
create table if not exists sent_reminders (
  household_id uuid not null references households(id) on delete cascade,
  item_id text not null,
  sent_at timestamptz not null default now(),
  primary key (household_id, item_id)
);

alter table push_subscriptions enable row level security;
alter table notification_prefs enable row level security;
alter table sent_reminders enable row level security;

-- push_subscriptions: a person manages only their own device subscriptions.
-- (The functions that actually send notifications run with the service-role
-- key server-side, which bypasses RLS entirely — this policy only governs
-- what the browser/client itself can do.)
create policy "user manages their own push subscriptions" on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_prefs: a person manages only their own preferences, for
-- households they're actually a member of.
create policy "user manages their own notification prefs" on notification_prefs
  for all using (user_id = auth.uid() and household_role(household_id) is not null)
  with check (user_id = auth.uid() and household_role(household_id) is not null);

-- sent_reminders: no client access needed at all — only the scheduled
-- function (via the service-role key) reads/writes this table.
create policy "no direct client access to sent_reminders" on sent_reminders
  for all using (false) with check (false);
