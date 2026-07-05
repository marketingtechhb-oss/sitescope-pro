// netlify/functions/check-min.js
//
// TEMPORARY DIAGNOSTIC TOOL — not part of the normal app flow.
// Calls NOWPayments' own GET /v1/min-amount endpoint so we can see the real
// current minimum for a given currency pair, instead of guessing.
//
// Usage: /.netlify/functions/check-min?currency_from=usdttrc20&currency_to=usd
// (currency_to defaults to usd if omitted)
//
// Delete this file once diagnosis is done — it's not needed for production.

const API_BASE = process.env.NOWPAYMENTS_API_BASE || "https://api.nowpayments.io/v1";

function cors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": process.env.SITE_URL || "*",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return cors({ error: "Missing NOWPAYMENTS_API_KEY" }, 500);

  const currencyFrom = (event.queryStringParameters?.currency_from || "").trim();
  const currencyTo = (event.queryStringParameters?.currency_to || "usd").trim();

  if (!currencyFrom) {
    return cors({ error: "Pass ?currency_from=usdttrc20 (or trx, ltc, etc.)" }, 400);
  }

  try {
    const res = await fetch(
      `${API_BASE}/min-amount?currency_from=${encodeURIComponent(currencyFrom)}&currency_to=${encodeURIComponent(currencyTo)}&fiat_equivalent=usd`,
      { headers: { "x-api-key": apiKey } }
    );
    const data = await res.json();
    return cors({ status: res.status, data, apiBaseUsed: API_BASE });
  } catch (err) {
    return cors({ error: "Unexpected error: " + (err.message || String(err)) }, 500);
  }
};
