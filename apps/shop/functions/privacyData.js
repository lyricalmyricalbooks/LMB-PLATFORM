// Everything the shop holds about one email address, for the admin's Privacy requests export and
// erase (Settings › General › Privacy requests). Pure helpers over an injected Firestore handle so
// they are unit-tested without the emulator.
//
// Emails typed by visitors were historically stored exactly as typed ("Jane@Example.com"), and
// Firestore equality is case-sensitive. New writes are lower-cased; `findByEmail` ALSO scans the
// collection (reading only the one field) so older mixed-case rows are still found.

const SCAN_PAGE = 500;
const SCAN_CAP = 20000;

const lower = value => String(value ?? "").trim().toLowerCase();

const getPath = (data, field) => String(field).split(".").reduce((value, part) => (value == null ? undefined : value[part]), data);

/**
 * Documents of `collection` whose `field` holds `email` (any capitalisation). With `contains`, the
 * field may be a comma-separated list of addresses (emailLog `to`). Returns the documents, with
 * `.truncated` set when the safety cap stopped the legacy scan.
 */
async function findByEmail(db, collection, field, email, { contains = false } = {}) {
  const target = lower(email);
  const found = new Map();
  if (!contains) {
    for (const doc of (await db.collection(collection).where(field, "==", target).get()).docs) found.set(doc.id, doc);
  }
  let truncated = false;
  let last = null;
  let scanned = 0;
  for (;;) {
    let q = db.collection(collection).select(field).orderBy("__name__").limit(SCAN_PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      const value = lower(getPath(doc.data(), field));
      const hit = contains ? value.split(/[\s,;]+/).includes(target) : value === target;
      if (hit && !found.has(doc.id)) found.set(doc.id, doc);
    }
    scanned += page.docs.length;
    last = page.docs[page.docs.length - 1];
    if (page.docs.length < SCAN_PAGE) break;
    if (scanned >= SCAN_CAP) { truncated = true; break; }
  }
  // The scan only selected one field; re-read the matches in full.
  const refs = [...found.values()].map(d => d.ref);
  const full = refs.length ? await db.getAll(...refs) : [];
  const docs = full.filter(d => d.exists);
  docs.truncated = truncated;
  return docs;
}

/** An order that was never paid for (abandoned or cancelled attempt): no tax value, so no reason to keep the person's details. */
function neverPaid(order) {
  const payment = String(order?.paymentStatus || "").toLowerCase();
  if (["paid", "refunded", "partiallyrefunded", "partially_refunded", "refund_pending"].includes(payment)) return false;
  if (order?.paidAt || order?.refundedAmountMinor) return false;
  return true;
}

/** Fields written over a never-paid order when its customer is erased. */
function redactedOrderFields(now) {
  return {
    customer: { name: "", email: "", phone: "", address: {} },
    orderNote: "",
    privacyRedactedAt: now,
  };
}

/** Private notes on a kept (paid) order are personal commentary about the customer: blank them, keep the money/fulfilment facts. */
function redactedOperationsFields(ops, now) {
  const activity = Array.isArray(ops?.activity)
    ? ops.activity.map(a => (a && a.type === "note" ? { ...a, message: "[removed at the customer's request]" } : a))
    : ops?.activity;
  return { ...(activity !== undefined ? { activity } : {}), quotedAddress: "", privacyRedactedAt: now };
}

const GIFT_CARD_PERSONAL = { recipientEmail: "", recipientName: "", senderName: "", message: "", purchaserEmail: "" };

/** Gift cards bought by or sent to the address (they hold names, emails and a personal message). */
async function giftCardsFor(db, email) {
  const target = lower(email);
  const found = new Map();
  for (const field of ["purchaserEmail", "recipientEmail"]) {
    for (const doc of (await db.collection("giftCards").where(field, "==", target).get()).docs) found.set(doc.id, doc);
  }
  return [...found.values()];
}

/** Review action chosen by the admin when erasing: keep the text under "Anonymous", unpublish it, or blank it. */
function reviewErasure(mode) {
  if (mode === "unpublish") return { authorName: "Anonymous", status: "rejected" };
  if (mode === "remove-text") return { authorName: "Anonymous", title: "", body: "" };
  return { authorName: "Anonymous" };
}

module.exports = { findByEmail, neverPaid, redactedOrderFields, redactedOperationsFields, giftCardsFor, reviewErasure, GIFT_CARD_PERSONAL, lower };
