// netlify/functions/audit.js
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

function buildPrompt(url, domain, lang = "en") {
  return `You are an elite global website auditor and senior full-stack consultant. Analyze the website: ${url} (Domain: ${domain}).
Provide an extremely thorough, exhaustive, and premium architectural audit suitable for an international enterprise scale. 
The analysis must be strictly conducted and written in the language corresponding to this code: "${lang}".

CRITICAL EXPECTATIONS:
- Never mention geographical limitations (do not restrict to specific regions). Target a global international audience.
- The globalScore must be realistic and scientifically justified based on performance, accessibility, SEO, best practices, UX, and security.
- The content must be highly technical, structured, and contain rich data paragraphs, not brief summaries.

Respond with ONLY a raw valid JSON object. No markdown blocks, no text headers.

{
  "globalScore": <0-100 score>,
  "summary": "<Deep, comprehensive 4-6 sentence executive analysis detailing precise industrial bottlenecks, architecture flaws, and growth positioning for ${domain}>",
  "categories": [
    {"name": "SEO", "icon": "🔍", "score": <score>, "issues": "<Detailed paragraph analyzing crawlability, internationalization tags, Core Web Vitals impact on SERP, and semantic metadata architecture.>"},
    {"name": "Performance", "icon": "⚡", "score": <score>, "issues": "<Granular breakdown of TTFB, LCP, TBT, code-splitting inefficiencies, rendering bottlenecks, and global CDN latency issues.>"},
    {"name": "UX & Conversion", "icon": "🎨", "score": <score>, "issues": "<Deep cognitive load analysis, international accessibility compliance (WCAG), interactive element friction, and international checkout/conversion flow holes.>"},
    {"name": "Security & Trust", "icon": "🔒", "score": <score>, "issues": "<Assessment of SSL implementation depth, HTTP security headers (CSP, HSTS, X-Content-Type-Options), client-side data vectors, and user data privacy compliance.>"},
    {"name": "Content & Localization", "icon": "📝", "score": <score>, "issues": "<Evaluation of international readability, localization precision, search intent matching, and content layout hierarchical architecture.>"},
    {"name": "Mobile Responsiveness", "icon": "📱", "score": <score>, "issues": "<Detailed assessment of mobile viewport rendering shift, touch target sizing, dynamic asset scaling, and mobile network performance throttling behaviors.>"}
  ],
  "recommendations": [
    {"priority": "critical", "title": "<High Impact Action>", "description": "<Extremely precise technical fix instructions referencing exact architectural changes required>", "category": "Performance"},
    {"priority": "critical", "title": "<Critical Setup>", "description": "<Exact configuration adjustments required for global compliance and discoverability>", "category": "SEO"},
    {"priority": "medium", "title": "<UX Optimization>", "description": "<Actionable layouts or conversion rate optimization adjustments>", "category": "UX & Conversion"},
    {"priority": "medium", "title": "<Security Hardening>", "description": "<Precise rules or headers to deploy immediately>", "category": "Security & Trust"},
    {"priority": "low", "title": "<Localization Fine-Tuning>", "description": "<Enhancements for multilingual rendering and cross-border performance optimization>", "category": "Content & Localization"}
  ]
}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors({});
  if (event.httpMethod !== "POST") return cors({ error: "Method not allowed" }, 405);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return cors({ error: "Server missing GEMINI_API_KEY." }, 500);

  let payload = JSON.parse(event.body || "{}");
  const url = (payload.url || "").trim();
  const lang = (payload.lang || "en").trim();

  if (!url.startsWith("http")) return cors({ error: "Invalid URL." }, 400);

  const domain = new URL(url).hostname;
  const prompt = buildPrompt(url, domain, lang);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.15, responseMimeType: "application/json" },
      }),
    });

    const data = await res.json();
    let txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return cors({ audit: JSON.parse(txt.trim()), url });
  } catch (err) {
    return cors({ error: "Audit failed." }, 500);
  }
};
