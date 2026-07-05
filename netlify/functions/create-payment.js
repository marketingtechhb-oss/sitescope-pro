// netlify/functions/create-payment.js
//
// Creates a NOWPayments invoice for the $2 report unlock and records a
// "pending" order in Netlify Blobs so the IPN webhook and the polling
// endpoint (check-payment.js) can agree on its status.

const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");
const { normalizeEmail, isValidEmail, addOrderToEmailIndex } = require("./_lib/email-index");

const PRICE_USD = 2;

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
  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    return cors({ error: "Please provide a valid email address to receive your access link." }, 400);
  }
  const orderId = crypto.randomUUID();

  try {
    const invoiceRes = await fetch("https://api.nowpayments.io/v1/invoice", {
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

    const store = getStore("orders");
    await store.setJSON(orderId, {
      status: "pending",
      url: auditedUrl,
      audit,
      email,
      createdAt: Date.now(),
    });
    await addOrderToEmailIndex(email, orderId);

    return cors({ orderId, invoiceUrl: invoiceData.invoice_url });
  } catch (err) {
    return cors({ error: "Unexpected error while creating the payment." }, 500);
  }
};
