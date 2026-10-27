// Per-address email throttles for emails a visitor can trigger without signing in (the
// contact form). Counters live in the server-only `contact-email-throttle` collection
// (firestore.rules deny every browser access), one doc per purpose + sha256 of the
// normalised address, so the address itself is never stored there. Same transactional
// pattern as the abandoned-cart reminder throttle.
const crypto = require("crypto");

// Per-purpose limits. `perAddress` purposes are also counted per typed address (sha256), so one
// sender can't flood one inbox. Visitor "we got your message" copy: one per address per day, so
// the form can't mail a stranger over and over. Owner notification: a few per sender per hour.
const CONTACT_LIMITS = {
  visitorReply: { max: 1, windowMs: 24 * 60 * 60 * 1000, perAddress: true },
  ownerNotify: { max: 5, windowMs: 60 * 60 * 1000, perAddress: true },
  // A privacy request is emailed to the shop once per address per day (the record is kept either way).
  privacyNotify: { max: 1, windowMs: 24 * 60 * 60 * 1000, perAddress: true },
  // Customer cancel/return requests: the shop hears about each order a few times an hour at most.
  orderRequestNotify: { max: 3, windowMs: 60 * 60 * 1000, perAddress: true },
  // Newsletter double opt-in: one confirmation mail per address per day (a repeat signup is silent).
  newsletterConfirm: { max: 1, windowMs: 24 * 60 * 60 * 1000, perAddress: true },
  // Reminder / alert emails to addresses the shop only knows because a visitor typed them.
  abandonedCart: { perAddress: false },
  backInStock: { perAddress: false },
};

// One budget shared by EVERY anonymous-triggered email. The per-address counters above are keyed on
// text the visitor chooses, so rotating fake addresses gets a fresh allowance every time; this cap
// does not care who is typed. It keeps the shop's Gmail quota (about 500 recipients a day) for
// order, shipping and refund email. Past it, the message simply waits in Messages / is not mailed.
const GLOBAL_EMAIL_BUDGET = {
  hour: { max: 40, windowMs: 60 * 60 * 1000 },
  day: { max: 150, windowMs: 24 * 60 * 60 * 1000 },
};

const normaliseEmail = email => String(email || "").trim().toLowerCase();
const emailKey = email => crypto.createHash("sha256").update(normaliseEmail(email)).digest("hex");

// Pure: fixed-window counter. Returns whether this send is allowed and what to store.
function nextEmailWindow(saved, nowMs, { max, windowMs }) {
  const start = Number(saved?.windowStart) || 0;
  if (!start || nowMs - start >= windowMs || nowMs < start) return { allowed: true, record: { windowStart: nowMs, count: 1 } };
  const count = Number(saved?.count) || 0;
  if (count >= max) return { allowed: false, record: null };
  return { allowed: true, record: { windowStart: start, count: count + 1 } };
}

// Claims one send for `purpose` (to/from `email` where the purpose is per-address) and takes one
// from the shop-wide hourly and daily budget, all in one transaction so a refused send uses
// nothing. Resolves { allowed, reason } with reason "address" | "budget" | "error" when refused.
// `failOpen` decides what a Firestore failure means (false = don't send).
async function claimEmailSendDetailed(db, purpose, email, { now = Date.now(), failOpen = false } = {}) {
  const limits = CONTACT_LIMITS[purpose];
  if (!limits || (limits.perAddress && !normaliseEmail(email))) return { allowed: false, reason: "address" };
  const coll = db.collection("contact-email-throttle");
  const addressRef = limits.perAddress ? coll.doc(`${purpose}_${emailKey(email)}`) : null;
  const hourRef = coll.doc("_global_hour");
  const dayRef = coll.doc("_global_day");
  try {
    return await db.runTransaction(async tx => {
      const [addressSnap, hourSnap, daySnap] = await Promise.all([addressRef ? tx.get(addressRef) : null, tx.get(hourRef), tx.get(dayRef)]);
      const own = addressRef ? nextEmailWindow(addressSnap.exists ? addressSnap.data() : null, now, limits) : { allowed: true };
      if (!own.allowed) return { allowed: false, reason: "address" };
      const hour = nextEmailWindow(hourSnap.exists ? hourSnap.data() : null, now, GLOBAL_EMAIL_BUDGET.hour);
      const day = nextEmailWindow(daySnap.exists ? daySnap.data() : null, now, GLOBAL_EMAIL_BUDGET.day);
      if (!hour.allowed || !day.allowed) return { allowed: false, reason: "budget" };
      if (addressRef) tx.set(addressRef, { ...own.record, purpose, expiresAt: new Date(own.record.windowStart + limits.windowMs * 2) });
      tx.set(hourRef, { ...hour.record, purpose: "global", expiresAt: new Date(hour.record.windowStart + GLOBAL_EMAIL_BUDGET.hour.windowMs * 2) });
      tx.set(dayRef, { ...day.record, purpose: "global", expiresAt: new Date(day.record.windowStart + GLOBAL_EMAIL_BUDGET.day.windowMs * 2) });
      return { allowed: true, reason: "" };
    });
  } catch (err) {
    console.warn(`Email throttle unavailable (${purpose}):`, err.message);
    return { allowed: failOpen, reason: "error" };
  }
}

const claimEmailSend = async (db, purpose, email, options) => (await claimEmailSendDetailed(db, purpose, email, options)).allowed;

// Abandoned-cart reminders go to an address any visitor can type, so the email carries nothing
// they wrote except a plain first name ("Hi Sam"); anything else reads "Hi there".
function reminderFirstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return /^[\p{L}][\p{L}'’-]{0,29}$/u.test(first) ? first : "there";
}

// At most this many abandoned-cart reminders a day across every address, so forged carts can
// never turn the shop's mailbox into a bulk sender. Carts over the cap wait for the next day.
const ABANDONED_CART_DAILY_CAP = 25;

// Pure: the daily counter after one more send, or null when today's cap is reached.
function nextDailyCount(saved, day, cap = ABANDONED_CART_DAILY_CAP) {
  const count = saved && saved.day === day ? Number(saved.count) || 0 : 0;
  return count >= cap ? null : { day, count: count + 1 };
}

module.exports = { GLOBAL_EMAIL_BUDGET, claimEmailSendDetailed, reminderFirstName, ABANDONED_CART_DAILY_CAP, nextDailyCount, CONTACT_LIMITS, emailKey, normaliseEmail, nextEmailWindow, claimEmailSend };
