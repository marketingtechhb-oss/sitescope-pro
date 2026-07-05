// netlify/functions/audit.js
//
// Runs the website audit through Gemini using a server-side API key
// (env var GEMINI_API_KEY, set in Netlify → Site settings → Environment variables).
// The browser only ever sends a URL and gets back audit JSON — it never sees the key.

const ALLOWED_ORIGIN = process.env.SITE_URL || "*";

function cors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function buildPrompt(url, domain) {
  return `You are an expert website auditor. Your task is to audit the specific website: ${url}

This is a REAL audit. You must analyze this exact domain "${domain}" based on everything you know about it — its industry, typical design patterns, common technical issues for this type of site, and its likely audience.

CRITICAL RULES:
- Every score must reflect the REAL state of ${domain} specifically
- Do NOT use generic scores like 70, 75, 80 for everything — vary them based on actual site characteristics
- The summary must mention the actual domain name and its specific industry/purpose
- Each category issue must describe problems specific to THIS website, not generic websites
- Recommendations must reference actual elements of ${domain} (e.g. mention their product pages, contact forms, blog, etc.)
- Scores should vary significantly between categories (e.g. a restaurant site might score 90 on content but 30 on SEO)
- "grade" must be a letter grade (A+, A, A-, B+, B, B-, C+, C, C-, D, F) consistent with globalScore
- "strengths" and "quickWins" must be short, concrete, and specific to ${domain} — no generic filler
- Each recommendation needs an "impact" and "effort" rated exactly "High", "Medium", or "Low"

Respond with ONLY a JSON object. No text before or after. No markdown. Start directly with {

{
  "globalScore": <realistic score 0-100 specific to ${domain}>,
  "grade": "<letter grade consistent with globalScore>",
  "summary": "<2-3 sentences mentioning ${domain} by name, its industry, its main strengths AND specific weaknesses you identified>",
  "strengths": [
    "<specific concrete strength of ${domain}>",
    "<second specific strength>",
    "<third specific strength>"
  ],
  "quickWins": [
    "<a fast, low-effort fix specific to ${domain} that would meaningfully help>",
    "<a second quick win>",
    "<a third quick win>"
  ],
  "categories": [
    {"name":"SEO","icon":"🔍","score":<realistic score>,"issues":"<specific SEO issues for ${domain}>"},
    {"name":"Performance","icon":"⚡","score":<realistic score>,"issues":"<specific performance issues>"},
    {"name":"UX & Design","icon":"🎨","score":<realistic score>,"issues":"<specific UX issues for ${domain}>"},
    {"name":"Security","icon":"🔒","score":<realistic score>,"issues":"<specific security status for ${domain}>"},
    {"name":"Content","icon":"📝","score":<realistic score>,"issues":"<specific content issues>"},
    {"name":"Mobile","icon":"📱","score":<realistic score>,"issues":"<specific mobile issues for ${domain}>"}
  ],
  "recommendations": [
    {"priority":"critical","title":"<specific action title>","description":"<detailed fix referencing actual elements of ${domain}>","category":"SEO","impact":"High","effort":"Medium"},
    {"priority":"critical","title":"<specific action title>","description":"<detailed fix with specific technical steps>","category":"Performance","impact":"High","effort":"Medium"},
    {"priority":"medium","title":"<specific action title>","description":"<detailed fix referencing ${domain} pages or features>","category":"UX & Design","impact":"Medium","effort":"Low"},
    {"priority":"medium","title":"<specific action title>","description":"<detailed fix for ${domain} content strategy>","category":"Content","impact":"Medium","effort":"Medium"},
    {"priority":"low","title":"<specific action title>","description":"<enhancement specific to ${domain} industry and audience>","category":"Mobile","impact":"Low","effort":"Low"},
    {"priority":"low","title":"<specific action title>","description":"<enhancement for ${domain} long term growth>","category":"Security","impact":"Low","effort":"Medium"}
  ]
}`;
}

function tryRepairJson(raw) {
  let fixed = raw;
  let braces = 0;
  let brackets = 0;
  for (const ch of fixed) {
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }
  const last = fixed.trimEnd().slice(-1);
  if (last !== "}" && last !== "]" && last !== '"') fixed += '"';
  while (brackets > 0) {
    fixed += "]";
    brackets--;
  }
  while (braces > 0) {
    fixed += "}";
    braces--;
  }
  return JSON.parse(fixed);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors({});
  if (event.httpMethod !== "POST") return cors({ error: "Method not allowed" }, 405);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return cors({ error: "Server misconfigured: missing GEMINI_API_KEY." }, 500);
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return cors({ error: "Invalid request body." }, 400);
  }

  const url = (payload.url || "").trim();
  if (!isValidHttpUrl(url)) {
    return cors({ error: "Please provide a valid URL starting with http:// or https://" }, 400);
  }

  const domain = new URL(url).hostname;
  const prompt = buildPrompt(url, domain);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 5500, responseMimeType: "application/json" },
        }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return cors({ error: errData.error?.message || "Audit provider error." }, 502);
    }

    const data = await res.json();
    let txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    txt = txt.replace(/```json|```/g, "").trim();

    const jsonStart = txt.indexOf("{");
    const jsonEnd = txt.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return cors({ error: "The audit engine returned an unreadable response. Please try again." }, 502);
    }
    txt = txt.slice(jsonStart, jsonEnd + 1);
    txt = txt.replace(/[\x00-\x1F\x7F]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

    let audit;
    try {
      audit = JSON.parse(txt);
    } catch {
      audit = tryRepairJson(txt);
    }

    return cors({ audit, url });
  } catch (err) {
    return cors({ error: "Unexpected error while running the audit." }, 500);
  }
};
