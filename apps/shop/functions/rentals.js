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
const { cleanRentalItem, rentalPrice, rentalWhen, liveSpans, freeUnit, hourChoices, dayChoices, lateFeeFor, lateLength, feeRoom, RENTAL_MESSAGES, MAX_ITEMS, MAX_SPANS, MINUTE } = require("./shared/rentalRules");
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
// R2: a pay link for an amount the owner asks after the rental (a repair the deposit didn't cover, a fee on a shop
// that can't keep cards). Most it can ask, cents; a page stays open a day; at most this many open at once.
const MAX_EXTRA_MINOR = 1_000_000;
const EXTRA_PAGE_HOURS = 23;
const MAX_OPEN_EXTRAS = 3;
const FEE_REASONS = ["late", "damage", "other"];
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
    deposit: (amount) => `Your card is kept on file for up to ${amount} if the rental comes back late or damaged. Nothing more is charged unless the shop tells you why.`,
    feeSubject: (item) => `A charge for your rental: ${item}`, feeHeading: "A charge for your rental", feeIntro: (shop) => `${shop} has charged the card you rented with.`,
    feeReason: { late: "Brought back late", damage: "Damage or repair", other: "Other charge" }, amount: "Amount", note: "Note",
    linkSubject: (item) => `Payment asked for your rental: ${item}`, linkHeading: "A payment for your rental", linkIntro: (shop) => `${shop} asks you to pay the amount below for your rental.`, payButton: "Pay now",
  },
  fr: {
    subject: (item) => `Votre location : ${item}`, heading: "Votre location est réservée", intro: (shop) => `Merci. ${shop} aura votre location prête pour le moment ci-dessous.`,
    when: "Ramassage et retour", paid: "Payé", tax: "Taxes incluses", button: "Voir votre réservation",
    cancelSubject: (item) => `Votre location a été annulée : ${item}`, cancelHeading: "Votre location a été annulée",
    cancelIntro: (shop) => `${shop} a annulé la location ci-dessous.`, refunded: "Remboursé", refundWhen: "L'argent est remis sur la carte utilisée pour le paiement, habituellement en 5 à 10 jours ouvrables.",
    deposit: (amount) => `Votre carte est gardée au dossier jusqu'à ${amount} si la location revient en retard ou abîmée. Rien de plus n'est débité sans que la boutique vous dise pourquoi.`,
    feeSubject: (item) => `Des frais pour votre location : ${item}`, feeHeading: "Des frais pour votre location", feeIntro: (shop) => `${shop} a débité la carte utilisée pour la location.`,
    feeReason: { late: "Retour en retard", damage: "Dommage ou réparation", other: "Autres frais" }, amount: "Montant", note: "Note",
    linkSubject: (item) => `Paiement demandé pour votre location : ${item}`, linkHeading: "Un paiement pour votre location", linkIntro: (shop) => `${shop} vous demande de payer le montant ci-dessous pour votre location.`, payButton: "Payer",
  },
};

/** What the shop's page may show of an item: never how many units it has, only its prices and rules. */
function publicItem(item) {
  return {
    id: item.id, name: item.name, description: item.description, photo: item.photo, basis: item.basis,
    hourMinor: item.hourMinor, dayMinor: item.dayMinor, weekMinor: item.weekMinor, minLength: item.minLength, maxLength: item.maxLength,
    opens: item.opens, closes: item.closes, daysAhead: item.daysAhead, plusTax: item.chargeTax,
    ...(item.depositMinor ? { depositMinor: item.depositMinor, lateFeeMinor: item.lateFeeMinor || 0 } : {}),
  };
}

function publicRental(id, r) {
  return {
    id, status: r.status, itemId: r.itemId, itemName: r.itemName, basis: r.basis, startMs: r.startMs, endMs: r.endMs, length: r.length,
    name: r.customer?.name || "", totalMinor: r.totalMinor || 0, taxMinor: r.taxMinor || 0, chargedMinor: r.chargedMinor || 0, currency: r.currency,
    refundedMinor: r.refundedMinor || 0, holdUntil: r.status === "held" ? r.holdUntil || null : null,
    ...(r.card ? { depositMinor: r.depositMinor || 0, lateFeeMinor: r.lateFeeMinor || 0, cardLast4: r.card.last4 || "" } : {}),
    fees: (r.fees || []).map((x) => ({ amountMinor: x.amountMinor, reason: x.reason, note: x.note || "", at: x.at })),
    extrasPaid: (r.extrasPaid || []).map((x) => ({ amountMinor: x.amountMinor, note: x.note || "", at: x.at })),
    payLinks: (r.extraPages || []).filter((p) => p.url && Date.parse(p.closesAt || "") > Date.now()).map((p) => ({ amountMinor: p.amountMinor, note: p.note || "", url: p.url })),
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
          ${r.cardHold && !cancelled ? `<p style="margin:0 0 4px;">${escapeHtml(say.deposit(moneyWords(r.depositMinor, r.currency, locale)))}</p>` : ""}
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

  /** Tells the customer about a fee charged to their card (`fee`) or a pay link (`link`). Never throws. */
  async function tellAboutMoney(id, r, kind, { amountMinor, reason = "other", note = "", url = "" }) {
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
        subject: kind === "fee" ? say.feeSubject(r.itemName) : say.linkSubject(r.itemName),
        html: risoLayout(`
          <h4 style="margin:0 0 8px;">${kind === "fee" ? say.feeHeading : say.linkHeading}</h4>
          <h2 style="margin:0 0 12px;">${escapeHtml(r.itemName)}</h2>
          <p style="margin:0 0 16px;">${escapeHtml(kind === "fee" ? say.feeIntro(shop) : say.linkIntro(shop))}</p>
          <p style="margin:0 0 4px;"><strong>${say.when}:</strong> ${escapeHtml(whenWords(r, zone(), locale))}</p>
          ${kind === "fee" ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(say.feeReason[reason] || say.feeReason.other)}</strong></p>` : ""}
          <p style="margin:0 0 4px;"><strong>${say.amount}:</strong> ${escapeHtml(moneyWords(amountMinor, r.currency, locale))}</p>
          ${note ? `<p style="margin:0 0 16px;"><strong>${say.note}:</strong> ${escapeHtml(note)}</p>` : ""}
          ${url ? risoButton(escapeHtml(url), say.payButton, brand.accent, brand.theme) : ""}
        `, layout),
      });
      return true;
    } catch (err) {
      console.warn("rentals: the email failed:", err?.message || err);
      return false;
    }
  }

  /** Marks a held rental paid, once: its span becomes confirmed (kept even if the hold ran out: the money was taken). */
  async function confirmPaid(id, r, { session = "", paymentIntent = null, card = null } = {}) {
    const at = now().toISOString();
    const nowMs = now().getTime();
    const changes = { status: "paid", paidAt: at, paidSession: session || null, paymentIntent, holdUntil: null, pendingKey: null, updatedAt: at, ...(card ? { card } : {}) };
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
      // A rental with a deposit keeps the card it was paid with (Stripe shops), for a fee the owner may charge later.
      const card = r.cardHold && checkout.savedCard ? await checkout.savedCard(sid).catch((err) => { console.warn(`rentals: ${id}'s saved card couldn't be read:`, err?.message || err); return null; }) : null;
      return confirmPaid(id, r, { session: sid, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null, card: card ? { ...card, mode: r.mode === "test" ? "test" : "live" } : null });
    }
    return r;
  }

  /** Reads a rental's open pay links (R2); a paid one moves to `extrasPaid`, once, and one past its time is let go. */
  async function refreshExtras(id, r, checkout) {
    const open = r.extraPages || [];
    if (!open.length || !checkout) return r;
    const paid = [];
    const still = [];
    for (const p of open) {
      const session = SESSION_ID.test(p.session || "") ? await checkout.read(p.session).catch(() => null) : null;
      if (session?.payment_status === "paid" && session.metadata?.rentalOrder === id && session.amount_total === p.amountMinor) {
        paid.push({ amountMinor: p.amountMinor, note: p.note || "", session: p.session, intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null, at: now().toISOString() });
      } else if (Date.parse(p.closesAt || "") > now().getTime()) still.push(p);
    }
    if (still.length === open.length) return r;
    const changes = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(rentals().doc(id))).data() || {};
      const known = new Set((fresh.extrasPaid || []).map((x) => x.session));
      const add = paid.filter((x) => !known.has(x.session));
      const left = (fresh.extraPages || []).filter((p) => still.some((q) => q.session === p.session));
      const next = { extraPages: left, extraOpen: left.length > 0, extrasPaid: [...(fresh.extrasPaid || []), ...add].slice(-20), updatedAt: now().toISOString() };
      tx.set(rentals().doc(id), next, { merge: true });
      return next;
    });
    return { ...r, ...changes };
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
    const [snap, extras] = await Promise.all([rentals().where("status", "==", "held").limit(100).get(), rentals().where("extraOpen", "==", true).limit(50).get()]);
    if (snap.empty && extras.empty) return { confirmed: 0, freed: 0 };
    const { checkout } = await standalone();
    for (const doc of extras.docs) await refreshExtras(doc.id, doc.data(), (await payments.standaloneCheckout(doc.data().mode === "test" ? "test" : "live").catch(() => null)) || checkout).catch((err) => console.warn("rentals: a pay link couldn't be read:", err?.message || err));
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
        let r = await refreshRental(id, snap.data(), snap.data().status === "held" ? (await standalone()).checkout : null);
        if (r.extraOpen) r = await refreshExtras(id, r, await payments.standaloneCheckout(r.mode === "test" ? "test" : "live").catch(() => null));
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
          const cardHold = item.depositMinor > 0 && typeof checkout.savedCard === "function" && typeof checkout.chargeSaved === "function";
          const record = {
            ...(cardHold ? { cardHold: true, depositMinor: item.depositMinor, lateFeeMinor: item.lateFeeMinor || 0 } : {}),
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
            payment_intent_data: { description, metadata, ...(r.cardHold ? { setup_future_usage: "off_session" } : {}) },
            ...(r.cardHold ? { customer_creation: "always" } : {}),
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
    depositMinor: r.card ? r.depositMinor || 0 : 0, lateFeeMinor: r.lateFeeMinor || 0, card: r.card ? `${r.card.brand || "Card"} ending ${r.card.last4 || ""}`.trim() : "",
    feeRoomMinor: r.card ? feeRoom(r) : 0,
    lateBy: ["out", "returned"].includes(r.status) ? lateLength(r.basis, r.endMs, Date.parse(r.returnedAt || "") || now().getTime()) : 0,
    suggestedLateMinor: r.card && ["out", "returned"].includes(r.status) ? lateFeeFor(r, Date.parse(r.returnedAt || "") || now().getTime()) : 0,
    fees: (r.fees || []).map((x) => ({ amountMinor: x.amountMinor, reason: x.reason, note: x.note || "", at: x.at, by: x.by || "" })),
    extrasPaid: (r.extrasPaid || []).map((x) => ({ amountMinor: x.amountMinor, note: x.note || "", at: x.at })),
    payLinks: (r.extraPages || []).map((p) => ({ amountMinor: p.amountMinor, note: p.note || "", url: p.url, closesAt: p.closesAt })),
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
      if (op === "chargeFee") {
        // Charges the card kept with a deposit, only when the owner taps, never past the deposit.
        const id = String(req.body?.id || "");
        const reason = FEE_REASONS.includes(req.body?.reason) ? req.body.reason : "other";
        const note = text(req.body?.note, 300);
        const amount = Number(req.body?.amountMinor);
        const snap = ID.test(id) ? await rentals().doc(id).get() : null;
        const r = snap?.exists ? snap.data() : null;
        if (!r || !["paid", "out", "returned"].includes(r.status)) return fail(res, 409, "Fees can be charged on a paid rental only.", "stale");
        if (!r.card?.customer || !r.card?.paymentMethod) return fail(res, 409, "No card was kept for this rental. Send a pay link instead.", "no_card");
        if (!Number.isInteger(amount) || amount < 50) return fail(res, 400, "A fee must be at least 0.50.", "amount");
        if (amount > feeRoom(r)) return fail(res, 400, `This rental's deposit leaves ${moneyWords(feeRoom(r), r.currency)} to charge. Send a pay link for more.`, "amount");
        const nth = (r.fees || []).length + 1;
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = (await tx.get(rentals().doc(id))).data() || {};
          if ((fresh.fees || []).length + 1 !== nth || (fresh.feeCharging && Date.parse(fresh.feeCharging) > nowMs - 2 * 60_000)) return false;
          tx.set(rentals().doc(id), { feeCharging: new Date(nowMs).toISOString() }, { merge: true });
          return true;
        });
        if (!claimed) return fail(res, 409, "A fee is already being charged. Give it a moment and refresh.", "charging");
        let intent;
        try {
          const checkout = await payments.standaloneCheckout(r.card.mode === "test" ? "test" : "live");
          if (!checkout?.chargeSaved) throw Object.assign(new Error("This shop's card provider can't charge a saved card."), { code: "not_available" });
          intent = await checkout.chargeSaved({
            customer: r.card.customer, paymentMethod: r.card.paymentMethod, amountMinor: amount, currency: String(r.currency || currency()).toLowerCase(),
            description: `${shopName() ? `${shopName()}: ` : ""}${r.itemName}, ${reason} fee`.slice(0, 250), metadata: { rentalOrder: id, fee: reason },
          }, `rental-fee-${id}-${nth}`);
        } catch (err) {
          await rentals().doc(id).set({ feeCharging: null }, { merge: true });
          const declined = err?.statusCode === 402 || err?.type === "StripeCardError" || /card_declined|authentication_required|expired_card|insufficient_funds|incorrect_cvc/.test(String(err?.code || err?.decline_code || ""));
          console.error(`rentals: ${id}'s fee failed:`, err?.type || "", err?.code || "", err?.message || err);
          if (declined) return fail(res, 402, "Their card was declined, so nothing was taken. Send them a pay link instead.", "declined");
          return fail(res, 502, "The fee couldn't be charged just now, and nothing was taken. Try again in a minute.");
        }
        const at = now().toISOString();
        const fee = { intent: intent?.id || null, amountMinor: amount, reason, note, at, by };
        await rentals().doc(id).set({ fees: [...(r.fees || []), fee], feeCharging: null, updatedAt: at }, { merge: true });
        if (req.body?.notify !== false) await tellAboutMoney(id, r, "fee", { amountMinor: amount, reason, note });
        return res.status(200).json({ ok: true, rental: adminRental(id, (await rentals().doc(id).get()).data()) });
      }
      if (op === "payLink") {
        // A card page for an amount the owner asks after the rental; the customer pays it from the email or their page.
        const id = String(req.body?.id || "");
        const note = text(req.body?.note, 300);
        const amount = Number(req.body?.amountMinor);
        const snap = ID.test(id) ? await rentals().doc(id).get() : null;
        const r = snap?.exists ? snap.data() : null;
        if (!r || !["paid", "out", "returned"].includes(r.status)) return fail(res, 409, "Pay links are for paid rentals only.", "stale");
        if (!Number.isInteger(amount) || amount < 50 || amount > MAX_EXTRA_MINOR) return fail(res, 400, "Ask for an amount between 0.50 and 10,000.00.", "amount");
        const open = (r.extraPages || []).filter((p) => Date.parse(p.closesAt || "") > nowMs);
        if (open.length >= MAX_OPEN_EXTRAS) return fail(res, 409, "This rental already has three pay links waiting. Wait for one to be paid or to close.", "too_many");
        const checkout = await payments.standaloneCheckout(r.mode === "test" ? "test" : "live").catch(() => null);
        if (!checkout) return fail(res, 409, "This shop can't take card payments yet.", "not_available");
        const n = (r.extraPages || []).length + (r.extrasPaid || []).length + 1;
        const description = `${shopName() ? `${shopName()}: ` : ""}${r.itemName}${note ? `, ${note}` : ""}`.slice(0, 250);
        // The card page comes back to the customer's own rental page, with a key of its own.
        const backKey = randomKey();
        let session;
        try {
          session = await checkout.open({
            customer_email: r.customer?.email, metadata: { rentalOrder: id, extra: String(n) }, mode: "payment",
            expires_at: Math.floor(nowMs / 1000) + EXTRA_PAGE_HOURS * 3600,
            success_url: rentalUrl(id, backKey),
            line_items: [{ quantity: 1, price_data: { currency: String(r.currency || currency()).toLowerCase(), unit_amount: amount, product_data: { name: description } } }],
            payment_intent_data: { description, metadata: { rentalOrder: id, extra: String(n) } },
          }, `rental-extra-${id}-${n}`);
        } catch (err) {
          console.error("rentals: a pay link didn't open:", err?.message || err);
          return fail(res, 502, "The pay link couldn't be made just now. Try again in a minute.");
        }
        const page = { session: session.id, url: session.url, amountMinor: amount, note, openedAt: new Date(nowMs).toISOString(), closesAt: new Date(nowMs + EXTRA_PAGE_HOURS * 3_600_000).toISOString(), by };
        await rentals().doc(id).set({ extraPages: [...open, page], extraOpen: true, keyHashes: [...(r.keyHashes || []).slice(0, 1), ...(r.keyHashes || []).slice(1).slice(-8), hash(backKey)], updatedAt: page.openedAt }, { merge: true });
        if (req.body?.send !== false) await tellAboutMoney(id, r, "link", { amountMinor: amount, note, url: session.url });
        return res.status(200).json({ ok: true, url: session.url, rental: adminRental(id, (await rentals().doc(id).get()).data()) });
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
