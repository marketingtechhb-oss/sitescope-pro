// netlify/functions/create-payment.js
const crypto = require("crypto");
const { getSafeStore } = require("./_lib/blob-store");

const PRICE_USD = 9.99; // Prix calibré pour absorber les frais de réseau crypto standards

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
  const siteUrl = process.env.SITE_URL;
  if (!apiKey || !siteUrl) return cors({ error: "Missing configuration parameters." }, 500);

  let payload = JSON.parse(event.body || "{}");
  const auditedUrl = (payload.url || "").trim();
  const audit = payload.audit || null;
  const orderId = crypto.randomUUID();

  try {
    // Appel à l'API NOWPayments pour initialiser la facture crypto
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
        order_description: `Premium International Audit Unlock for ${auditedUrl}`,
        ipn_callback_url: `${siteUrl}/.netlify/functions/ipn-webhook`,
        success_url: `${siteUrl}/?order_id=${orderId}&paid=1`,
        cancel_url: `${siteUrl}/?order_id=${orderId}&canceled=1`,
      }),
    });

    const invoiceData = await invoiceRes.json();
    if (!invoiceRes.ok || !invoiceData.invoice_url) {
      return cors({ error: invoiceData.message || "Invoice creation failed." }, 502);
    }

    // Sauvegarde temporaire des données d'audit dans le Blob Store Netlify sous l'ID unique
    const store = getSafeStore("orders");
    await store.setJSON(orderId, {
      status: "pending",
      url: auditedUrl,
      audit,
      createdAt: Date.now(),
    });

    return cors({ orderId, invoiceUrl: invoiceData.invoice_url });
  } catch (err) {
    return cors({ error: err.message }, 500);
  }
};
