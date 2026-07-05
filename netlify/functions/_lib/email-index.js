// netlify/functions/_lib/email-index.js
//
// Small helper shared by create-payment.js and resend-link.js to maintain a
// simple email -> [orderId, ...] index in its own Netlify Blobs store, so we
// can look up "which reports did this email pay for" without scanning every
// order.

const { getSafeStore } = require("./blob-store");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function addOrderToEmailIndex(email, orderId) {
  const key = normalizeEmail(email);
  if (!key) return;
  const store = getSafeStore("email-index");
  const existing = (await store.get(key, { type: "json" })) || [];
  if (!existing.includes(orderId)) existing.push(orderId);
  await store.setJSON(key, existing);
}

async function getOrderIdsForEmail(email) {
  const key = normalizeEmail(email);
  if (!key) return [];
  const store = getSafeStore("email-index");
  return (await store.get(key, { type: "json" })) || [];
}

module.exports = { normalizeEmail, isValidEmail, addOrderToEmailIndex, getOrderIdsForEmail };
