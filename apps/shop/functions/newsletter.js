// Newsletter double opt-in (CASL / GDPR): a signup is only "pending" until the address owner clicks the
// signed link in the confirmation email; every subscriber can unsubscribe with a signed link. Pure
// helpers here; the HTTP actions (newsletterSignup / newsletterConfirm / unsubscribe) are in index.js.

const { DEFAULT_SHOP_NAME } = require("./shared/shopIdentity");

/** What the subscriber agreed to, in the press's own name (plan 5.8), kept on the record as proof of consent. */
const newsletterConsentText = shopName => `Asked to receive the ${String(shopName || "").trim() || DEFAULT_SHOP_NAME} newsletter on the website; the subscription starts only after the address owner confirms by email link.`;

/** The pending record written at signup. `subscribedAt` stays for older readers (Overview, CSV). */
function pendingRecord(email, source, now, shopName = "") {
  return {
    email,
    status: "pending",
    source: String(source || "website").slice(0, 60),
    requestedAt: now,
    subscribedAt: now,
    consentText: newsletterConsentText(shopName),
  };
}

/** What confirming does to a record (legacy records with no status are already live and are left alone). */
function confirmedRecord(existing, now) {
  if (!existing) return null;
  if (existing.status !== "pending") return existing;
  return { ...existing, status: "confirmed", confirmedAt: now, subscribedAt: now };
}

const isPending = record => record?.status === "pending";

/** Subscribers the shop may mail: everyone except unconfirmed signups. */
const mayMail = record => !!record && !isPending(record);

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function confirmationEmail({ shopName, confirmUrl, unsubscribeUrl, address }) {
  const plain = String(shopName || "").trim() || DEFAULT_SHOP_NAME;
  const name = esc(plain);
  return {
    subject: `Confirm your subscription to ${plain}`,
    html: `<p>Someone asked to send news from ${name} to this address. If that was you, confirm below. If not, ignore this email and nothing will be sent.</p>`
      + `<p><a href="${esc(confirmUrl)}" style="display:inline-block;padding:12px 22px;background:#111;color:#fff;text-decoration:none;font-weight:bold;">Yes, subscribe me</a></p>`
      + `<p style="font-size:12px;color:#666;">${esc(newsletterConsentText(plain))}</p>`
      + `<p style="margin-top:28px;font-size:11px;color:#888;">Changed your mind later? <a href="${esc(unsubscribeUrl)}">Unsubscribe</a> at any time.${address ? ` ${name}, ${esc(address)}.` : ""}</p>`,
  };
}

module.exports = { newsletterConsentText, pendingRecord, confirmedRecord, isPending, mayMail, confirmationEmail };
