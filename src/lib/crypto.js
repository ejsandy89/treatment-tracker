// Client-side password-based encryption for exporting/importing a full backup
// of the app's data. Uses the browser's Web Crypto API (AES-GCM with a
// PBKDF2-derived key) so an exported file is safe to send over email,
// WhatsApp, etc. — without the passphrase it's just noise.

const PBKDF2_ITERATIONS = 250000;

function toBase64(bytes) {
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
function fromBase64(b64) {
  const binary = atob(b64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Returns a JSON-serialisable envelope: { v, salt, iv, data }
export async function encryptPayload(plainObject, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(plainObject));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    v: 1,
    app: "treatment-tracker-backup",
    exportedAt: new Date().toISOString(),
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
}

// Throws if the passphrase is wrong or the file is corrupt/tampered with.
export async function decryptPayload(envelope, passphrase) {
  if (!envelope || envelope.v !== 1 || !envelope.salt || !envelope.iv || !envelope.data) {
    throw new Error("This doesn't look like a Treatment Tracker backup file.");
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.data);
  const key = await deriveKey(passphrase, salt);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("Couldn't decrypt this file — check the passphrase and try again.");
  }
}
