// Pure rules for the email retry queue (server-only `emailOutbox`, firestore.rules deny every
// browser). When both senders (Gmail, then Resend) refuse an important email, sendEmail parks it
// here and unpaidPaymentSweep (every 15 minutes) tries again on a widening schedule, so a
// temporary outage or a key the owner fixes later never loses an order confirmation.

const MINUTE = 60 * 1000;
// Wait before each retry: 15 min, 30 min, 1 h, 2 h, 4 h, 8 h, 12 h — about 28 hours in all.
const RETRY_DELAYS_MS = [15, 30, 60, 120, 240, 480, 720].map(m => m * MINUTE);
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
// How long a sweep (or the admin's Retry now) holds an entry while it sends, so two runs never
// send the same email at once.
const LEASE_MS = 10 * MINUTE;
// Personal data is not kept longer than the shop needs it to diagnose delivery.
const LOG_RETENTION_DAYS = 90;
const GAVE_UP_RETENTION_DAYS = 30;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

// Recipients as a clean list, or null when any address is unusable (empty, malformed, or
// carrying line breaks that could smuggle extra mail headers).
function cleanRecipients(to) {
  const list = (Array.isArray(to) ? to : [to]).map(v => String(v ?? "").trim()).filter(Boolean);
  if (!list.length || list.length > 10) return null;
  return list.every(addr => addr.length <= 254 && !/[\r\n]/.test(addr) && EMAIL_RE.test(addr)) ? list : null;
}

// One-line subject: no header-breaking newlines, bounded length.
function cleanSubject(subject) {
  return String(subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 250);
}

// Sender display name for a mail header (no quotes, angle brackets or newlines).
function cleanFromName(name) {
  return String(name ?? "").replace(/[\r\n"<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Lyricalmyrical Books";
}

// When the next try is due after `attempts` failed tries (ISO), or null once the queue gives up.
function nextRetryAt(attempts, nowMs) {
  const n = Math.max(1, Number(attempts) || 1);
  if (n >= MAX_ATTEMPTS) return null;
  return new Date(nowMs + RETRY_DELAYS_MS[n - 1]).toISOString();
}

// Errors no retry can fix: the address itself is wrong.
function isPermanentEmailError(message) {
  return /not a valid email|invalid (?:email|recipient|`?to`? field)|recipient address rejected|mailbox (?:unavailable|does not exist)|no such user|user unknown/i.test(String(message || ""));
}

// Pure: may this queued entry be sent now? (`force` = the admin's Retry now.)
// A given-up entry can only be sent again by hand.
function canSendNow(entry, nowMs, { force = false } = {}) {
  if (!entry || !(entry.status === "pending" || (force && entry.status === "failed"))) return false;
  const leased = Date.parse(entry.leaseUntil || "");
  if (Number.isFinite(leased) && leased > nowMs) return false;
  if (force) return true;
  const due = Date.parse(entry.nextAttemptAt || "");
  return Number.isFinite(due) && due <= nowMs;
}

// The admin-visible summary of a queue entry (never the HTML, which can hold gift-card codes
// and download links).
function publicOutboxEntry(id, entry = {}) {
  return {
    id,
    to: String(entry.to || ""),
    subject: String(entry.subject || ""),
    kind: String(entry.kind || ""),
    status: entry.status === "failed" ? "failed" : "pending",
    attempts: Number(entry.attempts) || 0,
    nextAttemptAt: entry.nextAttemptAt || null,
    lastError: String(entry.lastError || ""),
    createdAt: entry.createdAt || null,
  };
}

// Why a queued email no longer fits its order (sent hours later, the order may have moved on),
// or "" when it should still go. `order` is the current order (null = deleted).
function staleOrderEmailReason(kind, order) {
  const k = String(kind || "");
  const isOrderKind = /^(orderConfirmed|shopNewOrder|orderPendingPayment|shopPendingOrder|shipped|shopShipped|delivery|local_)/.test(k);
  if (!isOrderKind) return "";
  if (!order) return "the order no longer exists";
  const refunded = ["refunded", "refund_pending"].includes(order.paymentStatus);
  const cancelled = order.status === "cancelled";
  if (/^(orderPendingPayment|shopPendingOrder)/.test(k)) {
    if (order.paymentStatus === "paid" || refunded) return "the order has been paid since";
    if (cancelled) return "the order was cancelled since";
    return "";
  }
  if (refunded) return "the order was refunded since";
  if (cancelled) return "the order was cancelled since";
  return "";
}

const daysAgoIso = (days, nowMs) => new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();

// Required placeholders: an email that loses one of these is useless to the customer, so the
// server adds the line back even when an edited template dropped it.
const REQUIRED_PLACEHOLDERS = {
  gift_card: { code: "Your gift card code: {{code}}" },
};

function withRequiredPlaceholders(templateId, body) {
  const required = REQUIRED_PLACEHOLDERS[templateId];
  let text = String(body ?? "");
  if (!required) return text;
  for (const [token, line] of Object.entries(required)) {
    if (!new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`).test(text)) text = `${text.trimEnd()}\n\n${line}`;
  }
  return text;
}

// Any {{placeholder}} left after filling (a typo, or one this email doesn't know) reads as blank
// rather than as raw braces in a customer's inbox.
function blankUnknownPlaceholders(text) {
  return String(text ?? "").replace(/\{\{\s*[A-Za-z0-9_]+\s*\}\}/g, "");
}

module.exports = {
  RETRY_DELAYS_MS, MAX_ATTEMPTS, LEASE_MS, LOG_RETENTION_DAYS, GAVE_UP_RETENTION_DAYS, REQUIRED_PLACEHOLDERS,
  cleanRecipients, cleanSubject, cleanFromName, nextRetryAt, isPermanentEmailError, canSendNow, publicOutboxEntry, staleOrderEmailReason,
  daysAgoIso, withRequiredPlaceholders, blankUnknownPlaceholders,
};
