// Optional: turns statistical pattern findings (already computed client-side —
// see findLocalPatterns in App.jsx) into a short, careful plain-English
// summary using the Anthropic API. Requires an ANTHROPIC_API_KEY environment
// variable (Site configuration > Environment variables). Without it, this
// returns summary: null and the frontend just shows the raw findings without
// the extra narrative — the feature still works either way.
//
// Deliberately does NOT receive raw treatment/blood data — only the already-
// computed statistical findings — to keep the payload small and the prompt
// tightly scoped to "describe these numbers carefully", not "analyse this
// person's medical history".

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const findings = Array.isArray(body.findings) ? body.findings : [];

  if (!apiKey) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: null, reason: "no_api_key" }) };
  }
  if (findings.length === 0) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: "" }) };
  }

  const findingsText = findings
    .slice(0, 12)
    .map(f => `- ${f.element} tends to go ${f.direction} in the ${f.avgWindowDays || 14} days after ${f.trigger} (${f.occurrences} instances logged, average change ${f.avgChangePct >= 0 ? "+" : ""}${f.avgChangePct.toFixed(0)}%)`)
    .join("\n");

  const prompt = `You are helping someone read some simple statistical observations calculated from their own personal cancer-treatment tracking data (a personal app, not a clinical tool). Here is what was found:

${findingsText}

Write a short, warm, plain-English summary (3-5 sentences) of what's been noticed. This is a small personal dataset, not a clinical study — do not use words like "causes" or "proves", do not suggest any change to treatment or medication, and do not offer a diagnosis. End by encouraging them to mention anything notable to their care team. Respond with ONLY the summary text — no preamble, no markdown, no headings.`;

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
        max_tokens: 350,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const block = (data.content || []).find(b => b.type === "text");
    if (!block || !block.text.trim()) throw new Error("no text block in response");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: block.text.trim() }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: null, reason: "api_error" }),
    };
  }
};
