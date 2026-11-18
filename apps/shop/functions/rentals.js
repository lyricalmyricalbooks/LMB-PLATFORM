// Rentals (beta, R1; LMB-PLATFORM plan "Four more ways to sell"). A shop lists things to rent by the hour or the day,
// with how many units it has and the cleaning time after each rental; customers pick a time, pay on the shop's own card
// page (Stripe or Square, no shop order, the order webhook ignores it) and get a confirmation by email.
//
// On only while both switches are: the platform's (`platform/features` › `ways.rentals`, the control room) and the
// owner's (`firstWeek/start` › `ways.rentals`, Settings › Ways to sell). Every action checks them first.
//
// Records, all server-only (no rule opens them to a browser; the admin reads through `rentalsAdmin`):
//   rentalItems/{id}       what the owner made (shared/rentalRules `cleanRentalItem`)
//   rentalCalendar/{id}    the item's spans (unit, from, busy until with cleaning, held or confirmed), read and written
//                          in the rental's own transaction, so one unit is never rented twice for the same time
//   rentals/{id}           one rental: `held` while the customer pays (HOLD_MINUTES), then `paid`, `out` (picked up),
//                          `returned`, or `cancelled` (unpaid in time, or the owner cancelled it, with or without refund)
//
// Public actions (through validateDiscountCode, rate limited): rentalsInfo, rentalTimes, rentalStart, rentalView. Owner
// ops go through createStripeCheckoutSession `action: "rentalsAdmin"`. `sweep()` (inside bookingSweep) confirms a paid
// hold nobody came back to and frees an unpaid one.
"use strict";

const crypto = require("crypto");
const { cleanRentalItem, rentalPrice, rentalWhen, liveSpans, freeUnit, hourChoices, dayChoices, RENTAL_MESSAGES, MAX_ITEMS, MAX_SPANS, MINUTE } = require("./shared/rentalRules");
const { waysOn } = require("./shared/waysToSell");

const HOLD_MINUTES = 10;
const PAGE_MINUTES = 31;
const DAY_CHOICES = 14;
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const KEY = /^[a-f0-9]{48}$/;
const SESSION_ID = /^(cs_[A-Za-z0-9_]{8,200}|sqlink_[A-Za-z0-9_-]{1,192})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PUBLIC_RENTAL_ACTIONS = Object.freeze(["rentalsInfo", "rentalTimes", "rentalStart", "rentalView"]);
const OWNER_STEPS = { pickedUp: { from: ["paid"], to: "out", at: "pickedUpAt" }, returned: { from: ["paid", "out"], to: "returned", at: "returnedAt" } };

const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const hash = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (res, status, error, code) => res.status(status).json({ error, ...(code ? { code } : {}) });
const french = (locale) => /^fr\b/i.test(String(locale || ""));
const moneyWords = (minor, currency, locale = "en-CA") => new Intl.NumberFormat(locale, { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(minor / 100);

function cleanCustomer(body) {
  const name = text(body?.name, 100);
  const email = text(body?.email, 320).toLowerCase();
  if (!name) return { problem: "Please add your name." };
  if (!EMAIL.test(email)) return { problem: "Please add an email address we can send your booking to." };
  return { name, email };
}

/** When a rental runs, in the customer's words and the shop's time. */
function whenWords(r, zone, locale = "en-CA") {
  const at = (ms, withTime) => new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "short", month: "short", day: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) }).format(new Date(ms));
  return `${at(r.startMs, true)} – ${at(r.endMs, true)}`;
}

const WORDS = {
  en: {
    subject: (item) => `Your rental: ${item}`, heading: "Your rental is booked", intro: (shop) => `Thank you. ${shop} has your rental ready for the time below.`,
    when: "Pick up and return", paid: "Paid", tax: "Includes tax", button: "See your booking",
    cancelSubject: (item) => `Your rental was cancelled: ${item}`, cancelHeading: "Your rental was cancelled",
    cancelIntro: (shop) => `${shop} has cancelled the rental below.`, refunded: "Refunded", refundWhen: "The money goes back to the card you paid with, usually within 5 to 10 business days.",
  },
  fr: {
    subject: (item) => `Votre location : ${item}`, heading: "Votre location est réservée", intro: (shop) => `Merci. ${shop} aura votre location prête pour le moment ci-dessous.`,
    when: "Ramassage et retour", paid: "Payé", tax: "Taxes incluses", button: "Voir votre réservation",
    cancelSubject: (item) => `Votre location a été annulée : ${item}`, cancelHeading: "Votre location a été annulée",
    cancelIntro: (shop) => `${shop} a annulé la location ci-dessous.`, refunded: "Remboursé", refundWhen: "L'argent est remis sur la carte utilisée pour le paiement, habituellement en 5 à 10 jours ouvrables.",
  },
};

/** What the shop's page may show of an item: never how many units it has, only its prices and rules. */
function publicItem(item) {
  return {
    id: item.id, name: item.name, description: item.description, photo: item.photo, basis: item.basis,
    hourMinor: item.hourMinor, dayMinor: item.dayMinor, weekMinor: item.weekMinor, minLength: item.minLength, maxLength: item.maxLength,
    opens: item.opens, closes: item.closes, daysAhead: item.daysAhead, plusTax: item.chargeTax,
  };
}

function publicRental(id, r) {
  return {
    id, status: r.status, itemId: r.itemId, itemName: r.itemName, basis: r.basis, startMs: r.startMs, endMs: r.endMs, length: r.length,
    name: r.customer?.name || "", totalMinor: r.totalMinor || 0, taxMinor: r.taxMinor || 0, chargedMinor: r.chargedMinor || 0, currency: r.currency,
    refundedMinor: r.refundedMinor || 0, holdUntil: r.status === "held" ? r.holdUntil || null : null,
  };
}

function rentalActions({
  db, requireAdmin, payments, shopTestMode, hitLimit, LIMITS, siteLink, shopName = () => "", zone, currency,
  sendEmail = async () => {}, emailBrand = async () => ({}), ownerEmail = () => "",
  escapeHtml, risoLayout, risoButton, now = () => new Date(),
  randomId = () => crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(8, "0"),
  randomKey = () => crypto.randomBytes(24).toString("hex"),
  // Sales tax (index.js, the same as Events): async () → (amountMinor) → { taxMinor, taxLines }, or null.
  shopTax = null,
}) {
  const items = () => db.collection("rentalItems");
  const rentals = () => db.collection("rentals");
  const calRef = (itemId) => db.collection("rentalCalendar").doc(itemId);

  async function featureOn() {
    const [features, start] = await Promise.all([
      db.collection("platform").doc("features").get().catch(() => null),
      db.collection("firstWeek").doc("start").get().catch(() => null),
    ]);
    return waysOn(features?.exists ? features.data() : null, start?.exists ? start.data() : null).includes("rentals");
  }
  // The website shows its Rentals link from `settings/website.rentalsLive`; kept in step after a save, a delete and the
  // owner's switch (op `hint`). Only a hint for the link: every public action checks the real switches.
  async function tellWebsite() {
    try {
      const live = (await featureOn()) && (await readItems()).some((i) => i.status === "live");
      const ref = db.collection("settings").doc("website");
      const snap = await ref.get();
      const had = snap.exists ? snap.data() : null;
      if (had && (had.rentalsLive === true) !== live) await ref.set({ rentalsLive: live }, { merge: true });
      return live;
    } catch (err) {
      console.warn("rentals: the website link wasn't updated:", err?.message || err);
      return null;
    }
  }
  async function standalone() {
    const mode = (await shopTestMode()) ? "test" : "live";
    return { mode, checkout: await payments.standaloneCheckout(mode) };
  }
  async function readItems() {
    const snap = await items().limit(MAX_ITEMS).get();
    return snap.docs.map((d) => cleanRentalItem(d.data(), d.id)).filter((i) => !i.problem).sort((a, b) => a.name.localeCompare(b.name));
  }
  async function readItem(id) {
    if (!ID.test(String(id || ""))) return null;
    const snap = await items().doc(id).get();
    const item = snap.exists ? cleanRentalItem(snap.data(), id) : null;
    return item && !item.problem ? item : null;
  }
  const readSpans = async (itemId) => { const snap = await calRef(itemId).get(); return snap.exists ? snap.data().spans || [] : []; };
  const keyFits = (r, key) => KEY.test(String(key || "")) && (r.keyHashes || []).some((h) => sameHash(h, hash(key)));
  const rentalUrl = (id, key) => siteLink(`/rentals?rental=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`);
  const withoutSpan = (spans, id) => spans.filter((s) => s.id !== id);
  // Old spans and spent holds are dropped on every write, so the calendar stays small.
  const tidy = (spans, nowMs) => liveSpans(spans, nowMs).slice(-MAX_SPANS);

  async function tellCustomer(id, r, key, cancelled = null) {
    try {
      const to = r.customer?.email;
      if (!to || !EMAIL.test(to)) return false;
      const fr = french(r.locale);
      const say = fr ? WORDS.fr : WORDS.en;
      const locale = fr ? "fr-CA" : "en-CA";
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const layout = { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop };
      await sendEmail({
        to,
        subject: cancelled ? say.cancelSubject(r.itemName) : say.subject(r.itemName),
        html: risoLayout(`
          <h4 style="margin:0 0 8px;">${cancelled ? say.cancelHeading : say.heading}</h4>
          <h2 style="margin:0 0 12px;">${escapeHtml(r.itemName)}</h2>
          <p style="margin:0 0 16px;">${escapeHtml(cancelled ? say.cancelIntro(shop) : say.intro(shop))}</p>
          <p style="margin:0 0 4px;"><strong>${say.when}:</strong> ${escapeHtml(whenWords(r, zone(), locale))}</p>
          <p style="margin:0 0 4px;"><strong>${say.paid}:</strong> ${escapeHtml(moneyWords(r.chargedMinor, r.currency, locale))}</p>
          ${r.taxMinor > 0 ? `<p style="margin:0 0 4px;"><strong>${say.tax}:</strong> ${escapeHtml(moneyWords(r.taxMinor, r.currency, locale))}</p>` : ""}
          ${cancelled?.refundedMinor > 0 ? `<p style="margin:0 0 4px;"><strong>${say.refunded}:</strong> ${escapeHtml(moneyWords(cancelled.refundedMinor, r.currency, locale))}</p><p style="margin:0 0 16px;">${say.refundWhen}</p>` : ""}
          ${key && !cancelled ? risoButton(escapeHtml(rentalUrl(id, key)), say.button, brand.accent, brand.theme) : ""}
        `, layout),
      });
      const owner = cancelled ? "" : ownerEmail();
      if (owner) {
        await sendEmail({
          to: owner,
          subject: `[RENTAL] ${r.customer?.name || "A customer"}: ${r.itemName}`,
          html: risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(r.customer?.name || "")}: ${escapeHtml(r.itemName)} (unit ${r.unit})</h2>
            <p style="margin:0 0 4px;">${escapeHtml(r.customer?.email || "")} · ${escapeHtml(whenWords(r, zone()))} · ${escapeHtml(moneyWords(r.chargedMinor, r.currency))}</p>
            ${risoButton(escapeHtml(siteLink("/admin#rentals")), "Open Rentals", brand.accent, brand.theme)}`, layout),
        });
      }
      return true;
    } catch (err) {
      console.warn("rentals: the email failed:", err?.message || err);
      return false;
    }
  }

  /** Marks a held rental paid, once: its span becomes confirmed (kept even if the hold ran out: the money was taken). */
  async function confirmPaid(id, r, { session = "", paymentIntent = null } = {}) {
    const at = now().toISOString();
    const nowMs = now().getTime();
    const changes = { status: "paid", paidAt: at, paidSession: session || null, paymentIntent, holdUntil: null, pendingKey: null, updatedAt: at };
    const done = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(rentals().doc(id));
      if (!fresh.exists || !["held", "cancelled"].includes(fresh.data()?.status) || fresh.data()?.paidAt) return false;
      const cSnap = await tx.get(calRef(r.itemId));
      const spans = withoutSpan(cSnap.exists ? cSnap.data().spans || [] : [], id);
      const until = r.endMs + (r.cleanMinutes || 0) * MINUTE;
      tx.set(calRef(r.itemId), { spans: tidy([...spans, { id, unit: r.unit, from: r.startMs, until }], nowMs), updatedAt: at });
      tx.set(rentals().doc(id), changes, { merge: true });
      return true;
    });
    if (!done) return { ...r, ...((await rentals().doc(id).get()).data() || {}) };
    const next = { ...r, ...changes };
    await tellCustomer(id, next, r.pendingKey || "");
    return next;
  }

  async function refreshRental(id, r, checkout) {
    if (r.status !== "held" || !checkout) return r;
    for (const sid of (r.sessions || []).slice(-5)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await checkout.read(sid).catch(() => null);
      if (!session || (session.metadata?.rentalOrder && session.metadata.rentalOrder !== id) || session.payment_status !== "paid") continue;
      if (Number.isFinite(session.amount_total) && session.amount_total !== r.chargedMinor) continue;
      return confirmPaid(id, r, { session: sid, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null });
    }
    return r;
  }

  /** Lets a rental go: its span leaves the calendar and it is kept as cancelled. */
  async function freeRental(id, r, why, from = ["held"], extra = {}) {
    const at = now().toISOString();
    return db.runTransaction(async (tx) => {
      const fresh = await tx.get(rentals().doc(id));
      if (!fresh.exists || !from.includes(fresh.data()?.status)) return false;
      const cSnap = await tx.get(calRef(r.itemId));
      tx.set(calRef(r.itemId), { spans: tidy(withoutSpan(cSnap.exists ? cSnap.data().spans || [] : [], id), now().getTime()), updatedAt: at });
      tx.set(rentals().doc(id), { status: "cancelled", cancelledAt: at, cancelledBy: why, holdUntil: null, pendingKey: null, updatedAt: at, ...extra }, { merge: true });
      return true;
    });
  }

  async function sweep() {
    const snap = await rentals().where("status", "==", "held").limit(100).get();
    if (snap.empty) return { confirmed: 0, freed: 0 };
    const { checkout } = await standalone();
    let confirmed = 0;
    let freed = 0;
    for (const doc of snap.docs) {
      let r = await refreshRental(doc.id, doc.data(), checkout);
      if (r.status === "paid") { confirmed += 1; continue; }
      if (Date.parse(r.holdUntil || "") > now().getTime()) continue;
      for (const sid of r.sessions || []) if (SESSION_ID.test(sid)) await checkout?.close(sid).catch(() => {});
      r = await refreshRental(doc.id, r, checkout);
      if (r.status === "paid") { confirmed += 1; continue; }
      await freeRental(doc.id, r, "not paid in time");
      freed += 1;
    }
    return { confirmed, freed };
  }

  /** What a rental of this item for this time costs, tax included when the item charges it. */
  async function priceFor(item, when) {
    const totalMinor = rentalPrice(item, when.length);
    const calc = item.chargeTax && shopTax ? await shopTax().catch(() => null) : null;
    const tax = calc && totalMinor > 0 ? calc(totalMinor) : null;
    const taxMinor = tax?.taxMinor > 0 ? tax.taxMinor : 0;
    return { totalMinor, taxMinor, taxLines: taxMinor && Array.isArray(tax.taxLines) ? tax.taxLines : [], chargedMinor: totalMinor + taxMinor };
  }
  const askOf = (body) => ({ day: String(body?.day || ""), start: String(body?.start || ""), hours: Number(body?.hours), endDay: String(body?.endDay || "") });

  // ── Customers (validateDiscountCode actions; no sign-in) ───────────────────────────────────────────────────────

  async function handlePublic(req, res) {
    const action = req.body?.action;
    res.set("Cache-Control", "private, no-store");
    if (!(await hitLimit(db, "rental", req, LIMITS.rental))) return fail(res, 429, "Too many tries. Please wait a few minutes and try again.");
    try {
      const nowMs = now().getTime();
      if (action === "rentalView") {
        // The customer's own page keeps working after the shop stops renting: what was booked stays theirs.
        const id = String(req.body?.rentalId || "");
        const snap = ID.test(id) ? await rentals().doc(id).get() : null;
        if (!snap?.exists || !keyFits(snap.data(), req.body?.key)) return fail(res, 404, "We couldn't find that booking. Check the link in your email.", "not_found");
        const r = await refreshRental(id, snap.data(), snap.data().status === "held" ? (await standalone()).checkout : null);
        return res.status(200).json({ rental: publicRental(id, r), zone: zone() });
      }
      if (!(await featureOn())) return res.status(200).json({ on: false });
      if (action === "rentalsInfo") {
        const live = (await readItems()).filter((i) => i.status === "live");
        return res.status(200).json({ on: true, zone: zone(), currency: currency(), items: live.map(publicItem) });
      }
      if (action === "rentalTimes") {
        const item = await readItem(String(req.body?.itemId || ""));
        if (!item || item.status !== "live") return fail(res, 409, RENTAL_MESSAGES.closed, "closed");
        const spans = await readSpans(item.id);
        const day = DAY.test(String(req.body?.day || "")) ? req.body.day : new Date(nowMs).toISOString().slice(0, 10);
        if (item.basis === "hour") return res.status(200).json({ day, times: hourChoices(item, spans, day, Number(req.body?.hours) || item.minLength, zone(), nowMs).map((c) => ({ start: c.start, free: c.free > 0 })) });
        // Daily items: the next fortnight from that day, and the price when a return day is given.
        const days = dayChoices(item, spans, day, DAY_CHOICES, zone(), nowMs).map((d) => ({ day: d.day, free: d.free > 0 }));
        let quote = null;
        if (DAY.test(String(req.body?.endDay || ""))) {
          const when = rentalWhen(item, { day, endDay: req.body.endDay }, zone(), nowMs);
          if (!when.problem) quote = { ...(await priceFor(item, when)), free: freeUnit(item, spans, when, nowMs) > 0, length: when.length };
          else quote = { problem: when.problem };
        }
        return res.status(200).json({ day, days, quote });
      }
      if (action === "rentalStart") {
        const itemId = String(req.body?.itemId || "");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem);
        const seen = await readItem(itemId);
        if (!seen || seen.status !== "live") return fail(res, 409, RENTAL_MESSAGES.closed, "closed");
        const asked = rentalWhen(seen, askOf(req.body), zone(), nowMs);
        if (asked.problem) return fail(res, 400, asked.problem, "when");
        const price = await priceFor(seen, asked);
        const { checkout, mode } = await standalone();
        if (!checkout) return fail(res, 409, "This shop can't take card payments for rentals yet. Please contact the shop.", "not_available");
        const id = randomId();
        const key = randomKey();
        const at = new Date(nowMs).toISOString();
        const holdMs = nowMs + HOLD_MINUTES * MINUTE;
        const made = await db.runTransaction(async (tx) => {
          const iSnap = await tx.get(items().doc(itemId));
          const item = iSnap.exists ? cleanRentalItem(iSnap.data(), itemId) : null;
          if (!item || item.problem || item.status !== "live") return { problem: RENTAL_MESSAGES.closed, code: "closed" };
          const when = rentalWhen(item, askOf(req.body), zone(), nowMs);
          if (when.problem) return { problem: when.problem, code: "when", status: 400 };
          // The price must not have changed since it was worked out above.
          if (rentalPrice(item, when.length) !== price.totalMinor) return { problem: "The price has just changed. Please look again.", code: "price" };
          const cSnap = await tx.get(calRef(itemId));
          const spans = tidy(cSnap.exists ? cSnap.data().spans || [] : [], nowMs);
          const unit = freeUnit(item, spans, when, nowMs);
          if (!unit) return { problem: RENTAL_MESSAGES.taken, code: "taken" };
          const record = {
            itemId, itemName: item.name, basis: item.basis, unit, startMs: when.startMs, endMs: when.endMs, length: when.length, day: when.day, endDay: when.endDay,
            cleanMinutes: item.cleanMinutes, customer, locale: french(req.body?.locale) ? "fr" : "en",
            totalMinor: price.totalMinor, ...(price.taxMinor ? { taxMinor: price.taxMinor, taxLines: price.taxLines } : {}), chargedMinor: price.chargedMinor,
            currency: currency(), mode, keyHashes: [hash(key)], sessions: [], createdAt: at, updatedAt: at,
            status: "held", holdUntil: new Date(holdMs).toISOString(), pendingKey: key,
          };
          tx.set(calRef(itemId), { spans: [...spans, { id, unit, from: when.startMs, until: when.endMs + item.cleanMinutes * MINUTE, held: true, holdUntil: holdMs }], updatedAt: at });
          tx.set(rentals().doc(id), record);
          return { record };
        });
        if (made.problem) return fail(res, made.status || 409, made.problem, made.code);
        const r = made.record;
        const description = `${shopName() ? `${shopName()}: ` : ""}${r.itemName}, ${whenWords(r, zone())}`.slice(0, 250);
        const metadata = { rentalOrder: id };
        let session;
        try {
          session = await checkout.open({
            customer_email: customer.email, metadata, mode: "payment", expires_at: Math.floor(nowMs / 1000) + PAGE_MINUTES * 60,
            success_url: rentalUrl(id, key),
            line_items: [{ quantity: 1, price_data: { currency: currency().toLowerCase(), unit_amount: r.chargedMinor, product_data: { name: description } } }],
            payment_intent_data: { description, metadata },
          }, `rental-${id}`);
        } catch (err) {
          await freeRental(id, r, "the card page didn't open");
          if (err?.code === "currency_mismatch") return fail(res, 409, err.message, "currency_mismatch");
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) return fail(res, 409, "This shop can't take card payments for rentals yet. Please contact the shop.", "not_available");
          throw err;
        }
        await rentals().doc(id).set({ sessions: [session.id] }, { merge: true });
        return res.status(200).json({ url: session.url, rentalId: id, holdUntil: r.holdUntil });
      }
      return fail(res, 400, "Unknown request.");
    } catch (err) {
      console.error("rentals: a customer action failed:", err?.message || err);
      return fail(res, 500, "Something went wrong on our side. Please try again in a moment.");
    }
  }

  // ── The owner (createStripeCheckoutSession action "rentalsAdmin") ────────────────────────────────────────────

  const adminRental = (id, r) => ({
    id, status: r.status, itemId: r.itemId, itemName: r.itemName, unit: r.unit, startMs: r.startMs, endMs: r.endMs, length: r.length, basis: r.basis,
    name: r.customer?.name || "", email: r.customer?.email || "", totalMinor: r.totalMinor || 0, taxMinor: r.taxMinor || 0, chargedMinor: r.chargedMinor || 0,
    currency: r.currency, refundedMinor: r.refundedMinor || 0, test: r.mode === "test", createdAt: r.createdAt || "", paidAt: r.paidAt || "",
    pickedUpAt: r.pickedUpAt || "", returnedAt: r.returnedAt || "", holdUntil: r.status === "held" ? r.holdUntil || "" : "",
  });

  async function handleAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    const by = adminUser.email || "admin";
    try {
      if (op === "hint") return res.status(200).json({ ok: true, rentalsLive: (await tellWebsite()) === true });
      if (!(await featureOn())) return fail(res, 403, "Rentals aren't turned on for this shop.", "off");
      const nowMs = now().getTime();
      if (op === "list") {
        const list = await readItems();
        // Rentals from a day ago on, soonest first: what is coming and what is out now.
        const snap = await rentals().limit(500).get();
        const all = snap.docs.map((d) => adminRental(d.id, d.data())).filter((r) => r.status !== "cancelled" || r.refundedMinor > 0 || r.paidAt);
        const coming = all.filter((r) => r.endMs > nowMs - 86_400_000 || r.status === "out").sort((a, b) => a.startMs - b.startMs);
        return res.status(200).json({ zone: zone(), currency: currency(), items: list, rentals: coming.slice(0, 300) });
      }
      if (op === "saveItem") {
        const id = ID.test(String(req.body?.item?.id || "")) ? req.body.item.id : randomId();
        const item = cleanRentalItem(req.body?.item, id);
        if (item.problem) return fail(res, 400, item.problem);
        const existing = await items().limit(MAX_ITEMS + 1).get();
        const isNew = !existing.docs.some((d) => d.id === id);
        if (isNew && existing.docs.length >= MAX_ITEMS) return fail(res, 400, `A shop can have up to ${MAX_ITEMS} rental items. Delete an old one first.`);
        // Units with rentals still to come can't be taken away.
        const spans = isNew ? [] : liveSpans(await readSpans(id), nowMs);
        const highest = spans.filter((s) => s.until > nowMs).reduce((m, s) => Math.max(m, s.unit), 0);
        if (highest > item.units) return fail(res, 409, `Unit ${highest} has rentals still to come, so this item needs at least ${highest} units.`, "booked");
        await items().doc(id).set({ ...item, updatedAt: now().toISOString(), updatedBy: by });
        await tellWebsite();
        return res.status(200).json({ ok: true, item });
      }
      if (op === "deleteItem") {
        const id = String(req.body?.id || "");
        if (!(await readItem(id))) return res.status(200).json({ ok: true });
        if (liveSpans(await readSpans(id), nowMs).some((s) => s.until > nowMs)) return fail(res, 409, "This item has rentals still to come, so it can't be deleted. Set it to hidden instead.", "booked");
        await items().doc(id).delete();
        await calRef(id).delete();
        await tellWebsite();
        return res.status(200).json({ ok: true });
      }
      if (op === "pickedUp" || op === "returned") {
        const step = OWNER_STEPS[op];
        const id = String(req.body?.id || "");
        const at = now().toISOString();
        const done = ID.test(id) && await db.runTransaction(async (tx) => {
          const snap = await tx.get(rentals().doc(id));
          if (!snap.exists || !step.from.includes(snap.data().status)) return false;
          tx.set(rentals().doc(id), { status: step.to, [step.at]: at, updatedAt: at, [`${step.at}By`]: by }, { merge: true });
          // A rental handed back early frees its unit from now (plus cleaning) for the next customer.
          if (op === "returned") {
            const r = snap.data();
            const cSnap = await tx.get(calRef(r.itemId));
            const spans = (cSnap.exists ? cSnap.data().spans || [] : []).map((s) => (s.id === id && nowMs < r.endMs ? { ...s, until: Math.max(s.from, nowMs) + (r.cleanMinutes || 0) * MINUTE } : s));
            tx.set(calRef(r.itemId), { spans, updatedAt: at });
          }
          return true;
        });
        if (!done) return fail(res, 409, "This rental has already moved on. Refresh to see where it is.", "stale");
        return res.status(200).json({ ok: true, rental: adminRental(id, (await rentals().doc(id).get()).data()) });
      }
      if (op === "cancel") {
        // Cancels a paid rental that hasn't been picked up; the money goes back first when `refund` is set.
        const id = String(req.body?.id || "");
        const snap = ID.test(id) ? await rentals().doc(id).get() : null;
        const r = snap?.exists ? snap.data() : null;
        if (!r || r.status !== "paid") return fail(res, 409, "Only a paid rental that hasn't been picked up can be cancelled.", "stale");
        let refundedMinor = 0;
        if (req.body?.refund !== false && r.chargedMinor > 0) {
          if (!r.paymentIntent) return fail(res, 409, "This rental has no card payment on record to refund. Refund it from your payment account, then cancel it here without a refund.", "no_payment");
          try {
            await payments.refund({ mode: r.mode === "test" ? "test" : "live", paymentIntentId: r.paymentIntent, amountMinor: r.chargedMinor, metadata: { rentalOrder: id }, idempotencyKey: `rental-refund-${id}` });
            refundedMinor = r.chargedMinor;
          } catch (err) {
            console.error("rentals: a refund was refused:", err?.message || err);
            return fail(res, 502, "The refund didn't go through, so nothing was changed. Try again in a moment.", "refund_failed");
          }
        }
        await freeRental(id, r, by, ["paid"], refundedMinor ? { refundedMinor, refundedAt: now().toISOString() } : {});
        await tellCustomer(id, r, "", { refundedMinor });
        return res.status(200).json({ ok: true, rental: adminRental(id, (await rentals().doc(id).get()).data()) });
      }
      return fail(res, 400, "Unknown request.");
    } catch (err) {
      console.error("rentals: an owner action failed:", err?.message || err);
      return fail(res, 500, "Something went wrong on our side. Please try again in a moment.");
    }
  }

  return { handlePublic, handleAdmin, sweep, featureOn };
}

module.exports = { rentalActions, PUBLIC_RENTAL_ACTIONS, HOLD_MINUTES, publicItem, publicRental };
