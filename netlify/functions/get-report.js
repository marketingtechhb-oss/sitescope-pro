// netlify/functions/get-report.js
//
// Lets the browser reload a report by orderId — from a bookmarked link, a
// fresh browser session, or a different device — instead of only unlocking
// within the tab that made the payment. The audit content itself lives in
// Netlify Blobs (written by create-payment.js), keyed by orderId.

const { normalizeEmail } = require("./_lib/email-index");
const { getSafeStore } = require("./_lib/blob-store");

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
  if (event.httpMethod !== "GET") return cors({ error: "Method not allowed" }, 405);

  const orderId = event.queryStringParameters?.orderId;
  const email = normalizeEmail(event.queryStringParameters?.email);
  if (!orderId) return cors({ error: "Missing orderId" }, 400);
  if (!email) return cors({ error: "email_required" }, 401);

  const store = getSafeStore("orders");
  const order = await store.get(orderId, { type: "json" });

  if (!order) return cors({ error: "Report not found" }, 404);

  if (normalizeEmail(order.email) !== email) {
    // Deliberately generic — don't reveal whether the order exists or which
    // email it belongs to.
    return cors({ error: "email_mismatch" }, 403);
  }

  return cors({
    status: order.status,
    url: order.url,
    audit: order.audit || null,
  });
};
