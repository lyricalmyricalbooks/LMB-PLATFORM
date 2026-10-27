// "How was your book?" — one review-request email per paid order whose printed books were shipped
// N days ago (Settings › Notifications › review_request: `enabled`, off by default; `delayDays`,
// default 14). Runs inside unpaidPaymentSweep. Honours the marketing opt-out and carries an
// unsubscribe link; the order is claimed (`reviewRequestedAt`) before sending so a re-run never
// sends twice, and a failed send is released for at most MAX_ATTEMPTS tries.
// Bounded: one single-field range query on `shippedAt` (no composite index), ≤200 orders, ≤50 sends.

const DAY = 86400000;
const WINDOW_DAYS = 30; // orders shipped longer ago than delay + 30 days are never asked
const MAX_SCAN = 200;
const MAX_SENDS = 50;
const MAX_ATTEMPTS = 3;

const isPhysicalLine = item => item && item.giftCard !== true && item.digital !== true && item.isDigital !== true
  && !/digital|ebook|e-book|epub|pdf|audiobook/i.test(String(item.format || ""));

const delayDaysOf = template => {
  const n = Math.floor(Number(template && template.delayDays));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 90) : 14;
};

/** Why an order isn't asked (or "" when it should be). Pure. */
function reviewRequestProblem(order) {
  if (!order) return "missing";
  if (order.isTest === true || order.sandboxPayment === true) return "test";
  if (order.paymentStatus !== "paid") return "not_paid";
  if (["cancelled", "refunded"].includes(order.status)) return "cancelled";
  if (order.reviewRequestedAt) return "already_asked";
  if ((Number(order.reviewRequestAttempts) || 0) >= MAX_ATTEMPTS) return "gave_up";
  if (!order.shippedAt) return "not_shipped";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(order.customer?.email || "").trim())) return "no_email";
  if (!(order.items || []).some(isPhysicalLine)) return "nothing_shipped";
  return "";
}

/** Distinct printed books on the order, in order. */
function reviewBookIds(order) {
  const ids = [];
  for (const item of order.items || []) {
    if (!isPhysicalLine(item) || typeof item.id !== "string" || !item.id || item.id.includes("/")) continue;
    if (!ids.includes(item.id)) ids.push(item.id);
  }
  return ids.slice(0, 10);
}

/**
 * deps: { db, notificationSettings, sendEmail({to, subject, html}), compileEmailTemplate, siteLink, escapeHtml,
 *         optOutId(email), unsubscribeUrl(email), now }
 */
async function runReviewRequests(deps) {
  const { db, notificationSettings = {}, now = Date.now() } = deps;
  const template = notificationSettings.review_request || {};
  if (template.enabled !== true) return { scanned: 0, sent: 0, skipped: "off" };
  const cutoff = new Date(now - delayDaysOf(template) * DAY).toISOString();
  const earliest = new Date(now - (delayDaysOf(template) + WINDOW_DAYS) * DAY).toISOString();
  const snap = await db.collection("orders").where("shippedAt", ">=", earliest).where("shippedAt", "<=", cutoff)
    .orderBy("shippedAt").limit(MAX_SCAN).get();
  let sent = 0;
  for (const doc of snap.docs) {
    if (sent >= MAX_SENDS) break;
    const order = doc.data();
    if (reviewRequestProblem(order)) continue;
    const email = String(order.customer.email).trim().toLowerCase();
    if ((await db.collection("marketing-optout").doc(deps.optOutId(email)).get()).exists) {
      await doc.ref.update({ reviewRequestedAt: new Date(now).toISOString(), reviewRequestSkipped: "opted_out" });
      continue;
    }
    // Claim first: a second sweep (or a retry of this one) sees the claim and skips.
    const claimed = await db.runTransaction(async tx => {
      const fresh = await tx.get(doc.ref);
      if (!fresh.exists || reviewRequestProblem(fresh.data())) return false;
      tx.update(doc.ref, { reviewRequestedAt: new Date(now).toISOString() });
      return true;
    }).catch(() => false);
    if (!claimed) continue;
    const books = [];
    for (const id of reviewBookIds(order)) {
      const book = await db.collection("books").doc(id).get().then(d => (d.exists ? d.data() : null)).catch(() => null);
      if (!book || book.status === "draft" || book.status === "archived") continue;
      books.push({ title: String(book.title || "").slice(0, 200), url: deps.siteLink(`/books/${encodeURIComponent(book.slug || id)}`) });
    }
    if (!books.length) {
      await doc.ref.update({ reviewRequestSkipped: "no_live_books" }).catch(() => {});
      continue;
    }
    const esc = deps.escapeHtml;
    const list = `<ul style="margin:16px 0;padding-left:18px;">${books.map(b => `<li style="margin:6px 0;"><a href="${esc(b.url)}">${esc(b.title)}</a></li>`).join("")}</ul>`;
    const compiled = deps.compileEmailTemplate("review_request", notificationSettings, {
      customer_name: String(order.customer?.name || "there").slice(0, 80),
      order_id: String(order.orderNumber || doc.id),
      book_titles: books.map(b => b.title).join(", "),
      items_table: list,
      button_url: books[0].url,
    }, `<p style="margin-top:28px;font-size:11px;color:#888;">Don't want emails like this? <a href="${esc(deps.unsubscribeUrl(email))}">Unsubscribe</a>.</p>`);
    try {
      await deps.sendEmail({ to: email, subject: compiled.subject, html: compiled.html });
      sent += 1;
    } catch (err) {
      // Release the claim so a later sweep can try again (bounded by MAX_ATTEMPTS).
      await doc.ref.update({ reviewRequestedAt: null, reviewRequestAttempts: (Number(order.reviewRequestAttempts) || 0) + 1, reviewRequestError: String(err?.message || err).slice(0, 200) }).catch(() => {});
    }
  }
  return { scanned: snap.docs.length, sent };
}

const REVIEW_REQUEST_TEMPLATE = {
  subject: "How are you finding your book?",
  body: "Hi {{customer_name}},\n\nWe hope your books from order {{order_id}} arrived safely. If you have a moment, we'd love to hear what you think — a short review helps other readers find their next book. Each title below opens its page, where the review form is.",
  buttonText: "Write a review",
  signoff: "Thanks for reading,\nThe Lyricalmyrical Team",
  enabled: false,
  delayDays: 14,
};

module.exports = { runReviewRequests, reviewRequestProblem, reviewBookIds, delayDaysOf, REVIEW_REQUEST_TEMPLATE, MAX_ATTEMPTS };
