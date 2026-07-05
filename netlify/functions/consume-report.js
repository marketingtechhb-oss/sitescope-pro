// netlify/functions/consume-report.js
//
// Called by the browser right after the PDF report has been generated and
// the download has started. Deletes the order from Netlify Blobs so the
// same orderId link can no longer be reopened — enforcing "one download per
// payment" without needing accounts or emails.

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors({});
  if (event.httpMethod !== "POST") return cors({ error: "Method not allowed" }, 405);

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return cors({ error: "Invalid request body." }, 400);
  }

  const orderId = (payload.orderId || "").trim();
  if (!orderId) return cors({ error: "Missing orderId" }, 400);

  try {
    const store = getSafeStore("orders");
    const order = await store.get(orderId, { type: "json" });

    // Only consume orders that were actually paid — never let an
    // unauthenticated caller delete a pending order out from under someone
    // who hasn't finished paying yet.
    if (order && order.status === "paid") {
      await store.delete(orderId);
    }

    return cors({ ok: true });
  } catch (err) {
    console.error("consume-report error:", err);
    return cors({ error: "Unexpected error." }, 500);
  }
};
