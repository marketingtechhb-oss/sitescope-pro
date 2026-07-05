// netlify/functions/_lib/blob-store.js
//
// Netlify Blobs is supposed to auto-inject siteID/token into every function
// invocation, but this is a known-flaky behavior on some sites/deploys
// (MissingBlobsEnvironmentError). As a reliable fallback, if NETLIFY_SITE_ID
// and NETLIFY_BLOBS_TOKEN are set, we pass them explicitly.

const { getStore } = require("@netlify/blobs");

function getSafeStore(name) {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token });
  }
  // Fall back to automatic configuration (works when Netlify's own
  // injection is functioning correctly).
  return getStore(name);
}

module.exports = { getSafeStore };
