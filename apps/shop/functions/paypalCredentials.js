"use strict";

// Which PayPal credentials a request uses. Pure; functions/index.js getPayPalAccessToken calls it.
//
// Live: the Client ID saved in Settings › Payments › PayPal plus the Client secret saved privately in
// adminSecrets/paypal — only when BOTH are saved — otherwise the PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET
// Functions secrets (the original setup). Test (sandbox): only the saved Test client ID + Test client secret.
// A sandbox request must never be sent live credentials (PayPal refuses them), so there is no fallback to the
// Functions secrets in test mode — it says what is missing instead.

const text = (value) => (typeof value === "string" ? value.trim() : "");

function paypalCredentials({ testMode, settingsPaypal, privateSecrets, fallback }) {
  const saved = settingsPaypal || {};
  const secrets = privateSecrets || {};
  if (testMode) {
    const clientId = text(saved.testClientId);
    const clientSecret = text(secrets.testClientSecret);
    if (!clientId || !clientSecret) {
      return { ok: false, error: "PayPal test mode is on, but the Test client ID and Test client secret are not both saved in Settings › Payments › PayPal." };
    }
    return { ok: true, clientId, clientSecret, source: "test" };
  }
  const clientId = text(saved.clientId);
  const clientSecret = text(secrets.clientSecret);
  if (clientId && clientSecret) return { ok: true, clientId, clientSecret, source: "settings" };
  const fallbackId = text(fallback && fallback.clientId);
  const fallbackSecret = text(fallback && fallback.clientSecret);
  if (fallbackId && fallbackSecret) return { ok: true, clientId: fallbackId, clientSecret: fallbackSecret, source: "functions" };
  return { ok: false, error: "PayPal credentials are not configured." };
}

module.exports = { paypalCredentials };
