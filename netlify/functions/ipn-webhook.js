// netlify/functions/ipn-webhook.js
const crypto = require("crypto");
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
  if (event.httpMethod !== "POST") return cors({ error: "Method not allowed" }, 405);

  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  const signature = event.headers["x-nowpayments-sig"];

  if (!ipnSecret || !signature) {
    return cors({ error: "Missing configuration or signature" }, 400);
  }

  try {
    const bodyStr = event.body;
    let payload = JSON.parse(bodyStr || "{}");

    // 1. Tri des clés pour reconstruire la chaîne de validation selon le protocole NOWPayments
    const sortedPayload = Object.keys(payload)
      .sort()
      .reduce((obj, key) => {
        obj[key] = payload[key];
        return obj;
      }, {});

    const hmac = crypto.createHmac("sha512", ipnSecret);
    hmac.update(JSON.stringify(sortedPayload));
    const calculatedSignature = hmac.digest("hex");

    // 2. Vérification de l'authenticité de la requête
    if (calculatedSignature !== signature) {
      return cors({ error: "Signature verification failed" }, 401);
    }

    const orderId = payload.order_id;
    const paymentStatus = payload.payment_status; // ex: 'pending', 'confirmed', 'paid'

    if (!orderId) return cors({ error: "Missing order_id in payload" }, 400);

    // 3. Mise à jour de l'état de la session dans le Blob Store
    const store = getSafeStore("orders");
    const orderData = await store.get(orderId, { type: "json" });

    if (orderData) {
      orderData.status = paymentStatus;
      orderData.updatedAt = Date.now();
      await store.setJSON(orderId, orderData);
    }

    return cors({ success: true, orderId, status: paymentStatus });
  } catch (err) {
    return cors({ error: "Internal processing error: " + err.message }, 500);
  }
};
