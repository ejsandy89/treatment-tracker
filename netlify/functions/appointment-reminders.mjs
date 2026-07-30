// Runs once an hour (see the "config.schedule" export below) and checks
// every household for appointments/treatments happening in roughly 24 hours,
// sending a push reminder to anyone with reminders turned on. Uses
// sent_reminders to make sure the same appointment doesn't get reminded
// about twice during that ~1 hour window.
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY as environment variables (Site configuration >
// Environment variables). Without these, the function exits immediately —
// nothing breaks, you just won't get reminders until they're set.
//
// Note: treatments/appointments are stored as one JSON blob per household
// (not one database row each), since that's how the rest of the app stores
// them — so this fetches each household's data and checks it in code,
// rather than querying a per-appointment table directly. Fine at this
// app's scale (a handful of households), not something you'd want at
// thousands of households.

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const REMINDER_WINDOW_HOURS = 24;
const WINDOW_TOLERANCE_MINUTES = 35; // a bit more than half the hourly cadence, so nothing gets missed between runs

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("appointment-reminders: not configured, skipping");
    return new Response("not configured");
  }

  webpush.setVapidDetails("mailto:no-reply@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const now = new Date();
  const targetStart = new Date(now.getTime() + (REMINDER_WINDOW_HOURS * 60 - WINDOW_TOLERANCE_MINUTES) * 60000);
  const targetEnd = new Date(now.getTime() + (REMINDER_WINDOW_HOURS * 60 + WINDOW_TOLERANCE_MINUTES) * 60000);

  const { data: households } = await supabase.from("households").select("id, name");
  let remindersSent = 0;

  for (const household of households || []) {
    const { data: rows } = await supabase
      .from("app_data")
      .select("key, value")
      .eq("household_id", household.id)
      .in("key", ["treatments", "appointments"]);

    const items = [];
    (rows || []).forEach(row => {
      const kind = row.key === "treatments" ? "treatment" : "appointment";
      (row.value || []).forEach(entry => {
        if (!entry.date || entry.status === "Skipped" || entry.status === "Completed") return;
        const when = new Date(`${entry.date}T${entry.time || "09:00"}:00`);
        if (when >= targetStart && when <= targetEnd) {
          const label = kind === "treatment"
            ? (entry.type === "Other" ? (entry.typeCustom || "treatment") : entry.type)
            : (entry.name || entry.role || "appointment");
          items.push({ id: `${kind}-${entry.id}`, kind, label, date: entry.date, time: entry.time || "" });
        }
      });
    });

    if (items.length === 0) continue;

    // Filter out anything already reminded about.
    const { data: already } = await supabase
      .from("sent_reminders")
      .select("item_id")
      .eq("household_id", household.id)
      .in("item_id", items.map(i => i.id));
    const alreadySent = new Set((already || []).map(r => r.item_id));
    const toRemind = items.filter(i => !alreadySent.has(i.id));
    if (toRemind.length === 0) continue;

    const { data: members } = await supabase.from("household_members").select("user_id").eq("household_id", household.id);
    const memberIds = (members || []).map(m => m.user_id);
    if (memberIds.length === 0) continue;

    const { data: prefs } = await supabase
      .from("notification_prefs")
      .select("user_id, reminders_enabled")
      .eq("household_id", household.id)
      .in("user_id", memberIds);
    const disabled = new Set((prefs || []).filter(p => p.reminders_enabled === false).map(p => p.user_id));
    const eligibleUserIds = memberIds.filter(id => !disabled.has(id));

    if (eligibleUserIds.length > 0) {
      const { data: subs } = await supabase.from("push_subscriptions").select("*").in("user_id", eligibleUserIds);

      for (const item of toRemind) {
        const title = item.kind === "treatment" ? `⏰ Treatment tomorrow: ${item.label}` : `⏰ Appointment tomorrow: ${item.label}`;
        const timeText = item.time ? ` at ${item.time}` : "";
        const message = `Coming up tomorrow${timeText} — ${household.name || "your tracker"}.`;

        await Promise.all((subs || []).map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title, body: message })
            );
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        }));
        remindersSent++;
      }
    }

    // Mark these as sent regardless of whether anyone was actually
    // subscribed, so we don't keep re-checking them every hour.
    await supabase.from("sent_reminders").upsert(
      toRemind.map(i => ({ household_id: household.id, item_id: i.id })),
      { onConflict: "household_id,item_id" }
    );
  }

  console.log(`appointment-reminders: sent ${remindersSent} reminder(s)`);
  return new Response(JSON.stringify({ remindersSent }));
};

export const config = {
  schedule: "@hourly",
};
