// One-click unsubscribe for marketing email (abandoned-cart reminders), as Canada's
// anti-spam law requires. The link carries the address and an HMAC of it, so nobody
// can unsubscribe someone else; opt-outs are stored by hash, never as plain emails.
const crypto = require("crypto");

const normEmail = email => String(email || "").trim().toLowerCase();
const optOutId = email => crypto.createHash("sha256").update(normEmail(email)).digest("hex");
const unsubscribeToken = (email, key) => crypto.createHmac("sha256", String(key)).update(normEmail(email)).digest("hex").slice(0, 40);

function tokenMatches(email, token, key) {
  if (!key || typeof token !== "string" || !/^[a-f0-9]{40}$/.test(token)) return false;
  const expected = unsubscribeToken(email, key);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

// Signed links for other purposes (newsletter confirmation): the purpose is part of what is signed, so a
// confirm link can never be used as an unsubscribe link or the other way round.
const purposeToken = (email, key, purpose) => crypto.createHmac("sha256", String(key)).update(`${purpose}:${normEmail(email)}`).digest("hex").slice(0, 40);

function purposeTokenMatches(email, token, key, purpose) {
  if (!key || typeof token !== "string" || !/^[a-f0-9]{40}$/.test(token)) return false;
  return crypto.timingSafeEqual(Buffer.from(purposeToken(email, key, purpose)), Buffer.from(token));
}

/** Mailing address for the email footer, from Settings › General › Location. */
function footerAddress(location) {
  const l = location || {};
  return [l.street, l.city, l.state, l.zip, l.country].map(v => String(v || "").trim()).filter(Boolean).join(", ");
}

module.exports = { optOutId, unsubscribeToken, tokenMatches, purposeToken, purposeTokenMatches, footerAddress, normEmail };
