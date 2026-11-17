// Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md). Customers book a time with the shop from
// its Book a time page (/book); the owner sees and changes bookings in Admin › Orders › Bookings. Off for every shop
// until the platform's control room turns it on for that shop: the platform writes `platform/features` { bookings: true }
// into the shop's folder, and every action here first checks it.
//
// Records, all in the shop's own folder (firestore.rules lets admins read them and no browser write them):
//   bookingServices/{id}   a service (src/shared/bookingTimes.ts BookingService)
//   bookingSettings/main   opening hours and rules (BookingSettings)
//   bookings/{id}          { serviceId, serviceName, minutes, gapAfter, location, start, end, customer: { name, email, phone },
//                            note, answers: [{ label, answer }] (the service's own questions), status: "held" | "confirmed" | "cancelled",
//                            payment: "free" | "card" | "deposit" | "atShop", priceMinor (the whole price), depositMinor and depositPaid (payment "deposit":
//                            the part taken by card when booked; the rest is paid at the visit), currency, paid (all of it), sessions, paidSession?, paymentIntent?, refund?, holdUntil?, manageKeyHash,
//                            source: "website" | "admin", noShow?, history: [{ at, what, by }], createdAt, updatedAt,
//                            cardHold? and lateFeeMinor? (the service keeps a card on file), card? { customer, paymentMethod, brand,
//                            last4, mode } once saved, fee? { intent, amountMinor, at, by } once a missed-booking fee is charged,
//                            discount? { id, code, amountMinor, returned? } and listPriceMinor (a discount code typed when booking:
//                            priceMinor is after it, listPriceMinor before; its use is counted when the time is taken and given back on cancel),
//                            giftCard? { id, last4, amountMinor, returned? } (a gift card paying part or all of what is paid when booked:
//                            debited when the time is taken, put back once on cancel unless the shop keeps it),
//                            pack? { id, last4, visit, visits, returned? } with payment "pack" and priceMinor 0 (a visit booked with
//                            a pack of visits: listPriceMinor is the service's price; the use is counted when the time is taken
//                            and given back once on cancel unless the shop keeps it),
//                            staffId? and staffName? (who takes it, when the shop lists people), roomId? and roomName? (the room it uses) }
//   bookingPacks/{id}      a pack of visits bought on the Book a time page (id = hash of its code; only the last four are kept):
//                          { last4, serviceId, serviceName, visits, priceMinor, currency, customer: { name, email },
//                          status: "held" | "active" | "closed", sessions, paymentIntent?, paidAt?, expiresOn (last shop day,
//                          or null), uses: [{ bookingId, start, at, returned? }], holdUntil, refund?, createdAt, updatedAt }.
//                          Server-only (no rule opens it): the code is the customer's key, so it is never stored.
//   bookingDays/{day}      { items: { [bookingId]: { start, end, held, s: serviceId, p?: staffId, r?: roomId } } }: what is taken on
//                          one shop day, read and written in the same transaction as the booking, so two customers can never
//                          take one time (or one person, or one room). An item with no p blocks everyone (older bookings).
//   bookingWaitlist/{id}   { serviceId, serviceName, day, start | null, name, email, createdAt, offerStart?, offerUntil?,
//                          offerKeyHash? }: someone who asked to hear when a full class time (start) or a full day (start
//                          null) has room again. Server-only (no rule opens it). A freed place goes to the first in line:
//                          it is held for them for the shop's waitHoldMinutes (an `offer_<id>` item in bookingDays) and emailed with a
//                          link that books it; the entry goes once they book, once the hold runs out (the place then goes
//                          to the next person) or once its day has passed.
//
// A paid booking holds its time while the customer pays on the shop's own Stripe or Square page
// (payments.standaloneCheckout, as the stockroom's invoice pay links do). No shop order is made and the webhook ignores
// the page; the Book a time page asks "view" when the customer comes back, and the five-minute sweep confirms a paid
// hold or, after HOLD_MINUTES, closes the page and frees the time.
//
// Card on file (Stripe shops only, 16 November 2026): a service with `holdCard` saves the customer's card on the same page
// (a setup page when nothing is taken now, or the deposit page with setup_future_usage). After a no-show or the shop's own
// cancel, the owner charges the service's fee to it once (op chargeFee) and the customer gets a receipt.
//
// Pay the rest (16 November 2026): what is still due on a confirmed booking (the rest after a deposit, or a pay-at-the-shop
// price) can be paid by card from the customer's booking page. The owner sends that page as a link, by email or as a QR
// code (op payLink, which keeps its own key `payKey` so the same link works every time). Each pay page is listed in
// `restPages` [{ id, amountMinor, until, url }] with `restOpen: true`; the page view and the five-minute sweep read
// them, and the first paid one is kept as `rest` { amountMinor, paymentIntent, session, at }. A refund takes the rest's
// payment back first, then the booking's own.
//
// The customer's link to see, move or cancel is /book?booking=<id>&key=<key>; only a hash of the key is kept.
const crypto = require("crypto");
const {
  cleanService, cleanBookingSettings, cleanAnswers, freeTimes, isClass, daysTouched, addDays, dayOf, isDay, customerCanChange,
  googleCalendarLink, bookingsFeedIcs, bookingIcs, MAX_SERVICES, depositOf, cardAsk, cardTaken, giftCardPart, giftTaken, bookedCardTaken, restTaken, balanceDue, restPayable, feeChargeable, tipTaken, tipFits, tipOpen, tipLimitMinor,
  secondReminderDue, summaryDue, zonedTime, offersPack, packLeft, packProblem, packEndsOn, PACK_MESSAGES, MIN_CARD_MINOR,
  pickupSlots, pickupTimeProblem, PICKUP_MESSAGES, PICKUP_DAYS_AHEAD,
  whoIsFree, booksByPerson, classPlacesLeft, keptPerson, ownerBookingSettings,
} = require("./shared/bookingTimes");
const { bookingDiscountMinor, tooSmallForCard, BookingCodeProblem } = require("./bookingDiscount");
const { emailIdentity } = require("./discountClaims");
const { findCountry, regionCode } = require("./shared/shippingZones");
const { giftCardId, last4, giftCardProblem, availableMinor, withHistory, GIFT_CARD_MESSAGES } = require("./giftCards");

const HOLD_MINUTES = 10;
/** How long a pack's card page stays open. An unpaid pack is forgotten once it closes. */
const PACK_PAGE_MINUTES = 60;
/** A pack's code: 12 letters and digits with nothing that reads two ways, as "ABCD-EFGH-JKLM". */
const PACK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newPackCode() {
  const bytes = crypto.randomBytes(12);
  let raw = "";
  for (let i = 0; i < 12; i++) raw += PACK_ALPHABET[bytes[i] % PACK_ALPHABET.length];
  return raw.match(/.{4}/g).join("-");
}
/** "abcd efgh-jklm" → "ABCD-EFGH-JKLM"; "" when it can't be a pack code. */
function normalizePackCode(value) {
  const raw = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 12 ? raw.match(/.{4}/g).join("-") : "";
}
const packId = (code) => { const normal = normalizePackCode(code); return normal ? hash(`booking-pack:${normal}`).slice(0, 40) : ""; };
const MINUTE = 60_000;
/** A hold the sweep never got to (a failed run) stops blocking its time after this long. */
const STALE_HOLD_MS = 2 * 60 * 60 * 1000;
const MAX_DAYS_ASKED = 14;
/** The most one payment taken at the desk may be (a typo guard: $10,000). */
const WALK_IN_MAX_MINOR = 1_000_000;
/** How many people may wait for one day of one service. */
const MAX_WAITING = 30;
/** A waiting-list hold the sweep never got to stops blocking its place this long after its end. */
const OFFER_GRACE_MS = 15 * 60 * 1000;
const WAIT_ID = /^[a-f0-9]{32}$/;
const PACK_ID = /^[a-f0-9]{40}$/;
const offerItem = (wid) => `offer_${wid}`;
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const KEY = /^[a-f0-9]{48}$/;
const READER_ID = /^tmr_[A-Za-z0-9_]{1,100}$/;
/** A fee being charged stops a second tap for this long, in case the first one never finished. */
const FEE_CLAIM_MS = 2 * MINUTE;
const SESSION_ID = /^(cs_[A-Za-z0-9_]{8,200}|sqlink_[A-Za-z0-9_-]{1,192})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const hash = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** What is taken on the given days, as Busy stretches, leaving out `except` (a booking being moved). */
function busyFrom(daySnaps, nowMs, except = "") {
  const busy = [];
  for (const snap of daySnaps) {
    const items = (snap.exists ? snap.data()?.items : null) || {};
    for (const [id, item] of Object.entries(items)) {
      if (id === except || !item || !Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
      // A place held for the waiting list lasts until its own end (the owner picks how long); other holds STALE_HOLD_MS.
      if (item.offer && Number.isFinite(item.until) ? nowMs > item.until + OFFER_GRACE_MS : item.held && Number.isFinite(item.at) && nowMs - item.at > STALE_HOLD_MS) continue;
      busy.push({ start: item.start, end: item.end, serviceId: typeof item.s === "string" ? item.s : undefined,
        // Whose booking it is and which room it uses (staff and rooms); an older item without them blocks everyone.
        ...(typeof item.p === "string" && item.p ? { staffId: item.p } : {}), ...(typeof item.r === "string" && item.r ? { roomId: item.r } : {}) });
    }
  }
  return busy;
}

/**
 * What a day item and a booking carry for the person who takes it and the room it uses: nothing at all in a shop that
 * books as one calendar and has no rooms, so its records stay as they were.
 */
function staffParts(settings, person, roomId) {
  const who = person ? (settings.staff || []).find((p) => p.id === person) : null;
  const room = roomId ? (settings.rooms || []).find((r) => r.id === roomId) : null;
  return {
    item: { ...(person ? { p: person } : {}), ...(roomId ? { r: roomId } : {}) },
    record: { ...(person ? { staffId: person, staffName: who?.name || "" } : {}), ...(roomId ? { roomId, roomName: room?.name || "" } : {}) },
  };
}

/** "with Ana" for emails and the owner's calendar, or "". */
const withWhom = (b) => (b?.staffName ? `with ${b.staffName}` : "");

/** A customer's details from the Book a time page, or { problem }. */
function cleanCustomer(body) {
  const name = text(body?.name, 100);
  const email = text(body?.email, 320).toLowerCase();
  if (!name) return { problem: "Please add your name." };
  if (!EMAIL.test(email)) return { problem: "Please add an email address we can send your booking to." };
  return { name, email, phone: text(body?.phone, 40), note: typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "" };
}

/** What the customer's page may see of a booking (never the payment ids or the key's hash). */
function publicBooking(id, b, settings, nowMs) {
  const start = Date.parse(b.start);
  return {
    id, serviceId: b.serviceId, serviceName: b.serviceName, minutes: b.minutes, location: b.location || "", start: b.start, end: b.end,
    staffId: b.staffId || "", staffName: b.staffName || "",
    meetUrl: b.status === "confirmed" ? b.meetUrl || "" : "",
    status: b.status, payment: b.payment, paid: !!b.paid, priceMinor: b.priceMinor || 0, currency: b.currency,
    // A discount code: what it took off the service's price (priceMinor is already after it).
    discountCode: b.discount?.code || "", discountMinor: b.discount?.amountMinor || 0,
    // A gift card: its last four and what it paid (never its id), and whether that went back onto it.
    giftCardLast4: b.giftCard?.last4 || "", giftMinor: b.giftCard?.amountMinor || 0, giftReturned: !!b.giftCard?.returned,
    // A pack of visits: its last four, and which visit of how many this is (never the pack's id).
    packLast4: b.pack?.last4 || "", packVisit: b.pack?.visit || 0, packVisits: b.pack?.visits || 0, packReturned: !!b.pack?.returned,
    depositMinor: b.payment === "deposit" ? b.depositMinor || 0 : 0, depositPaid: !!b.depositPaid, dueMinor: balanceDue(b),
    name: b.customer?.name || "", email: b.customer?.email || "", refunded: !!b.refund?.amountMinor,
    canChange: b.status === "confirmed" && customerCanChange(start, settings, nowMs),
    cancelHours: settings.cancelHours,
    // Card on file: only whether one is kept, its last four and the fee (never its ids).
    cardHold: !!b.cardHold, lateFeeMinor: b.cardHold ? b.lateFeeMinor || 0 : 0, cardLast4: b.card?.last4 || "", feeMinor: b.fee?.amountMinor || 0,
    // Pay the rest: whether what is left can be paid by card here, and what was.
    canPayRest: restPayable(b), restPaidMinor: restTaken(b),
    // Tips: the choices (when the shop asks for them), whether a tip can be added on its own, and the tip given.
    tipPercents: settings.tips && (b.priceMinor || 0) > 0 ? settings.tipPercents : [], canTip: tipOpen(b, settings.tips, nowMs) && !restPayable(b),
    tipMinor: tipTaken(b), tipLimitMinor: tipLimitMinor(b.priceMinor || 0),
  };
}

function bookingActions({
  db, requireAdmin, payments, shopTestMode, hitLimit, LIMITS, siteLink, shopName = () => "", zone, currency,
  sendEmail = async () => {}, emailBrand = async () => ({}), claimEmailSend = async () => true, ownerEmail = () => "",
  escapeHtml, risoLayout, risoButton, now = () => new Date(), randomId = () => crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(8, "0"),
  randomKey = () => crypto.randomBytes(24).toString("hex"),
  // Bookings straight into the owner's Google Calendar (googleConnect.js googleCalendarSync): { put, remove }, or none.
  calendar = null,
  // Discount codes on bookings: (code, email) → the shop's discount, checked like checkout's (on, dates, usage limit,
  // who may use it, one use per customer across orders), or throws with the customer's words. None: codes are refused.
  findDiscount = null,
}) {
  const services = () => db.collection("bookingServices");
  const settingsRef = () => db.collection("bookingSettings").doc("main");
  const bookings = () => db.collection("bookings");
  const dayRef = (day) => db.collection("bookingDays").doc(day);
  const waitlist = () => db.collection("bookingWaitlist");
  const packs = () => db.collection("bookingPacks");

  async function featureOn() {
    const snap = await db.collection("platform").doc("features").get().catch(() => null);
    return snap?.exists === true && snap.data()?.bookings === true;
  }
  async function readSettings() {
    const snap = await settingsRef().get();
    return cleanBookingSettings(snap.exists ? snap.data() : null);
  }
  // The shop's pages show "Book a time" in the header, phone menu and footer while bookings are on. They learn it from
  // the public website settings they already read (`bookingsLive`), so no page asks this server on every visit. Only a
  // hint for showing a link: every booking action above still checks the real switch. A shop with no website settings
  // yet is left alone (a record holding only this would stand in for the starting design).
  async function tellWebsite(live) {
    try {
      const ref = db.collection("settings").doc("website");
      const snap = await ref.get();
      if (snap.exists && (snap.data()?.bookingsLive === true) !== (live === true)) await ref.set({ bookingsLive: live === true }, { merge: true });
    } catch (err) {
      console.warn("bookings: the website link wasn't updated:", err?.message || err);
    }
  }
  async function readServices() {
    const snap = await services().limit(MAX_SERVICES).get();
    return snap.docs.map((d) => cleanService(d.data(), d.id)).filter((s) => !s.problem).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  /** Only Stripe can keep a card for later; a Square shop's services book without one. */
  const canHoldCard = () => payments?.provider === "stripe";
  async function standalone() {
    const mode = (await shopTestMode()) ? "test" : "live";
    return { mode, checkout: await payments.standaloneCheckout(mode) };
  }

  // ── Google Calendar ───────────────────────────────────────────────────────────────────────────────────────────────

  /** What the owner's calendar event says: who, and everything they told the shop. */
  function calendarEvent(id, b) {
    const who = b.customer?.name || "Booking";
    const details = [
      b.customer?.email, b.customer?.phone, b.note ? `“${b.note}”` : "",
      ...(b.answers || []).map((a) => `${a.label}: ${a.answer}`),
      balanceDue(b) ? `To pay at the visit: ${moneyWords(balanceDue(b), b.currency)}` : "",
      siteLink("/admin#bookings"),
    ].filter(Boolean).join("\n");
    return { title: `${who}: ${b.serviceName || "Booking"}${b.staffName ? ` (${b.staffName})` : ""}`, start: b.start, end: b.end, location: b.location || "", details };
  }

  /**
   * Keeps a booking's event in the owner's Google Calendar (settings `googleCalendar`): a confirmed booking is put there,
   * with a Google Meet call when its service is a video call (one-to-one services only); a cancelled one is taken away.
   * Never throws and never holds up a booking: Google being slow or unlinked only leaves the calendar behind. Answers the
   * booking with its call link, so the email about it can carry the link.
   */
  async function syncCalendar(id, b) {
    if (!calendar) return b;
    try {
      const settings = await readSettings();
      if (b.status !== "confirmed" || !settings.googleCalendar) {
        if (b.calendarAt) {
          const gone = await calendar.remove(id);
          if (gone?.available) await bookings().doc(id).set({ calendarAt: null }, { merge: true });
        }
        return b;
      }
      const service = (await readServices()).find((x) => x.id === b.serviceId);
      const meet = service?.meet === true && (service.places || 1) === 1;
      const put = await calendar.put(id, { ...calendarEvent(id, b), meet });
      if (!put?.available) return b;
      const meetUrl = meet && /^https:\/\/meet\.google\.com\/[\w-]+$/.test(put.meetUrl || "") ? put.meetUrl : "";
      await bookings().doc(id).set({ calendarAt: now().toISOString(), meetUrl }, { merge: true });
      return { ...b, calendarAt: now().toISOString(), meetUrl };
    } catch (err) {
      console.warn(`Booking ${id} didn't reach Google Calendar:`, err?.message || err);
      return b;
    }
  }

  /** Turning the setting on: the coming confirmed bookings go in too (up to 200). Answers whether Google is linked. */
  async function fillCalendar() {
    if (!calendar) return { available: false, filled: 0 };
    const snap = await bookings().where("start", ">=", now().toISOString()).limit(200).get();
    let filled = 0;
    for (const doc of snap.docs) {
      const b = doc.data();
      if (b.status !== "confirmed") continue;
      const after = await syncCalendar(doc.id, b);
      if (!after.calendarAt) return { available: false, filled };
      filled += 1;
    }
    if (filled) return { available: true, filled };
    // Nothing booked yet: ask Google whether the calendar is linked, with an event put and taken away again.
    const probe = await calendar.remove("linkcheck");
    return { available: !!probe?.available, filled: 0 };
  }

  // ── Emails ────────────────────────────────────────────────────────────────────────────────────────────────────────

  function whenWords(b) {
    const start = new Date(b.start);
    const opts = { timeZone: zone() };
    const dayText = start.toLocaleDateString("en-CA", { ...opts, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeText = start.toLocaleTimeString("en-CA", { ...opts, hour: "numeric", minute: "2-digit" });
    return `${dayText} at ${timeText}`;
  }
  const manageUrl = (id, key) => siteLink(`/book?booking=${encodeURIComponent(id)}&key=${key}`);

  /** Emails the customer (and tells the owner) about a booking. `kind`: booked, moved, cancelled. Never throws. */
  async function tellCustomer(id, b, kind, { key = "", refundText = "", byShop = false, toOwner = !byShop } = {}) {
    try {
      const to = b.customer?.email;
      if (!to || !EMAIL.test(to)) return;
      if (!byShop && !(await claimEmailSend(db, "bookingEmail", to))) return;
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const when = whenWords(b);
      const where = b.location ? `<p style="margin:0 0 4px;"><strong>Where:</strong> ${escapeHtml(b.location)}</p>` : "";
      const video = b.meetUrl && b.status !== "cancelled" ? `<p style="margin:0 0 4px;"><strong>Video call:</strong> <a href="${escapeHtml(b.meetUrl)}">Join with Google Meet</a></p>` : "";
      const due0 = moneyWords(balanceDue(b), b.currency);
      const tipText = moneyWords(tipTaken(b), b.currency);
      const subject = { tip: `Thank you for coming: ${b.serviceName}`, tipPaid: `Tip received: ${b.serviceName}, ${when}`, payRest: `Left to pay: ${b.serviceName}, ${when}`, restPaid: `Paid in full: ${b.serviceName}, ${when}`, fee: `Fee charged: ${b.serviceName}, ${when}`, notCleared: `Not booked: ${b.serviceName}, ${when}`, reminder: `Coming up: ${b.serviceName}, ${when}`, soon: `Soon: ${b.serviceName}, ${when}`, booked: `Booked: ${b.serviceName}, ${when}`, moved: `Moved: ${b.serviceName}, now ${when}`, cancelled: `Cancelled: ${b.serviceName}, ${when}` }[kind];
      const lead = {
        fee: `${escapeHtml(shop)} charged ${escapeHtml(moneyWords(b.fee?.amountMinor || 0, b.currency))} to your card${b.card?.last4 ? ` ending ${escapeHtml(b.card.last4)}` : ""} for ${b.status === "cancelled" ? "cancelling late" : "missing"} this booking, as agreed when you booked. Questions? Just reply to this email.`,
        payRest: `There is ${escapeHtml(due0)} left to pay for your booking with ${escapeHtml(shop)}. You can pay it by card now, so there is nothing to pay at your visit.`,
        restPaid: `Thank you. You paid ${escapeHtml(moneyWords(restTaken(b), b.currency))} by card${tipTaken(b) ? `, with a ${escapeHtml(tipText)} tip` : ""}, so your booking with ${escapeHtml(shop)} is paid in full.`,
        tip: `Thank you for visiting ${escapeHtml(shop)}. If you'd like to thank the team, you can add a tip by card. It's up to you.`,
        tipPaid: `Thank you! Your ${escapeHtml(tipText)} tip for your visit to ${escapeHtml(shop)} has gone through.`,
        reminder: `A reminder of your booking with ${escapeHtml(shop)}. If you can't make it, please cancel or move it below so the time can go to someone else.`,
        soon: `Your booking with ${escapeHtml(shop)} is coming up soon. See you there.`,
        notCleared: `Your bank payment for this booking with ${escapeHtml(shop)} didn't clear in time, so the time has been released. Nothing was taken. You're welcome to book again.`,
        booked: `You're booked in with ${escapeHtml(shop)}.`,
        moved: `Your booking with ${escapeHtml(shop)} has moved.`,
        cancelled: `Your booking with ${escapeHtml(shop)} is cancelled.${refundText ? ` ${escapeHtml(refundText)}` : ""}`,
      }[kind];
      const ended = kind === "cancelled" || kind === "notCleared" || kind === "fee" || kind === "tip" || kind === "tipPaid";
      // What is paid and what is left to pay at the visit, on every email about a booking that is still on.
      const due = balanceDue(b);
      const taken = bookedCardTaken(b);
      const packLine = ended || !b.pack ? "" : `<p style="margin:0 0 4px;"><strong>Paid with your pack ••••${escapeHtml(b.pack.last4 || "")}:</strong> visit ${b.pack.visit || 1} of ${b.pack.visits || 1}</p>`;
      const money = ended || !(b.priceMinor > 0) ? packLine : [
        b.discount?.amountMinor ? `<p style="margin:0 0 4px;"><strong>Discount (${escapeHtml(b.discount.code)}):</strong> ${escapeHtml(moneyWords(b.discount.amountMinor, b.currency))} off</p>` : "",
        giftTaken(b) ? `<p style="margin:0 0 4px;"><strong>Gift card ••••${escapeHtml(b.giftCard.last4 || "")}:</strong> ${escapeHtml(moneyWords(giftTaken(b), b.currency))}</p>` : "",
        b.payment === "deposit" && taken ? `<p style="margin:0 0 4px;"><strong>Deposit paid:</strong> ${escapeHtml(moneyWords(taken, b.currency))}</p>` : "",
        due ? `<p style="margin:0 0 4px;"><strong>${kind === "payRest" ? "Left to pay" : "To pay at your visit"}:</strong> ${escapeHtml(moneyWords(due, b.currency))}</p>` : `<p style="margin:0 0 4px;"><strong>Paid:</strong> ${escapeHtml(moneyWords(b.priceMinor, b.currency))}</p>`,
      ].join("");
      // The card kept on file, and what missing the booking costs, on every email about a booking that is still on.
      const cancelHours = ended || !b.card ? 0 : (await readSettings().catch(() => null))?.cancelHours || 0;
      const held = ended || !b.card ? "" : `<p style="margin:0 0 4px;"><strong>Card on file:</strong> ${escapeHtml(cardWords(b.card))}. Missing this booking${cancelHours ? `, or cancelling less than ${cancelHours} hours before,` : ""} may cost ${escapeHtml(moneyWords(b.lateFeeMinor || 0, b.currency))}.</p>`;
      const calendar = ended ? "" : `<p style="margin:16px 0 0;"><a href="${escapeHtml(googleCalendarLink({ title: `${b.serviceName} · ${shop}`, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "" }))}">Add to Google Calendar</a>${key ? ` &nbsp;·&nbsp; <a href="${escapeHtml(siteLink(`/calendar/b/${encodeURIComponent(id)}/${key}.ics`))}">Add to Apple Calendar</a>` : ""}</p>`;
      const manage = (!ended || kind === "tip") && key ? risoButton(escapeHtml(manageUrl(id, key)), kind === "tip" ? "Add a tip" : kind === "payRest" ? `Pay ${due0}` : "See or change your booking", brand.accent, brand.theme) : "";
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">${escapeHtml({ tip: "Thanks for coming", tipPaid: "Tip received", payRest: "Left to pay", restPaid: "Paid in full", fee: "Fee receipt", notCleared: "Payment didn't clear", reminder: "See you soon", soon: "Starting soon", booked: "Booking confirmed", moved: "Booking moved", cancelled: "Booking cancelled" }[kind])}</h4>
        <h2 style="margin:0 0 12px;">${escapeHtml(b.serviceName)}</h2>
        <p style="margin:0 0 16px;">${lead}</p>
        <p style="margin:0 0 4px;"><strong>When:</strong> ${escapeHtml(when)}</p>
        <p style="margin:0 0 4px;"><strong>How long:</strong> ${b.minutes} minutes</p>
        ${b.staffName ? `<p style="margin:0 0 4px;"><strong>With:</strong> ${escapeHtml(b.staffName)}</p>` : ""}
        ${where}
        ${video}
        ${money}
        ${held}
        ${manage}
        ${calendar}
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to, subject, html });
      const owner = ownerEmail();
      if (owner && toOwner) {
        await sendEmail({
          to: owner,
          subject: `[BOOKING] ${{ booked: "New", moved: "Moved", notCleared: "Payment didn't clear", restPaid: "Paid in full", tipPaid: `${tipText} tip` }[kind] || "Cancelled"}: ${b.serviceName}, ${when}`,
          html: risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(b.customer.name)}: ${escapeHtml(b.serviceName)}</h2>
            <p style="margin:0 0 4px;">${escapeHtml(when)} · ${b.minutes} minutes${b.staffName ? ` · ${escapeHtml(withWhom(b))}` : ""}</p>
            <p style="margin:0 0 4px;">${escapeHtml(b.customer.email)}${b.customer.phone ? ` · ${escapeHtml(b.customer.phone)}` : ""}</p>
            ${money}
            ${held}
            ${kind === "notCleared" ? `<p style="margin:12px 0 0;">Their bank payment was still clearing when the booking was due, so the time was released and nothing was taken. You may want to get in touch with them.</p>` : ""}
            ${b.note ? `<p style="margin:12px 0 0;">“${escapeHtml(b.note)}”</p>` : ""}
            ${(b.answers || []).map((a) => `<p style="margin:12px 0 0;"><strong>${escapeHtml(a.label)}</strong><br>${escapeHtml(a.answer)}</p>`).join("")}
            ${risoButton(escapeHtml(siteLink("/admin#bookings")), "Open Bookings", brand.accent, brand.theme)}`, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
        });
      }
    } catch (err) {
      console.warn(`Booking ${id} ${kind} email failed:`, err?.message || err);
    }
  }

  // ── The waiting list ──────────────────────────────────────────────────────────────────────────────────────────────

  async function busyAround(day, nowMs) {
    const snaps = await Promise.all([addDays(day, -1), day, addDays(day, 1)].map((d) => dayRef(d).get()));
    return busyFrom(snaps, nowMs);
  }
  /** The full starts of a class on one day: its own times that only lack a place (nothing else is in the way). */
  function fullClassTimes(service, settings, busy, day, nowMs) {
    if (!isClass(service)) return [];
    const others = busy.filter((b) => b.serviceId !== service.id);
    const open = new Set(freeTimes({ service, settings, busy, day, zone: zone(), nowMs }));
    return freeTimes({ service, settings, busy: others, day, zone: zone(), nowMs }).filter((ms) => !open.has(ms) && busy.some((b) => b.serviceId === service.id && b.start === ms));
  }

  /**
   * Holds a freed place for the first person waiting for it: an `offer_<id>` item on its days (so nobody else sees the
   * place), and the hold's end and key on their entry. false when the place went or they already have one.
   */
  async function holdForWaiting(wid, service, settings, start, until, key) {
    const blockEnd = start + (service.minutes + (service.gapAfter || 0)) * MINUTE;
    const days = daysTouched(start, blockEnd, zone());
    return db.runTransaction(async (tx) => {
      const fresh = await tx.get(waitlist().doc(wid));
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      if (!fresh.exists || fresh.data()?.offerUntil) return false;
      const who = whoIsFree({ service, settings, busy: busyFrom(snaps, nowMs), start, zone: zone(), nowMs });
      if (who === null) return false;
      // The held place keeps a person (and the room) free for them; booking it picks the person again.
      const { item } = staffParts(settings, who, service.roomId);
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        items[offerItem(wid)] = { start, end: blockEnd, held: true, at: nowMs, s: service.id, ...item, offer: true, until };
        tx.set(dayRef(d), { items });
      });
      tx.set(waitlist().doc(wid), { offerStart: new Date(start).toISOString(), offerUntil: new Date(until).toISOString(), offerKeyHash: hash(key) }, { merge: true });
      return true;
    });
  }

  /** Takes a waiting person's held place off its days (the entry itself is left to the caller). */
  async function dropOffer(wid, w) {
    const start = Date.parse(w?.offerStart || "");
    if (!Number.isFinite(start)) return;
    const days = daysTouched(start, start + 24 * HOUR, zone());
    await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        if (!(offerItem(wid) in items)) return;
        delete items[offerItem(wid)];
        tx.set(dayRef(d), { items });
      });
    });
  }

  /** A held place named on the Book a time page (`offer`, `offerKey` from the email), still theirs and for this service; else null. */
  async function offerFor(body, serviceId, nowMs) {
    const wid = String(body?.offer || "");
    const key = String(body?.offerKey || "");
    if (!WAIT_ID.test(wid) || !KEY.test(key)) return null;
    const snap = await waitlist().doc(wid).get();
    const w = snap.exists ? snap.data() : null;
    if (!w || w.serviceId !== serviceId || !sameHash(w.offerKeyHash, hash(key)) || !(Date.parse(w.offerUntil || "") > nowMs)) return null;
    const start = Date.parse(w.offerStart);
    return { wid, item: offerItem(wid), start, until: w.offerUntil, days: daysTouched(start, start + 24 * HOUR, zone()) };
  }

  /**
   * Offers the places that opened on these days to the people waiting for them, first come first served: each gets one
   * place held for the shop's waitHoldMinutes and an email with a link that books it. Someone already holding (or who let a hold run
   * out) is skipped; the sweep passes a lapsed hold to the next person. Never throws.
   */
  async function tellWaitlist(days) {
    try {
      const settings = await readSettings();
      if (!settings.live) return 0;
      let told = 0;
      let list = null;
      for (const day of [...new Set(days)]) {
        const snap = await waitlist().where("day", "==", day).limit(MAX_WAITING * 4).get();
        if (snap.empty) continue;
        list = list || (await readServices());
        const nowMs = now().getTime();
        const brand = await emailBrand();
        const shop = brand.shopName || shopName() || "the shop";
        const queue = snap.docs.map((doc) => ({ doc, w: doc.data() }))
          .sort((a, b) => String(a.w.createdAt || "").localeCompare(String(b.w.createdAt || "")) || a.doc.id.localeCompare(b.doc.id));
        let busy = await busyAround(day, nowMs);
        for (const { doc, w } of queue) {
          if (w.offerUntil) continue;
          const service = list.find((s) => s.id === w.serviceId && s.active);
          if (!service) { await doc.ref.delete(); continue; }
          const times = freeTimes({ service, settings, busy, day, zone: zone(), nowMs });
          // A class time waits for its own start; a booked-up day gets the first time that opened.
          const start = w.start ? Date.parse(w.start) : times[0];
          if (!times.includes(start) || !EMAIL.test(String(w.email || ""))) continue;
          if (!(await claimEmailSend(db, "bookingEmail", w.email))) continue;
          const key = randomKey();
          const until = Math.min(nowMs + settings.waitHoldMinutes * MINUTE, start);
          const held = await holdForWaiting(doc.id, service, settings, start, until, key);
          busy = await busyAround(day, nowMs);
          if (!held) continue;
          const when = whenWords({ start: new Date(start).toISOString() });
          const untilText = new Date(until).toLocaleTimeString("en-CA", { timeZone: zone(), hour: "numeric", minute: "2-digit" });
          const link = `/book?service=${encodeURIComponent(service.id)}&day=${day}&offer=${doc.id}&offerKey=${key}`;
          await sendEmail({
            to: w.email,
            subject: `A place is held for you: ${service.name}, ${when}`,
            html: risoLayout(`
              <h4 style="margin:0 0 8px;">A place has opened</h4>
              <h2 style="margin:0 0 12px;">${escapeHtml(service.name)}</h2>
              <p style="margin:0 0 16px;">You were first on ${escapeHtml(shop)}'s waiting list, so a place on ${escapeHtml(when)} is held for you until ${escapeHtml(untilText)}. Book it before then and it's yours. After that it goes to the next person waiting.</p>
              ${risoButton(escapeHtml(siteLink(link)), "Book my place", brand.accent, brand.theme)}
            `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
          });
          told += 1;
        }
      }
      return told;
    } catch (err) {
      console.warn("bookings: the waiting list wasn't told:", err?.message || err);
      return 0;
    }
  }

  /** Tells someone whose held place wasn't booked in time that it went to the next person. Never throws. */
  async function tellHoldEnded(w) {
    try {
      if (!EMAIL.test(String(w.email || "")) || !(await claimEmailSend(db, "bookingEmail", w.email))) return;
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const when = whenWords({ start: w.offerStart });
      await sendEmail({
        to: w.email,
        subject: `Your held place has gone: ${w.serviceName}, ${when}`,
        html: risoLayout(`
          <h4 style="margin:0 0 8px;">Your hold has ended</h4>
          <h2 style="margin:0 0 12px;">${escapeHtml(w.serviceName || "")}</h2>
          <p style="margin:0 0 16px;">The place ${escapeHtml(shop)} held for you on ${escapeHtml(when)} wasn't booked in time, so it has gone to the next person waiting. You're welcome to book another time.</p>
          ${risoButton(escapeHtml(siteLink(`/book?service=${encodeURIComponent(w.serviceId || "")}`)), "See other times", brand.accent, brand.theme)}
        `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
      });
    } catch (err) {
      console.warn("bookings: the hold-ended email failed:", err?.message || err);
    }
  }

  /** Forgets the people who waited for days now past, and passes holds that ran out to the next person in line. */
  async function sweepWaitlist() {
    if (!(await featureOn())) return { forgotten: 0, passedOn: 0 };
    const nowMs = now().getTime();
    const past = await waitlist().where("day", "<", dayOf(nowMs, zone())).limit(200).get();
    for (const doc of past.docs) {
      await dropOffer(doc.id, doc.data());
      await doc.ref.delete();
    }
    const lapsed = await waitlist().where("offerUntil", "<=", new Date(nowMs).toISOString()).limit(100).get();
    const days = [];
    for (const doc of lapsed.docs) {
      const w = doc.data();
      await dropOffer(doc.id, w);
      await doc.ref.delete();
      days.push(w.day);
      await tellHoldEnded(w);
    }
    if (days.length) await tellWaitlist(days);
    return { forgotten: past.docs.length, passedOn: lapsed.docs.length };
  }

  // ── Taking, moving and freeing time (one transaction each) ──────────────────────────────────────────────────────

  /**
   * Takes `start` for a new booking if it is still free, writing the booking and its days together. With `offer` (a place
   * held for this customer from the waiting list) the held place doesn't count against them and is used up. With people
   * on the team the booking goes to `staffId` (the client's pick), else to whoever is free (whoIsFree), chosen inside
   * the transaction so two bookings at once go to two people; the person and room go on the day item and the booking.
   */
  async function takeTime({ id, service, settings, start, record, check = true, offer = null, staffId = "" }) {
    // A discount code's use is counted with the time, so its usage limit holds even when many book at once.
    const code = record.discount?.id ? db.collection("discounts").doc(record.discount.id) : null;
    // A gift card is debited with the time too, so one balance can never pay for two bookings.
    const gift = record.giftCard?.id ? db.collection("giftCards").doc(record.giftCard.id) : null;
    const testMode = gift ? await shopTestMode() : false;
    // A pack's visit is counted with the time too, so one pack can never book more visits than it holds.
    const pack = record.pack?.id ? packs().doc(record.pack.id) : null;
    const end = start + service.minutes * MINUTE;
    const blockEnd = end + service.gapAfter * MINUTE;
    const days = daysTouched(start, blockEnd, zone());
    const all = offer ? [...new Set([...days, ...offer.days])] : days;
    return db.runTransaction(async (tx) => {
      const snaps = await Promise.all(all.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      const codeSnap = code ? await tx.get(code) : null;
      const giftSnap = gift ? await tx.get(gift) : null;
      const packSnap = pack ? await tx.get(pack) : null;
      const nearby = snaps.filter((_, i) => days.includes(all[i]));
      const who = whoIsFree({ service, settings, busy: busyFrom(nearby, nowMs, offer?.item || ""), start, zone: zone(), nowMs, staffId });
      if (check && who === null) return false;
      const assigned = staffParts(settings, who ?? staffId, service.roomId);
      const card = giftSnap?.exists ? giftSnap.data() : null;
      const giftMinor = record.giftCard?.amountMinor || 0;
      if (giftSnap && (giftCardProblem(card, { now: new Date(nowMs), testMode }) || availableMinor(card, "", nowMs) < giftMinor)) return "gift_short";
      const packData = packSnap?.exists ? packSnap.data() : null;
      if (packSnap && packProblem(packData, record.serviceId, dayOf(start, zone()))) return "pack_used";
      if (codeSnap) {
        const used = Number(codeSnap.data()?.usageCount) || 0;
        const limit = Number(codeSnap.data()?.usageLimit) || 0;
        if (!codeSnap.exists || (limit > 0 && used >= limit)) return "code_used";
        tx.set(code, { usageCount: used + 1 }, { merge: true });
      }
      if (giftSnap) {
        const at = new Date(nowMs).toISOString();
        tx.set(gift, { balanceMinor: Math.floor(Number(card.balanceMinor) || 0) - giftMinor, history: withHistory(card, { type: "redeemed", minor: giftMinor, bookingId: id, at }), updatedAt: at }, { merge: true });
      }
      const held = record.status === "held";
      all.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        if (offer) delete items[offer.item];
        if (days.includes(d)) items[id] = { start, end: blockEnd, held, at: nowMs, s: record.serviceId, ...assigned.item };
        tx.set(dayRef(d), { items });
      });
      // The caller's record carries the person too (it is what the confirmation email reads).
      Object.assign(record, assigned.record);
      if (offer) tx.delete(waitlist().doc(offer.wid));
      let packed = {};
      if (packSnap) {
        const at = new Date(nowMs).toISOString();
        const uses = [...(packData.uses || []), { bookingId: id, start: new Date(start).toISOString(), at }];
        tx.set(pack, { uses, updatedAt: at }, { merge: true });
        packed = { pack: { ...record.pack, visit: uses.length, visits: packData.visits } };
      }
      tx.set(bookings().doc(id), { ...record, ...packed, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      return true;
    });
  }

  /**
   * Frees a booking's time (cancelled, or a hold that ran out), and writes `changes` on the booking. A cancelled booking
   * puts its gift card's part back onto the card, once, unless the shop keeps it (`giftBack: false`). Returns what it wrote.
   */
  async function freeTime(id, b, changes, { giftBack = true, packBack = true } = {}) {
    const days = daysTouched(Date.parse(b.start), Date.parse(b.end) + (b.gapAfter || 0) * MINUTE, zone());
    // A cancelled booking gives its discount code's use back, once.
    const giveBack = changes?.status === "cancelled" && b.discount?.id && !b.discount.returned;
    const code = giveBack ? db.collection("discounts").doc(b.discount.id) : null;
    const giftMinor = b.giftCard?.amountMinor || 0;
    const returnGift = giftBack && changes?.status === "cancelled" && b.giftCard?.id && !b.giftCard.returned && giftMinor > 0;
    const gift = returnGift ? db.collection("giftCards").doc(b.giftCard.id) : null;
    // A pack's visit goes back onto the pack, once, unless the shop keeps it (packBack: false).
    const returnPack = packBack && changes?.status === "cancelled" && b.pack?.id && !b.pack.returned;
    const pack = returnPack ? packs().doc(b.pack.id) : null;
    const written = await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      const codeSnap = code ? await tx.get(code) : null;
      const giftSnap = gift ? await tx.get(gift) : null;
      // Only the booking's own copy decides, so two cancels at once never put the money back twice.
      const packSnap = pack ? await tx.get(pack) : null;
      const fresh = gift || pack ? (await tx.get(bookings().doc(id))).data() : null;
      const putBack = !!giftSnap?.exists && !fresh?.giftCard?.returned;
      const visitBack = !!packSnap?.exists && !fresh?.pack?.returned && (packSnap.data()?.uses || []).some((u) => u.bookingId === id && !u.returned);
      if (codeSnap?.exists) tx.set(code, { usageCount: Math.max(0, (Number(codeSnap.data()?.usageCount) || 0) - 1) }, { merge: true });
      if (putBack) {
        const card = giftSnap.data();
        const at = now().toISOString();
        tx.set(gift, { balanceMinor: Math.floor(Number(card.balanceMinor) || 0) + giftMinor, history: withHistory(card, { type: "refunded", minor: giftMinor, bookingId: id, at }), updatedAt: at }, { merge: true });
      }
      if (visitBack) {
        const at = now().toISOString();
        tx.set(pack, { uses: (packSnap.data().uses || []).map((u) => (u.bookingId === id && !u.returned ? { ...u, returned: true, returnedAt: at } : u)), updatedAt: at }, { merge: true });
      }
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        if (!(id in items)) return;
        delete items[id];
        tx.set(dayRef(d), { items });
      });
      const all = { ...changes, ...(giveBack ? { discount: { ...b.discount, returned: true } } : {}), ...(putBack ? { giftCard: { ...b.giftCard, returned: true } } : {}),
        ...(visitBack ? { pack: { ...b.pack, returned: true } } : {}) };
      tx.set(bookings().doc(id), all, { merge: true });
      return all;
    });
    await tellWaitlist(days);
    return written;
  }

  /**
   * Moves a booking to `start` if free (its own old time doesn't count against it). It stays with the same person while
   * they still do the service; the owner may name another (`staffId`, "" for anyone free). Resolves to false, or to
   * what changed on the booking.
   */
  async function moveTime(id, b, service, settings, start, { check = true, by = "customer", staffId } = {}) {
    const oldDays = daysTouched(Date.parse(b.start), Date.parse(b.end) + (b.gapAfter || 0) * MINUTE, zone());
    const end = start + b.minutes * MINUTE;
    const blockEnd = end + (b.gapAfter || 0) * MINUTE;
    const newDays = daysTouched(start, blockEnd, zone());
    const all = [...new Set([...oldDays, ...newDays])];
    const moved = await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(all.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      const nearby = snaps.filter((_, i) => newDays.includes(all[i]));
      const wanted = staffId === undefined ? keptPerson(settings, b.serviceId, b.staffId) : String(staffId || "");
      const who = whoIsFree({ service, settings, busy: busyFrom(nearby, nowMs, id), start, zone: zone(), nowMs, staffId: wanted });
      if (check && who === null) return false;
      const assigned = staffParts(settings, who ?? wanted, service.roomId);
      all.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        delete items[id];
        if (newDays.includes(d)) items[id] = { start, end: blockEnd, held: false, at: nowMs, s: b.serviceId, ...assigned.item };
        tx.set(dayRef(d), { items });
      });
      // A booking that had a person and now has none (the team was cleared) loses the old name.
      const staffChange = b.staffId || b.roomId ? { staffId: "", staffName: "", roomId: "", roomName: "", ...assigned.record } : assigned.record;
      const newName = assigned.record.staffName;
      const what = `moved from ${b.start}${newName && assigned.record.staffId !== b.staffId ? ` to ${newName}` : ""}`;
      const changes = {
        start: new Date(start).toISOString(), end: new Date(end).toISOString(), updatedAt: new Date(nowMs).toISOString(), reminderSentAt: null,
        ...staffChange, history: [...(b.history || []), { at: new Date(nowMs).toISOString(), what, by }].slice(-20),
      };
      tx.set(bookings().doc(id), changes, { merge: true });
      return changes;
    });
    // The time left behind may be what someone is waiting for.
    if (moved) await tellWaitlist(oldDays);
    return moved;
  }

  /** Reads a held booking's payment pages; confirms it when one is paid. Returns the booking as it now stands. */
  async function refreshHeld(id, b, checkout) {
    if (b.status !== "held" || !checkout) return b;
    for (const sid of (b.sessions || []).slice(-10)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await checkout.read(sid).catch(() => null);
      if (!session || (session.metadata?.booking && session.metadata.booking !== id)) continue;
      if (cardAsk(b) > 0) {
        if (session.payment_status !== "paid") continue;
        if (Number.isFinite(session.amount_total) && session.amount_total !== cardAsk(b)) continue;
      } else if (!(session.mode === "setup" && session.status === "complete")) continue; // only a card to save
      const card = b.cardHold && checkout.savedCard ? await checkout.savedCard(sid).catch((err) => { console.warn(`Booking ${id}: the saved card couldn't be read:`, err?.message || err); return null; }) : null;
      return confirmPaid(id, b, sid, session.payment_intent, card ? { ...card, mode: b.cardMode || "live" } : null);
    }
    return b;
  }

  /** Is a payment on one of this hold's pages finished by the customer but still clearing with their bank? */
  async function paymentClearing(b, checkout) {
    if (!checkout) return false;
    for (const sid of (b.sessions || []).slice(-10)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await checkout.read(sid).catch(() => null);
      if (session?.status === "complete" && session.payment_status === "unpaid") return true;
    }
    return false;
  }

  async function confirmPaid(id, b, sid, intent, card = null) {
    const at = now().toISOString();
    // A deposit leaves the rest to pay at the visit, so only the deposit is marked paid. A page that only saved a card
    // took nothing.
    const deposit = b.payment === "deposit";
    const tookMoney = cardAsk(b) > 0;
    // A gift card paid its part when the time was taken, so the booking is paid even when the card page took nothing.
    const gifted = (b.giftCard?.amountMinor || 0) > 0;
    const money = !tookMoney && !gifted ? {} : { ...(deposit ? { depositPaid: true, paid: false } : { paid: true }), ...(tookMoney ? { paymentIntent: typeof intent === "string" ? intent : intent?.id || null } : {}) };
    const what = [tookMoney || gifted ? (deposit ? "deposit paid" : "paid") : "", card ? "card saved" : ""].filter(Boolean).join(", ") || "confirmed";
    const changes = {
      status: "confirmed", ...money, paidSession: sid, ...(card ? { card } : {}),
      holdUntil: null, updatedAt: at, history: [...(b.history || []), { at, what, by: "customer" }].slice(-20),
    };
    // The days stop calling it a hold.
    const days = daysTouched(Date.parse(b.start), Date.parse(b.end) + (b.gapAfter || 0) * MINUTE, zone());
    const confirmed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(bookings().doc(id));
      if (fresh.data()?.status !== "held") return false;
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        if (items[id]) items[id] = { ...items[id], held: false };
        tx.set(dayRef(d), { items });
      });
      tx.set(bookings().doc(id), changes, { merge: true });
      return true;
    });
    const next = confirmed ? await syncCalendar(id, { ...b, ...changes }) : { ...b, ...changes };
    if (confirmed) await tellCustomer(id, next, "booked", { key: b.pendingKey || "" });
    if (confirmed && b.pendingKey) await bookings().doc(id).set({ pendingKey: null }, { merge: true });
    return next;
  }

  /**
   * Reads the pages where the customer pays what is left; keeps the first one paid as `rest`, closes the others and
   * sends the receipt. Returns the booking as it now stands.
   */
  async function refreshRest(id, b, checkout) {
    if (!b.restOpen || !checkout) return b;
    for (const page of (b.restPages || []).slice(-10)) {
      if (!SESSION_ID.test(String(page?.id || ""))) continue;
      const restPart = Math.max(0, page.amountMinor || 0);
      const tipPart = Math.max(0, page.tipMinor || 0);
      // A page for what is left that was already paid another way, or a tip already given, is skipped.
      if ((restPart && b.rest) || (tipPart && b.tip)) continue;
      const session = await checkout.read(page.id).catch(() => null);
      if (!session || session.payment_status !== "paid" || (session.metadata?.booking && session.metadata.booking !== id)) continue;
      const amount = Number.isFinite(session.amount_total) ? session.amount_total : restPart + tipPart;
      if (amount !== restPart + tipPart) continue;
      const at = now().toISOString();
      const paid = { paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null, session: page.id, at };
      const kept = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(bookings().doc(id))).data() || {};
        if ((restPart && fresh.rest) || (tipPart && fresh.tip)) return null;
        // Already marked paid at the shop as well: kept all the same (the money was taken), and said so for the owner.
        const what = [
          restPart ? (fresh.paid ? "rest paid by card (it was also marked paid at the shop)" : "rest paid by card") : "",
          tipPart ? `${moneyWords(tipPart, fresh.currency)} tip added` : "",
        ].filter(Boolean).join(", ");
        const changes = {
          ...(restPart ? { rest: { amountMinor: restPart, ...paid } } : {}), ...(tipPart ? { tip: { amountMinor: tipPart, ...paid } } : {}),
          restOpen: false, updatedAt: at, history: [...(fresh.history || []), { at, what, by: "customer" }].slice(-20),
        };
        tx.set(bookings().doc(id), changes, { merge: true });
        return { ...fresh, ...changes };
      });
      if (!kept) return { ...b, ...((await bookings().doc(id).get()).data() || {}) };
      for (const other of b.restPages || []) if (other.id !== page.id && SESSION_ID.test(String(other?.id || ""))) await checkout.close(other.id).catch(() => {});
      await tellCustomer(id, kept, restPart ? "restPaid" : "tipPaid", { byShop: true, toOwner: true });
      return kept;
    }
    return b;
  }

  /** Closes every page where the customer could still pay what is left (it was paid another way, or the booking ended). */
  async function closeRest(id, b, checkout) {
    if (!b.restOpen) return;
    for (const page of b.restPages || []) if (SESSION_ID.test(String(page?.id || ""))) await checkout?.close(page.id).catch(() => {});
    await bookings().doc(id).set({ restOpen: false }, { merge: true });
  }

  /** Before the booking ends or is marked paid: closes its pay-the-rest pages, then reads them once more (a payment that landed just before the close still counts). */
  async function settleRest(id, b) {
    if (!b.restOpen) return b;
    const { checkout } = await standalone();
    await closeRest(id, b, checkout);
    return refreshRest(id, b, checkout);
  }

  // ── Card readers at the desk (Services plan phase 3) ────────────────────────────────────────────────────────────

  /** The provider's card readers for this shop's mode, or null (Square shops, for now). */
  async function readerDesk() {
    const { mode, checkout } = await standalone();
    return { mode, reader: checkout?.reader || null };
  }
  const readersRef = () => db.collection("bookingReaders").doc("main");

  /** The shop's one place for card readers in this mode, made from Settings › General › Location the first time. */
  async function readerPlace(mode, reader, { make = false } = {}) {
    const snap = await readersRef().get();
    const kept = snap.exists ? String(snap.data()?.[`place_${mode}`] || "") : "";
    if (kept || !make) return kept;
    const site = await db.collection("settings").doc("website").get();
    const loc = (site.exists ? site.data()?.location : null) || {};
    const t = (v) => (typeof v === "string" ? v.trim() : "");
    const country = findCountry(loc.country);
    if (!t(loc.street) || !t(loc.city) || !country) {
      throw Object.assign(new Error("Add your shop's street address in Settings › General › Location first. Card readers need it."), { readerCode: "address" });
    }
    const region = regionCode(country.code, loc.state, loc.zip);
    const address = { line1: t(loc.street), city: t(loc.city), country: country.code, ...(t(loc.zip) ? { postal_code: t(loc.zip) } : {}), ...(region ? { state: region.split("-")[1] } : {}) };
    const place = await reader.makePlace({ name: (shopName() || "Shop").slice(0, 100), address });
    await readersRef().set({ [`place_${mode}`]: place }, { merge: true });
    return place;
  }

  /**
   * Reads a payment sent to a card reader: a payment that went through is kept as `rest` (so refunds, figures and the
   * receipt work as for a pay link), a declined or stopped one closes with the reader's words. Returns the booking.
   */
  async function refreshReader(id, b, reader, { stopped = "The payment was stopped." } = {}) {
    const charge = b.readerCharge;
    if (!b.readerOpen || !charge?.intent || !reader) return b;
    const payment = await reader.payment(charge.intent);
    const at = now().toISOString();
    if (payment.status === "succeeded") {
      const kept = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(bookings().doc(id))).data() || {};
        if (!fresh.readerOpen || fresh.readerCharge?.intent !== charge.intent) return null;
        const changes = {
          ...(fresh.rest ? {} : { rest: { amountMinor: payment.amountMinor || charge.amountMinor, paymentIntent: charge.intent, at, reader: true } }),
          readerOpen: false, readerCharge: null, readerError: "", updatedAt: at,
          history: [...(fresh.history || []), { at, what: fresh.rest ? "card reader payment also went through (it was already paid)" : "paid on the card reader", by: "shop" }].slice(-20),
        };
        tx.set(bookings().doc(id), changes, { merge: true });
        return { ...fresh, ...changes };
      });
      if (!kept) return { ...b, ...((await bookings().doc(id).get()).data() || {}) };
      if (kept.rest?.paymentIntent === charge.intent) await tellCustomer(id, kept, "restPaid", { byShop: true, toOwner: false });
      return kept;
    }
    let error = "";
    const canceled = payment.status === "canceled";
    if (canceled) error = stopped;
    else if (payment.status === "requires_payment_method") {
      const onReader = await reader.read(charge.readerId).catch(() => null);
      const action = onReader?.action;
      if (action?.status === "failed") error = action.error || payment.error || "The card wasn't accepted.";
      else if (!action && payment.error) error = payment.error;
    }
    if (!error && !canceled) return b;
    if (!canceled) await reader.cancel(charge.readerId, charge.intent);
    const what = error ? `card reader: ${error}` : "card reader payment cancelled";
    const changes = { readerOpen: false, readerCharge: null, readerError: error.slice(0, 200), updatedAt: at, history: [...(b.history || []), { at, what: what.slice(0, 200), by: "shop" }].slice(-20) };
    await bookings().doc(id).set(changes, { merge: true });
    return { ...b, ...changes };
  }

  /** The owner's words for a reader that couldn't be reached or a code that didn't work. */
  function readerWords(err, fallback) {
    if (err?.readerCode === "address") return err.message;
    const message = String(err?.message || "");
    if (/registration code/i.test(message)) return "That code didn't work. Check the code on the reader's screen and try again.";
    if (/offline|not online|unreachable|timed out/i.test(message)) return "The card reader is offline. Check it is on and connected to the internet.";
    if (/busy|in progress|another action/i.test(message)) return "The card reader is busy. Finish or cancel what is on its screen first.";
    return fallback;
  }

  /**
   * Refunds what a booking took by card (all of it unless a part is named): the rest's payment first, then the booking's
   * own. Returns the refund, or null when nothing was paid by card.
   */
  async function refundBooking(id, b, amountMinor = cardTaken(b)) {
    if (!cardTaken(b) || b.refund?.refundId) return null;
    const mode = (await shopTestMode()) ? "test" : "live";
    const whole = amountMinor === cardTaken(b);
    const fromRest = b.rest?.paymentIntent ? Math.min(amountMinor, restTaken(b)) : 0;
    const parts = [
      { intent: b.rest?.paymentIntent, amount: fromRest, key: whole ? `booking-refund-${id}-rest` : `booking-refund-${id}-rest-${amountMinor}` },
      { intent: b.paymentIntent, amount: Math.min(amountMinor - fromRest, bookedCardTaken(b)), key: whole ? `booking-refund-${id}` : `booking-refund-${id}-${amountMinor}` },
    ].filter((part) => part.intent && part.amount > 0);
    if (!parts.length) return null;
    const ids = [];
    let total = 0;
    for (const part of parts) {
      const refund = await payments.refund({ mode, paymentIntentId: part.intent, amountMinor: part.amount, metadata: { booking: id }, idempotencyKey: part.key });
      ids.push(refund.refundId);
      total += refund.amountMinor;
    }
    return { refundId: ids[ids.length - 1], ...(ids.length > 1 ? { refundIds: ids } : {}), amountMinor: total, at: now().toISOString() };
  }

  async function loadBooking(id, key) {
    if (!ID.test(String(id || "")) || !KEY.test(String(key || ""))) return null;
    const snap = await bookings().doc(id).get();
    const data = snap.exists ? snap.data() : null;
    if (!data || !keyFits(data, key)) return null;
    return snap.data();
  }

  const fail = (res, status, error, code) => res.status(status).json({ error, ...(code ? { code } : {}) });

  // ── Discount codes ────────────────────────────────────────────────────────────────────────────────────────────

  /** Does the shop have a code marked "Works on bookings too"? The booking form shows its code box only then. */
  async function codesOffered() {
    if (!findDiscount) return false;
    const snap = await db.collection("discounts").where("forBookings", "==", true).limit(1).get().catch(() => null);
    return !!snap && !snap.empty;
  }

  /**
   * A code typed on the booking form, priced for this service: { discount: { id, code, amountMinor }, priceMinor (after
   * the code), upFront (what the card page takes now) }. Throws BookingCodeProblem in the customer's words.
   */
  async function codeFor(service, raw, email) {
    const typed = String(raw || "").trim().toUpperCase().slice(0, 40);
    if (!findDiscount || service.payment === "free" || !typed) throw new BookingCodeProblem("This code can't be used on bookings.");
    let found;
    try {
      found = await findDiscount(typed, email);
    } catch (err) {
      // The database failing is not the customer's code being wrong.
      if (err && err.code !== undefined) throw err;
      throw new BookingCodeProblem(String(err?.message || "This code can't be used.").slice(0, 160));
    }
    const amountMinor = bookingDiscountMinor(found, service.priceMinor);
    // One use per customer counts bookings too (findDiscount already counted the orders).
    if (found.onePerCustomer && email) {
      const me = emailIdentity(email);
      const snap = await bookings().where("discount.id", "==", found.id).limit(500).get();
      if (snap.docs.some((d) => d.data()?.status !== "cancelled" && emailIdentity(d.data()?.customer?.email) === me)) {
        throw new BookingCodeProblem("You have already used this code.");
      }
    }
    const priceMinor = service.priceMinor - amountMinor;
    const upFront = depositOf({ ...service, priceMinor });
    if (tooSmallForCard(upFront)) throw new BookingCodeProblem("This code can't be used on this booking.");
    return { discount: { id: found.id, code: typed, amountMinor }, priceMinor, upFront };
  }

  // ── Gift cards ────────────────────────────────────────────────────────────────────────────────────────────────

  /** Does the shop have any gift card? The booking form shows its gift card box only then (and only for a paid service). */
  async function giftCardsOffered() {
    const snap = await db.collection("giftCards").limit(1).get().catch(() => null);
    return !!snap && !snap.empty;
  }

  /**
   * A gift card typed on the booking form, for `upFront` (what is paid when booked): { id, last4, amountMinor } with
   * what it pays now. Checked again (and debited) when the time is taken. Throws BookingCodeProblem in the customer's words.
   */
  async function giftFor(raw, upFront) {
    const id = giftCardId(raw);
    if (!id) throw new BookingCodeProblem(GIFT_CARD_MESSAGES.not_found);
    if (!(upFront > 0)) throw new BookingCodeProblem("A gift card can only pay for a booking that's paid when you book.");
    const snap = await db.collection("giftCards").doc(id).get();
    const card = snap.exists ? snap.data() : null;
    const problem = giftCardProblem(card, { now: now(), testMode: await shopTestMode() });
    if (problem) throw new BookingCodeProblem(GIFT_CARD_MESSAGES[problem]);
    const available = availableMinor(card, "", now().getTime());
    if (!available) throw new BookingCodeProblem(GIFT_CARD_MESSAGES.held);
    const amountMinor = giftCardPart(upFront, available);
    if (!amountMinor) throw new BookingCodeProblem("This gift card can't be used on this booking.");
    return { id, last4: card.last4 || last4(raw), amountMinor };
  }

  // ── Packs of visits ───────────────────────────────────────────────────────────────────────────────────────────

  /** What the customer's pages may see of a pack (never its id, the customer's details or payment ids). */
  function publicPack(p, nowMs) {
    return {
      last4: p.last4 || "", serviceId: p.serviceId, serviceName: p.serviceName || "", visits: p.visits || 0, left: packLeft(p),
      status: p.status, expiresOn: p.expiresOn || null, priceMinor: p.priceMinor || 0, currency: p.currency,
      // The visits booked with it that are still to come.
      coming: (p.uses || []).filter((u) => !u.returned && Date.parse(u.start || "") > nowMs).map((u) => u.start).sort(),
    };
  }
  async function loadPack(code) {
    const id = packId(code);
    if (!id) return null;
    const snap = await packs().doc(id).get();
    return snap.exists ? { ...snap.data(), id } : null;
  }

  /** Emails a paid pack's code to the customer (and tells the owner). Never throws. */
  async function tellPack(p, code) {
    try {
      const to = p.customer?.email;
      if (!to || !EMAIL.test(to) || !code) return;
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const until = p.expiresOn ? new Date(`${p.expiresOn}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : "";
      const layout = { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop };
      await sendEmail({
        to,
        subject: `Your pack of ${p.visits} visits: ${p.serviceName}`,
        html: risoLayout(`
          <h4 style="margin:0 0 8px;">Your pack is ready</h4>
          <h2 style="margin:0 0 12px;">${escapeHtml(p.serviceName)}</h2>
          <p style="margin:0 0 16px;">Thank you. You have ${p.visits} visits with ${escapeHtml(shop)} to book whenever suits you. Use this code on the booking form for each visit. Keep it safe: anyone with the code can book with it.</p>
          <p style="margin:0 0 16px;font-family:monospace;font-size:22px;letter-spacing:2px;"><strong>${escapeHtml(code)}</strong></p>
          <p style="margin:0 0 4px;"><strong>Paid:</strong> ${escapeHtml(moneyWords(p.priceMinor || 0, p.currency))}</p>
          ${until ? `<p style="margin:0 0 4px;"><strong>Book by:</strong> ${escapeHtml(until)}</p>` : ""}
          ${risoButton(escapeHtml(siteLink(`/book?pack=${encodeURIComponent(code)}`)), "Book a visit", brand.accent, brand.theme)}
        `, layout),
      });
      const owner = ownerEmail();
      if (owner) {
        await sendEmail({
          to: owner,
          subject: `[PACK] New: ${p.customer?.name || "A customer"}, ${p.visits} visits of ${p.serviceName}`,
          html: risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(p.customer?.name || "")}: ${p.visits} visits of ${escapeHtml(p.serviceName)}</h2>
            <p style="margin:0 0 4px;">${escapeHtml(p.customer?.email || "")} · ${escapeHtml(moneyWords(p.priceMinor || 0, p.currency))}${until ? ` · book by ${escapeHtml(until)}` : ""}</p>
            ${risoButton(escapeHtml(siteLink("/admin#bookings")), "Open Bookings", brand.accent, brand.theme)}`, layout),
        });
      }
    } catch (err) {
      console.warn("bookings: the pack email failed:", err?.message || err);
    }
  }

  /** Reads a held pack's card page; once it is paid for the pack's price the pack starts and its code is emailed, once. */
  async function refreshPack(id, p, checkout) {
    if (p.status !== "held" || !checkout) return p;
    for (const sid of (p.sessions || []).slice(-5)) {
      if (!SESSION_ID.test(sid)) continue;
      const session = await checkout.read(sid).catch(() => null);
      if (!session || (session.metadata?.pack && session.metadata.pack !== id) || session.payment_status !== "paid") continue;
      if (Number.isFinite(session.amount_total) && session.amount_total !== p.priceMinor) continue;
      const at = now().toISOString();
      const changes = {
        status: "active", paidAt: at, paidSession: sid, holdUntil: null, updatedAt: at, pendingCode: null,
        paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        expiresOn: packEndsOn(dayOf(now().getTime(), zone()), p.days || 0),
      };
      const started = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(packs().doc(id));
        if (fresh.data()?.status !== "held") return false;
        tx.set(packs().doc(id), changes, { merge: true });
        return true;
      });
      if (!started) return { ...p, ...(await packs().doc(id).get()).data() };
      const next = { ...p, ...changes };
      await tellPack(next, p.pendingCode);
      return next;
    }
    return p;
  }

  /** Forgets packs whose card page closed unpaid, and starts the ones paid while nobody had the page open. */
  async function sweepPacks() {
    const snap = await packs().where("status", "==", "held").limit(100).get();
    if (snap.empty) return;
    const { checkout } = await standalone();
    for (const doc of snap.docs) {
      let p = await refreshPack(doc.id, doc.data(), checkout);
      if (p.status !== "held" || Date.parse(p.holdUntil || "") > now().getTime()) continue;
      // Close the page first, then read once more: a payment that landed just before the close still counts.
      for (const sid of p.sessions || []) if (SESSION_ID.test(sid)) await checkout?.close(sid).catch(() => {});
      p = await refreshPack(doc.id, p, checkout);
      if (p.status === "held") await doc.ref.delete();
    }
  }

  /** What the cancel email says about a pack's visit. */
  const packBackWords = (b) => (b.pack ? " The visit is back on your pack, so you can book another time." : "");

  /** What the cancel email says about the gift card's part. */
  const giftBackWords = (b) => (b.giftCard?.amountMinor ? ` The ${moneyWords(b.giftCard.amountMinor, b.currency)} from your gift card is back on it.` : "");

  // ── Customers (validateDiscountCode actions; no sign-in) ───────────────────────────────────────────────────────

  // ── Pickup times at checkout (phase 4) ─────────────────────────────────────────────────────────────────────────────
  // With Hours & rules › Pickup times on, a shopper who picks up chooses a time inside the opening hours. The order keeps
  // it as `fulfillment.pickupAt` (ISO), set by index.js resolveShipping through `pickupCheck`, so no new record or rule.
  // A slot counts the paid, uncancelled orders in it plus unpaid ones started in the last PICKUP_UNPAID_HOURS (a checkout
  // still under way), so two shoppers rarely race for the last place and an abandoned bag never blocks one for long.
  async function pickupTaken(fromMs, toMs, skipOrderId = "") {
    const snap = await db.collection("orders")
      .where("fulfillment.pickupAt", ">=", new Date(fromMs).toISOString())
      .where("fulfillment.pickupAt", "<", new Date(toMs).toISOString())
      .limit(2000).get();
    const nowMs = now().getTime();
    const taken = {};
    for (const d of snap.docs) {
      if (d.id === skipOrderId) continue;
      const o = d.data() || {};
      if (o.status === "cancelled" || /refund/.test(String(o.paymentStatus || ""))) continue;
      if (o.paymentStatus !== "paid" && !(nowMs - whenMs(o.createdAt) < PICKUP_UNPAID_HOURS * HOUR)) continue;
      const start = Date.parse(o.fulfillment.pickupAt);
      if (Number.isFinite(start)) taken[String(start)] = (taken[String(start)] || 0) + 1;
    }
    return taken;
  }
  /** Whether this shop asks for pickup times, and its rules: null when Bookings or the switch is off. */
  async function pickupRules() {
    if (!(await featureOn())) return null;
    const settings = await readSettings();
    return settings.pickupTimes ? settings : null;
  }
  /**
   * The checkout's check (index.js resolveShipping, pickup only): `{ pickupAt }` to keep on the order's fulfillment, `{}`
   * when the shop doesn't ask for times, or throws PickupTimeProblem with the shopper's words.
   */
  async function pickupCheck(selection, orderId = "") {
    const settings = await pickupRules();
    if (!settings) return {};
    const start = Date.parse(String(selection?.pickupAt || ""));
    if (!selection?.pickupAt) throw new PickupTimeProblem("Please choose a pickup time.", "pickup_time");
    const taken = Number.isFinite(start) ? (await pickupTaken(start, start + 1, orderId))[String(start)] || 0 : 0;
    const problem = pickupTimeProblem({ settings, zone: zone(), nowMs: now().getTime(), start, taken });
    if (problem) throw new PickupTimeProblem(PICKUP_MESSAGES[problem], `pickup_${problem}`);
    return { pickupAt: new Date(start).toISOString() };
  }

  async function handlePublic(req, res) {
    const action = req.body?.action;
    res.set("Cache-Control", "private, no-store");
    if (!(await hitLimit(db, "booking", req, LIMITS.booking))) return fail(res, 429, "Too many tries. Please wait a few minutes and try again.");
    try {
      if (!(await featureOn())) return res.status(200).json({ on: false });
      const settings = await readSettings();
      const nowMs = now().getTime();
      if (action === "pickupTimes") {
        // Checkout's pickup times: on with the switch alone (the Book a time page may stay closed).
        if (!settings.pickupTimes) return res.status(200).json({ on: false });
        const today = dayOf(nowMs, zone());
        const taken = await pickupTaken(zonedTime(today, "00:00", zone()), zonedTime(addDays(today, PICKUP_DAYS_AHEAD + 1), "00:00", zone()));
        const slots = pickupSlots({ settings, zone: zone(), nowMs, taken });
        const days = {};
        for (const [day, list] of Object.entries(slots)) days[day] = list.map((ms) => new Date(ms).toISOString());
        return res.status(200).json({ on: true, zone: zone(), slotMinutes: settings.pickupSlotMinutes, days });
      }
      if (action === "bookingInfo") {
        if (!settings.live) return res.status(200).json({ on: false });
        const list = (await readServices()).filter((s) => s.active);
        return res.status(200).json({
          on: true, zone: zone(), currency: currency(), cancelHours: settings.cancelHours, maxDaysAhead: settings.maxDaysAhead, today: dayOf(nowMs, zone()),
          codes: await codesOffered(), giftCards: await giftCardsOffered(),
          // The people a client can pick (the "With" choice); none when the shop books as one calendar.
          staff: booksByPerson(settings) ? settings.staff.filter((p) => p.active).map(({ id, name, serviceIds }) => ({ id, name, serviceIds })) : [],
          services: list.map(({ id, name, description, minutes, priceMinor, payment, depositMinor, depositPercent, location, questions, places, holdCard, lateFeeMinor, packVisits, packPriceMinor, packDays }) => ({
            id, name, description, minutes, priceMinor, payment, depositMinor, depositPercent, location, questions, places,
            ...(holdCard && canHoldCard() ? { holdCard: true, lateFeeMinor } : {}),
            ...(offersPack({ packVisits, packPriceMinor }) ? { packVisits, packPriceMinor, packDays } : {}),
          })),
        });
      }
      if (action === "bookingTimes") {
        if (!settings.live) return res.status(200).json({ on: false });
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const from = isDay(req.body?.from) ? req.body.from : dayOf(nowMs, zone());
        const count = Math.min(MAX_DAYS_ASKED, Math.max(1, Math.round(Number(req.body?.days) || 7)));
        const days = Array.from({ length: count }, (_, i) => addDays(from, i));
        const snaps = await Promise.all([addDays(from, -1), ...days, addDays(from, count)].map((d) => dayRef(d).get()));
        // A place held for this customer from the waiting list shows as free to them.
        const offer = await offerFor(req.body, service.id, nowMs);
        const busy = busyFrom(snaps, nowMs, offer?.item || "");
        // Only one person's times when the client picked someone (a person who doesn't do it reads as anyone).
        const staffId = keptPerson(settings, service.id, req.body?.staffId);
        const out = {};
        // A group class also says how many places each time has left.
        const left = {};
        for (const day of days) {
          out[day] = freeTimes({ service, settings, busy, day, zone: zone(), nowMs, staffId }).map((ms) => {
            const iso = new Date(ms).toISOString();
            if (isClass(service)) left[iso] = classPlacesLeft(ms, service, settings, busy, staffId);
            return iso;
          });
        }
        // A class's full times are listed too, so the page can offer its waiting list.
        const full = {};
        if (isClass(service)) for (const day of days) {
          const list = fullClassTimes(service, settings, busy, day, nowMs);
          if (list.length) full[day] = list.map((ms) => new Date(ms).toISOString());
        }
        // Days with nothing left only because they are booked up (not closed): the page offers the waiting list there.
        const fullDays = days.filter((day) => !out[day].length && !full[day] && freeTimes({ service, settings, busy: [], day, zone: zone(), nowMs, staffId }).length > 0);
        return res.status(200).json({ on: true, days: out, fullDays, ...(isClass(service) ? { places: service.places, left, full } : {}),
          ...(offer ? { held: { start: new Date(offer.start).toISOString(), until: offer.until } } : {}) });
      }
      if (action === "bookingCode") {
        // Try a discount code before booking: what it takes off and what is paid now. Booking checks it again.
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200);
        try {
          const priced = await codeFor(service, req.body?.code, email);
          return res.status(200).json({ code: priced.discount.code, discountMinor: priced.discount.amountMinor, priceMinor: priced.priceMinor, payNowMinor: priced.upFront });
        } catch (err) {
          if (err instanceof BookingCodeProblem) return fail(res, 400, err.message, "code");
          throw err;
        }
      }
      if (action === "bookingGiftCard") {
        // Try a gift card before booking: what it pays now and what is left for the card page. Booking checks it again.
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200);
        let upFront = depositOf(service);
        if (String(req.body?.code || "").trim()) {
          try { upFront = (await codeFor(service, req.body.code, email)).upFront; } catch (err) {
            if (err instanceof BookingCodeProblem) return fail(res, 400, err.message, "code");
            throw err;
          }
        }
        try {
          const gift = await giftFor(req.body?.giftCard, upFront);
          return res.status(200).json({ last4: gift.last4, giftMinor: gift.amountMinor, payNowMinor: upFront - gift.amountMinor });
        } catch (err) {
          if (err instanceof BookingCodeProblem) return fail(res, 400, err.message, "gift");
          throw err;
        }
      }
      if (action === "bookingPackBuy") {
        // Buy a pack of visits: a card page for the pack's price. The code is emailed once it is paid.
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service || !offersPack(service)) return fail(res, 404, "This service doesn't sell packs right now.");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem.replace("send your booking to", "send your pack to"));
        const { checkout, mode } = await standalone();
        if (!checkout) return fail(res, 409, "This shop can't take card payments for packs yet. Please contact the shop.", "not_available");
        const code = newPackCode();
        const pid = packId(code);
        const until = nowMs + PACK_PAGE_MINUTES * MINUTE;
        const at = new Date(nowMs).toISOString();
        await packs().doc(pid).set({
          last4: code.slice(-4), serviceId: service.id, serviceName: service.name, visits: service.packVisits, days: service.packDays,
          priceMinor: service.packPriceMinor, currency: currency(), mode, customer: { name: customer.name, email: customer.email },
          status: "held", sessions: [], uses: [], holdUntil: new Date(until).toISOString(), createdAt: at, updatedAt: at,
          // Kept only until it is paid, so the email can carry the code; afterwards only its hash (the id) is left.
          pendingCode: code,
        });
        const description = `${shopName() ? `${shopName()}: ` : ""}${service.name}, pack of ${service.packVisits} visits`.slice(0, 250);
        const metadata = { pack: pid };
        let session;
        try {
          session = await checkout.open({
            customer_email: customer.email, metadata, mode: "payment", expires_at: Math.floor(until / 1000),
            success_url: siteLink(`/book?pack=${encodeURIComponent(code)}`),
            line_items: [{ quantity: 1, price_data: { currency: currency().toLowerCase(), unit_amount: service.packPriceMinor, product_data: { name: description } } }],
            payment_intent_data: { description, metadata },
          }, `booking-pack-${pid}`);
        } catch (err) {
          await packs().doc(pid).delete();
          if (err?.code === "currency_mismatch") return fail(res, 409, err.message, "currency_mismatch");
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) return fail(res, 409, "This shop can't take card payments for packs yet. Please contact the shop.", "not_available");
          throw err;
        }
        await packs().doc(pid).set({ sessions: [session.id] }, { merge: true });
        return res.status(200).json({ url: session.url });
      }
      if (action === "bookingPackView") {
        // The pack's own page (the link in its email): visits left, the last day, the visits coming up.
        const p = await loadPack(req.body?.pack);
        if (!p) return fail(res, 404, PACK_MESSAGES.not_found, "pack");
        const next = p.status === "held" ? await refreshPack(p.id, p, (await standalone()).checkout) : p;
        return res.status(200).json({ pack: publicPack(next, nowMs) });
      }
      if (action === "bookingPack") {
        // Try a pack's code on the booking form; booking checks it again and counts the visit.
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const p = await loadPack(req.body?.pack);
        const when = Date.parse(String(req.body?.start || ""));
        const problem = packProblem(p, service.id, dayOf(Number.isFinite(when) ? when : nowMs, zone()));
        if (problem) return fail(res, 400, PACK_MESSAGES[problem], "pack");
        return res.status(200).json({ last4: p.last4, left: packLeft(p), visits: p.visits, expiresOn: p.expiresOn || null });
      }
      if (action === "bookingStart") {
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a time first.");
        // The person the client picked ("" for anyone free); someone who doesn't do this service is refused.
        const staffId = String(req.body?.staffId || "");
        if (staffId && !keptPerson(settings, service.id, staffId)) return fail(res, 400, "That person doesn't take this service. Please pick someone else.", "staff");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem);
        // The service's own questions: a required one left empty stops the booking, with the question named.
        const answered = cleanAnswers(service.questions, req.body?.answers);
        if (answered.problem) return fail(res, 400, answered.problem, "answers");
        // A pack of visits pays for the visit outright: no code, gift card or card payment with it.
        let pack = null;
        if (String(req.body?.pack || "").trim()) {
          const p = await loadPack(req.body.pack);
          const problem = packProblem(p, service.id, dayOf(start, zone()));
          if (problem) return fail(res, 400, PACK_MESSAGES[problem], "pack");
          pack = { id: p.id, last4: p.last4 };
        }
        // A discount code comes off the price first; a deposit is then worked out on what is left.
        let priced = null;
        if (!pack && String(req.body?.code || "").trim()) {
          try {
            priced = await codeFor(service, req.body.code, customer.email);
          } catch (err) {
            if (err instanceof BookingCodeProblem) return fail(res, 400, err.message, "code");
            throw err;
          }
        }
        const price = service.payment === "free" || pack ? 0 : priced ? priced.priceMinor : service.priceMinor;
        // What the card page takes now: the whole price, the deposit, or nothing (free, all paid at the visit, or a pack).
        const upFront = pack ? 0 : priced ? priced.upFront : depositOf(service);
        const deposit = upFront > 0 && service.payment === "deposit" && upFront < price;
        // A gift card pays part or all of what is paid now; the card page takes the rest.
        let gift = null;
        if (!pack && String(req.body?.giftCard || "").trim()) {
          try { gift = await giftFor(req.body.giftCard, upFront); } catch (err) {
            if (err instanceof BookingCodeProblem) return fail(res, 400, err.message, "gift");
            throw err;
          }
        }
        const cardDue = upFront - (gift?.amountMinor || 0);
        let checkout = null;
        let mode = "live";
        let holdCard = service.holdCard && canHoldCard();
        if (cardDue > 0 || holdCard) {
          ({ checkout, mode } = await standalone());
          if (!checkout?.savedCard) holdCard = false;
          if (!checkout && cardDue > 0) return fail(res, 409, "This shop can't take card payments for bookings yet. Please contact the shop.", "not_available");
        }
        // The customer goes to a card page to pay now, to save a card for the missed-booking fee, or both.
        const paid = cardDue > 0 || holdCard;
        // Paid in full by the gift card with no page to visit: the booking's payment is done now.
        const giftPaid = gift && !paid ? (deposit ? { depositPaid: true } : { paid: true }) : {};
        const id = randomId();
        const key = randomKey();
        const at = new Date(nowMs).toISOString();
        const record = {
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: service.gapAfter, location: service.location,
          customer: { name: customer.name, email: customer.email, phone: customer.phone }, note: customer.note, answers: answered.answers,
          status: paid ? "held" : "confirmed", payment: pack ? "pack" : deposit ? "deposit" : upFront > 0 ? "card" : price > 0 ? "atShop" : "free",
          priceMinor: price, ...(deposit ? { depositMinor: upFront, depositPaid: false } : {}), currency: currency(),
          ...(priced ? { discount: priced.discount, listPriceMinor: service.priceMinor } : {}),
          ...(gift ? { giftCard: gift } : {}),
          ...(pack ? { pack, listPriceMinor: service.priceMinor } : {}),
          paid: false, ...giftPaid, sessions: [], holdUntil: paid ? new Date(nowMs + HOLD_MINUTES * MINUTE).toISOString() : null, manageKeyHash: hash(key),
          ...(holdCard ? { cardHold: true, lateFeeMinor: service.lateFeeMinor, cardMode: mode } : {}),
          // Kept only until the payment is confirmed, so the confirmation email can carry the customer's link.
          pendingKey: paid ? key : null,
          source: "website", history: [{ at, what: "booked", by: "customer" }], createdAt: at, updatedAt: at,
        };
        const took = await takeTime({ id, service, settings, start, record, offer: await offerFor(req.body, service.id, nowMs), staffId });
        if (took === "code_used") return fail(res, 409, "This code has reached its usage limit.", "code");
        if (took === "gift_short") return fail(res, 409, "This gift card's balance just changed. Please check it and try again.", "gift");
        if (took === "pack_used") return fail(res, 409, "This pack can't book another visit just now. Please check it and try again.", "pack");
        if (!took) return fail(res, 409, isClass(service) ? "That class just filled up. Please pick another time." : staffId ? "That person was just booked then. Please pick another time or anyone free." : "Someone just took that time. Please pick another.", "taken");
        if (!paid) {
          const written = pack ? (await bookings().doc(id).get()).data() : record;
          const booked = await syncCalendar(id, { ...written, start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString() });
          await tellCustomer(id, booked, "booked", { key });
          return res.status(200).json({ id, key, status: "confirmed" });
        }
        try {
          const description = `${shopName() ? `${shopName()}: ` : ""}${service.name}${deposit ? " (deposit)" : ""}`.slice(0, 250);
          const metadata = { booking: id };
          const page = {
            customer_email: customer.email,
            metadata,
            // Stripe's shortest page life is 30 minutes; the sweep closes it once the hold runs out.
            expires_at: Math.floor(nowMs / 1000) + 31 * 60,
            success_url: manageUrl(id, key),
          };
          // Nothing to pay now: a page that only saves the card. Paying now with a card kept: the same payment page,
          // which also saves the card for later (a customer of the shop's own Stripe account holds it).
          const session = await checkout.open(cardDue > 0 ? {
            ...page,
            mode: "payment",
            line_items: [{ quantity: 1, price_data: { currency: currency().toLowerCase(), unit_amount: cardDue, product_data: { name: description } } }],
            payment_intent_data: { description, metadata, ...(holdCard ? { setup_future_usage: "off_session" } : {}) },
            ...(holdCard ? { customer_creation: "always" } : {}),
          } : {
            ...page,
            mode: "setup",
            currency: currency().toLowerCase(),
            customer_creation: "always",
            setup_intent_data: { description: `${description} (card kept for the missed-booking fee)`.slice(0, 250), metadata },
          }, `booking-${id}`);
          await bookings().doc(id).set({ sessions: [session.id] }, { merge: true });
          return res.status(200).json({ id, key, status: "held", url: session.url, holdMinutes: HOLD_MINUTES });
        } catch (err) {
          await freeTime(id, { ...record, start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString() }, { status: "cancelled", holdUntil: null, updatedAt: now().toISOString() });
          if (err?.code === "currency_mismatch") return fail(res, 409, err.message, "currency_mismatch");
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) {
            console.error(`Booking ${id} card payment refused:`, err.code, err?.message || err);
            return fail(res, 409, "This shop can't take card payments for bookings yet. Please contact the shop.", "not_available");
          }
          console.error(`Booking ${id} payment page refused:`, err?.type || "", err?.code || "", err?.param || "", err?.message || err);
          throw err;
        }
      }
      if (action === "bookingWait") {
        // Hear when a full class time (start) or a full day has room again; a freed place is held for the first in line.
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem.replace("send your booking to", "reach you at"));
        const start = req.body?.start ? Date.parse(String(req.body.start)) : null;
        if (start !== null && !Number.isFinite(start)) return fail(res, 400, "Pick a time first.");
        const day = start !== null ? dayOf(start, zone()) : String(req.body?.day || "");
        const today = dayOf(nowMs, zone());
        if (!isDay(day) || day < today || day > addDays(today, settings.maxDaysAhead)) return fail(res, 400, "Pick a day first.");
        const busy = await busyAround(day, nowMs);
        const times = freeTimes({ service, settings, busy, day, zone: zone(), nowMs });
        if (start !== null ? times.includes(start) : times.length > 0) return fail(res, 409, "There is room now. You can book it straight away.", "open");
        if (start !== null && !fullClassTimes(service, settings, busy, day, nowMs).includes(start)) return fail(res, 400, "That time isn't one you can wait for.");
        // A day the shop is closed never opens up, so there is nothing to wait for.
        if (start === null && !freeTimes({ service, settings, busy: [], day, zone: zone(), nowMs }).length) return fail(res, 400, "That day isn't one you can wait for.");
        const startIso = start !== null ? new Date(start).toISOString() : null;
        const wid = hash(`${service.id}|${startIso || day}|${customer.email}`).slice(0, 32);
        const waiting = await waitlist().where("day", "==", day).limit(MAX_WAITING * 4).get();
        // Someone already holding a place keeps it (asking again would otherwise start them over).
        if (waiting.docs.some((d) => d.id === wid && d.data()?.offerUntil)) return res.status(200).json({ ok: true });
        if (!waiting.docs.some((d) => d.id === wid) && waiting.docs.filter((d) => d.data()?.serviceId === service.id).length >= MAX_WAITING) {
          return fail(res, 409, "The waiting list for this day is full.", "wait_full");
        }
        await waitlist().doc(wid).set({ serviceId: service.id, serviceName: service.name, day, start: startIso, name: customer.name, email: customer.email, createdAt: new Date(nowMs).toISOString() });
        return res.status(200).json({ ok: true });
      }
      const id = String(req.body?.id || "");
      const key = String(req.body?.key || "");
      let b = await loadBooking(id, key);
      if (!b) return fail(res, 404, "We couldn't find this booking. Check the link in your email.");
      /** A card page for what is left and/or a tip, listed on the booking so the view and the sweep can read it. */
      const payPage = async (res, b, { amountMinor, tipMinor, label }) => {
        // A payment on the shop's card reader right now: paying by link as well could take the money twice.
        if (b.readerOpen && amountMinor > 0) return fail(res, 409, "This payment is on the shop's card reader right now.", "reader_busy");
        const { checkout } = await standalone();
        const total = amountMinor + tipMinor;
        const pages = (b.restPages || []).filter((p) => p && SESSION_ID.test(String(p.id || "")));
        // The same page again while it has a while left, so tapping twice never opens two.
        const open = pages.find((p) => (p.amountMinor || 0) === amountMinor && (p.tipMinor || 0) === tipMinor && p.url && Date.parse(p.until || "") - nowMs > REST_REUSE_MINUTES * MINUTE);
        if (open) return res.status(200).json({ url: open.url });
        const description = `${shopName() ? `${shopName()}: ` : ""}${b.serviceName} (${label})`.slice(0, 250);
        const metadata = { booking: id, rest: "1", ...(tipMinor ? { tip: String(tipMinor) } : {}) };
        const until = nowMs + REST_PAGE_MINUTES * MINUTE;
        let session;
        try {
          session = await checkout.open({
            customer_email: b.customer?.email || undefined, metadata, mode: "payment",
            expires_at: Math.floor(until / 1000), success_url: manageUrl(id, key),
            line_items: [{ quantity: 1, price_data: { currency: String(b.currency || currency()).toLowerCase(), unit_amount: total, product_data: { name: description } } }],
            payment_intent_data: { description, metadata },
          }, `booking-rest-${id}-${amountMinor}-${tipMinor}-${pages.length}`);
        } catch (err) {
          if (err?.code === "currency_mismatch") return fail(res, 409, err.message, "currency_mismatch");
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) return fail(res, 409, "This shop can't take card payments online yet. Please pay at your visit.", "not_available");
          throw err;
        }
        await bookings().doc(id).set({ restOpen: true, restPages: [...pages, { id: session.id, amountMinor, tipMinor, until: new Date(until).toISOString(), url: session.url }].slice(-10) }, { merge: true });
        return res.status(200).json({ url: session.url });
      };
      if (action === "bookingView") {
        if (b.status === "held") b = await refreshHeld(id, b, (await standalone()).checkout);
        if (b.restOpen) b = await refreshRest(id, b, (await standalone()).checkout);
        return res.status(200).json({ booking: publicBooking(id, b, settings, nowMs) });
      }
      if (action === "bookingPayRest") {
        // A card page for what is left; the booking page reads it when the customer comes back.
        const { checkout } = await standalone();
        if (b.restOpen) b = await refreshRest(id, b, checkout);
        if (!restPayable(b)) return fail(res, 409, b.rest || b.paid ? "This booking is already paid in full." : "There is nothing to pay online for this booking.", "nothing_due");
        const amount = balanceDue(b);
        // An optional tip on top, when the shop asks for tips.
        const tip = req.body?.tipMinor === undefined || req.body?.tipMinor === 0 ? 0 : Number(req.body.tipMinor);
        if (tip && (!settings.tips || b.tip || !tipFits(tip, b.priceMinor || 0))) return fail(res, 400, "That tip can't be added. Please choose another amount.", "bad_tip");
        return payPage(res, b, { amountMinor: amount, tipMinor: tip, label: tip ? "the rest and a tip" : "the rest" });
      }
      if (action === "bookingTip") {
        // A tip on its own, after the visit (the "Add a tip" email); what is still due is paid with Pay the rest instead.
        const { checkout } = await standalone();
        if (b.restOpen) b = await refreshRest(id, b, checkout);
        if (b.tip) return fail(res, 409, "You already added a tip. Thank you!", "tipped");
        if (!tipOpen(b, settings.tips, nowMs) || restPayable(b)) return fail(res, 409, "A tip can't be added to this booking.", "no_tip");
        const tip = Number(req.body?.tipMinor);
        if (!tipFits(tip, b.priceMinor || 0)) return fail(res, 400, "That tip can't be added. Please choose another amount.", "bad_tip");
        return payPage(res, b, { amountMinor: 0, tipMinor: tip, label: "a tip" });
      }
      if (action === "bookingCancel") {
        if (b.status === "cancelled") return res.status(200).json({ booking: publicBooking(id, b, settings, nowMs) });
        if (b.status !== "confirmed" || !customerCanChange(Date.parse(b.start), settings, nowMs)) {
          return fail(res, 409, `This booking can't be cancelled online within ${settings.cancelHours} hours of its start. Please contact the shop.`, "too_late");
        }
        b = await settleRest(id, b);
        let refund = null;
        try { refund = await refundBooking(id, b); } catch (err) {
          console.error(`Booking ${id} refund failed:`, err?.message || err);
          return fail(res, 502, "Your refund couldn't be started, so the booking is still on. Please try again in a minute.");
        }
        const at = now().toISOString();
        const changes = { status: "cancelled", cancelledAt: at, cancelledBy: "customer", updatedAt: at, ...(refund ? { refund } : {}),
          history: [...(b.history || []), { at, what: refund ? "cancelled and refunded" : "cancelled", by: "customer" }].slice(-20) };
        const written = await freeTime(id, b, changes);
        const next = await syncCalendar(id, { ...b, ...written });
        await tellCustomer(id, next, "cancelled", { refundText: `${!refund ? "" : b.payment === "deposit" && !b.rest ? "Your deposit is being refunded to your card." : "Your payment is being refunded to your card."}${giftBackWords(b)}${packBackWords(b)}`.trim() });
        return res.status(200).json({ booking: publicBooking(id, next, settings, nowMs) });
      }
      if (action === "bookingMove") {
        if (b.status !== "confirmed" || !customerCanChange(Date.parse(b.start), settings, nowMs)) {
          return fail(res, 409, `This booking can't be moved online within ${settings.cancelHours} hours of its start. Please contact the shop.`, "too_late");
        }
        const service = (await readServices()).find((s) => s.id === b.serviceId) || { minutes: b.minutes, gapAfter: b.gapAfter || 0 };
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a new time first.");
        // A visit booked with a pack stays inside the pack's dates.
        if (b.pack?.id) {
          const p = (await packs().doc(b.pack.id).get()).data();
          if (p?.expiresOn && dayOf(start, zone()) > p.expiresOn) return fail(res, 409, "Your pack runs out before that day. Please pick an earlier time.", "pack");
        }
        const moved = await moveTime(id, b, { ...service, id: b.serviceId, minutes: b.minutes, gapAfter: b.gapAfter || 0 }, settings, start);
        if (!moved) return fail(res, 409, isClass(service) ? "That class just filled up. Please pick another time." : "Someone just took that time. Please pick another.", "taken");
        const next = await syncCalendar(id, { ...b, ...moved });
        await tellCustomer(id, next, "moved", { key });
        return res.status(200).json({ booking: publicBooking(id, next, settings, nowMs) });
      }
      return fail(res, 400, "Unknown booking action.");
    } catch (err) {
      console.error("booking action failed:", action, err?.message || err);
      return fail(res, 502, "Bookings couldn't be reached just now. Please try again.");
    }
  }

  // ── The owner (createStripeCheckoutSession action "bookingsAdmin") ─────────────────────────────────────────────

  async function handleAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    const by = adminUser.email || "admin";
    try {
      if (!(await featureOn())) return fail(res, 403, "Bookings aren't turned on for this shop.", "off");
      const settings = await readSettings();
      if (op === "saveService") {
        const id = ID.test(String(req.body?.service?.id || "")) ? req.body.service.id : randomId();
        const service = cleanService(req.body?.service, id);
        if (service.problem) return fail(res, 400, service.problem);
        const existing = await services().limit(MAX_SERVICES + 1).get();
        if (!existing.docs.some((d) => d.id === id) && existing.docs.length >= MAX_SERVICES) return fail(res, 400, `A shop can have up to ${MAX_SERVICES} services.`);
        await services().doc(id).set({ ...service, updatedAt: now().toISOString(), updatedBy: by });
        return res.status(200).json({ ok: true, service });
      }
      if (op === "deleteService") {
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 400, "Unknown service.");
        await services().doc(id).delete();
        return res.status(200).json({ ok: true });
      }
      if (op === "calendarFeed") {
        // The owner's private calendar link (frontDoor.js answers it). Kept server-only; a new one stops the old.
        const ref = db.collection("bookingFeed").doc("main");
        const snap = await ref.get();
        let token = snap.exists ? snap.data()?.token : "";
        if (!KEY.test(String(token || "")) || req.body?.renew === true) {
          token = randomKey();
          await ref.set({ token, madeAt: now().toISOString(), madeBy: by });
        }
        return res.status(200).json({ path: `/calendar/${token}.ics` });
      }
      if (op === "saveSettings") {
        const next = cleanBookingSettings(req.body?.settings);
        await settingsRef().set({ ...next, updatedAt: now().toISOString(), updatedBy: by });
        await tellWebsite(next.live);
        // Just switched on: the coming bookings go in too, and the owner learns whether Google is linked.
        const googleCalendar = next.googleCalendar && !settings.googleCalendar ? await fillCalendar() : undefined;
        return res.status(200).json({ ok: true, settings: next, ...(googleCalendar ? { googleCalendar } : {}) });
      }
      if (op === "setLive") {
        // The owner's on/off switch (Orders › Bookings): one tap, nothing else about the hours changes. Off hides the
        // page and its links and stops new bookings; bookings already made stay, and customers can still open theirs.
        const next = { ...settings, live: req.body?.live === true };
        await settingsRef().set({ ...next, updatedAt: now().toISOString(), updatedBy: by });
        await tellWebsite(next.live);
        return res.status(200).json({ ok: true, settings: next });
      }
      if (op === "times") {
        // The admin's own times for a new or moved booking: the same free times customers see, without the notice.
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId);
        if (!service) return fail(res, 404, "Choose a service.");
        const day = isDay(req.body?.day) ? req.body.day : dayOf(now().getTime(), zone());
        const nowMs = now().getTime();
        const snaps = await Promise.all([addDays(day, -1), day, addDays(day, 1)].map((d) => dayRef(d).get()));
        const own = { ...settings, minNoticeHours: 0, maxDaysAhead: 366 };
        const staffId = keptPerson(settings, service.id, req.body?.staffId);
        const times = freeTimes({ service, settings: own, busy: busyFrom(snaps, nowMs, String(req.body?.except || "")), day, zone: zone(), nowMs, staffId });
        return res.status(200).json({ times: times.map((ms) => new Date(ms).toISOString()) });
      }
      if (op === "waitlist") {
        // Who is waiting from one day to another (the week on screen). Read here because no browser may read the list.
        const from = isDay(req.body?.from) ? req.body.from : dayOf(now().getTime(), zone());
        const to = isDay(req.body?.to) ? req.body.to : addDays(from, 6);
        const snap = await waitlist().where("day", ">=", from).where("day", "<=", to).limit(500).get();
        return res.status(200).json({ waiting: snap.docs.map((d) => { const w = d.data(); return { id: d.id, serviceId: w.serviceId, serviceName: w.serviceName, day: w.day, start: w.start || null, name: w.name, email: w.email, createdAt: w.createdAt, ...(Date.parse(w.offerUntil || "") > now().getTime() ? { heldUntil: w.offerUntil, heldStart: w.offerStart } : { heldUntil: null, heldStart: null }) }; }) });
      }
      if (op === "removeWaiting") {
        const wid = String(req.body?.id || "");
        if (!WAIT_ID.test(wid)) return fail(res, 400, "Unknown entry.");
        const snap = await waitlist().doc(wid).get();
        const w = snap.exists ? snap.data() : null;
        await dropOffer(wid, w);
        await waitlist().doc(wid).delete();
        // A place held for them goes to the next person.
        if (w?.offerStart) await tellWaitlist([w.day]);
        return res.status(200).json({ ok: true });
      }
      if (op === "packs") {
        // Every pack sold (newest first), read here because no browser may read them.
        const snap = await packs().orderBy("createdAt", "desc").limit(300).get();
        const list = snap.docs.map((d) => ({ id: d.id, p: d.data() })).filter(({ p }) => p.status !== "held")
          .sort((a, b) => String(b.p.createdAt || "").localeCompare(String(a.p.createdAt || "")));
        return res.status(200).json({
          packs: list.map(({ id, p }) => ({
            id, last4: p.last4 || "", serviceId: p.serviceId, serviceName: p.serviceName || "", name: p.customer?.name || "", email: p.customer?.email || "",
            visits: p.visits || 0, left: packLeft(p), status: p.status, priceMinor: p.priceMinor || 0, currency: p.currency, expiresOn: p.expiresOn || null,
            paidAt: p.paidAt || null, refundMinor: p.refund?.amountMinor || 0,
            uses: (p.uses || []).map((u) => ({ bookingId: u.bookingId, start: u.start || null, returned: !!u.returned })),
          })),
        });
      }
      if (op === "packClose") {
        // End a pack (no more visits can be booked with it), refunding some or all of it. Visits already booked stay.
        const pid = String(req.body?.id || "");
        if (!PACK_ID.test(pid)) return fail(res, 400, "Unknown pack.");
        const ref = packs().doc(pid);
        const snap = await ref.get();
        if (!snap.exists) return fail(res, 404, "This pack is gone.");
        const p = snap.data();
        if (p.status !== "active") return fail(res, 409, "This pack is already closed.", "closed");
        const amount = req.body?.refundMinor === undefined ? 0 : Number(req.body.refundMinor);
        if (!Number.isInteger(amount) || amount < 0 || amount > (p.priceMinor || 0)) return fail(res, 400, "The refund can't be more than they paid.");
        const at = now().toISOString();
        let refund = null;
        if (amount > 0) {
          if (!p.paymentIntent) return fail(res, 409, "This pack has no card payment to refund.");
          try {
            const mode = p.mode || ((await shopTestMode()) ? "test" : "live");
            const done = await payments.refund({ mode, paymentIntentId: p.paymentIntent, amountMinor: amount, metadata: { bookingPack: pid }, idempotencyKey: `pack-refund-${pid}-${amount}` });
            refund = { refundId: done.refundId, amountMinor: done.amountMinor, at };
          } catch (err) {
            console.error(`Pack ${pid} refund failed:`, err?.message || err);
            return fail(res, 502, "The refund couldn't be started, so the pack is still open. Try again in a minute.");
          }
        }
        await ref.set({ status: "closed", closedAt: at, closedBy: by, updatedAt: at, ...(refund ? { refund } : {}) }, { merge: true });
        return res.status(200).json({ ok: true, refundMinor: refund?.amountMinor || 0 });
      }
      if (op === "create") {
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId);
        if (!service) return fail(res, 404, "Choose a service.");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem.replace("your", "the customer's").replace("Please add an email address we can send your booking to.", "Add the customer's email address."));
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a time.");
        const id = randomId();
        const key = randomKey();
        const at = now().toISOString();
        const record = {
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: service.gapAfter, location: service.location,
          // The owner booking someone in may fill in the service's questions or leave them.
          customer: { name: customer.name, email: customer.email, phone: customer.phone }, note: customer.note, answers: cleanAnswers(service.questions, req.body?.answers, false).answers,
          // Booked in by the owner: nothing is taken by card, so a priced service is all paid at the visit.
          status: "confirmed", payment: service.priceMinor > 0 ? "atShop" : "free", priceMinor: service.priceMinor, currency: currency(),
          paid: false, sessions: [], holdUntil: null, manageKeyHash: hash(key), pendingKey: null, source: "admin",
          history: [{ at, what: "booked", by }], createdAt: at, updatedAt: at,
        };
        // The owner may book any time that doesn't clash, outside the hours too (a favour for a regular), with anyone on
        // the team who does the service.
        const staffId = String(req.body?.staffId || "");
        if (staffId && !keptPerson(settings, service.id, staffId)) return fail(res, 400, "That person doesn't do this service.", "staff");
        const own = ownerBookingSettings(settings);
        const took = await takeTime({ id, service: { ...service, classTimes: [] }, settings: own, start, record, staffId });
        if (!took) return fail(res, 409, isClass(service) ? "That class is full, or the time clashes with another booking." : staffId ? "That person is busy then." : "That time clashes with another booking.", "taken");
        const booked = await syncCalendar(id, { ...record, start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString() });
        if (req.body?.sendEmail !== false) await tellCustomer(id, booked, "booked", { key, byShop: true });
        return res.status(200).json({ ok: true, id });
      }
      if (op === "readers" || op === "readerAdd" || op === "readerRemove") {
        // Card readers that connect over the internet (Stripe's smart readers): one place per shop, readers added with
        // the code the reader shows. Square shops answer `available: false` for now.
        const { mode, reader } = await readerDesk();
        if (!reader) {
          if (op === "readers") return res.status(200).json({ available: false, readers: [] });
          return fail(res, 409, "Card readers work with Stripe for now.", "not_available");
        }
        try {
          if (op === "readerAdd") {
            const code = String(req.body?.code || "").trim().toLowerCase().replace(/\s+/g, "-");
            const label = text(req.body?.label, 60) || "Card reader";
            if (!/^[a-z0-9-]{3,60}$/.test(code)) return fail(res, 400, "Type the code the reader shows on its screen.", "code");
            const place = await readerPlace(mode, reader, { make: true });
            const added = await reader.add({ code, label, place });
            return res.status(200).json({ ok: true, reader: added });
          }
          if (op === "readerRemove") {
            const readerId = String(req.body?.readerId || "");
            if (!READER_ID.test(readerId)) return fail(res, 400, "Choose a card reader.");
            await reader.remove(readerId);
            return res.status(200).json({ ok: true });
          }
          const place = await readerPlace(mode, reader);
          return res.status(200).json({ available: true, testMode: reader.testMode === true, readers: place ? await reader.list(place) : [] });
        } catch (err) {
          console.warn("bookings: card readers:", op, err?.message || err);
          const words = readerWords(err, op === "readerAdd" ? "The reader couldn't be added just now. Please try again." : "The card readers couldn't be reached just now. Please try again.");
          return fail(res, err?.readerCode === "address" ? 409 : err?.statusCode === 400 ? 400 : 502, words, err?.readerCode || "reader");
        }
      }
      if (op === "walkIn") {
        // Take a payment at the desk for someone with no booking: a visit recorded as starting now, at the shop's price
        // or one the owner typed, paid from the same pay link and QR code as the rest of a booking (tip and all). It
        // takes no time on the calendar (they are already here), sends no booking email and never holds a card.
        const service = (await readServices()).find((s) => s.id === req.body?.serviceId);
        if (!service) return fail(res, 404, "Choose a service.");
        const name = text(req.body?.name, 100);
        const email = text(req.body?.email, 320).toLowerCase();
        if (!name) return fail(res, 400, "Add the client's name.");
        if (email && !EMAIL.test(email)) return fail(res, 400, "Check the client's email address, or leave it empty.");
        const typed = req.body?.priceMinor;
        const priceMinor = typed === undefined || typed === null ? service.priceMinor : Number(typed);
        if (!Number.isInteger(priceMinor) || priceMinor < MIN_CARD_MINOR || priceMinor > WALK_IN_MAX_MINOR) {
          return fail(res, 400, `Enter an amount from ${moneyWords(MIN_CARD_MINOR, currency())} to ${moneyWords(WALK_IN_MAX_MINOR, currency())}.`, "amount");
        }
        const id = randomId();
        const payKey = randomKey();
        const at = now().toISOString();
        const start = now().getTime();
        const record = {
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: 0, location: service.location,
          customer: { name, email, phone: "" }, note: "", answers: [],
          status: "confirmed", payment: "atShop", priceMinor, currency: currency(),
          ...(priceMinor !== service.priceMinor ? { listPriceMinor: service.priceMinor } : {}),
          paid: false, sessions: [], holdUntil: null, manageKeyHash: hash(randomKey()), pendingKey: null, payKey, source: "desk", walkIn: true,
          // Reminders and the second reminder are for visits still to come.
          reminderSentAt: at, reminder2SentAt: at,
          start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString(),
          history: [{ at, what: "taken at the desk", by }], createdAt: at, updatedAt: at,
        };
        await bookings().doc(id).set(record);
        return res.status(200).json({ ok: true, id, url: manageUrl(id, payKey), dueMinor: priceMinor });
      }
      const id = String(req.body?.id || "");
      if (!ID.test(id)) return fail(res, 400, "Unknown booking.");
      const snap = await bookings().doc(id).get();
      if (!snap.exists) return fail(res, 404, "This booking is gone.");
      let b = snap.data();
      if (op === "payLink") {
        // The customer's booking page with a Pay button, to copy, email or show as a QR code. Its own key, kept so the
        // same link (and printed QR code) works every time; it opens only this booking.
        if (b.restOpen) b = await refreshRest(id, b, (await standalone()).checkout);
        if (!restPayable(b)) return fail(res, 409, b.rest || b.paid ? "This booking is already paid in full." : "Nothing is left to pay for this booking.", "nothing_due");
        let key = KEY.test(String(b.payKey || "")) ? b.payKey : "";
        if (!key) {
          key = randomKey();
          await bookings().doc(id).set({ payKey: key }, { merge: true });
        }
        if (req.body?.send === true) {
          const to = b.customer?.email;
          if (!to || !EMAIL.test(to)) return fail(res, 400, "This booking has no email address to send it to.");
          await tellCustomer(id, { ...b, payKey: key }, "payRest", { key, byShop: true, toOwner: false });
          const at = now().toISOString();
          await bookings().doc(id).set({ history: [...(b.history || []), { at, what: "pay link emailed", by }].slice(-20) }, { merge: true });
        }
        return res.status(200).json({ ok: true, url: manageUrl(id, key), dueMinor: balanceDue(b), sent: req.body?.send === true });
      }
      if (op === "cancel") {
        if (b.status === "cancelled") return res.status(200).json({ ok: true });
        b = await settleRest(id, b);
        let refund = null;
        // refund: true is the whole payment; refundMinor a part of it (a shop keeping a deposit), 0 for none.
        const part = req.body?.refundMinor;
        const onCard = cardTaken(b);
        const amount = part === undefined ? (req.body?.refund === true ? onCard : 0) : Number(part);
        if (!Number.isInteger(amount) || amount < 0 || amount > onCard) return fail(res, 400, "The refund can't be more than they paid.");
        if (amount > 0) {
          try { refund = await refundBooking(id, b, amount); } catch (err) {
            console.error(`Booking ${id} refund failed:`, err?.message || err);
            return fail(res, 502, "The refund couldn't be started, so the booking is still on. Try again in a minute.");
          }
        }
        const at = now().toISOString();
        // The gift card's part goes back onto it unless the shop keeps it (giftBack: false).
        const giftBack = req.body?.giftBack !== false && !!b.giftCard?.amountMinor && !b.giftCard.returned;
        // The pack's visit goes back onto it unless the shop keeps it (packBack: false, a late cancel).
        const packBack = req.body?.packBack !== false && !!b.pack?.id && !b.pack.returned;
        const what = [refund ? "refunded" : "", giftBack ? "gift card put back" : "", packBack ? "visit put back on the pack" : ""].filter(Boolean).join(" and ");
        const changes = { status: "cancelled", cancelledAt: at, cancelledBy: by, holdUntil: null, updatedAt: at, ...(refund ? { refund } : {}),
          history: [...(b.history || []), { at, what: what ? `cancelled and ${what}` : "cancelled", by }].slice(-20) };
        await freeTime(id, b, changes, { giftBack, packBack });
        await syncCalendar(id, { ...b, ...changes });
        const cardWordsBack = !refund ? "" : refund.amountMinor < onCard ? `${moneyWords(refund.amountMinor, b.currency)} of your ${b.payment === "deposit" && !b.rest ? "deposit" : "payment"} is being refunded to your card.` : `Your ${b.payment === "deposit" && !b.rest ? "deposit" : "payment"} is being refunded to your card.`;
        if (req.body?.notify !== false && b.status === "confirmed") await tellCustomer(id, { ...b, ...changes }, "cancelled", { byShop: true, refundText: `${cardWordsBack}${giftBack ? giftBackWords(b) : ""}${packBack ? packBackWords(b) : ""}`.trim() });
        return res.status(200).json({ ok: true, refunded: !!refund, refundMinor: refund?.amountMinor || 0, ...(giftBack ? { giftBackMinor: b.giftCard.amountMinor } : {}), ...(packBack ? { packBack: true } : {}) });
      }
      if (op === "move") {
        if (b.status !== "confirmed") return fail(res, 409, "Only a confirmed booking can be moved.");
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a new time.");
        const own = ownerBookingSettings(settings);
        // A class keeps its places when one of its people is moved: they may join another start of the same class.
        const theirs = (await readServices()).find((s) => s.id === b.serviceId);
        // The same person unless the owner picks another ("" for anyone free).
        const staffId = req.body?.staffId === undefined ? undefined : String(req.body.staffId || "");
        if (staffId && !keptPerson(settings, b.serviceId, staffId)) return fail(res, 400, "That person doesn't do this service.", "staff");
        const moved = await moveTime(id, b, { id: b.serviceId, places: theirs?.places || 1, minutes: b.minutes, gapAfter: b.gapAfter || 0, roomId: theirs?.roomId || "" }, own, start, { by, staffId });
        if (!moved) return fail(res, 409, isClass(theirs) ? "That class is full, or the time clashes with another booking." : staffId ? "That person is busy then." : "That time clashes with another booking.", "taken");
        // A new link: the old one in the customer's first email still works, since the key is unchanged.
        const movedTo = await syncCalendar(id, { ...b, ...moved });
        if (req.body?.notify !== false) await tellCustomer(id, movedTo, "moved", { byShop: true });
        return res.status(200).json({ ok: true });
      }
      if (op === "chargeFee") {
        // The missed-booking fee, on the card the customer saved when booking: once, at most the fee they agreed to.
        const nowMs = now().getTime();
        if (!feeChargeable(b, nowMs)) {
          if (b.fee) return fail(res, 409, "The fee for this booking is already charged.", "charged");
          if (!b.card) return fail(res, 409, "No card is kept for this booking.", "no_card");
          return fail(res, 409, b.status === "cancelled" ? "The customer cancelled in time, so there is no fee." : "The fee can be charged once the booking has started.", "too_soon");
        }
        const amount = req.body?.amountMinor === undefined ? b.lateFeeMinor : Number(req.body.amountMinor);
        if (!Number.isInteger(amount) || amount < 50 || amount > b.lateFeeMinor) return fail(res, 400, `The fee is between ${moneyWords(50, b.currency)} and ${moneyWords(b.lateFeeMinor, b.currency)}, the amount they agreed to.`);
        // A second tap while the first is still with the card company waits rather than charging twice.
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = (await tx.get(bookings().doc(id))).data() || {};
          if (fresh.fee || Date.parse(fresh.feeCharging || "") > nowMs - FEE_CLAIM_MS) return false;
          tx.set(bookings().doc(id), { feeCharging: new Date(nowMs).toISOString() }, { merge: true });
          return true;
        });
        if (!claimed) return fail(res, 409, "This fee is already being charged. Give it a moment.", "charging");
        const reason = b.status === "cancelled" ? "late cancellation" : "missed booking";
        let intent;
        try {
          const checkout = await payments.standaloneCheckout(b.card.mode === "test" ? "test" : "live");
          if (!checkout?.chargeSaved) throw Object.assign(new Error("This shop's card provider can't charge a saved card."), { code: "not_available" });
          intent = await checkout.chargeSaved({
            customer: b.card.customer, paymentMethod: b.card.paymentMethod, amountMinor: amount, currency: String(b.currency || currency()).toLowerCase(),
            description: `${shopName() ? `${shopName()}: ` : ""}${b.serviceName}, ${reason} fee`.slice(0, 250), metadata: { booking: id, fee: reason },
          }, `booking-fee-${id}-${amount}`);
        } catch (err) {
          const at = now().toISOString();
          const declined = err?.statusCode === 402 || err?.type === "StripeCardError" || /card_declined|authentication_required|expired_card|insufficient_funds|incorrect_cvc/.test(String(err?.code || err?.decline_code || ""));
          await bookings().doc(id).set({ feeCharging: null, ...(declined ? { history: [...(b.history || []), { at, what: "fee declined by the card", by }].slice(-20) } : {}) }, { merge: true });
          console.error(`Booking ${id} fee failed:`, err?.type || "", err?.code || "", err?.message || err);
          if (declined) return fail(res, 402, err?.code === "authentication_required"
            ? "Their bank wants them to approve this charge themselves, so nothing was taken. Ask them to pay another way."
            : "Their card was declined, so nothing was taken. Ask them to pay another way.", "declined");
          return fail(res, 502, "The fee couldn't be charged just now, and nothing was taken. Try again in a minute.");
        }
        const at = now().toISOString();
        const fee = { intent: intent?.id || null, amountMinor: amount, reason, at, by };
        const changes = { fee, feeCharging: null, updatedAt: at, history: [...(b.history || []), { at, what: `${reason} fee charged`, by }].slice(-20) };
        await bookings().doc(id).set(changes, { merge: true });
        if (req.body?.notify !== false) await tellCustomer(id, { ...b, ...changes }, "fee", { byShop: true, toOwner: false });
        return res.status(200).json({ ok: true, fee });
      }
      if (op === "readerCharge" || op === "readerCheck" || op === "readerCancel" || op === "readerTest") {
        const { reader } = await readerDesk();
        if (!reader) return fail(res, 409, "Card readers work with Stripe for now.", "not_available");
        const state = (x) => ({ ok: true, state: x.readerOpen ? "waiting" : x.rest?.reader ? "paid" : "idle", error: x.readerOpen ? "" : String(x.readerError || ""), dueMinor: balanceDue(x) });
        try {
          if (op === "readerCheck") return res.status(200).json(state(await refreshReader(id, b, reader)));
          if (op === "readerCancel") {
            if (!b.readerOpen || !b.readerCharge) return res.status(200).json(state(b));
            await reader.cancel(b.readerCharge.readerId, b.readerCharge.intent);
            // Read once more: a card tapped just before the cancel still counts.
            b = await refreshReader(id, b, reader, { stopped: "" });
            if (b.readerOpen) {
              const at = now().toISOString();
              const changes = { readerOpen: false, readerCharge: null, readerError: "", updatedAt: at, history: [...(b.history || []), { at, what: "card reader payment cancelled", by }].slice(-20) };
              await bookings().doc(id).set(changes, { merge: true });
              b = { ...b, ...changes };
            }
            return res.status(200).json(state(b));
          }
          if (op === "readerTest") {
            if (!reader.testMode) return fail(res, 409, "Test cards work in test mode only.", "test_only");
            if (!b.readerOpen || !b.readerCharge) return fail(res, 409, "Send the payment to the reader first.", "not_waiting");
            await reader.testCard(b.readerCharge.readerId);
            return res.status(200).json(state(await refreshReader(id, b, reader)));
          }
          // readerCharge: what is left, sent to one reader.
          const readerId = String(req.body?.readerId || "");
          if (!READER_ID.test(readerId)) return fail(res, 400, "Choose a card reader.");
          if (b.readerOpen) {
            b = await refreshReader(id, b, reader);
            if (b.readerOpen) return fail(res, 409, "A payment is already on a card reader. Finish or cancel it first.", "reader_busy");
          }
          // A pay link still open would let them pay twice: close it first (a payment that already came in counts).
          b = await settleRest(id, b);
          if (b.paid || !restPayable(b)) return fail(res, 409, b.rest || b.paid ? "This booking is already paid in full." : "Nothing is left to pay for this booking.", "nothing_due");
          const amountMinor = balanceDue(b);
          const tries = Math.max(0, Number(b.readerTries) || 0) + 1;
          const description = `${shopName() ? `${shopName()}: ` : ""}${b.serviceName} (${b.customer?.name || "desk"})`.slice(0, 250);
          // Counted before the reader is asked, so a try that failed never hands back its stopped payment.
          await bookings().doc(id).set({ readerTries: tries }, { merge: true });
          const started = await reader.charge({ readerId, amountMinor, currency: b.currency || currency(), description, metadata: { booking: id, rest: "1", reader: "1" } }, `booking-reader-${id}-${amountMinor}-${tries}`);
          const at = now().toISOString();
          const changes = { readerOpen: true, readerTries: tries, readerError: "", readerCharge: { intent: started.intent, readerId, amountMinor, at }, updatedAt: at, history: [...(b.history || []), { at, what: `${moneyWords(amountMinor, b.currency || currency())} sent to the card reader`, by }].slice(-20) };
          await bookings().doc(id).set(changes, { merge: true });
          return res.status(200).json(state({ ...b, ...changes }));
        } catch (err) {
          console.warn("bookings: card reader:", op, id, err?.message || err);
          return fail(res, 502, readerWords(err, "The card reader couldn't be reached just now. Please try again."), "reader");
        }
      }
      if (op === "noShow" || op === "paidAtShop") {
        const at = now().toISOString();
        const changes = op === "noShow"
          ? { noShow: req.body?.value !== false, updatedAt: at, history: [...(b.history || []), { at, what: req.body?.value !== false ? "marked no-show" : "no-show taken off", by }].slice(-20) }
          : { paid: req.body?.value !== false, updatedAt: at, history: [...(b.history || []), { at, what: req.body?.value !== false ? (b.payment === "deposit" ? "rest marked paid at the shop" : "marked paid at the shop") : "paid mark taken off", by }].slice(-20) };
        // Only money due at the visit is marked here: a card booking is paid by its own payment page.
        if (op === "paidAtShop" && b.payment !== "atShop" && !(b.payment === "deposit" && b.depositPaid)) return fail(res, 409, "Nothing is due at the shop for this booking.");
        if (op === "paidAtShop" && req.body?.value !== false) {
          // A pay link still open would let them pay twice; a payment that already came in means it is paid.
          if (b.readerOpen) return fail(res, 409, "A payment is on the card reader. Cancel it there first.", "reader_busy");
          b = await settleRest(id, b);
          if (b.rest) return fail(res, 409, "They already paid the rest by card.", "paid_by_card");
        }
        await bookings().doc(id).set(changes, { merge: true });
        return res.status(200).json({ ok: true });
      }
      return fail(res, 400, "Unknown bookings action.");
    } catch (err) {
      console.error("bookingsAdmin failed:", op, err?.message || err);
      return fail(res, 502, "Bookings couldn't be saved just now. Please try again.");
    }
  }

  // ── The five-minute sweep ──────────────────────────────────────────────────────────────────────────────────────

  /** Payments the owner sent to a card reader and walked away from: kept when paid, stopped after READER_MINUTES. */
  async function sweepReaders(docs) {
    const { reader } = await readerDesk();
    if (!reader) return;
    for (const doc of docs) {
      let b = await refreshReader(doc.id, doc.data(), reader);
      if (!b.readerOpen || !(now().getTime() - Date.parse(b.readerCharge?.at || "") > READER_MINUTES * MINUTE)) continue;
      await reader.cancel(b.readerCharge.readerId, b.readerCharge.intent);
      b = await refreshReader(doc.id, b, reader, { stopped: "The card reader payment ran out of time." });
      if (!b.readerOpen) continue;
      const at = now().toISOString();
      await bookings().doc(doc.id).set({ readerOpen: false, readerCharge: null, readerError: "The card reader payment ran out of time.", updatedAt: at, history: [...(b.history || []), { at, what: "card reader payment ran out of time", by: "shop" }].slice(-20) }, { merge: true });
    }
  }

  /** Confirms paid holds and frees the time of holds that ran out (their payment page closed first). */
  async function sweepHolds() {
    if (!(await featureOn())) return { confirmed: 0, freed: 0 };
    await sweepPacks().catch((err) => console.warn("bookings: the packs sweep failed:", err?.message || err));
    const [snap, rests, onReaders] = await Promise.all([bookings().where("status", "==", "held").limit(100).get(), bookings().where("restOpen", "==", true).limit(100).get(), bookings().where("readerOpen", "==", true).limit(50).get()]);
    if (!onReaders.empty) await sweepReaders(onReaders.docs).catch((err) => console.warn("bookings: the card reader sweep failed:", err?.message || err));
    if (snap.empty && rests.empty) return { confirmed: 0, freed: 0 };
    const { checkout } = await standalone();
    // Pay-the-rest pages: keep a payment that came in; once every page has run out, stop looking.
    for (const doc of rests.docs) {
      const b = await refreshRest(doc.id, doc.data(), checkout);
      if (!b.restOpen || b.rest) continue;
      if ((b.restPages || []).every((p) => !(Date.parse(p?.until || "") > now().getTime())) || b.status !== "confirmed") await settleRest(doc.id, b);
    }
    let confirmed = 0;
    let freed = 0;
    const nowMs = now().getTime();
    for (const doc of snap.docs) {
      let b = doc.data();
      b = await refreshHeld(doc.id, b, checkout);
      if (b.status === "confirmed") { confirmed += 1; continue; }
      if (Date.parse(b.holdUntil || "") > nowMs) continue;
      // A slower way to pay (a bank debit) finishes the page but clears later: keep the time for it until the booking starts.
      if (Date.parse(b.start || "") > nowMs && (await paymentClearing(b, checkout))) {
        if (!b.clearing) await bookings().doc(doc.id).set({ clearing: true, history: [...(b.history || []), { at: now().toISOString(), what: "payment clearing", by: "customer" }].slice(-20) }, { merge: true });
        continue;
      }
      // Close every page first, then read once more: a payment that landed just before the close still counts.
      for (const sid of b.sessions || []) if (SESSION_ID.test(sid)) await checkout?.close(sid).catch(() => {});
      b = await refreshHeld(doc.id, b, checkout);
      if (b.status === "confirmed") { confirmed += 1; continue; }
      const at = now().toISOString();
      await freeTime(doc.id, b, { status: "cancelled", cancelledAt: at, cancelledBy: "hold ran out", holdUntil: null, pendingKey: null, updatedAt: at,
        history: [...(b.history || []), { at, what: b.clearing ? "payment didn't clear" : "not paid in time", by: "shop" }].slice(-20) });
      if (b.clearing) await tellCustomer(doc.id, b, "notCleared", { byShop: true, toOwner: true });
      freed += 1;
    }
    return { confirmed, freed };
  }

  /**
   * Emails each confirmed customer once, about a day before their booking. Skips bookings made in the last
   * REMINDER_SKIP_HOURS (the confirmation is fresh) and ones starting within the hour. Marks before sending, so a
   * second sweep never sends twice.
   */
  async function sweepReminders() {
    if (!(await featureOn())) return { reminded: 0 };
    const { reminderHours } = await readSettings();
    if (!reminderHours) return { reminded: 0 };
    const nowMs = now().getTime();
    const snap = await bookings().where("status", "==", "confirmed").limit(1000).get();
    let reminded = 0;
    for (const doc of snap.docs) {
      const b = doc.data();
      const start = Date.parse(b.start || "");
      if (b.reminderSentAt || !Number.isFinite(start)) continue;
      if (start - nowMs > reminderHours * HOUR || start - nowMs < Math.min(HOUR, reminderHours * HOUR / 2)) continue;
      if (nowMs - Date.parse(b.createdAt || "") < Math.min(REMINDER_SKIP_HOURS, reminderHours / 2) * HOUR) continue;
      // Its own link, so the customer can cancel or move from the reminder; the first email's link keeps working.
      const key = randomKey();
      await bookings().doc(doc.id).set({ reminderSentAt: new Date(nowMs).toISOString(), reminderKeyHash: hash(key) }, { merge: true });
      await tellCustomer(doc.id, b, "reminder", { byShop: true, key });
      reminded += 1;
    }
    return { reminded };
  }

  /**
   * The second, shorter reminder (`secondReminderHours`, off unless the owner picks it): once, a few hours before, with
   * its own key (`reminder2KeyHash`). Never for a booking made inside those hours. Marked before sending.
   */
  async function sweepSecondReminders() {
    if (!(await featureOn())) return { reminded: 0 };
    const { secondReminderHours } = await readSettings();
    if (!secondReminderHours) return { reminded: 0 };
    const nowMs = now().getTime();
    // By start time alone (one field, no new index); the status is checked here.
    const snap = await bookings().where("start", ">=", new Date(nowMs).toISOString()).where("start", "<=", new Date(nowMs + secondReminderHours * HOUR).toISOString()).limit(500).get();
    let reminded = 0;
    for (const doc of snap.docs) {
      const b = doc.data();
      if (b.status !== "confirmed" || !secondReminderDue(b, secondReminderHours, nowMs)) continue;
      const key = randomKey();
      await bookings().doc(doc.id).set({ reminder2SentAt: new Date(nowMs).toISOString(), reminder2KeyHash: hash(key) }, { merge: true });
      await tellCustomer(doc.id, b, "soon", { byShop: true, key });
      reminded += 1;
    }
    return { reminded };
  }

  /**
   * The owner's morning list (`dailySummary`): from DAILY_SUMMARY_HOUR in the shop's time zone, one email naming the day's
   * bookings in time order. Claimed per day in `bookingSettings/summary` first, so two sweeps never send twice; a day with
   * nothing booked sends nothing.
   */
  async function sweepSummary() {
    if (!(await featureOn())) return { sent: false };
    const settings = await readSettings();
    const owner = ownerEmail();
    if (!settings.dailySummary || !owner || !EMAIL.test(owner)) return { sent: false };
    const nowMs = now().getTime();
    const mark = db.collection("bookingSettings").doc("summary");
    const day = await db.runTransaction(async (tx) => {
      const snap = await tx.get(mark);
      const due = summaryDue(nowMs, zone(), snap.exists ? String(snap.data()?.day || "") : "");
      if (due) tx.set(mark, { day: due, at: new Date(nowMs).toISOString() });
      return due;
    });
    if (!day) return { sent: false };
    const from = new Date(zonedTime(day, "00:00", zone())).toISOString();
    const to = new Date(zonedTime(addDays(day, 1), "00:00", zone())).toISOString();
    const snap = await bookings().where("start", ">=", from).where("start", "<", to).orderBy("start").limit(300).get();
    const list = snap.docs.map((d) => d.data()).filter((b) => b.status === "confirmed" || b.status === "held");
    if (!list.length) return { sent: false, day };
    try {
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const time = (iso) => new Date(iso).toLocaleTimeString("en-CA", { timeZone: zone(), hour: "numeric", minute: "2-digit" });
      const dayWords = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
      const rows = list.map((b) => {
        const due = balanceDue(b);
        const extra = [withWhom(b), b.status === "held" ? "not confirmed yet" : "", due ? `${moneyWords(due, b.currency)} to pay at the visit` : "", b.customer?.phone || ""].filter(Boolean).join(" · ");
        return `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;white-space:nowrap;"><strong>${escapeHtml(time(b.start))}</strong></td>
          <td style="padding:8px 0;vertical-align:top;"><strong>${escapeHtml(b.customer?.name || "")}</strong> · ${escapeHtml(b.serviceName || "")}${extra ? `<br><span style="opacity:.75;">${escapeHtml(extra)}</span>` : ""}${b.note ? `<br><em>“${escapeHtml(b.note)}”</em>` : ""}</td></tr>`;
      }).join("");
      await sendEmail({
        to: owner,
        subject: `[BOOKINGS] Today: ${list.length} ${list.length === 1 ? "booking" : "bookings"}, first at ${time(list[0].start)}`,
        html: risoLayout(`<h4 style="margin:0 0 8px;">Today's bookings</h4>
          <h2 style="margin:0 0 12px;">${escapeHtml(dayWords)}</h2>
          <table role="presentation" style="border-collapse:collapse;width:100%;">${rows}</table>
          ${risoButton(escapeHtml(siteLink("/admin#bookings")), "Open Bookings", brand.accent, brand.theme)}
          <p style="margin:16px 0 0;font-size:13px;opacity:.75;">You get this each morning there are bookings. Turn it off in Bookings › Hours &amp; rules.</p>`,
          { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
      });
      return { sent: true, day, count: list.length };
    } catch (err) {
      console.warn("Bookings day summary failed:", err?.message || err);
      return { sent: false, day };
    }
  }

  /**
   * The "Add a tip" email, once per visit, TIP_ASK_HOURS after it ended (within a day of that), for a shop that asks for
   * tips. Only kept, priced visits with no tip yet; marked before sending, so a second sweep never sends twice.
   */
  async function sweepTips() {
    if (!(await featureOn())) return { asked: 0 };
    const settings = await readSettings();
    if (!settings.tips) return { asked: 0 };
    const nowMs = now().getTime();
    const from = new Date(nowMs - (TIP_ASK_HOURS + 24) * HOUR).toISOString();
    const to = new Date(nowMs - TIP_ASK_HOURS * HOUR).toISOString();
    // One range on the end time needs no extra index; the status is checked below.
    const snap = await bookings().where("end", ">=", from).where("end", "<=", to).limit(500).get();
    let asked = 0;
    for (const doc of snap.docs) {
      const b = doc.data();
      if (b.tipAskedAt || !tipOpen(b, true, nowMs)) continue;
      const key = randomKey();
      await bookings().doc(doc.id).set({ tipAskedAt: new Date(nowMs).toISOString(), tipKeyHash: hash(key) }, { merge: true });
      await tellCustomer(doc.id, b, "tip", { byShop: true, toOwner: false, key });
      asked += 1;
    }
    return { asked };
  }

  return { handlePublic, handleAdmin, sweepHolds, sweepReminders, sweepSecondReminders, sweepSummary, sweepWaitlist, sweepTips, featureOn, pickupCheck };
}

/** A pickup time checkout can't take; `code` goes back to the shop's page with the words. */
class PickupTimeProblem extends Error {
  constructor(message, code) { super(message); this.name = "PickupTimeProblem"; this.code = code; this.pickupTime = true; }
}
/** How long an unpaid checkout keeps its place in a pickup slot. */
const PICKUP_UNPAID_HOURS = 2;
/** A stored time (Firestore Timestamp, Date, ISO text or milliseconds) in milliseconds; 0 when unreadable. */
const whenMs = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const n = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The owner's calendar feed for frontDoor.js: every booking from a month back, as one calendar Google or Apple Calendar
 * subscribes to. `db` is the database root; only shops/<shopId>/… is read. null when the link is wrong or Bookings is off.
 */
async function bookingsFeed({ db, shopId, token, shopName = "", nowMs = Date.now() }) {
  if (!KEY.test(String(token || ""))) return null;
  const shop = db.collection("shops").doc(shopId);
  const [features, feed] = await Promise.all([shop.collection("platform").doc("features").get(), shop.collection("bookingFeed").doc("main").get()]);
  if (features.data()?.bookings !== true || !sameHash(feed.data()?.token, token)) return null;
  const snap = await shop.collection("bookings").where("status", "in", ["confirmed", "held"]).limit(2000).get();
  const from = nowMs - 31 * 24 * HOUR;
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => Date.parse(b.end || "") >= from)
    .map((b) => ({
      id: b.id, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "",
      title: `${b.customer?.name || "Booking"}: ${b.serviceName || "Booking"}${b.staffName ? ` (${b.staffName})` : ""}${b.status === "held" ? " (not paid yet)" : ""}`,
      details: [b.customer?.email, b.customer?.phone, b.meetUrl ? `Video call: ${b.meetUrl}` : "", b.note ? `“${b.note}”` : "", ...(b.answers || []).map((a) => `${a.label}: ${a.answer}`)].filter(Boolean).join("\n"),
    }));
  return bookingsFeedIcs(shopName ? `${shopName} bookings` : "Bookings", events, nowMs);
}

/** One booking as a calendar file, for the customer's "Add to Apple Calendar" link. null for a wrong link or a cancelled booking. */
async function customerBookingIcs({ db, shopId, id, key, shopName = "", nowMs = Date.now() }) {
  if (!ID.test(String(id || "")) || !KEY.test(String(key || ""))) return null;
  const shop = db.collection("shops").doc(shopId);
  const [features, snap] = await Promise.all([shop.collection("platform").doc("features").get(), shop.collection("bookings").doc(id).get()]);
  const b = snap.exists ? snap.data() : null;
  if (features.data()?.bookings !== true || !b || b.status !== "confirmed") return null;
  if (!keyFits(b, key)) return null;
  return bookingIcs({ id, title: shopName ? `${b.serviceName} · ${shopName}` : b.serviceName, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "", nowMs });
}

const HOUR = 60 * 60 * 1000;
/** The booking's own link, the reminder's, the tip email's or the owner's pay link: each opens the customer's booking page. */
const keyFits = (b, key) => [b.manageKeyHash, b.reminderKeyHash, b.reminder2KeyHash, b.tipKeyHash, b.payKey ? hash(b.payKey) : ""].some((h) => h && sameHash(h, hash(key)));
/** How long a page to pay the rest stays open, and how long before its end a fresh one is opened instead. */
const REST_PAGE_MINUTES = 60;
/** A payment sent to a card reader and left waiting is stopped after this long (the sweep). */
const READER_MINUTES = 15;
const REST_REUSE_MINUTES = 15;
/** The "Add a tip" email goes this many hours after a visit ends. */
const TIP_ASK_HOURS = 2;
/** "Visa ending 4242", or "Your card" when its brand and number weren't read. */
const cardWords = (card) => (card?.last4 ? `${card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card"} ending ${card.last4}` : "Your card");
const moneyWords = (minor, currency) => new Intl.NumberFormat("en-CA", { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(minor / 100);
const REMINDER_SKIP_HOURS = 6;

const PUBLIC_BOOKING_ACTIONS = Object.freeze(["bookingInfo", "bookingTimes", "bookingCode", "bookingGiftCard", "bookingStart", "bookingView", "bookingCancel", "bookingMove", "bookingWait", "bookingPayRest", "bookingTip", "bookingPackBuy", "bookingPackView", "bookingPack", "pickupTimes"]);

module.exports = { PickupTimeProblem, bookingsFeed, customerBookingIcs, bookingActions, busyFrom, cleanCustomer, publicBooking, PUBLIC_BOOKING_ACTIONS, HOLD_MINUTES };
