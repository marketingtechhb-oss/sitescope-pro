// netlify/functions/ipn-webhook.js
//
// NOWPayments calls this endpoint whenever a payment's status changes.
// We verify the HMAC-SHA512 signature (header x-nowpayments-sig) using the
// IPN secret before trusting the payload, then mark the order as paid.
//
// Signature rule per NOWPayments docs: sort the JSON body's keys
// alphabetically (recursively), JSON.stringify it, and HMAC-SHA512 it with
// the IPN secret. The hex digest must match the header.

const crypto = require("crypto");
const { sendAccessLinkEmail } = require("./_lib/send-email");
const { getSafeStore } = require("./_lib/blob-store");

const PAID_STATUSES = ["finished", "confirmed"];

function sortObject(obj) {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObject(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

function verifySignature(rawBody, signature, secret) {
  if (!signature) return false;
  const parsed = JSON.parse(rawBody);
  const sorted = JSON.stringify(sortObject(parsed));
  const hmac = crypto.createHmac("sha512", secret).update(sorted).digest("hex");
  return hmac === signature;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    return { statusCode: 500, body: "Server misconfigured: missing NOWPAYMENTS_IPN_SECRET." };
  }

  const signature = event.headers["x-nowpayments-sig"] || event.headers["X-Nowpayments-Sig"];

  let valid = false;
  try {
    valid = verifySignature(event.body, signature, secret);
  } catch {
    valid = false;
  }

  if (!valid) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  const data = JSON.parse(event.body);
  const orderId = data.order_id;
  const status = data.payment_status;

  if (!orderId) {
    return { statusCode: 400, body: "Missing order_id" };
  }

  const store = getSafeStore("orders");
  const existing = (await store.get(orderId, { type: "json" })) || {};
  const wasAlreadyPaid = existing.status === "paid";
  const isNowPaid = PAID_STATUSES.includes(status);

  await store.setJSON(orderId, {
    ...existing,
    status: isNowPaid ? "paid" : status,
    lastPaymentStatus: status,
    updatedAt: Date.now(),
  });

  if (isNowPaid && !wasAlreadyPaid && existing.email) {
    try {
      await sendAccessLinkEmail({ to: existing.email, orderId, auditedUrl: existing.url });
    } catch {
      // Don't fail the webhook just because the email failed to send —
      // the report is still reachable via the "resend my link" flow.
    }
  }

  return { statusCode: 200, body: "OK" };
};
