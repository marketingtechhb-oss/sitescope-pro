// netlify/functions/_lib/send-email.js
//
// Thin wrapper around the Resend API (https://api.resend.com/emails).
// Silently no-ops if RESEND_API_KEY isn't configured, so the payment flow
// never breaks just because email isn't set up yet — it just skips sending.

async function sendAccessLinkEmail({ to, orderId, auditedUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM || "SiteScope Pro <onboarding@resend.dev>";
  const siteUrl = process.env.SITE_URL;

  if (!apiKey || !siteUrl) return { skipped: true };

  const link = `${siteUrl}/?order_id=${encodeURIComponent(orderId)}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hi,</p>
      <p>Your payment for the full SiteScope Pro report${auditedUrl ? ` on <strong>${auditedUrl}</strong>` : ""} is confirmed.</p>
      <p>Open your unlocked report here:</p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background:#4F8EF7;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">
          View my report
        </a>
      </p>
      <p style="color:#5A6A8A;font-size:13px;">Keep this email — you'll need the same email address to reopen the report from this link later.</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [to],
      subject: "Your SiteScope Pro report is unlocked",
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { skipped: false, error: errText };
  }
  return { skipped: false, error: null };
}

module.exports = { sendAccessLinkEmail };
