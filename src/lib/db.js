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
