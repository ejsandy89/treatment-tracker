import { supabase } from "./supabaseClient.js";

// ---------- Auth ----------
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}
export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}
export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  return supabase.auth.signOut();
}

// ---------- Household / membership ----------
export async function getMyMembership() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, role, households(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { householdId: data.household_id, role: data.role, householdName: data.households?.name || "" };
}

export async function createHousehold(name) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Not signed in.");
  const { data: household, error } = await supabase
    .from("households")
    .insert({ name: name || "Our tracker", owner_id: user.id })
    .select()
    .single();
  if (error) throw error;
  const { error: memErr } = await supabase
    .from("household_members")
    .insert({ household_id: household.id, user_id: user.id, role: "owner" });
  if (memErr) throw memErr;
  return { householdId: household.id, role: "owner", householdName: household.name };
}

export async function redeemInvite(token) {
  const { data, error } = await supabase.rpc("redeem_invite", { invite_token: token });
  if (error) throw error;
  return data; // household_id
}

export async function createInvite(householdId, role = "viewer") {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  const { data, error } = await supabase
    .from("invites")
    .insert({ household_id: householdId, role, created_by: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function listInvites(householdId) {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
  return error ? [] : data;
}
export async function revokeInvite(token) {
  const { error } = await supabase.from("invites").update({ revoked: true }).eq("token", token);
  return !error;
}
export async function listMembers(householdId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("user_id, role, joined_at")
    .eq("household_id", householdId)
    .order("joined_at", { ascending: true });
  return error ? [] : data;
}

// ---------- Generic key/value app data (treatments, appointments, results, etc.) ----------
// Deliberately kept at module scope with a single "active household" set once
// after sign-in, so the rest of the app can keep calling loadKey(key, fallback)
// / saveKey(key, value) exactly as before, without threading a household id
// through every component.
let _householdId = null;
export function setActiveHousehold(id) {
  _householdId = id;
}

export async function loadKey(key, fallback) {
  if (!_householdId) return fallback;
  try {
    const { data, error } = await supabase
      .from("app_data")
      .select("value")
      .eq("household_id", _householdId)
      .eq("key", key)
      .maybeSingle();
    if (error || !data || data.value === null || data.value === undefined) return fallback;
    return data.value;
  } catch {
    return fallback;
  }
}

export async function saveKey(key, value) {
  if (!_householdId) return false;
  try {
    const { error } = await supabase
      .from("app_data")
      .upsert(
        { household_id: _householdId, key, value, updated_at: new Date().toISOString() },
        { onConflict: "household_id,key" }
      );
    return !error;
  } catch {
    return false;
  }
}

// ---------- Support messages (own table, so viewers can insert without wider access) ----------
export async function listSupportMessages() {
  if (!_householdId) return [];
  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .eq("household_id", _householdId)
    .order("date", { ascending: false });
  return error ? [] : data.map(m => ({ id: m.id, name: m.name || "", date: m.date, message: m.message }));
}
export async function addSupportMessage({ name, date, message }) {
  if (!_householdId) return false;
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("support_messages").insert({
    household_id: _householdId, name, date, message, created_by: userData?.user?.id || null,
  });
  return !error;
}
export async function deleteSupportMessage(id) {
  const { error } = await supabase.from("support_messages").delete().eq("id", id);
  return !error;
}

// ---------- Push notifications ----------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function getPushPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function getExistingPushSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// Requests permission (if needed), subscribes this device via the service
// worker, and saves the subscription against the current user + household.
export async function subscribeToPush(vapidPublicKey) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications aren't supported in this browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission wasn't granted.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user || !_householdId) throw new Error("Not signed in.");

  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, household_id: _householdId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
  return true;
}

export async function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator)) return true;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
  return true;
}

export async function getNotificationPrefs() {
  const fallback = {
    reminders_enabled: true,
    treatment_completed_enabled: true,
    new_treatments_enabled: true,
    new_appointments_enabled: true,
    new_results_enabled: true,
    support_messages_enabled: true,
  };
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user || !_householdId) return fallback;
  const { data, error } = await supabase
    .from("notification_prefs")
    .select("reminders_enabled, treatment_completed_enabled, new_treatments_enabled, new_appointments_enabled, new_results_enabled, support_messages_enabled")
    .eq("user_id", user.id).eq("household_id", _householdId)
    .maybeSingle();
  return (error || !data) ? fallback : { ...fallback, ...data };
}

export async function setNotificationPrefs(prefs) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user || !_householdId) return false;
  const { error } = await supabase.from("notification_prefs").upsert(
    { user_id: user.id, household_id: _householdId, ...prefs, updated_at: new Date().toISOString() },
    { onConflict: "user_id,household_id" }
  );
  return !error;
}

// Best-effort request to push a notification to the rest of the household
// (excluding whoever just made the change). Never throws — a notification
// failing to send should never block the actual data save.
export async function notifyHousehold({ title, body, category }) {
  if (!_householdId) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    await fetch("/.netlify/functions/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId: _householdId, excludeUserId: userData?.user?.id, title, body, category }),
    });
  } catch {
    // best-effort only — swallow errors
  }
}

// Sends a notification straight back to the current user's own device(s),
// bypassing the normal "everyone except whoever made the change" rule — for
// checking your own setup actually works, without needing a second person.
export async function sendTestNotification() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Not signed in.");
  const res = await fetch("/.netlify/functions/send-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selfTest: true, userId: user.id, title: "🔔 Test notification", body: "If you can see this, notifications are working." }),
  });
  const data = await res.json();
  if (!data || typeof data.sent !== "number") throw new Error("Unexpected response from the server.");
  return data.sent;
}

// ---------- Realtime ----------
// Subscribes to changes on this household's data and support messages, and
// calls onChange(table, payload) whenever something changes — used to keep
// everyone's view live without polling.
export function subscribeToHousehold(householdId, onChange) {
  const channel = supabase
    .channel(`household-${householdId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "app_data", filter: `household_id=eq.${householdId}` },
      payload => onChange("app_data", payload))
    .on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `household_id=eq.${householdId}` },
      payload => onChange("support_messages", payload))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
