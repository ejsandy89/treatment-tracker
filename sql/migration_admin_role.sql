-- ============================================================
-- Migration: add an "admin" role
--
-- Only run this if your Supabase project already exists (i.e. your app is
-- already live and has data in it). If you're setting this up fresh, just
-- use the current sql/schema.sql instead — it already includes this.
--
-- Safe to run whether or not you've previously run
-- migration_editor_role.sql — this one checks for both possible policy
-- names left behind by earlier versions before replacing them.
--
-- Run this once, in full, in your Supabase project's SQL Editor.
-- It does not delete or change any existing data.
-- ============================================================

-- Widen the allowed roles on both tables
alter table household_members drop constraint if exists household_members_role_check;
alter table household_members add constraint household_members_role_check
  check (role in ('owner', 'admin', 'editor', 'viewer'));

alter table invites drop constraint if exists invites_role_check;
alter table invites add constraint invites_role_check
  check (role in ('admin', 'editor', 'viewer'));

-- households: let admins (not just the owner) update the household
drop policy if exists "owner can update their household" on households;
drop policy if exists "owner or admin can update their household" on households;
create policy "owner or admin can update their household" on households
  for update using (household_role(id) in ('owner', 'admin'));

-- household_members: let admins remove members too
drop policy if exists "owner can remove members" on household_members;
drop policy if exists "owner or admin can remove members" on household_members;
create policy "owner or admin can remove members" on household_members
  for delete using (household_role(household_id) in ('owner', 'admin'));

-- invites: let admins manage invites too
drop policy if exists "owner can manage invites" on invites;
drop policy if exists "owner or admin can manage invites" on invites;
create policy "owner or admin can manage invites" on invites
  for all using (household_role(household_id) in ('owner', 'admin'))
  with check (household_role(household_id) in ('owner', 'admin'));

-- app_data: let admins write, same as owner/editor
drop policy if exists "owner can insert app_data" on app_data;
drop policy if exists "owner or editor can insert app_data" on app_data;
drop policy if exists "owner, admin or editor can insert app_data" on app_data;
create policy "owner, admin or editor can insert app_data" on app_data
  for insert with check (household_role(household_id) in ('owner', 'admin', 'editor'));

drop policy if exists "owner can update app_data" on app_data;
drop policy if exists "owner or editor can update app_data" on app_data;
drop policy if exists "owner, admin or editor can update app_data" on app_data;
create policy "owner, admin or editor can update app_data" on app_data
  for update using (household_role(household_id) in ('owner', 'admin', 'editor'));

drop policy if exists "owner can delete app_data" on app_data;
drop policy if exists "owner or editor can delete app_data" on app_data;
drop policy if exists "owner, admin or editor can delete app_data" on app_data;
create policy "owner, admin or editor can delete app_data" on app_data
  for delete using (household_role(household_id) in ('owner', 'admin', 'editor'));

-- support_messages: let admins delete too
drop policy if exists "owner can delete support messages" on support_messages;
drop policy if exists "owner or editor can delete support messages" on support_messages;
drop policy if exists "owner, admin or editor can delete support messages" on support_messages;
create policy "owner, admin or editor can delete support messages" on support_messages
  for delete using (household_role(household_id) in ('owner', 'admin', 'editor'));
