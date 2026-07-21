-- ============================================================
-- Migration: add an "editor" role
--
-- Only run this if you already set up Supabase using an earlier version of
-- sql/schema.sql (i.e. your app is already live and has data in it). If
-- you're setting this up fresh, just use the current sql/schema.sql instead
-- — it already includes this.
--
-- Run this once, in full, in your Supabase project's SQL Editor.
-- It does not delete or change any existing data.
-- ============================================================

-- Widen the allowed roles on both tables
alter table household_members drop constraint if exists household_members_role_check;
alter table household_members add constraint household_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

alter table invites drop constraint if exists invites_role_check;
alter table invites add constraint invites_role_check
  check (role in ('editor', 'viewer'));

-- Let editors write to app_data the same as owners (viewers still read-only)
drop policy if exists "owner can insert app_data" on app_data;
drop policy if exists "owner or editor can insert app_data" on app_data;
create policy "owner or editor can insert app_data" on app_data
  for insert with check (household_role(household_id) in ('owner', 'editor'));

drop policy if exists "owner can update app_data" on app_data;
drop policy if exists "owner or editor can update app_data" on app_data;
create policy "owner or editor can update app_data" on app_data
  for update using (household_role(household_id) in ('owner', 'editor'));

drop policy if exists "owner can delete app_data" on app_data;
drop policy if exists "owner or editor can delete app_data" on app_data;
create policy "owner or editor can delete app_data" on app_data
  for delete using (household_role(household_id) in ('owner', 'editor'));

-- Let editors delete support messages too (same as owners)
drop policy if exists "owner can delete support messages" on support_messages;
drop policy if exists "owner or editor can delete support messages" on support_messages;
create policy "owner or editor can delete support messages" on support_messages
  for delete using (household_role(household_id) in ('owner', 'editor'));
