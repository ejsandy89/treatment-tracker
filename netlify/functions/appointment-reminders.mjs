// Runs once an hour (see the "config.schedule" export below) and checks
// every household for: (a) appointments/treatments happening in roughly 24
// hours, and (b) prescriptions with a reminder time falling in the current
// hour on a day a dose is due — sending a push reminder to anyone with
// reminders turned on. Uses sent_reminders to make sure the same item
// doesn't get reminded about twice during a given ~1 hour window.
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY as environment variables (Site configuration >
// Environment variables). Without these, the function exits immediately —
// nothing breaks, you just won't get reminders until they're set.
//
// Note: treatments/appointments/prescriptions are stored as one JSON blob
// per household (not one database row each), since that's how the rest of
// the app stores them — so this fetches each household's data and checks it
// in code, rather than querying a per-item table directly. Fine at this
// app's scale (a handful of households), not something you'd want at
// thousands of households.
//
// Known limitation: prescription reminder times are compared against the
// server's clock as-is, with no timezone stored against the time you pick —
// same simplification already used for appointment times. If the server and
// your local timezone differ, reminders may arrive at a different clock
// time than expected.

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const REMINDER_WINDOW_HOURS = 24;
const WINDOW_TOLERANCE_MINUTES = 35; // a bit more than half the hourly cadence, so nothing gets missed between runs

function addDaysToDateStr(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Mirrors generateRxSchedule() in the app itself — only the date list is
// needed here, not the dose labels.
function rxScheduleDates(rx) {
  if (!rx.startDate) return [];
  const dates = [];
  if (rx.courseType === "taper") {
    let offset = 0;
    (rx.stages || []).forEach(stage => {
      const days = parseInt(stage.days, 10) || 0;
      for (let i = 0; i < days; i++) { dates.push(addDaysToDateStr(rx.startDate, offset)); offset++; }
    });
  } else {
    const perDay = rx.frequency === "Twice daily" ? 2 : 1;
    const total = parseInt(rx.doseCount, 10) || 0;
    let offset = 0, done = 0;
    while (done < total) {
      const todayCount = Math.min(perDay, total - done);
      dates.push(addDaysToDateStr(rx.startDate, offset));
      done += todayCount;
      offset++;
    }
  }
  return dates;
}

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("appointment-reminders: not configured, skipping");
    return new Response("not configured");
  }

  webpush.setVapidDetails("mailto:no-reply@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const targetStart = new Date(now.getTime() + (REMINDER_WINDOW_HOURS * 60 - WINDOW_TOLERANCE_MINUTES) * 60000);
  const targetEnd = new Date(now.getTime() + (REMINDER_WINDOW_HOURS * 60 + WINDOW_TOLERANCE_MINUTES) * 60000);

  const { data: households } = await supabase.from("households").select("id, name");
  let remindersSent = 0;

  for (const household of households || []) {
    const { data: rows } = await supabase
      .from("app_data")
      .select("key, value")
      .eq("household_id", household.id)
      .in("key", ["treatments", "appointments", "prescriptions"]);

    const rowByKey = Object.fromEntries((rows || []).map(r => [r.key, r.value]));

    // ----- Appointments / treatments due in ~24 hours -----
    const items = [];
    ["treatments", "appointments"].forEach(key => {
      const kind = key === "treatments" ? "treatment" : "appointment";
      (rowByKey[key] || []).forEach(entry => {
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

    // ----- Prescription doses due around now, today -----
    const rxItems = [];
    (rowByKey.prescriptions || []).forEach(rx => {
      if (!rx.reminderTime) return;
      const scheduleDates = rxScheduleDates(rx);
      if (!scheduleDates.includes(todayStr)) return;
      const reminderMoment = new Date(`${todayStr}T${rx.reminderTime}:00`);
      const diffMinutes = Math.abs((reminderMoment.getTime() - now.getTime()) / 60000);
      if (diffMinutes <= WINDOW_TOLERANCE_MINUTES) {
        rxItems.push({ id: `rx-${rx.id}-${todayStr}`, kind: "prescription", label: rx.name, date: todayStr, time: rx.reminderTime });
      }
    });

    const allItems = [...items, ...rxItems];
    if (allItems.length === 0) continue;

    // Filter out anything already reminded about.
    const { data: already } = await supabase
      .from("sent_reminders")
      .select("item_id")
      .eq("household_id", household.id)
      .in("item_id", allItems.map(i => i.id));
    const alreadySent = new Set((already || []).map(r => r.item_id));
    const toRemind = allItems.filter(i => !alreadySent.has(i.id));
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
        let title, message;
        if (item.kind === "prescription") {
          title = `⏰ Time to take ${item.label}`;
          message = `Scheduled for ${item.time} — ${household.name || "your tracker"}.`;
        } else {
          title = item.kind === "treatment" ? `⏰ Treatment tomorrow: ${item.label}` : `⏰ Appointment tomorrow: ${item.label}`;
          const timeText = item.time ? ` at ${item.time}` : "";
          message = `Coming up tomorrow${timeText} — ${household.name || "your tracker"}.`;
        }

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

