// Newsletter double opt-in (CASL / GDPR): a signup is only "pending" until the address owner clicks the
// signed link in the confirmation email; every subscriber can unsubscribe with a signed link. Pure
// helpers here; the HTTP actions (newsletterSignup / newsletterConfirm / unsubscribe) are in index.js.

const NEWSLETTER_CONSENT_TEXT = "Asked to receive the Lyricalmyrical Books newsletter on the website; the subscription starts only after the address owner confirms by email link.";

/** The pending record written at signup. `subscribedAt` stays for older readers (Overview, CSV). */
function pendingRecord(email, source, now) {
  return {
    email,
    status: "pending",
    source: String(source || "website").slice(0, 60),
    requestedAt: now,
    subscribedAt: now,
    consentText: NEWSLETTER_CONSENT_TEXT,
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
  const name = esc(shopName || "Lyricalmyrical Books");
  return {
    subject: `Confirm your subscription to ${shopName || "Lyricalmyrical Books"}`,
    html: `<p>Someone asked to send news from ${name} to this address. If that was you, confirm below. If not, ignore this email and nothing will be sent.</p>`
      + `<p><a href="${esc(confirmUrl)}" style="display:inline-block;padding:12px 22px;background:#111;color:#fff;text-decoration:none;font-weight:bold;">Yes, subscribe me</a></p>`
      + `<p style="font-size:12px;color:#666;">${esc(NEWSLETTER_CONSENT_TEXT)}</p>`
      + `<p style="margin-top:28px;font-size:11px;color:#888;">Changed your mind later? <a href="${esc(unsubscribeUrl)}">Unsubscribe</a> at any time.${address ? ` ${name}, ${esc(address)}.` : ""}</p>`,
  };
}

module.exports = { NEWSLETTER_CONSENT_TEXT, pendingRecord, confirmedRecord, isPending, mayMail, confirmationEmail };
