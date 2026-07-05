// netlify/functions/check-payment.js
const { getSafeStore } = require("./_lib/blob-store");

function cors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": process.env.SITE_URL || "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  // Gestion des requêtes de pré-vérification CORS
  if (event.httpMethod === "OPTIONS") return cors({});
  if (event.httpMethod !== "GET") return cors({ error: "Method not allowed" }, 405);

  const orderId = event.queryStringParameters?.orderId;
  if (!orderId) return cors({ error: "Missing orderId parameter" }, 400);

  try {
    // Connexion sécurisée au store Netlify Blobs via l'utilitaire partagé
    const store = getSafeStore("orders");
    const orderData = await store.get(orderId, { type: "json" });

    if (!orderData) {
      return cors({ status: "not_found", message: "No session associated with this ID." }, 404);
    }

    // On renvoie uniquement le statut (ex: pending, paid, confirmed) à l'interface client
    return cors({ 
      orderId, 
      status: orderData.status 
    });
  } catch (err) {
    return cors({ error: "Failed to fetch order status." }, 500);
  }
};
