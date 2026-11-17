// Events and tickets (beta; LMB-PLATFORM tasks/todo/2026-11-17-events-tickets-e1.md). A shop makes an event with a day,
// a place and kinds of ticket; shoppers buy tickets and pay on the shop's own card page (Stripe or Square, no shop
// order, the order webhook ignores it); each ticket gets a code by email.
//
// On only while both switches are: the platform's (`platform/features` › `ways.events`, the control room) and the
// owner's (`firstWeek/start` › `ways.events`, Settings › Ways to sell). Every action checks them first.
//
// Records, all server-only (no rule opens them to a browser; the admin reads through `eventsAdmin`):
//   events/{id}             what the owner made (shared/eventTickets `cleanEvent`)
//   eventPlaces/{eventId}   tickets sold per kind and the orders still paying, read and written in the order's own
//                           transaction, so the last ticket can't be sold twice
//   eventOrders/{id}        one purchase: `held` while the customer pays (its places kept HOLD_MINUTES), then `paid`
//                           with its ticket codes, or `cancelled` when the page closed unpaid
//
// Public actions (through validateDiscountCode, rate limited): eventsInfo, eventStart, eventView. Owner ops go through
// createStripeCheckoutSession `action: "eventsAdmin"`. `sweep()` (inside bookingSweep, every 5 minutes) confirms a paid
// hold nobody came back to and frees an unpaid one.
//
// At the door (E2): owner op `checkIn` marks one ticket used by its code (`usedAt` on the ticket inside its order, and
// `arrived` on the event's places record, in one transaction), so a code gets one person in.
//
// Refunds (E3): owner op `refund` gives back an order's tickets, all or some. The money goes back through the payments
// module first (same key for the same tickets, so a second tap can't refund twice), then one transaction takes the
// tickets off the order, frees their places and takes the money off the event's figures. An order with no tickets left
// is `refunded`. Moves, extras and codes come later.
"use strict";

const crypto = require("crypto");
const {
  cleanEvent, salesOpen, placesLeft, soldCount, orderLines, extraLines, bookingFeeMinor, withHold, withSold, withoutHold, withReturned, refundMinorFor, withArrived, moveKinds, movedLines, placesLeft: leftAt, ticketCodeFrom, cleanTicketCode, eventWhen,
  TICKET_MESSAGES, MAX_EVENTS,
} = require("./shared/eventTickets");
const { waysOn } = require("./shared/waysToSell");
const { ticketDiscountMinor, tooSmallForCard, TicketCodeProblem, NOT_FOR_TICKETS } = require("./eventDiscount");

/** How long an order's places are kept while the customer pays. */
// Orders given back per call when a whole event is called off.
const CANCEL_BATCH = 10;
const HOLD_MINUTES = 10;
/** The card page's own end (Stripe's shortest is 30 minutes); the sweep closes it when the hold runs out. */
const PAGE_MINUTES = 31;
const MINUTE = 60_000;
/** How many coming events the shop's page lists. */
const MAX_SHOWN = 50;
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const KEY = /^[a-f0-9]{48}$/;
const SESSION_ID = /^(cs_[A-Za-z0-9_]{8,200}|sqlink_[A-Za-z0-9_-]{1,192})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PUBLIC_EVENT_ACTIONS = Object.freeze(["eventsInfo", "eventStart", "eventView", "eventCode"]);

const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const hash = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (res, status, error, code) => res.status(status).json({ error, ...(code ? { code } : {}) });
const moneyWords = (minor, currency, locale = "en-CA") => new Intl.NumberFormat(locale, { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(minor / 100);
const french = (locale) => /^fr\b/i.test(String(locale || ""));

/** The buyer's name and email, or the problem in plain words. */
function cleanBuyer(body) {
  const name = text(body?.name, 100);
  const email = text(body?.email, 320).toLowerCase();
  if (!name) return { problem: "Please add your name." };
  if (!EMAIL.test(email)) return { problem: "Please add an email address we can send your tickets to." };
  return { name, email };
}

// The fixed words of the ticket email, in the buyer's language (the page sends the browser's).
const WORDS = {
  en: {
    subject: (n, title) => `Your ${n === 1 ? "ticket" : "tickets"}: ${title}`,
    heading: (n) => (n === 1 ? "Your ticket" : "Your tickets"),
    intro: (shop) => `Thank you. Here is what you need for the door, from ${shop}. Show each code when you arrive.`,
    when: "When", where: "Where", online: "Join online", paid: "Paid", free: "Free", tax: "Includes tax", discount: "Discount", extras: "Extras", fee: "Booking fee", button: "See your tickets",
    keep: "Keep this email: anyone with a code can use that ticket.",
    refundSubject: (title) => `Your refund: ${title}`,
    refundHeading: (n) => (n === 1 ? "Your ticket was refunded" : "Your tickets were refunded"),
    cancelHeading: (n) => (n === 1 ? "Your ticket was cancelled" : "Your tickets were cancelled"),
    movedSubject: (title) => `Your tickets have moved: ${title}`, movedHeading: (n) => (n === 1 ? "Your ticket has moved" : "Your tickets have moved"),
    movedIntro: (shop, from) => `${shop} has moved you from "${from}" to the event below. Your ticket codes stay the same.`,
    calledSubject: (title) => `Cancelled: ${title}`, calledHeading: "This event has been cancelled",
    calledIntro: (shop) => `${shop} has cancelled this event. We're sorry for the change of plans. Your tickets below no longer work.`,
    refundIntro: (shop) => `${shop} has cancelled the tickets below. Their codes no longer work at the door.`,
    refunded: "Refunded", refundWhen: "The money goes back to the card you paid with, usually within 5 to 10 business days.",
    stillYours: (n) => (n === 1 ? "You still have 1 ticket for this event." : `You still have ${n} tickets for this event.`),
  },
  fr: {
    subject: (n, title) => `${n === 1 ? "Votre billet" : "Vos billets"} : ${title}`,
    heading: (n) => (n === 1 ? "Votre billet" : "Vos billets"),
    intro: (shop) => `Merci. Voici ce qu'il vous faut à l'entrée, de la part de ${shop}. Présentez chaque code à votre arrivée.`,
    when: "Quand", where: "Où", online: "Participer en ligne", paid: "Payé", free: "Gratuit", tax: "Taxes incluses", discount: "Rabais", extras: "Suppléments", fee: "Frais de réservation", button: "Voir vos billets",
    keep: "Conservez ce courriel : toute personne ayant un code peut utiliser ce billet.",
    refundSubject: (title) => `Votre remboursement : ${title}`,
    refundHeading: (n) => (n === 1 ? "Votre billet a été remboursé" : "Vos billets ont été remboursés"),
    cancelHeading: (n) => (n === 1 ? "Votre billet a été annulé" : "Vos billets ont été annulés"),
    movedSubject: (title) => `Vos billets ont été déplacés : ${title}`, movedHeading: (n) => (n === 1 ? "Votre billet a été déplacé" : "Vos billets ont été déplacés"),
    movedIntro: (shop, from) => `${shop} vous a déplacé de « ${from} » vers l'événement ci-dessous. Vos codes de billet restent les mêmes.`,
    calledSubject: (title) => `Annulé : ${title}`, calledHeading: "Cet événement a été annulé",
    calledIntro: (shop) => `${shop} a annulé cet événement. Nous sommes désolés de ce changement. Vos billets ci-dessous ne sont plus valides.`,
    refundIntro: (shop) => `${shop} a annulé les billets ci-dessous. Leurs codes ne sont plus valides à l'entrée.`,
    refunded: "Remboursé", refundWhen: "L'argent est remis sur la carte utilisée pour le paiement, habituellement en 5 à 10 jours ouvrables.",
    stillYours: (n) => (n === 1 ? "Il vous reste 1 billet pour cet événement." : `Il vous reste ${n} billets pour cet événement.`),
  },
};

/** What the shop's page may show of an event: never how many places it has in all, only what is left to buy now. */
function publicEvent(event, places, nowMs, taxOf) {
  const left = placesLeft(event, places, nowMs);
  const open = salesOpen(event, nowMs);
  return {
    id: event.id, title: event.title, description: event.description, start: event.start, end: event.end, venue: event.venue,
    address: event.address, photo: event.photo, online: !!event.onlineUrl, open, cancelled: event.status === "cancelled",
    tickets: event.tickets.map((t) => ({
      id: t.id, name: t.name, priceMinor: t.priceMinor, maxPerOrder: t.maxPerOrder, left: Math.min(left[t.id] ?? 0, t.maxPerOrder), soldOut: !(left[t.id] > 0),
      ...(event.chargeTax && t.priceMinor > 0 && taxOf ? { taxMinor: taxOf(t.priceMinor)?.taxMinor || 0 } : {}),
    })),
    feeMinor: event.feeMinor || 0,
    extras: (event.extras || []).map((x) => ({
      id: x.id, name: x.name, priceMinor: x.priceMinor, maxPerOrder: x.maxPerOrder,
      ...(event.chargeTax && taxOf ? { taxMinor: taxOf(x.priceMinor)?.taxMinor || 0 } : {}),
    })),
  };
}

/**
 * What a buyer asked for: the tickets, any extras and the shop's booking fee, with one total before tax. `ticketsMinor`
 * is the tickets alone (what a discount code works on). A problem carries the code the page shows it under.
 */
function askedOf(event, body, left) {
  const order = orderLines(event, body?.tickets, left);
  if (order.problem) return { problem: order.problem, code: "tickets" };
  const extras = extraLines(event, body?.extras);
  if (extras.problem) return { problem: extras.problem, code: "extras" };
  const feeMinor = bookingFeeMinor(event, order.lines);
  return { lines: order.lines, tickets: order.tickets, ticketsMinor: order.totalMinor, extras: extras.lines, extrasMinor: extras.totalMinor, feeMinor, totalMinor: order.totalMinor + extras.totalMinor + feeMinor };
}
const extrasWords = (o) => (o.extras || []).map((x) => `${x.qty} × ${x.name}`).join(", ");

/** What the buyer's own page may see of their order (never payment ids or key hashes). */
function publicOrder(id, o, event) {
  const paid = o.status === "paid";
  return {
    id, status: o.status, refundedMinor: o.refundedMinor || 0, eventId: o.eventId, title: o.eventTitle, start: o.start, end: o.end || "", venue: o.venue || "", address: o.address || "",
    name: o.customer?.name || "", lines: o.lines || [], extras: o.extras || [], feeMinor: o.feeMinor || 0, totalMinor: o.totalMinor || 0, taxMinor: o.taxMinor || 0, chargedMinor: o.chargedMinor || 0, currency: o.currency,
    discount: o.discount ? { code: o.discount.code, amountMinor: o.discount.amountMinor || 0 } : null,
    holdUntil: o.status === "held" ? o.holdUntil || null : null,
    // The codes and the online link only once the order is paid, and never for an event the shop called off.
    // Each ticket's code and whether the door has used it; never who checked it in.
    tickets: paid ? (o.tickets || []).map((t) => ({ code: t.code, ticketId: t.ticketId, name: t.name, used: !!t.usedAt })) : [],
    onlineUrl: paid && event && event.status !== "cancelled" ? event.onlineUrl || "" : "",
    eventCancelled: event?.status === "cancelled",
  };
}

function eventActions({
  db, requireAdmin, payments, shopTestMode, hitLimit, LIMITS, siteLink, shopName = () => "", zone, currency,
  sendEmail = async () => {}, emailBrand = async () => ({}), claimEmailSend = async () => true, ownerEmail = () => "",
  escapeHtml, risoLayout, risoButton, now = () => new Date(),
  randomId = () => crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(8, "0"),
  randomKey = () => crypto.randomBytes(24).toString("hex"),
  randomCode = () => ticketCodeFrom(crypto.randomBytes(8)),
  // Sales tax on tickets (index.js, the same as Bookings): async () → (amountMinor) → { taxMinor, taxLines }, or null.
  shopTax = null,
  // Discount codes on tickets (index.js): async (code, email) → the shop's discount after its usual checks, or throws
  // in the customer's words (an error with a `code` is the database failing). None: no code box.
  findDiscount = null,
}) {
  const events = () => db.collection("events");
  const orders = () => db.collection("eventOrders");
  const placesRef = (eventId) => db.collection("eventPlaces").doc(eventId);

  /** Both switches: the platform lets this shop sell tickets, and the owner turned it on. */
  async function featureOn() {
    const [features, start] = await Promise.all([
      db.collection("platform").doc("features").get().catch(() => null),
      db.collection("firstWeek").doc("start").get().catch(() => null),
    ]);
    return waysOn(features?.exists ? features.data() : null, start?.exists ? start.data() : null).includes("events");
  }
  /** Still to come for the website: on sale and not over (one with no end shows until a few hours after it starts). */
  const endMs = (e) => Date.parse(e.end || "") || Date.parse(e.start) + 4 * 60 * MINUTE;
  const comingLive = (list, nowMs) => list.filter((e) => e.status === "live" && endMs(e) > nowMs);
  // The website shows its Events links from `settings/website.eventsLive`, which the pages already read. It is kept
  // in step here: after an event is saved or deleted, and when the owner flips the switch (admin op `hint`). Only a
  // hint for showing a link: every public action above still checks the real switches. A shop with no website
  // settings yet is left alone (a record holding only this would stand in for the starting design).
  async function tellWebsite() {
    try {
      const coming = (await featureOn()) ? comingLive(await readEvents(), now().getTime()) : [];
      const live = coming.length > 0;
      // When the last of them is over, so the pages take the link down by themselves with no scheduled job.
      const until = live ? new Date(Math.max(...coming.map(endMs))).toISOString() : null;
      const ref = db.collection("settings").doc("website");
      const snap = await ref.get();
      const had = snap.exists ? snap.data() : null;
      if (had && ((had.eventsLive === true) !== live || (had.eventsLiveUntil || null) !== until)) await ref.set({ eventsLive: live, eventsLiveUntil: until }, { merge: true });
      return live;
    } catch (err) {
      console.warn("events: the website link wasn't updated:", err?.message || err);
      return null;
    }
  }
  async function standalone() {
    const mode = (await shopTestMode()) ? "test" : "live";
    return { mode, checkout: await payments.standaloneCheckout(mode) };
  }
  async function taxCalc(event) {
    return event?.chargeTax && shopTax ? await shopTax().catch(() => null) : null;
  }
  async function readEvents() {
    const snap = await events().limit(MAX_EVENTS).get();
    return snap.docs.map((d) => cleanEvent(d.data(), d.id)).filter((e) => !e.problem).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  }
  async function readEvent(id) {
    if (!ID.test(String(id || ""))) return null;
    const snap = await events().doc(id).get();
    const event = snap.exists ? cleanEvent(snap.data(), id) : null;
    return event && !event.problem ? event : null;
  }
  const readPlaces = async (eventId) => { const snap = await placesRef(eventId).get(); return snap.exists ? snap.data() : null; };
  // The places record as written: the counts from the shared rules, the money taken so far, and when.
  const placesDoc = (before, next, extra = {}) => ({ sold: next.sold || {}, held: next.held || {}, paidMinor: before?.paidMinor || 0, orders: before?.orders || 0, arrived: before?.arrived || 0, ...extra, updatedAt: now().toISOString() });
  const newTickets = (lines) => lines.flatMap((l) => Array.from({ length: l.qty }, () => ({ code: randomCode(), ticketId: l.ticketId, name: l.name })));
  const keyFits = (o, key) => KEY.test(String(key || "")) && (o.keyHashes || []).some((h) => sameHash(h, hash(key)));
  const orderUrl = (id, key) => siteLink(`/events?order=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`);

  // ── Discount codes ──────────────────────────────────────────────────────────────────────────────────────────
  const discountRef = (id) => db.collection("discounts").doc(id);

  /** Does the shop have a code marked "Works on event tickets too"? The Events page shows its code box only then. */
  async function codesOffered() {
    if (!findDiscount) return false;
    const snap = await db.collection("discounts").where("forTickets", "==", true).limit(1).get().catch(() => null);
    return !!snap && !snap.empty;
  }

  /** A typed code after the shop's own checks and the tickets' side of one-use-per-customer. Throws TicketCodeProblem. */
  async function codeFor(raw, email) {
    const typed = String(raw || "").trim().toUpperCase().slice(0, 40);
    if (!findDiscount || !typed) throw new TicketCodeProblem(NOT_FOR_TICKETS);
    let found;
    try {
      found = await findDiscount(typed, email);
    } catch (err) {
      // The database failing is not the customer's code being wrong.
      if (err && err.code !== undefined) throw err;
      throw new TicketCodeProblem(String(err?.message || "This code can't be used.").slice(0, 160));
    }
    ticketDiscountMinor(found, 1_000_000);
    if (found.onePerCustomer && email) {
      const me = String(email).trim().toLowerCase();
      const snap = await orders().where("discount.id", "==", found.id).limit(500).get();
      if (snap.docs.some((d) => ["held", "paid"].includes(d.data()?.status) && String(d.data()?.customer?.email || "").toLowerCase() === me)) {
        throw new TicketCodeProblem("You have already used this code.");
      }
    }
    return { ...found, code: typed };
  }

  /** What an order costs: the tickets less a code, plus any extras, plus tax on what is left. Throws TicketCodeProblem for a code that doesn't fit. */
  function priceOf(event, order, calc, found) {
    const amountMinor = found ? ticketDiscountMinor(found, order.ticketsMinor ?? order.totalMinor) : 0;
    // A code that makes every ticket free takes the booking fee with it: nobody pays a fee on a ticket they were given.
    const ticketsMinor = order.ticketsMinor ?? order.totalMinor;
    const feeMinor = amountMinor > 0 && amountMinor >= ticketsMinor ? 0 : order.feeMinor || 0;
    const totalMinor = order.totalMinor - amountMinor - ((order.feeMinor || 0) - feeMinor);
    const tax = event.chargeTax && calc && totalMinor > 0 ? calc(totalMinor) : null;
    const taxMinor = tax?.taxMinor > 0 ? tax.taxMinor : 0;
    const chargedMinor = totalMinor + taxMinor;
    if (found && tooSmallForCard(chargedMinor)) throw new TicketCodeProblem("This code can't be used on these tickets.");
    return {
      totalMinor, taxMinor, taxLines: taxMinor && Array.isArray(tax.taxLines) ? tax.taxLines : [], chargedMinor, feeMinor,
      discount: found ? { id: found.id, code: found.code, amountMinor } : null,
    };
  }

  /** Emails a paid order's tickets to the buyer (and tells the owner, the first time). Never throws. */
  async function tellTickets(id, o, key, { toOwner = true, movedFrom = "" } = {}) {
    try {
      const to = o.customer?.email;
      if (!to || !EMAIL.test(to)) return false;
      const fr = french(o.locale);
      const say = fr ? WORDS.fr : WORDS.en;
      const locale = fr ? "fr-CA" : "en-CA";
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const layout = { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop };
      const tickets = o.tickets || [];
      const event = await readEvent(o.eventId);
      const where = [o.venue, o.address].filter(Boolean).join(", ");
      const rows = tickets.map((t) => `<tr><td style="padding:6px 12px 6px 0;">${escapeHtml(t.name)}</td><td style="padding:6px 0;font-family:monospace;font-size:18px;letter-spacing:1px;"><strong>${escapeHtml(t.code)}</strong></td></tr>`).join("");
      await sendEmail({
        to,
        subject: movedFrom ? say.movedSubject(o.eventTitle) : say.subject(tickets.length, o.eventTitle),
        html: risoLayout(`
          <h4 style="margin:0 0 8px;">${movedFrom ? say.movedHeading(tickets.length) : say.heading(tickets.length)}</h4>
          <h2 style="margin:0 0 12px;">${escapeHtml(o.eventTitle)}</h2>
          <p style="margin:0 0 16px;">${escapeHtml(movedFrom ? say.movedIntro(shop, movedFrom) : say.intro(shop))}</p>
          <p style="margin:0 0 4px;"><strong>${say.when}:</strong> ${escapeHtml(eventWhen(o.start, zone(), locale))}</p>
          ${where ? `<p style="margin:0 0 4px;"><strong>${say.where}:</strong> ${escapeHtml(where)}</p>` : ""}
          ${event?.onlineUrl && event.status !== "cancelled" ? `<p style="margin:0 0 4px;"><strong>${say.online}:</strong> <a href="${escapeHtml(event.onlineUrl)}">${escapeHtml(event.onlineUrl)}</a></p>` : ""}
          <p style="margin:0 0 4px;"><strong>${say.paid}:</strong> ${o.chargedMinor > 0 ? escapeHtml(moneyWords(o.chargedMinor, o.currency, locale)) : say.free}</p>
          ${(o.extras || []).length ? `<p style="margin:0 0 4px;"><strong>${say.extras}:</strong> ${escapeHtml(extrasWords(o))}</p>` : ""}
          ${o.feeMinor > 0 ? `<p style="margin:0 0 4px;"><strong>${say.fee}:</strong> ${escapeHtml(moneyWords(o.feeMinor, o.currency, locale))}</p>` : ""}
          ${o.discount?.amountMinor > 0 ? `<p style="margin:0 0 4px;"><strong>${say.discount} (${escapeHtml(o.discount.code)}):</strong> −${escapeHtml(moneyWords(o.discount.amountMinor, o.currency, locale))}</p>` : ""}
          ${o.taxMinor > 0 ? `<p style="margin:0 0 4px;"><strong>${say.tax}:</strong> ${escapeHtml(moneyWords(o.taxMinor, o.currency, locale))}</p>` : ""}
          <table role="presentation" style="margin:16px 0;border-collapse:collapse;">${rows}</table>
          <p style="margin:0 0 16px;">${say.keep}</p>
          ${key ? risoButton(escapeHtml(orderUrl(id, key)), say.button, brand.accent, brand.theme) : ""}
        `, layout),
      });
      const owner = toOwner ? ownerEmail() : "";
      if (owner) {
        await sendEmail({
          to: owner,
          subject: `[TICKETS] ${o.customer?.name || "A customer"}: ${tickets.length} for ${o.eventTitle}`,
          html: risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(o.customer?.name || "")}: ${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"} for ${escapeHtml(o.eventTitle)}</h2>
            <p style="margin:0 0 4px;">${escapeHtml(o.customer?.email || "")} · ${escapeHtml([(o.lines || []).map((l) => `${l.qty} × ${l.name}`).join(", "), extrasWords(o)].filter(Boolean).join(", "))} · ${o.chargedMinor > 0 ? escapeHtml(moneyWords(o.chargedMinor, o.currency)) : "free"}</p>
            ${risoButton(escapeHtml(siteLink("/admin#events")), "Open Events", brand.accent, brand.theme)}`, layout),
        });
      }
      return true;
    } catch (err) {
      console.warn("events: the ticket email failed:", err?.message || err);
      return false;
    }
  }

  /** Tells the buyer which tickets were given back and what was refunded. Never throws. */
  async function tellRefund(o, gone, amountMinor, left, called = false) {
    try {
      const to = o.customer?.email;
      if (!to || !EMAIL.test(to)) return false;
      const fr = french(o.locale);
      const say = fr ? WORDS.fr : WORDS.en;
      const locale = fr ? "fr-CA" : "en-CA";
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const rows = gone.map((t) => `<tr><td style="padding:6px 12px 6px 0;">${escapeHtml(t.name)}</td><td style="padding:6px 0;font-family:monospace;text-decoration:line-through;">${escapeHtml(t.code)}</td></tr>`).join("");
      await sendEmail({
        to,
        subject: (called ? say.calledSubject : say.refundSubject)(o.eventTitle),
        html: risoLayout(`
          <h4 style="margin:0 0 8px;">${called ? say.calledHeading : amountMinor > 0 ? say.refundHeading(gone.length) : say.cancelHeading(gone.length)}</h4>
          <h2 style="margin:0 0 12px;">${escapeHtml(o.eventTitle)}</h2>
          <p style="margin:0 0 16px;">${escapeHtml(called ? say.calledIntro(shop) : say.refundIntro(shop))}</p>
          <table role="presentation" style="margin:0 0 16px;border-collapse:collapse;">${rows}</table>
          ${amountMinor > 0 ? `<p style="margin:0 0 4px;"><strong>${say.refunded}:</strong> ${escapeHtml(moneyWords(amountMinor, o.currency, locale))}</p><p style="margin:0 0 16px;">${say.refundWhen}</p>` : ""}
          ${left > 0 ? `<p style="margin:0;">${say.stillYours(left)}</p>` : ""}
        `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
      });
      return true;
    } catch (err) {
      console.warn("events: the refund email failed:", err?.message || err);
      return false;
    }
  }

  /**
   * Marks a held order paid, once: its hold becomes sold tickets, each ticket gets its code, and the email goes out.
   * Safe when the hold already ran out (the money was taken, so the tickets are honoured).
   */
  async function confirmPaid(id, o, { session = "", paymentIntent = null } = {}) {
    const at = now().toISOString();
    const tickets = newTickets(o.lines || []);
    const changes = {
      status: "paid", paidAt: at, paidSession: session || null, paymentIntent, holdUntil: null, updatedAt: at, pendingKey: null,
      tickets, ticketCodes: tickets.map((t) => t.code),
    };
    const done = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(orders().doc(id));
      // A hold the sweep let go a moment ago is still honoured when the page turns out paid.
      if (!fresh.exists || !["held", "cancelled"].includes(fresh.data()?.status) || fresh.data()?.paidAt) return false;
      const pSnap = await tx.get(placesRef(o.eventId));
      const before = pSnap.exists ? pSnap.data() : null;
      // A code whose use was given back when the hold ran out is counted again now the order is paid after all.
      const code = fresh.data().discount?.returned ? fresh.data().discount : null;
      const cSnap = code ? await tx.get(discountRef(code.id)) : null;
      tx.set(placesRef(o.eventId), placesDoc(before, withSold(before, id, o.lines || []), { paidMinor: (before?.paidMinor || 0) + (o.chargedMinor || 0), orders: (before?.orders || 0) + 1 }));
      if (cSnap?.exists) tx.set(discountRef(code.id), { usageCount: (Number(cSnap.data()?.usageCount) || 0) + 1 }, { merge: true });
      tx.set(orders().doc(id), { ...changes, ...(code ? { discount: { ...code, returned: false } } : {}) }, { merge: true });
      return true;
    });
    if (!done) return { ...o, ...((await orders().doc(id).get()).data() || {}) };
    const next = { ...o, ...changes };
    await tellTickets(id, next, o.pendingKey || "");
    return next;
  }

  /** Reads a held order's card pages; the first one paid for the order's exact amount confirms it. */
  async function refreshOrder(id, o, checkout) {
    if (o.status !== "held" || !checkout) return o;
    for (const sid of (o.sessions || []).slice(-5)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await checkout.read(sid).catch(() => null);
      if (!session || (session.metadata?.eventOrder && session.metadata.eventOrder !== id) || session.payment_status !== "paid") continue;
      if (Number.isFinite(session.amount_total) && session.amount_total !== o.chargedMinor) continue;
      return confirmPaid(id, o, { session: sid, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null });
    }
    return o;
  }

  /** Lets an unpaid order go: its places are free again and it is kept as cancelled (no email: nothing was bought). */
  async function freeOrder(id, o, why) {
    const at = now().toISOString();
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(orders().doc(id));
      if (!fresh.exists || fresh.data()?.status !== "held") return;
      const pSnap = await tx.get(placesRef(o.eventId));
      const before = pSnap.exists ? pSnap.data() : null;
      // The code's use goes back with the places, once.
      const code = fresh.data().discount?.id && !fresh.data().discount.returned ? fresh.data().discount : null;
      const cSnap = code ? await tx.get(discountRef(code.id)) : null;
      tx.set(placesRef(o.eventId), placesDoc(before, withoutHold(before, id, now().getTime())));
      if (cSnap?.exists) tx.set(discountRef(code.id), { usageCount: Math.max(0, (Number(cSnap.data()?.usageCount) || 0) - 1) }, { merge: true });
      tx.set(orders().doc(id), { status: "cancelled", cancelledAt: at, cancelledBy: why, holdUntil: null, pendingKey: null, updatedAt: at, ...(code ? { discount: { ...code, returned: true } } : {}) }, { merge: true });
    });
  }

  /** Confirms paid holds nobody came back to, and frees the ones whose time ran out unpaid. Runs whatever the switches say. */
  async function sweep() {
    const snap = await orders().where("status", "==", "held").limit(100).get();
    if (snap.empty) return { confirmed: 0, freed: 0 };
    const { checkout } = await standalone();
    let confirmed = 0;
    let freed = 0;
    for (const doc of snap.docs) {
      let o = await refreshOrder(doc.id, doc.data(), checkout);
      if (o.status === "paid") { confirmed += 1; continue; }
      if (Date.parse(o.holdUntil || "") > now().getTime()) continue;
      // Close every page first, then read once more: a payment that landed just before the close still counts.
      for (const sid of o.sessions || []) if (SESSION_ID.test(sid)) await checkout?.close(sid).catch(() => {});
      o = await refreshOrder(doc.id, o, checkout);
      if (o.status === "paid") { confirmed += 1; continue; }
      await freeOrder(doc.id, o, "not paid in time");
      freed += 1;
    }
    return { confirmed, freed };
  }

  // ── Customers (validateDiscountCode actions; no sign-in) ───────────────────────────────────────────────────────

  async function handlePublic(req, res) {
    const action = req.body?.action;
    res.set("Cache-Control", "private, no-store");
    if (!(await hitLimit(db, "event", req, LIMITS.event))) return fail(res, 429, "Too many tries. Please wait a few minutes and try again.");
    try {
      const nowMs = now().getTime();
      if (action === "eventView") {
        // The buyer's own page works even after the shop stops selling tickets: what was bought stays theirs.
        const id = String(req.body?.orderId || "");
        const snap = ID.test(id) ? await orders().doc(id).get() : null;
        if (!snap?.exists || !keyFits(snap.data(), req.body?.key)) return fail(res, 404, "We couldn't find those tickets. Check the link in your email.", "not_found");
        const o = await refreshOrder(id, snap.data(), snap.data().status === "held" ? (await standalone()).checkout : null);
        return res.status(200).json({ order: publicOrder(id, o, await readEvent(o.eventId)), zone: zone() });
      }
      if (!(await featureOn())) return res.status(200).json({ on: false });
      if (action === "eventsInfo") {
        // Live events that haven't ended (one with no end shows until a few hours after it starts).
        const coming = comingLive(await readEvents(), nowMs).slice(0, MAX_SHOWN);
        const calc = coming.some((e) => e.chargeTax) && shopTax ? await shopTax().catch(() => null) : null;
        const places = await Promise.all(coming.map((e) => readPlaces(e.id)));
        const codes = coming.some((e) => e.tickets.some((t) => t.priceMinor > 0)) && (await codesOffered());
        return res.status(200).json({ on: true, zone: zone(), currency: currency(), codes, events: coming.map((e, i) => publicEvent(e, places[i], nowMs, calc)) });
      }
      if (action === "eventCode") {
        // Tries a code on the tickets picked: what comes off and what there is to pay. Nothing is held or counted.
        const event = await readEvent(String(req.body?.eventId || ""));
        if (!event || !salesOpen(event, nowMs)) return fail(res, 409, TICKET_MESSAGES.closed, "closed");
        const asked = askedOf(event, req.body, placesLeft(event, await readPlaces(event.id), nowMs));
        if (asked.problem) return fail(res, 409, asked.problem, asked.code);
        const email = EMAIL.test(String(req.body?.email || "").trim()) ? String(req.body.email).trim().toLowerCase() : "";
        try {
          const price = priceOf(event, asked, await taxCalc(event), await codeFor(req.body?.code, email));
          return res.status(200).json({ code: price.discount.code, amountMinor: price.discount.amountMinor, feeMinor: price.feeMinor, totalMinor: price.totalMinor, taxMinor: price.taxMinor, chargedMinor: price.chargedMinor });
        } catch (err) {
          if (err instanceof TicketCodeProblem) return fail(res, 400, err.message, "code");
          throw err;
        }
      }
      if (action === "eventStart") {
        const eventId = String(req.body?.eventId || "");
        if (!ID.test(eventId)) return fail(res, 404, TICKET_MESSAGES.closed, "closed");
        const buyer = cleanBuyer(req.body);
        if (buyer.problem) return fail(res, 400, buyer.problem);
        const seen = await readEvent(eventId);
        if (!seen || !salesOpen(seen, nowMs)) return fail(res, 409, TICKET_MESSAGES.closed, "closed");
        const calc = await taxCalc(seen);
        const { checkout, mode } = await standalone();
        const id = randomId();
        const key = randomKey();
        const at = new Date(nowMs).toISOString();
        const holdUntil = new Date(nowMs + HOLD_MINUTES * MINUTE).toISOString();
        // A free order sends an email nobody paid for, so it takes from the shop's email budget first.
        const asked = askedOf(seen, req.body, placesLeft(seen, await readPlaces(eventId), nowMs));
        if (asked.problem) return fail(res, 409, asked.problem, asked.code);
        let found = null;
        // Only whether there is anything to pay matters here; the transaction below works the real amount out.
        let toPay = asked.totalMinor;
        if (String(req.body?.code || "").trim()) {
          try {
            found = await codeFor(req.body.code, buyer.email);
            toPay = priceOf(seen, asked, calc, found).chargedMinor;
          } catch (err) {
            if (err instanceof TicketCodeProblem) return fail(res, 400, err.message, "code");
            throw err;
          }
        }
        if (toPay === 0 && !(await claimEmailSend(db, "eventEmail", buyer.email))) return fail(res, 429, "Too many tries. Please wait a while and try again.");
        if (toPay > 0 && !checkout) return fail(res, 409, "This shop can't take card payments for tickets yet. Please contact the shop.", "not_available");
        // The event and its places are read again inside the transaction: what is written is what was free then.
        const made = await db.runTransaction(async (tx) => {
          const eSnap = await tx.get(events().doc(eventId));
          const event = eSnap.exists ? cleanEvent(eSnap.data(), eventId) : null;
          if (!event || event.problem || !salesOpen(event, nowMs)) return { problem: TICKET_MESSAGES.closed, code: "closed" };
          const pSnap = await tx.get(placesRef(eventId));
          const before = pSnap.exists ? pSnap.data() : null;
          const order = askedOf(event, req.body, placesLeft(event, before, nowMs));
          if (order.problem) return { problem: order.problem, code: order.code };
          let price;
          try { price = priceOf(event, order, calc, found); } catch (err) {
            if (err instanceof TicketCodeProblem) return { problem: err.message, code: "code", status: 400 };
            throw err;
          }
          // The code is counted with the places, so its limit is never passed by two orders at once.
          const cSnap = found ? await tx.get(discountRef(found.id)) : null;
          const used = Number(cSnap?.data()?.usageCount) || 0;
          const limit = Number(cSnap?.data()?.usageLimit) || 0;
          if (found && (!cSnap.exists || (limit > 0 && used >= limit))) return { problem: "This code has been used up.", code: "code", status: 409 };
          const { taxMinor } = price;
          const free = price.chargedMinor === 0;
          const tickets = free ? newTickets(order.lines) : [];
          const record = {
            eventId, eventTitle: event.title, start: event.start, end: event.end, venue: event.venue, address: event.address,
            customer: buyer, locale: french(req.body?.locale) ? "fr" : "en", lines: order.lines, ticketCount: order.tickets, totalMinor: price.totalMinor,
            ...(order.extras.length ? { extras: order.extras, extrasMinor: order.extrasMinor } : {}),
            ...(price.feeMinor ? { feeMinor: price.feeMinor } : {}),
            ...(price.discount ? { discount: price.discount, listMinor: order.totalMinor } : {}),
            ...(taxMinor ? { taxMinor, taxLines: price.taxLines } : {}),
            chargedMinor: price.chargedMinor, currency: currency(), mode, keyHashes: [hash(key)], sessions: [], createdAt: at, updatedAt: at,
            ...(free
              ? { status: "paid", paidAt: at, holdUntil: null, tickets, ticketCodes: tickets.map((t) => t.code) }
              : { status: "held", holdUntil, pendingKey: key }),
          };
          const cleared = withoutHold(before, "", nowMs);
          tx.set(placesRef(eventId), free
            ? placesDoc(before, withSold(cleared, id, order.lines), { orders: (before?.orders || 0) + 1 })
            : placesDoc(before, withHold(cleared, id, order.lines, holdUntil)));
          if (found) tx.set(discountRef(found.id), { usageCount: used + 1 }, { merge: true });
          tx.set(orders().doc(id), record);
          return { record, free };
        });
        if (made.problem) return fail(res, made.status || 409, made.problem, made.code);
        if (made.free) {
          await tellTickets(id, made.record, key);
          return res.status(200).json({ orderId: id, key, paid: true });
        }
        const o = made.record;
        const description = `${shopName() ? `${shopName()}: ` : ""}${o.eventTitle}, ${[o.lines.map((l) => `${l.qty} × ${l.name}`).join(", "), extrasWords(o)].filter(Boolean).join(", ")}`.slice(0, 250);
        const metadata = { eventOrder: id };
        let session;
        try {
          session = await checkout.open({
            customer_email: buyer.email, metadata, mode: "payment", expires_at: Math.floor(nowMs / 1000) + PAGE_MINUTES * 60,
            success_url: orderUrl(id, key),
            line_items: [{ quantity: 1, price_data: { currency: currency().toLowerCase(), unit_amount: o.chargedMinor, product_data: { name: description } } }],
            payment_intent_data: { description, metadata },
          }, `event-order-${id}`);
        } catch (err) {
          await freeOrder(id, o, "the card page didn't open");
          if (err?.code === "currency_mismatch") return fail(res, 409, err.message, "currency_mismatch");
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) return fail(res, 409, "This shop can't take card payments for tickets yet. Please contact the shop.", "not_available");
          throw err;
        }
        await orders().doc(id).set({ sessions: [session.id] }, { merge: true });
        return res.status(200).json({ url: session.url, orderId: id, holdUntil });
      }
      return fail(res, 400, "Unknown request.");
    } catch (err) {
      console.error("events: a customer action failed:", err?.message || err);
      return fail(res, 500, "Something went wrong on our side. Please try again in a moment.");
    }
  }

  // ── The owner (createStripeCheckoutSession action "eventsAdmin") ──────────────────────────────────────────────

  /** An event as the admin lists it: what was made, plus tickets sold and money taken. */
  function adminEvent(event, places, nowMs) {
    const sold = soldCount(event, places);
    const left = placesLeft(event, places, nowMs);
    return { ...event, sold: sold.byKind, soldTotal: sold.total, placesTotal: sold.places, left, paidMinor: places?.paidMinor || 0, orders: places?.orders || 0, arrived: Math.max(0, places?.arrived || 0) };
  }
  const adminOrder = (id, o) => ({
    id, status: o.status, eventId: o.eventId, name: o.customer?.name || "", email: o.customer?.email || "", lines: o.lines || [], extras: o.extras || [], extrasMinor: o.extrasMinor || 0, feeMinor: o.feeMinor || 0, ticketCount: o.ticketCount || 0,
    totalMinor: o.totalMinor || 0, taxMinor: o.taxMinor || 0, chargedMinor: o.chargedMinor || 0, currency: o.currency,
    tickets: (o.tickets || []).map((t) => ({ code: t.code, ticketId: t.ticketId, name: t.name, usedAt: t.usedAt || "" })),
    createdAt: o.createdAt || "", paidAt: o.paidAt || "", test: o.mode === "test",
    discount: o.discount ? { code: o.discount.code, amountMinor: o.discount.amountMinor || 0 } : null,
    refundedMinor: o.refundedMinor || 0, refundedTickets: (o.refunds || []).reduce((sum, r) => sum + (r.tickets || []).length, 0), refundedAt: o.refundedAt || "",
  });

  async function handleAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    const by = adminUser.email || "admin";
    try {
      // The owner just flipped the Events switch (Settings › Ways to sell): the website's links follow, on or off.
      if (op === "hint") return res.status(200).json({ ok: true, eventsLive: (await tellWebsite()) === true });
      if (!(await featureOn())) return fail(res, 403, "Events aren't turned on for this shop.", "off");
      const nowMs = now().getTime();
      if (op === "list") {
        const list = await readEvents();
        const places = await Promise.all(list.map((e) => readPlaces(e.id)));
        return res.status(200).json({ zone: zone(), currency: currency(), events: list.map((e, i) => adminEvent(e, places[i], nowMs)) });
      }
      if (op === "saveEvent") {
        const id = ID.test(String(req.body?.event?.id || "")) ? req.body.event.id : randomId();
        const event = cleanEvent(req.body?.event, id);
        if (event.problem) return fail(res, 400, event.problem);
        const existing = await events().limit(MAX_EVENTS + 1).get();
        const isNew = !existing.docs.some((d) => d.id === id);
        if (isNew && existing.docs.length >= MAX_EVENTS) return fail(res, 400, `A shop can have up to ${MAX_EVENTS} events. Delete an old one first.`);
        // Tickets already sold stay sold: a kind can't go, and can't have fewer places than were bought.
        const places = isNew ? null : await readPlaces(id);
        for (const [kindId, n] of Object.entries(places?.sold || {})) {
          if (!(n > 0)) continue;
          const kind = event.tickets.find((t) => t.id === kindId);
          if (!kind) return fail(res, 409, "A ticket that people have bought can't be removed. Set its places to what was sold to stop selling it.", "sold");
          if (kind.places < n) return fail(res, 409, `${n} "${kind.name}" ${n === 1 ? "ticket is" : "tickets are"} already sold, so it needs at least ${n} ${n === 1 ? "place" : "places"}.`, "sold");
        }
        await events().doc(id).set({ ...event, updatedAt: now().toISOString(), updatedBy: by });
        await tellWebsite();
        return res.status(200).json({ ok: true, event: adminEvent(event, places, nowMs) });
      }
      if (op === "deleteEvent") {
        const id = String(req.body?.id || "");
        const event = await readEvent(id);
        if (!event) return res.status(200).json({ ok: true });
        const places = await readPlaces(id);
        const stillPaying = Object.values(places?.held || {}).some((h) => Date.parse(h?.until || "") > nowMs);
        if (soldCount(event, places).total > 0 || stillPaying) return fail(res, 409, "People have tickets for this event, so it can't be deleted. Mark it cancelled instead.", "sold");
        await events().doc(id).delete();
        await placesRef(id).delete();
        await tellWebsite();
        return res.status(200).json({ ok: true });
      }
      if (op === "orders") {
        // Who is coming: the paid orders of one event, newest first.
        const eventId = String(req.body?.eventId || "");
        if (!ID.test(eventId)) return fail(res, 400, "Unknown event.");
        const snap = await orders().where("eventId", "==", eventId).limit(1000).get();
        // Refunded orders stay on the list, after the ones still coming, so the owner can see what went back.
        const list = snap.docs.map((d) => adminOrder(d.id, d.data())).filter((o) => o.status === "paid" || o.status === "refunded")
          .sort((a, b) => Number(a.status === "refunded") - Number(b.status === "refunded") || String(b.paidAt).localeCompare(String(a.paidAt)));
        return res.status(200).json({ orders: list });
      }
      if (op === "resendTickets") {
        const id = String(req.body?.orderId || "");
        const snap = ID.test(id) ? await orders().doc(id).get() : null;
        if (!snap?.exists || snap.data().status !== "paid") return fail(res, 404, "That order has no tickets to send.");
        // A fresh link for this email; the last five keys keep working.
        const key = randomKey();
        await orders().doc(id).set({ keyHashes: [...(snap.data().keyHashes || []), hash(key)].slice(-5), updatedAt: now().toISOString() }, { merge: true });
        const sent = await tellTickets(id, snap.data(), key, { toOwner: false });
        if (!sent) return fail(res, 502, "The email didn't go out. Check Settings › Notifications and try again.");
        return res.status(200).json({ ok: true });
      }
      // Gives a paid order's tickets back: all of them, or the ones in `asked`. Money first (one key per order and set of
      // codes, so a second try is the same refund), then one transaction. `called`: the whole event is off, so tickets
      // already checked in go back too and the email says why. Answers `{ error }` or `{ already, amountMinor, order }`.
      const giveBack = async (id, seen, { asked = null, money = true, called = false } = {}) => {
        const gone = (seen.tickets || []).filter((t) => !asked || asked.has(t.code));
        if (!gone.length) return { error: [400, "Pick at least one ticket to refund.", "none"] };
        if (!called && gone.some((t) => t.usedAt)) return { error: [409, "A ticket that was checked in at the door can't be refunded. Undo its check-in first.", "used"] };
        const counts = {};
        for (const t of gone) counts[t.ticketId] = (counts[t.ticketId] || 0) + 1;
        const left = (seen.tickets || []).length - gone.length;
        const amountMinor = money === false ? 0 : refundMinorFor(seen, counts, left);
        const codes = gone.map((t) => t.code).sort();
        let refundId = null;
        if (amountMinor > 0) {
          if (!seen.paymentIntent) return { error: [409, "This order has no card payment on record to refund. Refund it from your payment account, then cancel the tickets here without a refund.", "no_payment"] };
          try {
            const refund = await payments.refund({
              mode: seen.mode === "test" ? "test" : "live", paymentIntentId: seen.paymentIntent, amountMinor, metadata: { eventOrder: id },
              idempotencyKey: `event-refund-${id}-${hash(codes.join(",")).slice(0, 24)}`,
            });
            refundId = refund.refundId || null;
          } catch (err) {
            console.error("events: a refund was refused:", err?.message || err);
            return { error: [502, "The refund didn't go through, so nothing was changed. Try again in a moment.", "refund_failed"] };
          }
        }
        const at = now().toISOString();
        const done = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(orders().doc(id));
          const o = fresh.exists ? fresh.data() : null;
          // A second tap finds the tickets already gone (the payment key above made its refund the same one).
          if (!o || o.status !== "paid" || !codes.every((c) => (o.tickets || []).some((t) => t.code === c))) return null;
          const tickets = o.tickets.filter((t) => !codes.includes(t.code));
          const pSnap = await tx.get(placesRef(o.eventId));
          const before = pSnap.exists ? pSnap.data() : null;
          const usedGone = gone.filter((t) => t.usedAt).length;
          // An order given back whole frees its code's use too, once.
          const code = !tickets.length && o.discount?.id && !o.discount.returned ? o.discount : null;
          const cSnap = code ? await tx.get(discountRef(code.id)) : null;
          if (cSnap?.exists) tx.set(discountRef(code.id), { usageCount: Math.max(0, (Number(cSnap.data()?.usageCount) || 0) - 1) }, { merge: true });
          tx.set(placesRef(o.eventId), placesDoc(before, withReturned(before, counts), {
            paidMinor: Math.max(0, (before?.paidMinor || 0) - amountMinor), orders: Math.max(0, (before?.orders || 0) - (tickets.length ? 0 : 1)),
            ...(usedGone ? { arrived: Math.max(0, (before?.arrived || 0) - usedGone) } : {}),
          }));
          const changes = {
            tickets, ticketCodes: tickets.map((t) => t.code), refundedMinor: (o.refundedMinor || 0) + amountMinor, updatedAt: at,
            refunds: [...(o.refunds || []), { at, by, amountMinor, refundId, ...(called ? { eventCancelled: true } : {}), tickets: gone.map((t) => ({ code: t.code, ticketId: t.ticketId, name: t.name })) }].slice(-50),
            ...(tickets.length ? {} : { status: "refunded", refundedAt: at }),
            ...(code ? { discount: { ...code, returned: true } } : {}),
          };
          tx.set(orders().doc(id), changes, { merge: true });
          return { ...o, ...changes };
        });
        if (!done) return { already: true, amountMinor: 0, order: adminOrder(id, (await orders().doc(id).get()).data() || seen) };
        await tellRefund(done, gone, amountMinor, done.tickets.length, called);
        return { amountMinor, order: adminOrder(id, done) };
      };
      if (op === "refund") {
        // Gives back an order's tickets: every one, or the ones named by code. `money: false` cancels them and keeps the money.
        const id = String(req.body?.orderId || "");
        const snap = ID.test(id) ? await orders().doc(id).get() : null;
        const seen = snap?.exists ? snap.data() : null;
        if (!seen || seen.status !== "paid") return fail(res, 404, "That order has no tickets to refund.", "not_found");
        const asked = Array.isArray(req.body?.codes) ? new Set(req.body.codes.map(cleanTicketCode).filter(Boolean)) : null;
        const result = await giveBack(id, seen, { asked, money: req.body?.money !== false });
        if (result.error) return fail(res, ...result.error);
        return res.status(200).json({ ok: true, ...result });
      }
      if (op === "moveOrder") {
        // Moves a paid order's tickets to another event: same codes, no money moves. `kinds` picks the new ticket kind
        // for each old one where the names don't match. Places at the new event are checked inside the transaction.
        const id = String(req.body?.orderId || "");
        const toId = String(req.body?.toEventId || "");
        const snap = ID.test(id) ? await orders().doc(id).get() : null;
        const seen = snap?.exists ? snap.data() : null;
        if (!seen || seen.status !== "paid" || !(seen.tickets || []).length) return fail(res, 404, "That order has no tickets to move.", "not_found");
        const target = await readEvent(toId);
        if (!target || toId === seen.eventId) return fail(res, 400, "Choose another event to move them to.", "event");
        if (target.status === "cancelled" || endMs(target) <= nowMs) return fail(res, 409, "That event is over or cancelled, so nobody can be moved to it.", "closed");
        const picks = req.body?.kinds && typeof req.body.kinds === "object" ? req.body.kinds : {};
        const kinds = moveKinds(seen.tickets, target.tickets, picks);
        if (Object.values(kinds).some((k) => !k)) return fail(res, 400, "Choose which ticket they get at the new event.", "kind");
        const at = now().toISOString();
        const key = randomKey();
        const done = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(orders().doc(id));
          const o = fresh.exists ? fresh.data() : null;
          if (!o || o.status !== "paid" || o.eventId !== seen.eventId || !(o.tickets || []).length) return { gone: true };
          const fromSnap = await tx.get(placesRef(o.eventId));
          const toSnap = await tx.get(placesRef(toId));
          const fromPlaces = fromSnap.exists ? fromSnap.data() : null;
          const toPlaces = toSnap.exists ? toSnap.data() : null;
          const leaving = {}; const arriving = {};
          for (const t of o.tickets) { leaving[t.ticketId] = (leaving[t.ticketId] || 0) + 1; arriving[kinds[t.ticketId]] = (arriving[kinds[t.ticketId]] || 0) + 1; }
          const left = leftAt(target, toPlaces, nowMs);
          const short = target.tickets.find((k) => (arriving[k.id] || 0) > (left[k.id] || 0));
          if (short) return { short: { name: short.name, left: left[short.id] || 0 } };
          const kept = Math.max(0, (o.chargedMinor || 0) - (o.refundedMinor || 0));
          const used = o.tickets.filter((t) => t.usedAt).length;
          tx.set(placesRef(o.eventId), placesDoc(fromPlaces, withReturned(fromPlaces, leaving), {
            paidMinor: Math.max(0, (fromPlaces?.paidMinor || 0) - kept), orders: Math.max(0, (fromPlaces?.orders || 0) - 1), arrived: Math.max(0, (fromPlaces?.arrived || 0) - used),
          }));
          tx.set(placesRef(toId), placesDoc(toPlaces, withArrived(toPlaces, arriving), { paidMinor: (toPlaces?.paidMinor || 0) + kept, orders: (toPlaces?.orders || 0) + 1 }));
          const nameOf = (kindId) => target.tickets.find((k) => k.id === kindId)?.name || "";
          const tickets = o.tickets.map((t) => ({ code: t.code, ticketId: kinds[t.ticketId], name: nameOf(kinds[t.ticketId]) }));
          const changes = {
            eventId: toId, eventTitle: target.title, start: target.start, end: target.end || "", venue: target.venue || "", address: target.address || "",
            tickets, lines: movedLines(o.lines || [], kinds, target.tickets), keyHashes: [...(o.keyHashes || []), hash(key)].slice(-5), updatedAt: at,
            moves: [...(o.moves || []), { at, by, from: o.eventId, fromTitle: o.eventTitle || "" }].slice(-20),
          };
          tx.set(orders().doc(id), changes, { merge: true });
          return { order: { ...o, ...changes }, fromTitle: o.eventTitle || "" };
        });
        if (done.gone) return fail(res, 409, "That order changed a moment ago. Open the guest list again.", "changed");
        if (done.short) return fail(res, 409, done.short.left > 0 ? `Only ${done.short.left} ${done.short.name} ${done.short.left === 1 ? "place is" : "places are"} left at that event.` : `${done.short.name} is sold out at that event.`, "full");
        const told = await tellTickets(id, done.order, key, { toOwner: false, movedFrom: done.fromTitle });
        return res.status(200).json({ ok: true, told, order: adminOrder(id, done.order) });
      }
      if (op === "cancelEvent") {
        // Calls an event off and gives every order back, a few per call so no call runs long: the admin calls again
        // while `left` is above 0. Safe to repeat: an order already given back is skipped, and a refund that fails
        // leaves its order as it was (counted in `failed`, tried again on the next press).
        const id = String(req.body?.id || "");
        const event = await readEvent(id);
        if (!event) return fail(res, 404, "That event is gone.", "not_found");
        if (event.status !== "cancelled") {
          await events().doc(id).set({ status: "cancelled", cancelledAt: now().toISOString(), updatedAt: now().toISOString() }, { merge: true });
          await tellWebsite();
        }
        const skip = new Set(Array.isArray(req.body?.skip) ? req.body.skip.map(String).slice(0, 1000) : []);
        const snap = await orders().where("eventId", "==", id).limit(1000).get();
        const open = snap.docs.filter((d) => d.data().status === "paid" && !skip.has(d.id));
        let done = 0; let amountMinor = 0;
        const failed = [];
        for (const d of open.slice(0, CANCEL_BATCH)) {
          const result = await giveBack(d.id, d.data(), { money: req.body?.money !== false, called: true });
          if (result.error) failed.push({ id: d.id, name: d.data().customer?.name || "", code: result.error[2] });
          else { done += 1; amountMinor += result.amountMinor; }
        }
        return res.status(200).json({ ok: true, done, amountMinor, failed, left: Math.max(0, open.length - CANCEL_BATCH) });
      }
      if (op === "checkIn") {
        // At the door: one ticket by its code (typed, or scanned from the buyer's page). `value: false` takes it back.
        const code = cleanTicketCode(req.body?.code);
        if (!code) return fail(res, 400, "A ticket code is eight letters and numbers, like K7QM-2XPA.", "bad_code");
        const found = await orders().where("ticketCodes", "array-contains", code).limit(5).get();
        const doc = found.docs.find((d) => d.data()?.status === "paid");
        if (!doc) return fail(res, 404, "No ticket has that code. Check the letters and try again.", "unknown_code");
        const seen = doc.data();
        const eventId = String(req.body?.eventId || "");
        if (ID.test(eventId) && seen.eventId !== eventId) return fail(res, 409, `That ticket is for "${seen.eventTitle}", not this event.`, "wrong_event");
        const event = await readEvent(seen.eventId);
        if (event?.status === "cancelled") return fail(res, 409, "This event was cancelled, so its tickets can't be used.", "cancelled");
        const undo = req.body?.value === false;
        const at = now().toISOString();
        const done = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(orders().doc(doc.id));
          const o = fresh.exists ? fresh.data() : null;
          const index = o?.status === "paid" ? (o.tickets || []).findIndex((t) => t.code === code) : -1;
          if (index < 0) return null;
          const ticket = o.tickets[index];
          const was = ticket.usedAt || "";
          if (undo ? !was : !!was) return { o, index, ticket, already: !undo, changed: false };
          const { usedAt: _at, usedBy: _by, ...plain } = ticket;
          const next = undo ? plain : { ...plain, usedAt: at, usedBy: by };
          const tickets = o.tickets.map((t, i) => (i === index ? next : t));
          const pSnap = await tx.get(placesRef(o.eventId));
          const before = pSnap.exists ? pSnap.data() : null;
          tx.set(placesRef(o.eventId), { arrived: Math.max(0, (before?.arrived || 0) + (undo ? -1 : 1)), updatedAt: at }, { merge: true });
          tx.set(orders().doc(doc.id), { tickets, updatedAt: at }, { merge: true });
          return { o: { ...o, tickets }, index, ticket: next, already: false, changed: true };
        });
        if (!done) return fail(res, 404, "No ticket has that code. Check the letters and try again.", "unknown_code");
        const places = await readPlaces(done.o.eventId);
        return res.status(200).json({
          ok: true, already: done.already,
          ticket: {
            code, kind: done.ticket.name, usedAt: done.ticket.usedAt || "", orderId: doc.id, eventId: done.o.eventId, eventTitle: done.o.eventTitle,
            name: done.o.customer?.name || "", number: done.index + 1, of: done.o.tickets.length,
            arrivedOfOrder: done.o.tickets.filter((t) => t.usedAt).length,
          },
          arrived: Math.max(0, places?.arrived || 0),
        });
      }
      return fail(res, 400, "Unknown request.");
    } catch (err) {
      console.error("events: an owner action failed:", err?.message || err);
      return fail(res, 500, err?.message || "Something went wrong.");
    }
  }

  return { handlePublic, handleAdmin, sweep, featureOn };
}

module.exports = { eventActions, PUBLIC_EVENT_ACTIONS, HOLD_MINUTES, publicEvent, publicOrder };
