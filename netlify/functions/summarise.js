// Optional: turns appointment notes into bullet points using the Anthropic
// API. Requires an ANTHROPIC_API_KEY environment variable to be set in the
// Netlify dashboard (Site configuration > Environment variables). If it's not
// set, this returns bullets: null and the frontend quietly falls back to a
// simple sentence-split instead — the app works fine either way.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bullets: null, reason: "no_api_key" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const notes = String(body.notes || "").slice(0, 6000);
  if (!notes.trim()) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bullets: [] }) };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Summarise these clinical appointment notes into 3-5 short, punchy bullet points capturing only the key information (decisions, findings, next steps, changes to plan). Each bullet should be a single, self-contained fact or action — no run-on sentences, no repeating information across bullets. Respond with ONLY a JSON array of strings, no preamble, no markdown fences.\n\nNotes:\n${notes}`,
        }],
      }),
    });
    const data = await res.json();
    const block = (data.content || []).find(b => b.type === "text");
    if (!block) throw new Error("no text block in response");
    const cleaned = block.text.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) throw new Error("unexpected response shape");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bullets: arr.map(String) }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bullets: null, reason: "api_error" }),
    };
  }
};
