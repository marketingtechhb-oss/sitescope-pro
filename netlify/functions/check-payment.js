// netlify/functions/check-payment.js
//
// The browser polls this after opening the NOWPayments checkout page,
// to know when to unblur the full report.

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
  if (!orderId) return cors({ error: "Missing orderId" }, 400);

  const store = getSafeStore("orders");
  const order = await store.get(orderId, { type: "json" });

  if (!order) return cors({ status: "unknown" });
  return cors({ status: order.status });
};
