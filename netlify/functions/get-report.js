// netlify/functions/get-report.js
//
// Lets the browser reload a report by orderId — from a bookmarked link, a
// fresh browser session, or a different device — as long as it hasn't been
// downloaded yet. Once the PDF is downloaded, consume-report.js deletes the
// order, and this endpoint will return 404 for that orderId from then on.

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

  if (!order) {
    return cors({ error: "not_found", message: "This report is no longer available. It may already have been downloaded, or the link is invalid." }, 404);
  }

  return cors({
    status: order.status,
    url: order.url,
    audit: order.audit || null,
  });
};
