const { getStore } = require("@netlify/blobs");

// A tiny key/value API in front of Netlify Blobs. Every key used by the app
// (treatments, appointments, test-entries, patient-info, etc.) lives in one
// "app-data" store, shared by everyone who opens this site — that's what
// makes it "live": one person's phone adding a treatment shows up on
// everyone else's phone too, next time they load or refresh the app.
//
// There's no per-user login, so treat this URL itself as the access
// boundary — see the README for adding a password gate.

exports.handler = async (event) => {
  const store = getStore({ name: "app-data", consistency: "strong" });

  if (event.httpMethod === "GET") {
    const key = event.queryStringParameters && event.queryStringParameters.key;
    if (!key) return { statusCode: 400, body: "Missing ?key=" };
    const value = await store.get(key);
    if (value === null || value === undefined) {
      return { statusCode: 404, body: "Not found" };
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    };
  }

  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON body" };
    }
    const { key, value } = payload;
    if (!key || value === undefined) return { statusCode: 400, body: "Missing key or value" };
    await store.set(key, value);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  }

  return { statusCode: 405, body: "Method not allowed" };
};
