const { getStore } = require("@netlify/blobs");

// A tiny key/value API in front of Netlify Blobs. Every key used by the app
// (treatments, appointments, test-entries, patient-info, etc.) lives in one
// "app-data" store, shared by everyone who opens this site — that's what
// makes it "live": one person's phone adding a treatment shows up on
// everyone else's phone too, next time they load or refresh the app.
//
// There's no per-user login, so treat this URL itself as the access
// boundary — see the README for adding a password gate.
//
// NOTE: Netlify's automatic Blobs configuration doesn't always reach every
// function (a known platform quirk — see MissingBlobsEnvironmentError).
// To work around it, we configure the store explicitly using a Site ID and
// access token supplied as environment variables. See the README for how to
// set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in the Netlify dashboard.
function getAppStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return getStore({ name: "app-data", consistency: "strong", siteID, token });
  }
  // Falls back to Netlify's automatic configuration if it happens to be
  // available in this environment.
  return getStore({ name: "app-data", consistency: "strong" });
}

exports.handler = async (event) => {
  const store = getAppStore();

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
