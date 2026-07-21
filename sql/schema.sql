-- ============================================================
-- Treatment Tracker — Supabase schema
--
-- Run this once, in full, in your Supabase project's SQL Editor
-- (left sidebar → SQL Editor → New query → paste this whole file → Run).
--
-- What this sets up:
--   - households: one per family/owner
--   - household_members: who belongs to which household, and as what role
--     ("owner" = the original creator, full access + manages invites/household,
--     "admin" = same as owner including managing invites/household, but isn't
--     the original creator, "editor" = full data access but can't manage
--     invites/household, "viewer" = read-only + can add support messages)
--   - invites: shareable invite links, role "admin", "editor" or "viewer"
--     (chosen by an owner or admin when creating the link)
--   - app_data: a generic key/value store for treatments, appointments,
--     test results, patient info, card/tab order — owner/admin/editor write, all members read
--   - support_messages: its own table (not app_data), so viewers can be given
--     permission to INSERT without being able to touch anything else
--
-- All access rules below are enforced by the database itself (Row Level
-- Security), not by the app's own code — so even a bug in the frontend can't
-- let a viewer see or change something they shouldn't.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Tables ----------

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_idx on household_members(user_id);

create table if not exists invites (
  token uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked boolean not null default false
);
create index if not exists invites_household_idx on invites(household_id);

create table if not exists app_data (
  household_id uuid not null references households(id) on delete cascade,
  key text not null,
  value jsonb not null default 'null',
  updated_at timestamptz not null default now(),
  primary key (household_id, key)
);
create index if not exists app_data_household_idx on app_data(household_id);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text,
  date date not null,
  message text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_household_idx on support_messages(household_id);

-- ---------- Helper: what role (if any) does the current user have in a household? ----------
-- SECURITY DEFINER means this function bypasses RLS internally when it looks
-- itself up in household_members — without this, the RLS policies below would
-- recursively query the very table they're protecting.
create or replace function public.household_role(hh uuid)
returns text
language sql
security definer
stable
as $$
  select role from household_members where household_id = hh and user_id = auth.uid();
$$;

-- ---------- Enable RLS ----------
alter table households enable row level security;
alter table household_members enable row level security;
alter table invites enable row level security;
alter table app_data enable row level security;
alter table support_messages enable row level security;

-- ---------- households ----------
create policy "members can view their household" on households
  for select using (household_role(id) is not null);
create policy "a user can create a household they own" on households
  for insert with check (auth.uid() = owner_id);
create policy "owner or admin can update their household" on households
  for update using (household_role(id) in ('owner', 'admin'));

-- ---------- household_members ----------
create policy "members can view membership of their household" on household_members
  for select using (household_role(household_id) is not null);
create policy "owner or admin can remove members" on household_members
  for delete using (household_role(household_id) in ('owner', 'admin'));
-- Joining a household as anything other than owner only happens via
-- redeem_invite() below (a SECURITY DEFINER function), never a direct
-- insert. The only direct insert allowed is a brand-new owner adding
-- themselves to a household they just created and genuinely own:
create policy "new owner can add their own membership" on household_members
  for insert with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (select 1 from households h where h.id = household_id and h.owner_id = auth.uid())
  );

-- ---------- invites ----------
create policy "owner or admin can manage invites" on invites
  for all using (household_role(household_id) in ('owner', 'admin'))
  with check (household_role(household_id) in ('owner', 'admin'));

-- ---------- app_data (owner/admin/editor read/write, viewer read-only) ----------
create policy "members can read app_data" on app_data
  for select using (household_role(household_id) is not null);
create policy "owner, admin or editor can insert app_data" on app_data
  for insert with check (household_role(household_id) in ('owner', 'admin', 'editor'));
create policy "owner, admin or editor can update app_data" on app_data
  for update using (household_role(household_id) in ('owner', 'admin', 'editor'));
create policy "owner, admin or editor can delete app_data" on app_data
  for delete using (household_role(household_id) in ('owner', 'admin', 'editor'));

-- ---------- support_messages (anyone in the household can add; owner/admin/editor can delete) ----------
create policy "members can read support messages" on support_messages
  for select using (household_role(household_id) is not null);
create policy "members can add support messages" on support_messages
  for insert with check (household_role(household_id) is not null);
create policy "owner, admin or editor can delete support messages" on support_messages
  for delete using (household_role(household_id) in ('owner', 'admin', 'editor'));

-- ---------- Invite redemption ----------
-- Runs as SECURITY DEFINER so it can safely insert a household_members row
-- on the invited user's behalf, after checking the invite is genuinely valid.
create or replace function public.redeem_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  inv invites%rowtype;
begin
  select * into inv from invites where token = invite_token;

  if inv is null then
    raise exception 'This invite link is not valid.';
  end if;
  if inv.revoked then
    raise exception 'This invite link has been revoked.';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invite link has expired.';
  end if;
  if household_role(inv.household_id) is not null then
    return inv.household_id; -- already a member, nothing more to do
  end if;

  insert into household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), inv.role);

  return inv.household_id;
end;
$$;

-- ---------- Realtime ----------
-- Lets the app get instant updates instead of having to poll.
alter publication supabase_realtime add table app_data;
alter publication supabase_realtime add table support_messages;
