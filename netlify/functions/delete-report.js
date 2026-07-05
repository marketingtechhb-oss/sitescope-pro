// netlify/functions/delete-report.js
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
  // Gestion des requêtes de pré-vérification CORS
  if (event.httpMethod === "OPTIONS") return cors({});
  if (event.httpMethod !== "POST") return cors({ error: "Method not allowed" }, 405);

  let payload = JSON.parse(event.body || "{}");
  const orderId = payload.orderId;

  if (!orderId) return cors({ error: "Missing orderId parameter" }, 400);

  try {
    const store = getSafeStore("orders");
    
    // Suppression définitive et immédiate du rapport du stockage
    await store.delete(orderId);
    
    return cors({ 
      success: true, 
      message: "Cache deleted successfully. Repurchase required for subsequent audits." 
    });
  } catch (err) {
    return cors({ error: "Failed to purge cache." }, 500);
  }
};
