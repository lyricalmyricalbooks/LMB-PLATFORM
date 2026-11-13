// Card pay links for stockroom invoices and author settle-ups (stockroom follow-up, 11 November 2026). The old stockroom
// made Stripe payment links in the browser with the press's own secret key; here the server does it on the shop's own
// payment account (Stripe or Square, payments.standaloneCheckout, as the fair helper's QR payments do).
//
//   invoicePayLinks/{token}  { ref, kind, label, amountMinor, currency, email, status: "open" | "closed", sessions: [id],
//                              paidAt?, paidSession?, createdAt, createdBy }. Admin-read, Functions-write (rules).
//
// The link the customer gets is the shop's own page (/track?invoicePay=<token>). Its Pay now asks the server for a
// fresh card page from the saved amount (a Stripe page lives a day at most, a pay link for weeks), so the browser never
// names an amount. No shop order is made and nothing touches the website's orders, stock or revenue: the admin asks
// "status" when it opens Invoices and marks the invoice paid itself, the way the fair till records a QR sale.
const crypto = require("crypto");
const { shopCurrency } = require("./shopMoney");

const TOKEN = /^[a-f0-9]{32}$/;
const REF = /^[A-Za-z0-9_.:-]{1,160}$/;
const SESSION_ID = /^(cs_[A-Za-z0-9_]{8,200}|sqlink_[A-Za-z0-9_-]{1,192})$/;
const CURRENCIES = new Set(["CAD", "USD", "EUR", "GBP", "AUD"]);
const MIN_MINOR = 50;
const MAX_MINOR = 10_000_000;
const MAX_SESSIONS = 40;

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** The cleaned link the admin asked for, or { problem } in plain words. */
function cleanPayLink(body) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const ref = text(source.ref, 160);
  if (!REF.test(ref)) return { problem: "This invoice can't take a card link yet. Save it first." };
  const kind = source.kind === "settle" ? "settle" : "invoice";
  const label = text(source.label, 200) || (kind === "settle" ? "Settle-up" : "Invoice");
  const currency = text(source.currency, 3).toUpperCase() || shopCurrency();
  if (!CURRENCIES.has(currency)) return { problem: `Card links can't be made in ${currency}.` };
  const amountMinor = Math.round(Number(source.amount) * 100);
  if (!Number.isFinite(amountMinor) || amountMinor < MIN_MINOR) return { problem: "A card can't take less than 0.50." };
  if (amountMinor > MAX_MINOR) return { problem: "That amount is too large for one card payment." };
  const email = text(source.email, 320).toLowerCase();
  return { ref, kind, label, currency, amountMinor, email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "" };
}

const PAGE_WINDOW_SECONDS = 600;

/** Stripe Checkout Session parameters for one payment of the saved amount (Square's provider maps the same shape). */
function payCheckoutParams(link, { token, shopName, returnUrl, nowSeconds }) {
  const description = `${shopName ? `${shopName}: ` : ""}${link.label}`.slice(0, 350);
  const metadata = { invoice_pay: token, invoice_ref: link.ref.slice(0, 120) };
  return {
    mode: "payment",
    // No client_reference_id: the webhook settles only sessions that name a shop order, so this one is left alone.
    line_items: [{ quantity: 1, price_data: { currency: link.currency.toLowerCase(), unit_amount: link.amountMinor, product_data: { name: description.slice(0, 250) } } }],
    ...(link.email ? { customer_email: link.email } : {}),
    metadata,
    payment_intent_data: { description, metadata },
    // An hour is plenty to pay; the link itself stays open, and a later visit opens a new page. Counted from the end
    // of the ten-minute window the page's key names (PAGE_WINDOW_SECONDS), so a second tap in that window asks for
    // exactly the same page: the card company refuses a repeated key whose details differ.
    expires_at: (Math.floor(nowSeconds / PAGE_WINDOW_SECONDS) + 1) * PAGE_WINDOW_SECONDS + 60 * 60,
    success_url: returnUrl,
  };
}

/** Whether a card page the account returned paid this link. */
function sessionPaid(session, token, link) {
  if (!session || session.payment_status !== "paid") return false;
  if (session.metadata?.invoice_pay && session.metadata.invoice_pay !== token) return false;
  if (Number.isFinite(session.amount_total) && session.amount_total !== link.amountMinor) return false;
  if (session.currency && String(session.currency).toUpperCase() !== link.currency) return false;
  return true;
}

/** What the customer's page may see about a link (never the ref, the email or the session ids). */
function publicView(link) {
  return { label: link.label, amountMinor: link.amountMinor, currency: link.currency, paid: !!link.paidAt, open: link.status === "open" };
}

function invoicePayActions({ db, requireAdmin, payments, shopTestMode, hitLimit, LIMITS, siteLink, shopName = () => "", now = () => new Date(), randomToken = () => crypto.randomBytes(16).toString("hex") }) {
  const links = () => db.collection("invoicePayLinks");

  async function standalone() {
    const mode = (await shopTestMode()) ? "test" : "live";
    return { mode, checkout: await payments.standaloneCheckout(mode) };
  }

  // Reads the link's card pages until one is paid, and saves the first paid one. Returns the link as it now stands.
  async function refreshPaid(ref, link, checkout) {
    if (link.paidAt || !checkout) return link;
    for (const id of (link.sessions || []).slice(-MAX_SESSIONS)) {
      if (!SESSION_ID.test(id)) continue;
      const session = await checkout.read(id).catch(() => null);
      if (!sessionPaid(session, ref.id, link)) continue;
      const paid = { paidAt: now().toISOString(), paidSession: id };
      await ref.set(paid, { merge: true });
      return { ...link, ...paid };
    }
    return link;
  }

  /** Admin: make (or replace) the link for an invoice or settle-up, close one, or ask which are paid. */
  async function handleInvoicePay(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    try {
      if (op === "make") {
        const input = cleanPayLink(req.body?.link);
        if (input.problem) return res.status(400).json({ error: input.problem });
        const { checkout } = await standalone();
        if (!checkout) return res.status(409).json({ error: "Card payments aren't set up for this shop yet. Connect them in Settings › Payments.", code: "not_available" });
        // One open link per invoice: an older one (a changed amount) closes, unless it was already paid.
        const older = await links().where("ref", "==", input.ref).get();
        for (const doc of older.docs) {
          if (doc.data().status === "open" && !doc.data().paidAt) await doc.ref.set({ status: "closed", closedAt: now().toISOString() }, { merge: true });
        }
        const token = randomToken();
        await links().doc(token).create({ ...input, status: "open", sessions: [], createdAt: now().toISOString(), createdBy: adminUser.email || "admin" });
        return res.status(200).json({ token, url: siteLink(`/track?invoicePay=${token}`) });
      }
      const token = String(req.body?.token || "");
      if (op === "close") {
        if (!TOKEN.test(token)) return res.status(400).json({ error: "Unknown link." });
        const ref = links().doc(token);
        const snap = await ref.get();
        if (!snap.exists) return res.status(200).json({ ok: true, paid: false });
        // Ask the card account first: a link paid a moment ago must be reported as paid, never closed in silence.
        const { checkout } = await standalone();
        const link = await refreshPaid(ref, snap.data(), checkout);
        if (!link.paidAt && link.status === "open") await ref.set({ status: "closed", closedAt: now().toISOString() }, { merge: true });
        return res.status(200).json({ ok: true, paid: !!link.paidAt, paidAt: link.paidAt || null, amountMinor: link.amountMinor, currency: link.currency });
      }
      if (op === "status") {
        const tokens = (Array.isArray(req.body?.tokens) ? req.body.tokens : []).filter(t => typeof t === "string" && TOKEN.test(t)).slice(0, 50);
        const { checkout } = await standalone();
        const out = {};
        for (const t of tokens) {
          const ref = links().doc(t);
          const snap = await ref.get();
          if (!snap.exists) continue;
          const link = await refreshPaid(ref, snap.data(), checkout);
          out[t] = { ref: link.ref, paid: !!link.paidAt, paidAt: link.paidAt || null, amountMinor: link.amountMinor, currency: link.currency, open: link.status === "open" };
        }
        return res.status(200).json({ links: out });
      }
      return res.status(400).json({ error: "Unknown pay link action." });
    } catch (err) {
      if (err?.code === "currency_mismatch") return res.status(409).json({ error: err.message, code: "currency_mismatch" });
      console.error("invoicePay failed:", err?.message || err);
      return res.status(502).json({ error: "The card payment account couldn't be reached. Please try again." });
    }
  }

  /** The customer's page: what the link is for ("view"), or a fresh card page to pay it ("open"). */
  async function handleInvoicePayOpen(req, res) {
    if (!(await hitLimit(db, "status", req, LIMITS.status))) return res.status(429).json({ error: "Too many requests. Please wait a few minutes and try again." });
    const token = String(req.body?.token || "");
    if (!TOKEN.test(token)) return res.status(404).json({ error: "This payment link doesn't work.", code: "not_found" });
    try {
      const ref = links().doc(token);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "This payment link doesn't work.", code: "not_found" });
      const { checkout } = await standalone();
      const link = await refreshPaid(ref, snap.data(), checkout);
      if (req.body?.op !== "open" || link.paidAt || link.status !== "open") return res.status(200).json(publicView(link));
      if (!checkout) return res.status(409).json({ error: "Card payments aren't available right now. Please contact the shop.", code: "not_available" });
      if ((link.sessions || []).length >= MAX_SESSIONS) return res.status(429).json({ error: "This link was opened too many times. Please contact the shop.", code: "too_many" });
      const nowSeconds = Math.floor(now().getTime() / 1000);
      const params = payCheckoutParams(link, { token, shopName: shopName(), returnUrl: siteLink(`/track?invoicePay=${token}`), nowSeconds });
      // The same link within the same ten minutes opens the same page, so a double tap never makes two.
      const session = await checkout.open(params, `invpay-${token}-${link.amountMinor}-${Math.floor(nowSeconds / PAGE_WINDOW_SECONDS)}`);
      if (!(link.sessions || []).includes(session.id)) {
        await db.runTransaction(async tx => {
          const fresh = await tx.get(ref);
          const sessions = (fresh.data()?.sessions || []).filter(id => id !== session.id);
          tx.set(ref, { sessions: [...sessions, session.id].slice(-MAX_SESSIONS) }, { merge: true });
        });
      }
      return res.status(200).json({ ...publicView(link), url: session.url });
    } catch (err) {
      if (err?.code === "currency_mismatch") return res.status(409).json({ error: err.message, code: "currency_mismatch" });
      console.error("invoicePayOpen failed:", err?.message || err);
      return res.status(502).json({ error: "We couldn't open the payment page. Please try again in a moment.", code: "unreachable" });
    }
  }

  return { handleInvoicePay, handleInvoicePayOpen };
}

module.exports = { cleanPayLink, payCheckoutParams, sessionPaid, publicView, invoicePayActions, TOKEN };
