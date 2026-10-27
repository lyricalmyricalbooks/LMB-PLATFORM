// Resend's raw errors ("domain is not verified", "only send testing emails to your own
// email address") don't say what the shop owner has to change, so translate the common ones.
function explainEmailError(message, { fromEmail, usedSandbox }) {
  const msg = String(message || "");
  const lower = msg.toLowerCase();
  const domain = String(fromEmail || "").split("@")[1] || "your sending domain";
  if (/missing api key|api key is invalid|invalid api key|unauthori[sz]ed|restricted_api_key/.test(lower)) {
    return `The Resend API key is missing or invalid. Set the RESEND_API_KEY Functions secret (or paste a key under Email branding) and try again. (${msg})`;
  }
  if (lower.includes("only send testing emails") || (usedSandbox && lower.includes("own email"))) {
    return `${domain} is not verified in Resend, so Resend only delivers to the address that owns the Resend account. Verify ${domain} at resend.com/domains to email customers. (${msg})`;
  }
  if (lower.includes("not verified") || lower.includes("verify")) {
    return `${domain} is not verified in Resend. Verify it at resend.com/domains, or change the sender address. (${msg})`;
  }
  return msg || "Failed to send email via Resend";
}

module.exports = { explainEmailError };
