// Shared, live data storage — backed by a Netlify Function + Netlify Blobs
// instead of anything local to a device. Everyone who opens this site's URL
// reads and writes the same store, so one person adding a treatment shows up
// on everyone else's phone too (next time they load or refresh the app).
// There's no per-user login, so the URL itself is the access boundary — see
// the README for adding a password gate before sharing it around.

const ENDPOINT = "/.netlify/functions/blob";

export async function storageGet(key) {
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${key} failed: ${res.status}`);
    const data = await res.json();
    return data.value ?? null;
  } catch (e) {
    console.error("storageGet failed", key, e);
    return null;
  }
}

export async function storageSet(key, value) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) throw new Error(`SET ${key} failed: ${res.status}`);
    return true;
  } catch (e) {
    console.error("storageSet failed", key, e);
    return false;
  }
}

export async function loadKey(key, fallback) {
  const value = await storageGet(key);
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function saveKey(key, value) {
  return storageSet(key, JSON.stringify(value));
}
