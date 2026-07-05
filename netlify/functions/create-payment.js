// netlify/functions/create-payment.js
//
// Creates a NOWPayments invoice for the report unlock and records a
// "pending" order in Netlify Blobs so the IPN webhook and the polling
// endpoint (check-payment.js) can agree on its status.
//
// No email is collected. Access to the unlocked report is by orderId link
// only, and is single-use: once the PDF is downloaded, consume-report.js
// deletes the stored order so the same link can't be reopened — a new
// audit + payment is required for another report.

const crypto = require("crypto");
const { getSafeStore } = require("./_lib/blob-store");

// $2 is below the minimum payment amount NOWPayments enforces for several
// cryptocurrencies (network-fee-driven minimums vary per coin). $5 clears
// the minimum for the large majority of supported currencies. Adjust here
// if you restrict to specific low-fee coins (e.g. USDT-TRC20, TRX) and want
// to lower it — check https://nowpayments.io's minimum-amount status page
// or the /v1/min-amount endpoint for exact current minimums per currency.
const PRICE_USD = 5;
const API_BASE = process.env.NOWPAYMENTS_API_BASE || "https://api.nowpayments.io/v1";

function cors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": process.env.SITE_URL || "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors({});
  if (event.httpMethod !== "POST") return cors({ error: "Method not allowed" }, 405);

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  const siteUrl = process.env.SITE_URL; // e.g. https://your-site.netlify.app
  if (!apiKey || !siteUrl) {
    return cors({ error: "Server misconfigured: missing NOWPAYMENTS_API_KEY or SITE_URL." }, 500);
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return cors({ error: "Invalid request body." }, 400);
  }

  const auditedUrl = (payload.url || "").trim();
  const audit = payload.audit || null;
  const orderId = crypto.randomUUID();

  try {
    const invoiceRes = await fetch(`${API_BASE}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: PRICE_USD,
        price_currency: "usd",
        order_id: orderId,
        order_description: `SiteScope Pro — full report unlock${auditedUrl ? " for " + auditedUrl : ""}`,
        ipn_callback_url: `${siteUrl}/.netlify/functions/ipn-webhook`,
        success_url: `${siteUrl}/?order_id=${orderId}&paid=1`,
        cancel_url: `${siteUrl}/?order_id=${orderId}&canceled=1`,
      }),
    });

    const invoiceData = await invoiceRes.json();
    if (!invoiceRes.ok || !invoiceData.invoice_url) {
      return cors({ error: invoiceData.message || "Could not create payment invoice." }, 502);
    }

    const store = getSafeStore("orders");
    await store.setJSON(orderId, {
      status: "pending",
      url: auditedUrl,
      audit,
      createdAt: Date.now(),
    });

    return cors({ orderId, invoiceUrl: invoiceData.invoice_url, price: PRICE_USD });
  } catch (err) {
    console.error("create-payment error:", err);
    return cors({ error: "Unexpected error: " + (err && err.message ? err.message : String(err)) }, 500);
  }
};
