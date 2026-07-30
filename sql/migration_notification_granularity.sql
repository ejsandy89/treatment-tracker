-- ============================================================
-- Migration: granular notification preferences + prescription reminders
--
-- Replaces the single "new data" on/off toggle with separate toggles per
-- notification type, and adds what's needed for prescription dose-time
-- reminders. Safe to run on an existing project — doesn't touch any
-- existing data, and everything defaults to on (matching the previous
-- behaviour) so nobody's settings silently change.
--
-- Run this once, in full, in your Supabase project's SQL Editor.
-- ============================================================

alter table notification_prefs add column if not exists treatment_completed_enabled boolean not null default true;
alter table notification_prefs add column if not exists new_treatments_enabled boolean not null default true;
alter table notification_prefs add column if not exists new_appointments_enabled boolean not null default true;
alter table notification_prefs add column if not exists new_results_enabled boolean not null default true;
alter table notification_prefs add column if not exists support_messages_enabled boolean not null default true;
-- reminders_enabled already exists from the original push-notifications
-- migration and is reused as-is for both appointment/treatment 24-hour
-- reminders and prescription dose-time reminders.

-- The old blanket "new_data_enabled" column is left in place (harmless,
-- unused going forward) rather than dropped, so nothing breaks if anything
-- still references it.
