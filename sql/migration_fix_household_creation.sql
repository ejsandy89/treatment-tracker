-- ============================================================
-- Migration: fix "new row violates row-level security policy for
-- table households" when creating a new household
--
-- The original SELECT policy on households only allowed someone to view a
-- household once they were already a member of it. But creating a household
-- asks the database to hand back the new row (to read its generated id),
-- which requires SELECT permission on that row too — and at that exact
-- moment, the owner isn't a member yet (that happens in the next step).
-- This adds "...or you're the owner" as an extra way to pass the check,
-- which breaks the loop.
--
-- Safe to run on an existing project — doesn't touch any data.
-- ============================================================

drop policy if exists "members can view their household" on households;
create policy "members can view their household" on households
  for select using (household_role(id) is not null or owner_id = auth.uid());
