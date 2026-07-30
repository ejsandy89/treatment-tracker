// Sends a push notification to everyone in a household who's subscribed and
// has notifications turned on — excluding whoever triggered it, so people
// don't get notified about their own change.
//
// Requires two environment variables (Site configuration > Environment
// variables): VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (a matching pair — see
// README for how to generate your own), plus the same SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY used by the scheduled reminder function. Without
// these set, this function does nothing (fails silently) — the rest of the
// app works fine either way, you just won't get push notifications.

const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: "not_configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }
  const { householdId, excludeUserId, title, body: message, selfTest, userId, category } = body;

  // Maps a notification's category to the specific preference column that
  // should gate it — each category defaults to on if never explicitly set.
  const CATEGORY_COLUMNS = {
    treatment_added: "new_treatments_enabled",
    treatment_completed: "treatment_completed_enabled",
    appointment_added: "new_appointments_enabled",
    result_added: "new_results_enabled",
    support_message: "support_messages_enabled",
  };
  const prefColumn = CATEGORY_COLUMNS[category] || "new_treatments_enabled";

  webpush.setVapidDetails("mailto:no-reply@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Self-test path: send straight back to the person who asked, ignoring the
  // usual "everyone except whoever made the change" logic — this is exactly
  // for verifying your own device/subscription works.
  if (selfTest && userId) {
    const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId);
    let sent = 0;
    await Promise.all((subs || []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: title || "🔔 Test notification", body: message || "If you can see this, notifications are working." })
        );
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }));
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sent }) };
  }

  if (!householdId || !title) return { statusCode: 400, body: "Missing householdId or title" };

  // Only notify members who have this specific category of notification
  // turned on (defaulting to on if they've never set a preference).
  const { data: members } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);
  const memberIds = (members || []).map(m => m.user_id).filter(id => id !== excludeUserId);
  if (memberIds.length === 0) return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };

  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select(`user_id, ${prefColumn}`)
    .eq("household_id", householdId)
    .in("user_id", memberIds);
  const disabledUserIds = new Set((prefs || []).filter(p => p[prefColumn] === false).map(p => p.user_id));
  const eligibleUserIds = memberIds.filter(id => !disabledUserIds.has(id));
  if (eligibleUserIds.length === 0) return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("user_id", eligibleUserIds);

  let sent = 0;
  await Promise.all((subs || []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body: message || "" })
      );
      sent++;
    } catch (e) {
      // A 404/410 means the subscription is dead (uninstalled, permission
      // revoked, etc.) — clean it up so future sends don't keep failing on it.
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }));

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sent }) };
};
