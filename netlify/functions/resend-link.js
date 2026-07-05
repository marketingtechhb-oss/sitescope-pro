// netlify/functions/resend-link.js
//
// "Forgot my link" flow: the user enters the email they used to unlock a
// report, and — if we have a paid order for that email — we re-send the
// access-link email. The response is always the same generic message
// whether or not the email matched anything, to avoid leaking which emails
// have purchased a report.

const { normalizeEmail, isValidEmail, getOrderIdsForEmail } = require("./_lib/email-index");
const { sendAccessLinkEmail } = require("./_lib/send-email");
const { getSafeStore } = require("./_lib/blob-store");

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

const GENERIC_MESSAGE = "If that email has an unlocked report, we've sent the access link to it.";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors({});
  if (event.httpMethod !== "POST") return cors({ error: "Method not allowed" }, 405);

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return cors({ error: "Invalid request body." }, 400);
  }

  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    return cors({ error: "Please provide a valid email address." }, 400);
  }

  try {
    const orderIds = await getOrderIdsForEmail(email);
    const store = getSafeStore("orders");

    // Find the most recent PAID order for this email, if any.
    let latestPaid = null;
    for (const id of orderIds) {
      const order = await store.get(id, { type: "json" });
      if (order && order.status === "paid") {
        if (!latestPaid || order.updatedAt > latestPaid.order.updatedAt) {
          latestPaid = { id, order };
        }
      }
    }

    if (latestPaid) {
      await sendAccessLinkEmail({
        to: email,
        orderId: latestPaid.id,
        auditedUrl: latestPaid.order.url,
      }).catch(() => {});
    }

    // Same response either way.
    return cors({ message: GENERIC_MESSAGE });
  } catch {
    // Still return the generic message — never surface internal errors here.
    return cors({ message: GENERIC_MESSAGE });
  }
};
