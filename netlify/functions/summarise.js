// Optional: uses the Anthropic API to summarise text — either appointment
// notes into bullet points (default), or a support message into 1-2 warm
// prose sentences (mode: "prose"). Requires an ANTHROPIC_API_KEY environment
// variable set in the Netlify dashboard (Site configuration > Environment
// variables). If it's not set, this returns a "no_api_key" reason and the
// frontend quietly falls back to a simple built-in version instead — the
// app works fine either way.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const mode = body.mode === "prose" ? "prose" : "bullets";
  const notes = String(body.notes || "").slice(0, 6000);

  if (!apiKey) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "prose" ? { summary: null, reason: "no_api_key" } : { bullets: null, reason: "no_api_key" }),
    };
  }

  if (!notes.trim()) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "prose" ? { summary: "" } : { bullets: [] }),
    };
  }

  const prompt = mode === "prose"
    ? `Summarise this message of support in 1-2 short, warm sentences, keeping its sentiment and tone. Respond with ONLY the summary text — no preamble, no quotation marks, no markdown.\n\nMessage:\n${notes}`
    : `Summarise these clinical appointment notes into 3-5 short, punchy bullet points capturing only the key information (decisions, findings, next steps, changes to plan). Each bullet should be a single, self-contained fact or action — no run-on sentences, no repeating information across bullets. Respond with ONLY a JSON array of strings, no preamble, no markdown fences.\n\nNotes:\n${notes}`;

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
        max_tokens: mode === "prose" ? 150 : 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const block = (data.content || []).find(b => b.type === "text");
    if (!block) throw new Error("no text block in response");

    if (mode === "prose") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: block.text.trim() }),
      };
    }

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
      body: JSON.stringify(mode === "prose" ? { summary: null, reason: "api_error" } : { bullets: null, reason: "api_error" }),
    };
  }
};
