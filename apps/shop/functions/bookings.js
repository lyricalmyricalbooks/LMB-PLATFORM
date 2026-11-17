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
//                            staffId? and staffName? (who takes it, when the shop lists people), roomId? and roomName? (the room it uses),
//                            checkInCode? ("K7QM-2XPA", given once confirmed: in its emails and on its page) and checkedInAt? (the
//                            shop typed or scanned it at the till, op checkIn) }
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
//   bookingEarlier/{bookingId} { bookingId, serviceId, serviceName, start, name, email, createdAt, passed[], offerStart?,
//                          offerUntil?, offerKeyHash? }: a client who asked to hear if a time earlier than their own
//                          one-to-one booking opens (Services plan 2, B5). Server-only. A freed earlier time goes to the
//                          first who asked: held for them EARLIER_HOLD_MINUTES (an `offer_e_<id>` item) and emailed with a
//                          link that moves their booking to it. A hold they let run out passes on; the time joins `passed`.
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
  cleanService, cleanBookingSettings, cleanAnswers, freeTimes, isClass, isCourse, joinableCourse, runDecisionDue, classStartsOn, courseStarts, coursePlacesLeft, daysTouched, addDays, dayOf, isDay, customerCanChange,
  googleCalendarLink, bookingsFeedIcs, bookingIcs, MAX_SERVICES, depositOf, cardAsk, cardTaken, giftCardPart, giftTaken, bookedCardTaken, restTaken, balanceDue, restPayable, feeChargeable, tipTaken, tipFits, tipOpen, tipLimitMinor,
  secondReminderDue, summaryDue, thanksDue, rebookDue, reviewOpen, cleanVisitReview, REBOOK_WINDOW_DAYS, zonedTime, offersPack, packLeft, packProblem, packEndsOn, PACK_MESSAGES, MIN_CARD_MINOR,
  pickupSlots, pickupTimeProblem, PICKUP_MESSAGES, PICKUP_DAYS_AHEAD,
  whoIsFree, booksByPerson, classPlacesLeft, keptPerson, forPerson, ownerBookingSettings, cleanCheckInCode, checkInCodeFrom,
  cleanRun, runStarts, runSettings, runsOnline, withExtras,
} = require("./shared/bookingTimes");
const { waysAllowed, waysOn } = require("./shared/waysToSell");
const { bookingDiscountMinor, tooSmallForCard, BookingCodeProblem } = require("./bookingDiscount");
const { emailIdentity } = require("./discountClaims");
const { findCountry, regionCode } = require("./shared/shippingZones");
const { giftCardId, last4, giftCardProblem, availableMinor, withHistory, GIFT_CARD_MESSAGES } = require("./giftCards");

const HOLD_MINUTES = 10;
/** How long a pack's card page stays open. An unpaid pack is forgotten once it closes. */
const PACK_PAGE_MINUTES = 60;
/** A pack's code: 12 letters and digits with nothing that reads two ways, as "ABCD-EFGH-JKLM". */
const PACK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/**
 * Whether the booking engine runs for a shop (`shop`: anything with `.collection`, the shop's own folder): Bookings is on
 * (`platform/features.bookings`), or Classes is (the platform's switch and the owner's, shared/waysToSell). The owner's
 * record is read only when the platform allows Classes.
 */
async function engineOn(shop) {
  const features = await shop.collection("platform").doc("features").get().catch(() => null);
  const data = features?.exists === true ? features.data() : null;
  if (data?.bookings === true) return true;
  if (!waysAllowed(data).includes("classes")) return false;
  const start = await shop.collection("firstWeek").doc("start").get().catch(() => null);
  return waysOn(data, start?.exists === true ? start.data() : null).includes("classes");
}

/** Whether the shop sells Classes: the platform allows it and the owner switched it on (shared/waysToSell). */
async function classesOn(shop) {
  const features = await shop.collection("platform").doc("features").get().catch(() => null);
  const data = features?.exists === true ? features.data() : null;
  if (!waysAllowed(data).includes("classes")) return false;
  const start = await shop.collection("firstWeek").doc("start").get().catch(() => null);
  return waysOn(data, start?.exists === true ? start.data() : null).includes("classes");
}
/** A class the website's Timetable lists: customers can book it, it has places for a group, and it runs at set weekly times. */
const onTimetable = (s) => s.active && isClass(s) && s.classTimes.length > 0;
// A course on the Timetable page: active, and still open to sign up for (before it starts, or late while it lets people
// join late with dates left).
const courseOpen = (s, zone, nowMs) => s.active && isCourse(s) && joinableCourse(s, zone, nowMs) !== null;
/**
 * The stretches a booking holds on the days' ledger: one for an ordinary booking (under its own id), and one for each
 * session of a course (the first under the id, the rest under `<id>~<n>`).
 */
function spansOf(id, b) {
  const first = Date.parse(b.start);
  const length = Date.parse(b.end) - first + (b.gapAfter || 0) * MINUTE;
  const starts = Array.isArray(b.course?.starts) && b.course.starts.length ? b.course.starts.map((iso) => Date.parse(iso)) : [first];
  return starts.map((start, n) => ({ key: n ? `${id}~${n}` : id, start, end: start + length }));
}

/** When a booking happens, as it is in a calendar: once, or on each date of a course (no tidy-up time). */
function datesOf(b) {
  const first = Date.parse(b.start);
  const length = Date.parse(b.end) - first;
  const starts = Array.isArray(b.course?.starts) && b.course.starts.length ? b.course.starts.map((iso) => Date.parse(iso)) : [first];
  return starts.map((start) => ({ start, end: start + length }));
}

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
/** The most sign-ups read for one class time (a class has at most 100 places). */
const MAX_PLACES_READ = 300;
/** The most one payment taken at the desk may be (a typo guard: $10,000). */
const WALK_IN_MAX_MINOR = 1_000_000;
/** How many people may wait for one day of one service. */
const MAX_WAITING = 30;
/** A waiting-list hold the sweep never got to stops blocking its place this long after its end. */
const OFFER_GRACE_MS = 15 * 60 * 1000;
const WAIT_ID = /^[a-f0-9]{32}$/;
const PACK_ID = /^[a-f0-9]{40}$/;
const offerItem = (wid) => `offer_${wid}`;
/** "Tell me if an earlier time opens": the held earlier time's item on its days, and how long it is held. */
const earlierItem = (bookingId) => `offer_e_${bookingId}`;
const EARLIER_HOLD_MINUTES = 30;
/** The most people one freed time is checked against for an earlier time (first asked first). */
const MAX_EARLIER_READ = 100;
const ID = /^[A-Za-z0-9_-]{6,40}$/;
const KEY = /^[a-f0-9]{48}$/;
// Stripe smart readers (tmr_…) and Square Terminals (sqdev_<device id>, payments/square.js).
const READER_ID = /^(tmr_[A-Za-z0-9_]{1,100}|sqdev_[A-Za-z0-9:_-]{1,192})$/;
/** A fee being charged stops a second tap for this long, in case the first one never finished. */
const FEE_CLAIM_MS = 2 * MINUTE;
const SESSION_ID = /^(cs_[A-Za-z0-9_]{8,200}|sqlink_[A-Za-z0-9_-]{1,192})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const text = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const hash = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** What is taken on the given days, as Busy stretches, leaving out `except` (a booking being moved; one id or several). */
function busyFrom(daySnaps, nowMs, except = "") {
  const busy = [];
  for (const snap of daySnaps) {
    const items = (snap.exists ? snap.data()?.items : null) || {};
    for (const [id, item] of Object.entries(items)) {
      if ((Array.isArray(except) ? except.includes(id) : id === except) || !item || !Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
      // A place held for the waiting list lasts until its own end (the owner picks how long); other holds STALE_HOLD_MS.
      if (item.offer && Number.isFinite(item.until) ? nowMs > item.until + OFFER_GRACE_MS : item.held && Number.isFinite(item.at) && nowMs - item.at > STALE_HOLD_MS) continue;
      busy.push({ start: item.start, end: item.end, serviceId: typeof item.s === "string" ? item.s : undefined,
        // Whose booking it is and which room it uses (staff and rooms); an older item without them blocks everyone.
        ...(typeof item.p === "string" && item.p ? { staffId: item.p } : {}), ...(typeof item.r === "string" && item.r ? { roomId: item.r } : {}),
        // A class time cancelled for too few people (sweepMinimum): it closes that class then, nothing else.
        ...(item.closed === true ? { closed: true } : {}) });
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
  const phone = text(body?.phone, 40);
  // Text reminders only with a number and the client's own tick (the shop's switch is checked when sending).
  return { name, email, phone, textOk: body?.textOk === true && /\d{7}/.test(phone.replace(/\D/g, "")), note: typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "" };
}

/** A booking's add-ons in words ("Deep conditioning, Long hair"), "" with none. */
function extrasWords(b) {
  return (Array.isArray(b.extras) ? b.extras : []).map((e) => e?.name).filter((n) => typeof n === "string" && n).join(", ");
}

/** What the customer's page may see of a booking (never the payment ids or the key's hash). */
function publicBooking(id, b, settings, nowMs) {
  const start = Date.parse(b.start);
  return {
    id, serviceId: b.serviceId, serviceName: b.serviceName, minutes: b.minutes, location: b.location || "", start: b.start, end: b.end,
    staffId: b.staffId || "", staffName: b.staffName || "",
    ...(Array.isArray(b.extras) && b.extras.length ? { extras: b.extras.map((e) => ({ id: e.id, name: e.name, minutes: e.minutes, priceMinor: e.priceMinor })) } : {}),
    // A course: every one of its dates (the first is `start`).
    ...(Array.isArray(b.course?.starts) && b.course.starts.length > 1 ? { courseStarts: b.course.starts } : {}),
    // A standing appointment: which visit of the run this is.
    ...(b.series?.id ? { run: { visit: b.series.visit || 1, visits: b.series.visits || 1, everyWeeks: b.series.everyWeeks || 1 } } : {}),
    meetUrl: b.status === "confirmed" ? b.meetUrl || "" : "",
    status: b.status, payment: b.payment, paid: !!b.paid, priceMinor: b.priceMinor || 0, currency: b.currency,
    // Sales tax: the part of priceMinor that is tax.
    taxMinor: b.taxMinor || 0,
    // A discount code: what it took off the service's price (priceMinor is already after it).
    discountCode: b.discount?.code || "", discountMinor: b.discount?.amountMinor || 0,
    // A gift card: its last four and what it paid (never its id), and whether that went back onto it.
    giftCardLast4: b.giftCard?.last4 || "", giftMinor: b.giftCard?.amountMinor || 0, giftReturned: !!b.giftCard?.returned,
    // A pack of visits: its last four, and which visit of how many this is (never the pack's id).
    packLast4: b.pack?.last4 || "", packVisit: b.pack?.visit || 0, packVisits: b.pack?.visits || 0, packReturned: !!b.pack?.returned,
    depositMinor: b.payment === "deposit" ? b.depositMinor || 0 : 0, depositPaid: !!b.depositPaid, dueMinor: balanceDue(b),
    name: b.customer?.name || "", email: b.customer?.email || "", refunded: !!b.refund?.amountMinor,
    canChange: b.status === "confirmed" && customerCanChange(start, settings, nowMs),
    // A course is one sign-up for all of its dates: it can be cancelled online, never moved.
    canMove: b.status === "confirmed" && customerCanChange(start, settings, nowMs) && !b.course,
    // "Tell me if an earlier time opens": a one-to-one visit still ahead (never a class or a course).
    canEarlier: b.status === "confirmed" && start > nowMs && !b.course, earlier: b.earlierWanted === true,
    cancelHours: settings.cancelHours,
    // Card on file: only whether one is kept, its last four and the fee (never its ids).
    cardHold: !!b.cardHold, lateFeeMinor: b.cardHold ? b.lateFeeMinor || 0 : 0, cardLast4: b.card?.last4 || "", feeMinor: b.fee?.amountMinor || 0,
    // Pay the rest: whether what is left can be paid by card here, and what was.
    canPayRest: restPayable(b), restPaidMinor: restTaken(b),
    // Tips: the choices (when the shop asks for them), whether a tip can be added on its own, and the tip given.
    tipPercents: settings.tips && (b.priceMinor || 0) > 0 ? settings.tipPercents : [], canTip: tipOpen(b, settings.tips, nowMs) && !restPayable(b),
    tipMinor: tipTaken(b), tipLimitMinor: tipLimitMinor(b.priceMinor || 0),
    // The code to show at the desk, while the visit is still to come; and whether the shop has checked them in.
    checkInCode: b.status === "confirmed" && Date.parse(b.end) > nowMs ? b.checkInCode || "" : "", checkedIn: !!b.checkedInAt,
    // A review of the visit on the shop's website: whether one can be written here, and whether it was.
    canReview: reviewOpen(b, settings, nowMs), reviewed: !!b.reviewId,
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
  // Sales tax on services (index.js): async () → (amountMinor) → { taxMinor, taxLines } at the shop's rate for where it
  // is (Settings › Taxes matched to Settings › General › Location), or null when the shop collects none. None: no tax.
  shopTax = null,
  // Rebook reminders (marketing mail): (email) → true when the client unsubscribed from such emails, and (email) → their
  // signed one-click unsubscribe link (may be async). Without both no rebook reminder is sent.
  optedOut = null,
  unsubscribeUrl = null,
  // Text-message reminders (textSender.js): { status() -> { available, price }, send({ to, body, kind, idempotencyKey }) }
  // through the platform, billed to the shop at cost. None: no texts, and the admin's switch says "Opening soon".
  texts = null,
}) {
  const services = () => db.collection("bookingServices");
  const settingsRef = () => db.collection("bookingSettings").doc("main");
  const bookings = () => db.collection("bookings");
  const dayRef = (day) => db.collection("bookingDays").doc(day);
  const waitlist = () => db.collection("bookingWaitlist");
  const earlierList = () => db.collection("bookingEarlier");
  const packs = () => db.collection("bookingPacks");

  // On when the platform turned Bookings on for the shop, or when the shop sells Classes (a way to sell, both of its
  // switches on): classes run on this same engine, so they bring its hours, team, rooms and Book a time page with them.
  async function featureOn() {
    return engineOn(db);
  }
  async function readSettings() {
    const snap = await settingsRef().get();
    return cleanBookingSettings(snap.exists ? snap.data() : null);
  }
  // The shop's pages show "Book a time" in the header, phone menu and footer while bookings are on. They learn it from
  // the public website settings they already read (`bookingsLive`), so no page asks this server on every visit. Only a
  // hint for showing a link: every booking action above still checks the real switch. A shop with no website settings
  // yet is left alone (a record holding only this would stand in for the starting design).
  // `classesLive` is the same hint for the Timetable page (/classes): bookings are on, the shop sells Classes and at
  // least one class runs at set weekly times.
  async function tellWebsite(live) {
    try {
      const ref = db.collection("settings").doc("website");
      const snap = await ref.get();
      if (!snap.exists) return;
      const had = snap.data() || {};
      const nowMs = now().getTime();
      const classes = live === true && (await classesOn(db)) && (await readServices()).some((s) => onTimetable(s) || courseOpen(s, zone(), nowMs));
      const changes = {};
      if ((had.bookingsLive === true) !== (live === true)) changes.bookingsLive = live === true;
      if ((had.classesLive === true) !== classes) changes.classesLive = classes;
      if (Object.keys(changes).length) await ref.set(changes, { merge: true });
    } catch (err) {
      console.warn("bookings: the website link wasn't updated:", err?.message || err);
    }
  }
  /**
   * The sales tax on `amountMinor` of a service with `chargeTax`, added on top of the price: { taxMinor, taxLines }, or
   * null when the service doesn't charge it or the shop has no rate for where it is. `calc` reuses one settings read.
   */
  async function taxOn(service, amountMinor, calc) {
    if (!service?.chargeTax || !(amountMinor > 0) || !shopTax) return null;
    const of = calc === undefined ? await shopTax() : calc;
    const tax = of ? of(amountMinor) : null;
    return tax && tax.taxMinor > 0 ? { taxMinor: tax.taxMinor, taxLines: Array.isArray(tax.taxLines) ? tax.taxLines : [] } : null;
  }
  const taxFields = (tax) => (tax ? { taxMinor: tax.taxMinor, taxLines: tax.taxLines } : {});
  // The tax line on a booking's emails: "Includes tax (HST ON): $13.00".
  const taxLinesWords = (b) => {
    if (!(b?.taxMinor > 0)) return "";
    const names = (Array.isArray(b.taxLines) ? b.taxLines : []).map((l) => l?.name).filter(Boolean).join(", ");
    return `<p style="margin:0 0 4px;"><strong>Includes tax${names ? ` (${escapeHtml(names)})` : ""}:</strong> ${escapeHtml(moneyWords(b.taxMinor, b.currency))}</p>`;
  };

  /** Approved reviews of visits for the website, newest first (at most 12; a source filter needs no extra index). */
  async function visitReviews() {
    const snap = await db.collection("reviews").where("source", "==", "booking").limit(300).get();
    return snap.docs.map((d) => d.data()).filter((r) => r.status === "approved")
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 12)
      .map((r) => ({ authorName: r.authorName || "", rating: r.rating, body: r.body || "", serviceName: r.serviceName || "", date: String(r.createdAt || "").slice(0, 10), reply: r.reply?.body || "" }));
  }
  async function readServices() {
    const snap = await services().limit(MAX_SERVICES).get();
    return snap.docs.map((d) => cleanService(d.data(), d.id)).filter((s) => !s.problem).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  /**
   * A service as a public action sees it: active, and a course as someone signing up now gets it (only the dates left,
   * at their price, when it lets people join late). A course that can't be joined any more comes back whole, so the
   * "already started" answer still applies. null when there is no such active service.
   */
  async function publicService(id) {
    const s = (await readServices()).find((x) => x.id === id && x.active);
    return s ? joinableCourse(s, zone(), now().getTime()) ?? s : null;
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
      b.customer?.email, b.customer?.phone, extrasWords(b) ? `Extras: ${extrasWords(b)}` : "", b.note ? `“${b.note}”` : "",
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

  function whenWords(b, at = b.start) {
    const start = new Date(at);
    const opts = { timeZone: zone() };
    const dayText = start.toLocaleDateString("en-CA", { ...opts, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeText = start.toLocaleTimeString("en-CA", { ...opts, hour: "numeric", minute: "2-digit" });
    return `${dayText} at ${timeText}`;
  }
  const manageUrl = (id, key) => siteLink(`/book?booking=${encodeURIComponent(id)}&key=${key}`);

  /** A confirmed booking's check-in code, made the first time it is needed (an email or the customer's page). */
  async function withCheckInCode(id, b) {
    if (!b || b.checkInCode || b.status !== "confirmed") return b;
    const checkInCode = checkInCodeFrom(crypto.randomBytes(8));
    await bookings().doc(id).set({ checkInCode }, { merge: true });
    return { ...b, checkInCode };
  }

  /** Emails the customer (and tells the owner) about a booking. `kind`: booked, moved, cancelled. Never throws. */
  async function tellCustomer(id, b, kind, { key = "", refundText = "", byShop = false, toOwner = !byShop, reviewUrl = "", siteReview = false, tooFew = false, run = [] } = {}) {
    try {
      const to = b.customer?.email;
      if (!to || !EMAIL.test(to)) return;
      if (!byShop && !(await claimEmailSend(db, "bookingEmail", to))) return;
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const when = whenWords(b);
      // A course lists every one of its dates.
      const dates = Array.isArray(b.course?.starts) && b.course.starts.length > 1
        ? `<p style="margin:12px 0 4px;"><strong>All ${b.course.starts.length} dates:</strong></p><ul style="margin:0 0 8px;padding-left:20px;">${b.course.starts.map((iso) => `<li>${escapeHtml(whenWords(b, iso))}</li>`).join("")}</ul>` : "";
      // A standing appointment lists every visit of the run when it is booked.
      const runDates = run.length > 1
        ? `<p style="margin:12px 0 4px;"><strong>All ${run.length} visits, every ${b.series?.everyWeeks === 1 ? "week" : `${b.series?.everyWeeks || ""} weeks`}:</strong></p><ul style="margin:0 0 8px;padding-left:20px;">${run.map((iso) => `<li>${escapeHtml(whenWords(b, iso))}</li>`).join("")}</ul><p style="margin:0 0 4px;font-size:13px;">Each visit gets its own reminder, and can be moved or cancelled on its own from your booking page.</p>` : "";
      const where = b.location ? `<p style="margin:0 0 4px;"><strong>Where:</strong> ${escapeHtml(b.location)}</p>` : "";
      const video = b.meetUrl && b.status !== "cancelled" ? `<p style="margin:0 0 4px;"><strong>Video call:</strong> <a href="${escapeHtml(b.meetUrl)}">Join with Google Meet</a></p>` : "";
      const arriving = ["booked", "moved", "reminder", "soon"].includes(kind);
      if (arriving) b = await withCheckInCode(id, b).catch(() => b);
      const checkIn = arriving && b.checkInCode ? `<p style="margin:16px 0 4px;"><strong>Check-in code:</strong> <span style="font-family:'DM Mono',Menlo,Consolas,monospace;font-size:20px;letter-spacing:.12em;">${escapeHtml(b.checkInCode)}</span></p>
        <p style="margin:0 0 4px;font-size:13px;">Show it at the desk when you arrive.${key ? " Your booking page has it as a code to scan." : ""}</p>` : "";
      const due0 = moneyWords(balanceDue(b), b.currency);
      const tipText = moneyWords(tipTaken(b), b.currency);
      const subject = { thanks: `Thank you for coming: ${b.serviceName}`, tip: `Thank you for coming: ${b.serviceName}`, tipPaid: `Tip received: ${b.serviceName}, ${when}`, payRest: `Left to pay: ${b.serviceName}, ${when}`, restPaid: `Paid in full: ${b.serviceName}, ${when}`, fee: `Fee charged: ${b.serviceName}, ${when}`, notCleared: `Not booked: ${b.serviceName}, ${when}`, reminder: `Coming up: ${b.serviceName}, ${when}`, soon: `Soon: ${b.serviceName}, ${when}`, booked: `Booked: ${b.serviceName}, ${when}`, moved: `Moved: ${b.serviceName}, now ${when}`, cancelled: `Cancelled: ${b.serviceName}, ${when}` }[kind];
      const lead = {
        fee: `${escapeHtml(shop)} charged ${escapeHtml(moneyWords(b.fee?.amountMinor || 0, b.currency))} to your card${b.card?.last4 ? ` ending ${escapeHtml(b.card.last4)}` : ""} for ${b.status === "cancelled" ? "cancelling late" : "missing"} this booking, as agreed when you booked. Questions? Just reply to this email.`,
        payRest: `There is ${escapeHtml(due0)} left to pay for your booking with ${escapeHtml(shop)}. You can pay it by card now, so there is nothing to pay at your visit.`,
        restPaid: `Thank you. You paid ${escapeHtml(moneyWords(restTaken(b), b.currency))} by card${tipTaken(b) ? `, with a ${escapeHtml(tipText)} tip` : ""}, so your booking with ${escapeHtml(shop)} is paid in full.`,
        thanks: `Thank you for visiting ${escapeHtml(shop)}. We hope to see you again soon.${reviewUrl || siteReview ? " If you have a moment, a short review helps others find us." : ""}`,
        tip: `Thank you for visiting ${escapeHtml(shop)}. If you'd like to thank the team, you can add a tip by card. It's up to you.${reviewUrl || siteReview ? " And if you have a moment, a short review helps others find us." : ""}`,
        tipPaid: `Thank you! Your ${escapeHtml(tipText)} tip for your visit to ${escapeHtml(shop)} has gone through.`,
        reminder: `A reminder of your booking with ${escapeHtml(shop)}. If you can't make it, please cancel or move it below so the time can go to someone else.`,
        soon: `Your booking with ${escapeHtml(shop)} is coming up soon. See you there.`,
        notCleared: `Your bank payment for this booking with ${escapeHtml(shop)} didn't clear in time, so the time has been released. Nothing was taken. You're welcome to book again.`,
        booked: `You're booked in with ${escapeHtml(shop)}.`,
        moved: `Your booking with ${escapeHtml(shop)} has moved.`,
        cancelled: `${tooFew ? `Not enough people signed up for this ${b.course ? "course" : "class"} to run, so ${escapeHtml(shop)} has cancelled it. Sorry for the change of plans.` : `Your booking with ${escapeHtml(shop)} is cancelled.`}${refundText ? ` ${escapeHtml(refundText)}` : ""}`,
      }[kind];
      const ended = kind === "cancelled" || kind === "notCleared" || kind === "fee" || kind === "tip" || kind === "tipPaid" || kind === "thanks";
      // What is paid and what is left to pay at the visit, on every email about a booking that is still on.
      const due = balanceDue(b);
      const taken = bookedCardTaken(b);
      const packLine = ended || !b.pack ? "" : `<p style="margin:0 0 4px;"><strong>Paid with your pack ••••${escapeHtml(b.pack.last4 || "")}:</strong> visit ${b.pack.visit || 1} of ${b.pack.visits || 1}</p>`;
      const money = ended || !(b.priceMinor > 0) ? packLine : [
        b.discount?.amountMinor ? `<p style="margin:0 0 4px;"><strong>Discount (${escapeHtml(b.discount.code)}):</strong> ${escapeHtml(moneyWords(b.discount.amountMinor, b.currency))} off</p>` : "",
        taxLinesWords(b),
        giftTaken(b) ? `<p style="margin:0 0 4px;"><strong>Gift card ••••${escapeHtml(b.giftCard.last4 || "")}:</strong> ${escapeHtml(moneyWords(giftTaken(b), b.currency))}</p>` : "",
        b.payment === "deposit" && taken ? `<p style="margin:0 0 4px;"><strong>Deposit paid:</strong> ${escapeHtml(moneyWords(taken, b.currency))}</p>` : "",
        due ? `<p style="margin:0 0 4px;"><strong>${kind === "payRest" ? "Left to pay" : "To pay at your visit"}:</strong> ${escapeHtml(moneyWords(due, b.currency))}</p>` : `<p style="margin:0 0 4px;"><strong>Paid:</strong> ${escapeHtml(moneyWords(b.priceMinor, b.currency))}</p>`,
      ].join("");
      // The card kept on file, and what missing the booking costs, on every email about a booking that is still on.
      const cancelHours = ended || !b.card ? 0 : (await readSettings().catch(() => null))?.cancelHours || 0;
      const held = ended || !b.card ? "" : `<p style="margin:0 0 4px;"><strong>Card on file:</strong> ${escapeHtml(cardWords(b.card))}. Missing this booking${cancelHours ? `, or cancelling less than ${cancelHours} hours before,` : ""} may cost ${escapeHtml(moneyWords(b.lateFeeMinor || 0, b.currency))}.</p>`;
      const calendar = ended ? "" : `<p style="margin:16px 0 0;"><a href="${escapeHtml(googleCalendarLink({ title: `${b.serviceName} · ${shop}`, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "" }))}">Add to Google Calendar</a>${key ? ` &nbsp;·&nbsp; <a href="${escapeHtml(siteLink(`/calendar/b/${encodeURIComponent(id)}/${key}.ics`))}">Add to Apple Calendar</a>` : ""}</p>`;
      const manage = (!ended || kind === "tip") && key ? risoButton(escapeHtml(manageUrl(id, key)), kind === "tip" ? "Add a tip" : kind === "payRest" ? `Pay ${due0}` : "See or change your booking", brand.accent, brand.theme) : "";
      // After the visit: leave a review (the shop's own link) and book the same service again.
      // On the shop's own website (Client reviews) when it takes them, through the booking page; else the shop's link.
      const afterVisit = kind === "thanks" || kind === "tip";
      const own = afterVisit && siteReview && key ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(manageUrl(id, key))}#review">Leave a review</a></p>` : "";
      const review = own || (reviewUrl && afterVisit ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(reviewUrl)}">Leave a review</a></p>` : "");
      const again = kind === "thanks" ? risoButton(escapeHtml(siteLink(b.serviceId ? `/book?service=${encodeURIComponent(b.serviceId)}` : "/book")), "Book again", brand.accent, brand.theme) : "";
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">${escapeHtml({ thanks: "Thanks for coming", tip: "Thanks for coming", tipPaid: "Tip received", payRest: "Left to pay", restPaid: "Paid in full", fee: "Fee receipt", notCleared: "Payment didn't clear", reminder: "See you soon", soon: "Starting soon", booked: "Booking confirmed", moved: "Booking moved", cancelled: "Booking cancelled" }[kind])}</h4>
        <h2 style="margin:0 0 12px;">${escapeHtml(b.serviceName)}</h2>
        <p style="margin:0 0 16px;">${lead}</p>
        <p style="margin:0 0 4px;"><strong>When:</strong> ${escapeHtml(when)}</p>
        <p style="margin:0 0 4px;"><strong>How long:</strong> ${b.minutes} minutes</p>
        ${extrasWords(b) ? `<p style="margin:0 0 4px;"><strong>Extras:</strong> ${escapeHtml(extrasWords(b))}</p>` : ""}
        ${b.staffName ? `<p style="margin:0 0 4px;"><strong>With:</strong> ${escapeHtml(b.staffName)}</p>` : ""}
        ${where}
        ${dates}
        ${runDates}
        ${video}
        ${money}
        ${held}
        ${checkIn}
        ${manage}
        ${again}
        ${review}
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
            ${extrasWords(b) ? `<p style="margin:0 0 4px;">Extras: ${escapeHtml(extrasWords(b))}</p>` : ""}
            ${runDates}
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

  async function busyAround(day, nowMs, except = "") {
    const snaps = await Promise.all([addDays(day, -1), day, addDays(day, 1)].map((d) => dayRef(d).get()));
    return busyFrom(snaps, nowMs, except);
  }
  /** The full starts of a class on one day: its own times that only lack a place (nothing else is in the way). */
  function fullClassTimes(service, settings, busy, day, nowMs) {
    if (!isClass(service)) return [];
    const others = busy.filter((b) => b.serviceId !== service.id);
    const open = new Set(freeTimes({ service, settings, busy, day, zone: zone(), nowMs }));
    return freeTimes({ service, settings, busy: others, day, zone: zone(), nowMs }).filter((ms) => !open.has(ms) && busy.some((b) => b.serviceId === service.id && b.start === ms && !b.closed));
  }

  /**
   * Holds a freed place for the first person waiting for it: an `offer_<id>` item on its days (so nobody else sees the
   * place), and the hold's end and key on their entry. false when the place went or they already have one.
   */
  function holdForWaiting(wid, service, settings, start, until, key) {
    return holdOffer({ ref: waitlist().doc(wid), item: offerItem(wid), service, settings, start, until, key });
  }
  /** The same for an earlier time: held with the client's own person, their own booking not counting against it. */
  function holdEarlier(bookingId, service, settings, start, until, key, staffId) {
    return holdOffer({ ref: earlierList().doc(bookingId), item: earlierItem(bookingId), service, settings, start, until, key, staffId, except: bookingId });
  }
  async function holdOffer({ ref, item: itemKey, service, settings, start, until, key, staffId, except = "" }) {
    const blockEnd = start + (service.minutes + (service.gapAfter || 0)) * MINUTE;
    const days = daysTouched(start, blockEnd, zone());
    return db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      if (!fresh.exists || fresh.data()?.offerUntil) return false;
      const who = whoIsFree({ service, settings, busy: busyFrom(snaps, nowMs, except), start, zone: zone(), nowMs, ...(staffId ? { staffId } : {}) });
      if (who === null) return false;
      // The held place keeps a person (and the room) free for them; booking it picks the person again.
      const { item } = staffParts(settings, who, service.roomId);
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        items[itemKey] = { start, end: blockEnd, held: true, at: nowMs, s: service.id, ...item, offer: true, until };
        tx.set(dayRef(d), { items });
      });
      tx.set(ref, { offerStart: new Date(start).toISOString(), offerUntil: new Date(until).toISOString(), offerKeyHash: hash(key) }, { merge: true });
      return true;
    });
  }

  /** Takes a waiting person's held place off its days (the entry itself is left to the caller). */
  async function dropOffer(wid, w, itemKey = offerItem(wid)) {
    const start = Date.parse(w?.offerStart || "");
    if (!Number.isFinite(start)) return;
    const days = daysTouched(start, start + 24 * HOUR, zone());
    await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        if (!(itemKey in items)) return;
        delete items[itemKey];
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

  /** A booking card's "earlier time" choice, off for a class (the record doesn't say; its service does). */
  async function withEarlier(card, b) {
    if (!card.canEarlier) return card;
    const service = (await readServices()).find((x) => x.id === b.serviceId);
    return service && !isClass(service) && !isCourse(service) ? card : { ...card, canEarlier: false };
  }

  /** The earlier time held for a booking (`id`, `ekey` from the email), still held and still theirs; else null. */
  async function earlierOffer(body, nowMs) {
    const id = String(body?.id || "");
    const key = String(body?.ekey || "");
    if (!ID.test(id) || !KEY.test(key)) return null;
    const [eSnap, bSnap] = await Promise.all([earlierList().doc(id).get(), bookings().doc(id).get()]);
    const e = eSnap.exists ? eSnap.data() : null;
    const b = bSnap.exists ? bSnap.data() : null;
    if (!e || !b || b.status !== "confirmed" || !sameHash(e.offerKeyHash, hash(key)) || !(Date.parse(e.offerUntil || "") > nowMs)) return null;
    return { id, b, e };
  }

  /**
   * Offers the places that opened on these days to the people waiting for them, first come first served: each gets one
   * place held for the shop's waitHoldMinutes and an email with a link that books it. Someone already holding (or who let a hold run
   * out) is skipped; the sweep passes a lapsed hold to the next person. Never throws.
   */
  async function tellWaitlist(days, opened = []) {
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
      // What is still free after the day's waiting list may be an earlier time for someone already booked.
      return told + (await tellEarlier(opened, settings));
    } catch (err) {
      console.warn("bookings: the waiting list wasn't told:", err?.message || err);
      return 0;
    }
  }

  /**
   * "Tell me if an earlier time opens" (Services plan 2, B5): offers each time that just opened (`opened`, the starts a
   * cancel, a move or a lapsed hold left behind) to the clients who asked, first asked first. One opened time goes to the
   * first whose booking is later and who fits it (same length, same person); it is held EARLIER_HOLD_MINUTES and sent by
   * email (and a text when they and the shop have texts on) with a link that moves their booking to it. Someone already
   * holding one, or who let this very time pass, is skipped. Never throws.
   */
  async function tellEarlier(opened, settings) {
    try {
      const nowMs = now().getTime();
      const times = [...new Set(opened)].filter((ms) => Number.isFinite(ms) && ms > nowMs).sort((x, y) => x - y);
      if (!times.length || !settings.live) return 0;
      const snap = await earlierList().where("start", ">", new Date(times[0]).toISOString()).limit(MAX_EARLIER_READ).get();
      if (snap.empty) return 0;
      const queue = snap.docs.map((doc) => ({ doc, e: doc.data() }))
        .sort((a, b) => String(a.e.createdAt || "").localeCompare(String(b.e.createdAt || "")) || a.doc.id.localeCompare(b.doc.id));
      const list = await readServices();
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const busy = new Set();
      let told = 0;
      for (const start of times) {
        for (const { doc, e } of queue) {
          if (e.offerUntil || busy.has(doc.id) || (Array.isArray(e.passed) && e.passed.includes(new Date(start).toISOString()))) continue;
          const bSnap = await bookings().doc(doc.id).get();
          const b = bSnap.exists ? bSnap.data() : null;
          const own = Date.parse(b?.start || "");
          const listed = list.find((x) => x.id === b?.serviceId && x.active);
          if (!b || b.status !== "confirmed" || !b.earlierWanted || !(own > nowMs) || !listed || isClass(listed) || b.course) {
            busy.add(doc.id); await doc.ref.delete(); continue;
          }
          if (!(start < own) || !EMAIL.test(String(b.customer?.email || ""))) continue;
          // Their own length (add-ons, their person's rate) and their own person.
          const service = { ...listed, minutes: b.minutes, gapAfter: b.gapAfter || 0 };
          const staffId = keptPerson(settings, b.serviceId, b.staffId);
          const day = dayOf(start, zone());
          const free = freeTimes({ service, settings, busy: await busyAround(day, nowMs, doc.id), day, zone: zone(), nowMs, ...(staffId ? { staffId } : {}) });
          if (!free.includes(start)) continue;
          const key = randomKey();
          const until = Math.min(nowMs + EARLIER_HOLD_MINUTES * MINUTE, start);
          if (!(await claimEmailSend(db, "bookingEmail", b.customer.email))) continue;
          if (!(await holdEarlier(doc.id, service, settings, start, until, key, staffId))) continue;
          busy.add(doc.id);
          const when = whenWords({ start: new Date(start).toISOString() });
          const was = whenWords(b);
          const untilText = new Date(until).toLocaleTimeString("en-CA", { timeZone: zone(), hour: "numeric", minute: "2-digit" });
          const link = siteLink(`/book?earlier=${encodeURIComponent(doc.id)}&ekey=${key}`);
          await sendEmail({
            to: b.customer.email,
            subject: `An earlier time is free: ${b.serviceName}, ${when}`,
            html: risoLayout(`
              <h4 style="margin:0 0 8px;">An earlier time has opened</h4>
              <h2 style="margin:0 0 12px;">${escapeHtml(b.serviceName || "")}</h2>
              <p style="margin:0 0 16px;">${escapeHtml(when)}${b.staffName ? ` ${escapeHtml(withWhom(b))}` : ""} is free, and ${escapeHtml(shop)} is holding it for you until ${escapeHtml(untilText)}. Your booking is now ${escapeHtml(was)}. Take the earlier time and your booking moves to it. If you do nothing, you keep your booking.</p>
              ${risoButton(escapeHtml(link), "Take the earlier time", brand.accent, brand.theme)}
            `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
          });
          await earlierText(doc.id, b, when, link, key);
          told += 1;
          break;
        }
      }
      return told;
    } catch (err) {
      console.warn("bookings: the earlier-time list wasn't told:", err?.message || err);
      return 0;
    }
  }

  /** The earlier time by text too, for a client who ticked texts while the shop's switch is on. Never throws. */
  async function earlierText(id, b, when, link, key) {
    try {
      if (!texts || !b.customer?.textOk || !b.customer?.phone) return;
      if (!(await readSettings()).textReminders) return;
      const shop = String(shopName() || "").trim().slice(0, 40);
      const body = `An earlier time is free${shop ? ` at ${shop}` : ""}: ${when}, held ${EARLIER_HOLD_MINUTES} min. Take it: ${link} Reply STOP to stop texts.`;
      const sent = await texts.send({ to: b.customer.phone, body, kind: "booking-earlier", idempotencyKey: `booking-${id}-earlier-${hash(key).slice(0, 10)}` });
      if (sent?.optedOut) await bookings().doc(id).set({ customer: { ...b.customer, textOk: false } }, { merge: true });
    } catch (err) {
      console.warn("bookings: the earlier-time text failed:", err?.message || err);
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
    const opened = [];
    for (const doc of lapsed.docs) {
      const w = doc.data();
      await dropOffer(doc.id, w);
      await doc.ref.delete();
      days.push(w.day);
      opened.push(Date.parse(w.offerStart || ""));
      await tellHoldEnded(w);
    }
    // Earlier times: forget visits now past, and pass a hold that ran out on (that time never comes back to them).
    const gone = await earlierList().where("start", "<=", new Date(nowMs).toISOString()).limit(200).get();
    for (const doc of gone.docs) { await dropOffer(doc.id, doc.data(), earlierItem(doc.id)); await doc.ref.delete(); }
    const ranOut = await earlierList().where("offerUntil", "<=", new Date(nowMs).toISOString()).limit(100).get();
    for (const doc of ranOut.docs) {
      const e = doc.data();
      await dropOffer(doc.id, e, earlierItem(doc.id));
      await doc.ref.set({ offerStart: null, offerUntil: null, offerKeyHash: null, passed: [...(Array.isArray(e.passed) ? e.passed : []), e.offerStart].slice(-20) }, { merge: true });
      const at = Date.parse(e.offerStart || "");
      if (Number.isFinite(at)) { days.push(dayOf(at, zone())); opened.push(at); }
    }
    if (days.length) await tellWaitlist(days, opened);
    return { forgotten: past.docs.length + gone.docs.length, passedOn: lapsed.docs.length + ranOut.docs.length };
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
    // A course takes a place in every one of its sessions with the one sign-up.
    const sessions = isCourse(service) ? courseStarts(service, zone()) : [start];
    if (sessions[0] !== start) return false;
    const length = blockEnd - start;
    const days = [...new Set(sessions.flatMap((ms) => daysTouched(ms, ms + length, zone())))];
    const all = offer ? [...new Set([...days, ...offer.days])] : days;
    // `days` (shop days) lets the admin find a course's people in any week it runs, with one query.
    if (sessions.length > 1) {
      record.course = { starts: sessions.map((ms) => new Date(ms).toISOString()), days: [...new Set(sessions.map((ms) => dayOf(ms, zone())))] };
      // Joined late: the dates missed and the whole course's price, for the owner's list and the emails.
      if (service.joining) record.course.joined = { missed: service.joining.missed, of: service.joining.of, fullPriceMinor: service.joining.fullPriceMinor };
    }
    return db.runTransaction(async (tx) => {
      const snaps = await Promise.all(all.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      const codeSnap = code ? await tx.get(code) : null;
      const giftSnap = gift ? await tx.get(gift) : null;
      const packSnap = pack ? await tx.get(pack) : null;
      const nearby = snaps.filter((_, i) => days.includes(all[i]));
      const busy = busyFrom(nearby, nowMs, offer?.item || "");
      const who = whoIsFree({ service, settings, busy, start, zone: zone(), nowMs, staffId });
      if (check && who === null) return false;
      const assigned = staffParts(settings, who ?? staffId, service.roomId);
      // The later sessions of a course: each needs a place too, at any hour and however far ahead (the course's own
      // dates decide), with the first session's person when they are free then, else anyone who does the class.
      const later = [];
      const anyHour = ownerBookingSettings(settings);
      for (const ms of sessions.slice(1)) {
        const local = new Date(ms).toLocaleTimeString("en-GB", { timeZone: zone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
        const session = { ...service, courseDates: [], classTimes: [{ weekday: new Date(`${dayOf(ms, zone())}T12:00:00Z`).getUTCDay(), time: local }] };
        const ask = (person) => whoIsFree({ service: session, settings: anyHour, busy, start: ms, zone: zone(), nowMs, staffId: person });
        const first = who ?? staffId;
        const theirs = first ? ask(first) ?? ask("") : ask("");
        if (theirs === null && (check || classPlacesLeft(ms, service, settings, busy) < 1)) return false;
        later.push(staffParts(settings, theirs ?? first, service.roomId));
      }
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
        sessions.forEach((ms, n) => {
          if (!daysTouched(ms, ms + length, zone()).includes(d)) return;
          items[n ? `${id}~${n}` : id] = { start: ms, end: ms + length, held, at: nowMs, s: record.serviceId, ...(n ? later[n - 1].item : assigned.item) };
        });
        tx.set(dayRef(d), { items });
      });
      // The caller's record carries the person too (it is what the confirmation email reads).
      Object.assign(record, assigned.record);
      // A course keeps who takes each date when it isn't one person throughout (a stand-in on a later date).
      const names = [assigned, ...later].map((x) => x.record.staffName || "");
      const ids = [assigned, ...later].map((x) => x.record.staffId || "");
      if (record.course && ids.some((n) => n !== ids[0])) record.course = { ...record.course, staff: names, staffIds: ids };
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
    const spans = spansOf(id, b);
    const days = [...new Set(spans.flatMap((x) => daysTouched(x.start, x.end, zone())))];
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
        const mine = spans.filter((x) => x.key in items);
        if (!mine.length) return;
        for (const x of mine) delete items[x.key];
        tx.set(dayRef(d), { items });
      });
      const all = { ...changes, ...(giveBack ? { discount: { ...b.discount, returned: true } } : {}), ...(putBack ? { giftCard: { ...b.giftCard, returned: true } } : {}),
        ...(visitBack ? { pack: { ...b.pack, returned: true } } : {}) };
      tx.set(bookings().doc(id), all, { merge: true });
      return all;
    });
    // No earlier time for a visit that is off (a time held for it goes back to the others below).
    if (written && b.earlierWanted) {
      const e = (await earlierList().doc(id).get()).data();
      if (e) {
        await dropOffer(id, e, earlierItem(id));
        await earlierList().doc(id).delete();
        const at = Date.parse(e.offerStart || "");
        if (Number.isFinite(at)) { days.push(dayOf(at, zone())); spans.push({ start: at }); }
      }
    }
    await tellWaitlist(days, spans.map((x) => x.start));
    return written;
  }

  /**
   * Moves a booking to `start` if free (its own old time doesn't count against it). It stays with the same person while
   * they still do the service; the owner may name another (`staffId`, "" for anyone free). Resolves to false, or to
   * what changed on the booking.
   */
  async function moveTime(id, b, service, settings, start, { check = true, by = "customer", staffId, alsoFree = "" } = {}) {
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
      // `alsoFree`: a time held for this very booking (an earlier time it is taking) doesn't count against it, and goes.
      const who = whoIsFree({ service, settings, busy: busyFrom(nearby, nowMs, alsoFree ? [id, alsoFree] : id), start, zone: zone(), nowMs, staffId: wanted });
      if (check && who === null) return false;
      const assigned = staffParts(settings, who ?? wanted, service.roomId);
      all.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        delete items[id];
        if (alsoFree) delete items[alsoFree];
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
    // An earlier-time wish follows the booking's new start.
    if (moved && b.earlierWanted && !alsoFree) await earlierList().doc(id).set({ start: moved.start }, { merge: true }).catch(() => {});
    // The time left behind may be what someone is waiting for.
    if (moved) await tellWaitlist(oldDays, [Date.parse(b.start)]);
    return moved;
  }

  // ── Standing appointments (Services plan 2, B1) ─────────────────────────────────────────────────────────────────

  /**
   * Whether each of a run's later visits (`starts`, milliseconds) is free: with `staffId` (or anyone who does the service),
   * in the shop's hours however far ahead, or at any hour when the shop books it (`owner`). Read only, so the page can show
   * the dates before booking; the visits are taken one by one afterwards, each in its own transaction.
   */
  async function runPlan({ service, settings, starts, staffId = "", owner = false }) {
    const rules = runSettings(settings, owner);
    const nowMs = now().getTime();
    return Promise.all(starts.map(async (ms) => {
      const busy = await busyAround(dayOf(ms, zone()), nowMs);
      const free = whoIsFree({ service: { ...service, classTimes: [] }, settings: rules, busy, start: ms, zone: zone(), nowMs, staffId }) !== null;
      return { start: new Date(ms).toISOString(), free };
    }));
  }

  /** Takes a booking back out entirely (a run that couldn't be booked whole): its time freed, its record deleted. */
  async function dropBooking(id, b) {
    await freeTime(id, b, { status: "cancelled", updatedAt: now().toISOString() });
    await bookings().doc(id).delete();
  }

  /**
   * Books a run's later visits after the first (`first`, as written, with its id). Each is its own booking: the full price
   * paid at the visit (a code, gift card or pack only ever paid the first), its own reminders, moved or cancelled alone,
   * with the first visit's person when they are free, else (when the client asked for anyone) whoever is. All or nothing:
   * when a visit can't be taken, every visit is taken back out, the first too, and the dates that failed are answered.
   */
  async function bookRun({ firstId, first, service, settings, starts, staffId = "", owner = false, by }) {
    const rules = runSettings(settings, owner);
    const tax = await taxOn(service, service.priceMinor);
    const price = service.priceMinor + (tax?.taxMinor || 0);
    const { discount: _d, listPriceMinor: _l, giftCard: _g, pack: _p, depositMinor: _dm, depositPaid: _dp, taxMinor: _t, taxLines: _tl, ...base } = first;
    const made = [];
    const taken = [];
    for (let n = 1; n < starts.length; n++) {
      const id = randomId();
      const at = now().toISOString();
      const record = {
        ...base, ...taxFields(tax), priceMinor: price, payment: price > 0 ? "atShop" : "free", paid: false, sessions: [], holdUntil: null, pendingKey: null,
        series: { ...first.series, visit: n + 1 }, history: [{ at, what: `booked (visit ${n + 1} of ${starts.length})`, by }], createdAt: at, updatedAt: at,
      };
      const take = (who) => takeTime({ id, service: { ...service, classTimes: [] }, settings: rules, start: starts[n], record: { ...record }, staffId: who });
      const ok = (await take(first.staffId || staffId)) === true || (!staffId && first.staffId ? (await take("")) === true : false);
      if (ok) made.push(id);
      else taken.push(new Date(starts[n]).toISOString());
    }
    if (taken.length) {
      for (const id of made) {
        const b = (await bookings().doc(id).get()).data();
        if (b) await dropBooking(id, b);
      }
      const b = (await bookings().doc(firstId).get()).data();
      if (b) await dropBooking(firstId, b);
      return { taken };
    }
    // Into the shop's Google Calendar too, each visit on its own.
    for (const id of made) {
      const b = (await bookings().doc(id).get()).data();
      if (b) await syncCalendar(id, b);
    }
    return { taken: [], ids: made };
  }

  /** The other visits of a booking's run, earliest first (for its page and for cancelling the rest). */
  async function runVisits(b) {
    if (!b.series?.id) return [];
    const snap = await bookings().where("series.id", "==", b.series.id).limit(30).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  }

  /**
   * A run's visits for the booking's own page: each one's id, start and status, so the page can link to them with the
   * same key. Only with the run's own key (the booked email's): a reminder's key opens just its one visit.
   */
  async function runOf(id, b, key) {
    if (!b.series?.id || !key || hash(key) !== b.manageKeyHash) return {};
    const list = await runVisits(b);
    return { runVisits: list.filter((v) => v.manageKeyHash === b.manageKeyHash).map((v) => ({ id: v.id, start: v.start, status: v.status, current: v.id === id })) };
  }

  /**
   * "Cancel this and the later visits" on a standing appointment: the run's later visits still on are cancelled too.
   * A visit something was paid on since (by card, the rest, a tip, or marked paid at the shop) is left for the shop to
   * refund or keep on its own (`skipped`).
   */
  async function cancelLater(id, b, by, at) {
    let cancelled = 0;
    let skipped = 0;
    for (const v of await runVisits(b)) {
      if (v.id === id || v.status !== "confirmed" || Date.parse(v.start) <= Date.parse(b.start)) continue;
      const { id: vid, ...vb } = v;
      if (vb.paid || vb.depositPaid || cardTaken(vb) > 0 || tipTaken(vb) > 0 || vb.readerOpen || vb.restOpen) { skipped += 1; continue; }
      const written = await freeTime(vid, vb, { status: "cancelled", cancelledAt: at, cancelledBy: by, updatedAt: at,
        history: [...(vb.history || []), { at, what: "cancelled with the rest of the run", by }].slice(-20) });
      await syncCalendar(vid, { ...vb, ...written });
      cancelled += 1;
    }
    return { cancelled, skipped };
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
    const spans = spansOf(id, b);
    const days = [...new Set(spans.flatMap((x) => daysTouched(x.start, x.end, zone())))];
    const confirmed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(bookings().doc(id));
      if (fresh.data()?.status !== "held") return false;
      const snaps = await Promise.all(days.map((d) => tx.get(dayRef(d))));
      days.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        for (const x of spans) if (items[x.key]) items[x.key] = { ...items[x.key], held: false };
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

  /** The provider's card readers for this shop's mode (Stripe smart readers or Square Terminals), or null. */
  async function readerDesk() {
    const { mode, checkout } = await standalone();
    return { mode, reader: checkout?.reader || null };
  }
  const readersRef = () => db.collection("bookingReaders").doc("main");

  /** The shop's one place for card readers in this mode, made from Settings › General › Location the first time. */
  async function readerPlace(mode, reader, { make = false } = {}) {
    // Square's readers belong to the shop's one Square location: nothing to make.
    if (reader.fixedPlace) return reader.fixedPlace;
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
   * Tips on the reader (Services plan 2, A4): Stripe asks the tip on the screen from the place's reader settings, so the
   * shop's tip choices are set on the place once and again whenever they change. Square takes them with each payment.
   */
  async function readerTips(mode, reader, place, currency, percents) {
    if (!reader.setTips || !percents.length) return true;
    const key = `${String(currency).toLowerCase()}:${percents.join(",")}`;
    const snap = await readersRef().get();
    const kept = snap.exists ? snap.data()?.[`tips_${mode}`] : null;
    if (kept?.key === key && kept.place === place) return true;
    try {
      const config = await reader.setTips({ place, currency, percents, config: kept?.config || null });
      await readersRef().set({ [`tips_${mode}`]: { key, place, config } }, { merge: true });
      return true;
    } catch (err) {
      // The payment still goes to the reader, only without the tip screen.
      console.warn("bookings: reader tips couldn't be set:", err?.message || err);
      return false;
    }
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
      // The payment to refund later (Square's checkout pays with its own payment), and any tip added on the reader.
      const paidWith = payment.paymentIntent || charge.intent;
      const tipMinor = Math.max(0, Math.round(Number(payment.tipMinor) || 0));
      const kept = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(bookings().doc(id))).data() || {};
        if (!fresh.readerOpen || fresh.readerCharge?.intent !== charge.intent) return null;
        const restMinor = Math.max(0, (payment.amountMinor || charge.amountMinor + tipMinor) - tipMinor) || charge.amountMinor;
        const tipNew = tipMinor > 0 && !fresh.tip;
        const what = [fresh.rest ? "card reader payment also went through (it was already paid)" : "paid on the card reader", tipNew ? `${moneyWords(tipMinor, fresh.currency)} tip added` : ""].filter(Boolean).join(", ");
        const changes = {
          ...(fresh.rest ? {} : { rest: { amountMinor: restMinor, paymentIntent: paidWith, at, reader: true } }),
          ...(tipNew ? { tip: { amountMinor: tipMinor, paymentIntent: paidWith, at, reader: true } } : {}),
          readerOpen: false, readerCharge: null, readerError: "", updatedAt: at,
          history: [...(fresh.history || []), { at, what, by: "shop" }].slice(-20),
        };
        tx.set(bookings().doc(id), changes, { merge: true });
        return { ...fresh, ...changes };
      });
      if (!kept) return { ...b, ...((await bookings().doc(id).get()).data() || {}) };
      if (kept.rest?.paymentIntent === paidWith) await tellCustomer(id, kept, "restPaid", { byShop: true, toOwner: false });
      return kept;
    }
    let error = "";
    const canceled = payment.status === "canceled";
    // Square says why a checkout stopped (the customer cancelled, it ran out of time); a stop asked for here has no words.
    if (canceled) error = stopped ? payment.error || stopped : "";
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
  /**
   * The shop cancels a booking (`b` already settled with settleRest): refunds `amount` of what was paid by card, puts a
   * gift card's part and a pack's visit back unless kept (giftBack / packBack false), frees its time and tells the
   * customer when it was confirmed. A refund that can't start throws (`refundFailed`) and leaves the booking on.
   * `tooFew`: cancelled because a class didn't reach its minimum (the email says so).
   */
  async function shopCancel(id, b, { amount = 0, by = "shop", giftBack: keepGift = true, packBack: keepVisit = true, notify = true, tooFew = false, andLater = false } = {}) {
    const onCard = cardTaken(b);
    let refund = null;
    if (amount > 0) {
      try { refund = await refundBooking(id, b, amount); } catch (err) {
        console.error(`Booking ${id} refund failed:`, err?.message || err);
        throw Object.assign(new Error("refund failed"), { refundFailed: true });
      }
    }
    const at = now().toISOString();
    // The gift card's part goes back onto it unless the shop keeps it (giftBack: false).
    const giftBack = keepGift && !!b.giftCard?.amountMinor && !b.giftCard.returned;
    // The pack's visit goes back onto it unless the shop keeps it (packBack: false, a late cancel).
    const packBack = keepVisit && !!b.pack?.id && !b.pack.returned;
    const what = [refund ? "refunded" : "", giftBack ? "gift card put back" : "", packBack ? "visit put back on the pack" : ""].filter(Boolean).join(" and ");
    const why = tooFew ? " (not enough people to run)" : "";
    const changes = { status: "cancelled", cancelledAt: at, cancelledBy: by, holdUntil: null, updatedAt: at, ...(refund ? { refund } : {}), ...(tooFew ? { cancelledFor: "minimum" } : {}),
      history: [...(b.history || []), { at, what: `${what ? `cancelled and ${what}` : "cancelled"}${why}`, by }].slice(-20) };
    await freeTime(id, b, changes, { giftBack, packBack });
    await syncCalendar(id, { ...b, ...changes });
    // A standing appointment: the later visits too, when asked (those with money on them are left).
    const run = andLater && b.series?.id ? await cancelLater(id, b, by, at) : null;
    const laterWords = run?.cancelled ? ` Your ${run.cancelled === 1 ? "next visit is" : `${run.cancelled} later visits are`} cancelled too.` : "";
    const paid = b.payment === "deposit" && !b.rest ? "deposit" : "payment";
    const cardWordsBack = !refund ? "" : refund.amountMinor < onCard ? `${moneyWords(refund.amountMinor, b.currency)} of your ${paid} is being refunded to your card.` : `Your ${paid} is being refunded to your card.`;
    if (notify && b.status === "confirmed") await tellCustomer(id, { ...b, ...changes }, "cancelled", { byShop: true, tooFew, refundText: `${cardWordsBack}${giftBack ? giftBackWords(b) : ""}${packBack ? packBackWords(b) : ""}${laterWords}`.trim() });
    return { ...(run ? { laterCancelled: run.cancelled, laterSkipped: run.skipped } : {}), refunded: !!refund, refundMinor: refund?.amountMinor || 0, ...(giftBack ? { giftBackMinor: b.giftCard.amountMinor } : {}), ...(packBack ? { packBack: true } : {}) };
  }

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
          ${taxLinesWords(p)}
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
        // A course already under way that lets people join late is offered as the dates left, at their price.
        const list = (await readServices()).filter((s) => s.active).map((s) => joinableCourse(s, zone(), nowMs) ?? s);
        const calc = list.some((s) => s.chargeTax) && shopTax ? await shopTax() : null;
        const taxes = await Promise.all(list.map((s) => taxOn(s, s.priceMinor, calc)));
        // The rate as tax on a million cents, so the page works out the tax on a price with add-ons or a person's own
        // price the way the server will (one rounding on the whole amount).
        const taxPpm = calc ? (await taxOn({ chargeTax: true }, 1_000_000, calc))?.taxMinor || 0 : 0;
        return res.status(200).json({
          on: true, zone: zone(), currency: currency(), cancelHours: settings.cancelHours, maxDaysAhead: settings.maxDaysAhead, today: dayOf(nowMs, zone()),
          // The shop's opening hours, Sunday first, for the Hours & where to find us section.
          hours: settings.hours,
          codes: await codesOffered(), giftCards: await giftCardsOffered(),
          // Approved reviews of visits, newest first, for the Client reviews section (only while the shop takes them).
          reviews: settings.siteReviews ? await visitReviews() : [],
          // Whether the form offers "Text me reminders": the owner's switch, and the platform sending texts.
          texts: !!settings.textReminders && (await textsOpen()),
          // The people a client can pick (the "With" choice); none when the shop books as one calendar.
          staff: booksByPerson(settings) ? settings.staff.filter((p) => p.active).map(({ id, name, serviceIds, rates }) => ({ id, name, serviceIds, ...(rates?.length ? { rates } : {}) })) : [],
          services: list.map(({ id, name, description, minutes, priceMinor, payment, depositMinor, depositPercent, location, questions, places, holdCard, lateFeeMinor, packVisits, packPriceMinor, packDays, courseDates, joining, repeats, minPlaces, extras }, i) => ({
            id, name, description, minutes, priceMinor, payment, depositMinor, depositPercent, location, questions, places,
            // Standing appointments: a run of visits can be booked at once.
            ...(runsOnline({ payment, places, holdCard: holdCard && canHoldCard(), repeats }) ? { repeats: true } : {}),
            // Add-ons and options the client may tick: each adds its minutes and price.
            ...(extras?.length ? { extras } : {}),
            // A course: every one of its dates (signed up for as a whole, from the first).
            ...(isCourse({ places, courseDates }) ? { courseStarts: courseStarts({ places, courseDates }, zone()).map((ms) => new Date(ms).toISOString()) } : {}),
            // Joining a course late: how many dates were missed, of how many, and the whole course's price.
            ...(joining ? { joining } : {}),
            ...(minPlaces ? { minPlaces } : {}),
            // Sales tax added when booked: the tax on the full price (the page shows "plus tax"; a code lowers it).
            ...(taxes[i] ? { taxMinor: taxes[i].taxMinor, ...(taxPpm ? { taxPpm } : {}) } : {}),
            ...(holdCard && canHoldCard() ? { holdCard: true, lateFeeMinor } : {}),
            ...(offersPack({ packVisits, packPriceMinor }) ? { packVisits, packPriceMinor, packDays } : {}),
          })),
        });
      }
      if (action === "classTimetable") {
        // The Timetable page (/classes): one week of dated classes with the places left in each. Only while the shop
        // sells Classes; signing up goes through Book a time (bookingStart), so this only reads.
        if (!settings.live || !(await classesOn(db))) return res.status(200).json({ on: false });
        const every = await readServices();
        const list = every.filter(onTimetable);
        // Courses still open for sign-up, with the fewest places left across their dates (one read per day they touch).
        const open = every.filter((s) => courseOpen(s, zone(), nowMs)).map((s) => joinableCourse(s, zone(), nowMs));
        // Whole courses only, up to 200 days in all: a course whose days didn't fit goes out with no count (an unread
        // day would read as empty and promise places that are gone). Signing up still checks every date.
        const daysOf = (s) => [...new Set(courseStarts(s, zone()).flatMap((ms) => [addDays(dayOf(ms, zone()), -1), dayOf(ms, zone()), addDays(dayOf(ms, zone()), 1)]))];
        const courseDays = new Set();
        const counted = new Set();
        // The soonest courses are counted first.
        for (const s of [...open].sort((a, b) => courseStarts(a, zone())[0] - courseStarts(b, zone())[0])) {
          const fresh = daysOf(s).filter((d) => !courseDays.has(d));
          if (courseDays.size + fresh.length > 200) continue;
          fresh.forEach((d) => courseDays.add(d));
          counted.add(s.id);
        }
        const courseBusy = courseDays.size ? busyFrom(await Promise.all([...courseDays].map((d) => dayRef(d).get())), nowMs, "") : [];
        const courses = open.map((s) => ({
          id: s.id, name: s.name, description: s.description, minutes: s.minutes, priceMinor: s.priceMinor, payment: s.payment, location: s.location, places: s.places,
          ...(s.chargeTax ? { plusTax: true } : {}), starts: courseStarts(s, zone()).map((ms) => new Date(ms).toISOString()),
          ...(s.joining ? { joining: s.joining } : {}),
          ...(counted.has(s.id) ? { left: coursePlacesLeft(s, settings, courseBusy, zone()) } : {}),
        })).sort((a, b) => a.starts[0].localeCompare(b.starts[0]) || a.id.localeCompare(b.id));
        const today = dayOf(nowMs, zone());
        // The last day Book a time's picker offers (BookTime.tsx), so every class listed can be signed up for from its button.
        const lastDay = addDays(today, Math.max(0, settings.maxDaysAhead - 1));
        const asked = isDay(req.body?.from) ? req.body.from : today;
        const from = asked < addDays(today, -6) ? today : asked > lastDay ? lastDay : asked;
        const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
        const snaps = await Promise.all([addDays(from, -1), ...days, addDays(from, 7)].map((d) => dayRef(d).get()));
        const busy = busyFrom(snaps, nowMs, "");
        const sessions = [];
        for (const day of days) for (const s of list) {
          if (day > lastDay) continue;
          for (const ms of freeTimes({ service: s, settings, busy, day, zone: zone(), nowMs })) sessions.push({ classId: s.id, day, start: new Date(ms).toISOString(), left: classPlacesLeft(ms, s, settings, busy) });
          for (const ms of fullClassTimes(s, settings, busy, day, nowMs)) sessions.push({ classId: s.id, day, start: new Date(ms).toISOString(), left: 0 });
        }
        sessions.sort((a, b) => a.start.localeCompare(b.start) || a.classId.localeCompare(b.classId));
        return res.status(200).json({
          on: true, zone: zone(), currency: currency(), today, from, lastDay,
          classes: list.map(({ id, name, description, minutes, priceMinor, payment, location, places, chargeTax }) => ({ id, name, description, minutes, priceMinor, payment, location, places, ...(chargeTax ? { plusTax: true } : {}) })),
          sessions, courses,
        });
      }
      if (action === "bookingTimes") {
        if (!settings.live) return res.status(200).json({ on: false });
        const listed = await publicService(req.body?.serviceId);
        if (!listed) return fail(res, 404, "This service isn't taking bookings right now.");
        // The add-ons the client ticked lengthen the booking and add to its price, for every rule below.
        const asked = withExtras(forPerson(listed, settings, req.body?.staffId), req.body?.extras);
        if (asked.problem) return fail(res, 400, asked.problem, "extras");
        const { service } = asked;
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
        const listed = await publicService(req.body?.serviceId);
        if (!listed) return fail(res, 404, "This service isn't taking bookings right now.");
        // The add-ons the client ticked lengthen the booking and add to its price, for every rule below.
        const asked = withExtras(forPerson(listed, settings, req.body?.staffId), req.body?.extras);
        if (asked.problem) return fail(res, 400, asked.problem, "extras");
        const { service } = asked;
        const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200);
        try {
          const priced = await codeFor(service, req.body?.code, email);
          const tax = await taxOn(service, priced.priceMinor);
          const total = priced.priceMinor + (tax?.taxMinor || 0);
          return res.status(200).json({ code: priced.discount.code, discountMinor: priced.discount.amountMinor, priceMinor: total, ...(tax ? { taxMinor: tax.taxMinor } : {}), payNowMinor: depositOf({ ...service, priceMinor: total }) });
        } catch (err) {
          if (err instanceof BookingCodeProblem) return fail(res, 400, err.message, "code");
          throw err;
        }
      }
      if (action === "bookingGiftCard") {
        // Try a gift card before booking: what it pays now and what is left for the card page. Booking checks it again.
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const listed = await publicService(req.body?.serviceId);
        if (!listed) return fail(res, 404, "This service isn't taking bookings right now.");
        // The add-ons the client ticked lengthen the booking and add to its price, for every rule below.
        const asked = withExtras(forPerson(listed, settings, req.body?.staffId), req.body?.extras);
        if (asked.problem) return fail(res, 400, asked.problem, "extras");
        const { service } = asked;
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
        const service = await publicService(req.body?.serviceId);
        if (!service || !offersPack(service)) return fail(res, 404, "This service doesn't sell packs right now.");
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem.replace("send your booking to", "send your pack to"));
        const { checkout, mode } = await standalone();
        if (!checkout) return fail(res, 409, "This shop can't take card payments for packs yet. Please contact the shop.", "not_available");
        // A service that charges sales tax charges it on its pack too, on top of the pack's price (as on a visit).
        const tax = await taxOn(service, service.packPriceMinor);
        const payMinor = service.packPriceMinor + (tax?.taxMinor || 0);
        const code = newPackCode();
        const pid = packId(code);
        const until = nowMs + PACK_PAGE_MINUTES * MINUTE;
        const at = new Date(nowMs).toISOString();
        await packs().doc(pid).set({
          last4: code.slice(-4), serviceId: service.id, serviceName: service.name, visits: service.packVisits, days: service.packDays,
          priceMinor: payMinor, ...taxFields(tax), currency: currency(), mode, customer: { name: customer.name, email: customer.email },
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
            line_items: [{ quantity: 1, price_data: { currency: currency().toLowerCase(), unit_amount: payMinor, product_data: { name: description } } }],
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
        const service = await publicService(req.body?.serviceId);
        if (!service) return fail(res, 404, "This service isn't taking bookings right now.");
        const p = await loadPack(req.body?.pack);
        const when = Date.parse(String(req.body?.start || ""));
        const problem = packProblem(p, service.id, dayOf(Number.isFinite(when) ? when : nowMs, zone()));
        if (problem) return fail(res, 400, PACK_MESSAGES[problem], "pack");
        return res.status(200).json({ last4: p.last4, left: packLeft(p), visits: p.visits, expiresOn: p.expiresOn || null });
      }
      if (action === "bookingRunCheck") {
        // Before booking a standing appointment: is each later visit free? (The page lists the dates with this.)
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const listed = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!listed) return fail(res, 404, "This service isn't taking bookings right now.");
        const asked = withExtras(forPerson(listed, settings, req.body?.staffId), req.body?.extras);
        if (asked.problem) return fail(res, 400, asked.problem, "extras");
        const { service } = asked;
        if (!runsOnline({ ...service, holdCard: service.holdCard && canHoldCard() })) return fail(res, 400, "This service can't be booked as a standing appointment.", "run");
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a time first.");
        const run = cleanRun(req.body?.run);
        if (!run) return res.status(200).json({ visits: [{ start: new Date(start).toISOString(), free: true }] });
        if (run.problem) return fail(res, 400, run.problem, "run");
        const staffId = keptPerson(settings, service.id, req.body?.staffId);
        const starts = runStarts(start, run, zone());
        return res.status(200).json({ visits: [{ start: new Date(start).toISOString(), free: true }, ...(await runPlan({ service, settings, starts: starts.slice(1), staffId }))] });
      }
      if (action === "bookingStart") {
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const listed = await publicService(req.body?.serviceId);
        if (!listed) return fail(res, 404, "This service isn't taking bookings right now.");
        // The add-ons the client ticked lengthen the booking and add to its price, for every rule below.
        const asked = withExtras(forPerson(listed, settings, req.body?.staffId), req.body?.extras);
        if (asked.problem) return fail(res, 400, asked.problem, "extras");
        const { service, extras } = asked;
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
        // A standing appointment: a run of visits booked at once, each its own booking (services that take no card).
        const run = cleanRun(req.body?.run);
        if (run?.problem) return fail(res, 400, run.problem, "run");
        if (run && !runsOnline({ ...service, holdCard: service.holdCard && canHoldCard() })) return fail(res, 400, "This service can't be booked as a standing appointment. Please book one visit.", "run");
        if (run && String(req.body?.pack || "").trim()) return fail(res, 400, "A pack pays for single visits. Please book one visit with it.", "pack");
        const runAt = run ? runStarts(start, run, zone()) : [];
        if (run) {
          const busyDates = (await runPlan({ service, settings, starts: runAt.slice(1), staffId })).filter((v) => !v.free).map((v) => v.start);
          if (busyDates.length) return res.status(409).json({ error: "Some of those dates are already taken. Choose another time, gap or number of visits.", code: "run_taken", taken: busyDates });
        }
        // A pack of visits pays for the visit outright: no code, gift card or card payment with it.
        let pack = null;
        // Its first date (the first left, for a late joiner) gone means it can't be joined any more.
        if (isCourse(service) && courseStarts(service, zone())[0] <= nowMs) return fail(res, 409, "This course has already started. Please contact the shop.", "started");
        if (isCourse(service) && String(req.body?.pack || "").trim()) return fail(res, 400, "A pack pays for single visits, not for a course.", "pack");
        if (String(req.body?.pack || "").trim() && extras.some((e) => e.priceMinor > 0)) return fail(res, 400, "A pack pays for the service on its own. Book the extras without the pack, or leave them off.", "pack");
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
        const before = service.payment === "free" || pack ? 0 : priced ? priced.priceMinor : service.priceMinor;
        // Sales tax (a service with chargeTax) goes on top of the price after any code; the booking's price includes it.
        const tax = await taxOn(service, before);
        const price = before + (tax?.taxMinor || 0);
        // What the card page takes now: the whole price, the deposit, or nothing (free, all paid at the visit, or a pack).
        const upFront = pack ? 0 : depositOf({ ...service, priceMinor: price });
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
          customer: { name: customer.name, email: customer.email, phone: customer.phone, ...(customer.textOk ? { textOk: true } : {}) }, note: customer.note, answers: answered.answers,
          status: paid ? "held" : "confirmed", payment: pack ? "pack" : deposit ? "deposit" : upFront > 0 ? "card" : price > 0 ? "atShop" : "free",
          priceMinor: price, ...taxFields(tax), ...(deposit ? { depositMinor: upFront, depositPaid: false } : {}), currency: currency(),
          ...(priced ? { discount: priced.discount, listPriceMinor: service.priceMinor } : {}),
          ...(gift ? { giftCard: gift } : {}),
          ...(pack ? { pack, listPriceMinor: service.priceMinor } : {}),
          ...(extras.length ? { extras } : {}),
          paid: false, ...giftPaid, sessions: [], holdUntil: paid ? new Date(nowMs + HOLD_MINUTES * MINUTE).toISOString() : null, manageKeyHash: hash(key),
          ...(holdCard ? { cardHold: true, lateFeeMinor: service.lateFeeMinor, cardMode: mode } : {}),
          // Kept only until the payment is confirmed, so the confirmation email can carry the customer's link.
          pendingKey: paid ? key : null,
          source: "website", history: [{ at, what: run ? `booked (visit 1 of ${run.visits})` : "booked", by: "customer" }], createdAt: at, updatedAt: at,
          ...(run ? { series: { id: `run_${id}`, everyWeeks: run.everyWeeks, visits: run.visits, visit: 1 } } : {}),
        };
        const took = await takeTime({ id, service, settings, start, record, offer: await offerFor(req.body, service.id, nowMs), staffId });
        if (took === "code_used") return fail(res, 409, "This code has reached its usage limit.", "code");
        if (took === "gift_short") return fail(res, 409, "This gift card's balance just changed. Please check it and try again.", "gift");
        if (took === "pack_used") return fail(res, 409, "This pack can't book another visit just now. Please check it and try again.", "pack");
        if (!took && isCourse(service)) return fail(res, 409, "This course just filled up, or one of its dates is no longer free. Please contact the shop.", "taken");
        if (!took) return fail(res, 409, isClass(service) ? "That class just filled up. Please pick another time." : staffId ? "That person was just booked then. Please pick another time or anyone free." : "Someone just took that time. Please pick another.", "taken");
        if (run && !paid) {
          const later = await bookRun({ firstId: id, first: record, service, settings, starts: runAt, staffId, by: "customer" });
          if (later.taken.length) return res.status(409).json({ error: "Someone just took one of those dates. Choose another time, gap or number of visits.", code: "run_taken", taken: later.taken });
        }
        if (!paid) {
          const written = pack ? (await bookings().doc(id).get()).data() : record;
          const booked = await syncCalendar(id, { ...written, start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString() });
          await tellCustomer(id, booked, "booked", { key, run: runAt.map((ms) => new Date(ms).toISOString()) });
          return res.status(200).json({ id, key, status: "confirmed", ...(run ? { visits: run.visits } : {}) });
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
        const service = await publicService(req.body?.serviceId);
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
      if (action === "bookingEarlierView" || action === "bookingEarlierTake") {
        // The earlier time held for a client (the link in the email: the booking's id and the hold's own key).
        const found = await earlierOffer(req.body, nowMs);
        if (!found) return fail(res, 404, "This earlier time has gone, or its hold ran out. You keep your booking.", "gone");
        const { id: bid, b: held, e } = found;
        if (action === "bookingEarlierView") {
          return res.status(200).json({ offer: { serviceName: held.serviceName, staffName: held.staffName || "", minutes: held.minutes, start: held.start, offerStart: e.offerStart, offerUntil: e.offerUntil } });
        }
        const service = (await readServices()).find((x) => x.id === held.serviceId) || { roomId: "" };
        const moved = await moveTime(bid, held, { ...service, id: held.serviceId, minutes: held.minutes, gapAfter: held.gapAfter || 0, places: 1 }, settings, Date.parse(e.offerStart), { by: "customer (earlier time)", alsoFree: earlierItem(bid) });
        if (!moved) return fail(res, 409, "Someone just took this time. You keep your booking.", "taken");
        await earlierList().doc(bid).delete();
        await bookings().doc(bid).set({ earlierWanted: false }, { merge: true });
        const next = await syncCalendar(bid, { ...held, ...moved, earlierWanted: false });
        await tellCustomer(bid, next, "moved");
        return res.status(200).json({ offer: { serviceName: next.serviceName, staffName: next.staffName || "", minutes: next.minutes, start: next.start, taken: true } });
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
        if (Date.parse(b.end) > nowMs) b = await withCheckInCode(id, b);
        return res.status(200).json({ booking: await withEarlier(publicBooking(id, b, settings, nowMs), b), ...(await runOf(id, b, key)) });
      }
      if (action === "bookingEarlier") {
        // "Tell me if an earlier time opens" on (`on: true`) or off for this one-to-one visit.
        const card = await withEarlier(publicBooking(id, b, settings, nowMs), b);
        const ref = earlierList().doc(id);
        if (req.body?.on === true) {
          if (!card.canEarlier) return fail(res, 409, "This booking can't wait for an earlier time.", "no_earlier");
          if (!b.earlierWanted) {
            await ref.set({ bookingId: id, serviceId: b.serviceId, serviceName: b.serviceName, start: b.start, name: b.customer?.name || "", email: b.customer?.email || "", createdAt: new Date(nowMs).toISOString(), passed: [] });
            await bookings().doc(id).set({ earlierWanted: true }, { merge: true });
            b = { ...b, earlierWanted: true };
          }
        } else {
          const snap = await ref.get();
          const e = snap.exists ? snap.data() : null;
          await bookings().doc(id).set({ earlierWanted: false }, { merge: true });
          b = { ...b, earlierWanted: false };
          if (e) {
            await dropOffer(id, e, earlierItem(id));
            await ref.delete();
            // A time held for them goes back to everyone else waiting.
            const at = Date.parse(e.offerStart || "");
            if (Number.isFinite(at)) await tellWaitlist([dayOf(at, zone())], [at]);
          }
        }
        return res.status(200).json({ booking: { ...card, earlier: b.earlierWanted === true } });
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
      if (action === "bookingReview") {
        // A review of the visit (Services plan phase 7): once per kept visit, waiting for the owner's yes.
        if (b.reviewId) return fail(res, 409, "You already reviewed this visit. Thank you!", "reviewed");
        if (!reviewOpen(b, settings, nowMs)) return fail(res, 409, "This visit can't be reviewed here.", "no_review");
        const review = cleanVisitReview(req.body, b.customer?.name || "");
        if (review.problem) return fail(res, 400, review.problem, "bad_review");
        const reviewRef = db.collection("reviews").doc(randomId());
        const createdAt = new Date(nowMs).toISOString();
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(bookings().doc(id));
          if (!fresh.exists || fresh.data().reviewId) return false;
          tx.set(reviewRef, {
            bookId: "", serviceId: b.serviceId || "", serviceName: b.serviceName || "", staffName: b.staffName || "", source: "booking",
            authorName: review.authorName, rating: review.rating, title: "", body: review.body, status: "pending", createdAt, verified: true,
          });
          // The client's email stays in the admin-only contacts, as for any review (and goes with a privacy erase).
          if (b.customer?.email) tx.set(db.collection("reviewContacts").doc(reviewRef.id), { email: String(b.customer.email).toLowerCase(), createdAt });
          tx.set(bookings().doc(id), { reviewId: reviewRef.id }, { merge: true });
          return true;
        });
        if (!claimed) return fail(res, 409, "You already reviewed this visit. Thank you!", "reviewed");
        const owner = ownerEmail();
        if (owner) {
          await sendEmail({
            to: owner, subject: `[REVIEW] ${"★".repeat(review.rating)} ${b.serviceName}`,
            html: risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(review.authorName)} reviewed ${escapeHtml(b.serviceName)}</h2>
              <p style="margin:0 0 12px;">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</p>
              <p style="margin:0 0 12px;">“${escapeHtml(review.body)}”</p>
              <p style="margin:0;">It shows on your website once you approve it in Reviews.</p>`, { shopName: shopName() }),
          }).catch(() => {});
        }
        return res.status(200).json({ booking: publicBooking(id, { ...b, reviewId: reviewRef.id }, settings, nowMs) });
      }
      if (action === "bookingCancel") {
        if (b.status === "cancelled") return res.status(200).json({ booking: publicBooking(id, b, settings, nowMs), ...(await runOf(id, b, key)) });
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
        // "Cancel this and the later visits" on a standing appointment, with the run's own key: its later visits go too.
        const alsoCancelled = req.body?.andLater === true && hash(key) === b.manageKeyHash ? (await cancelLater(id, b, "customer", at)).cancelled : 0;
        const later = alsoCancelled ? ` Your ${alsoCancelled === 1 ? "next visit is" : `${alsoCancelled} later visits are`} cancelled too.` : "";
        await tellCustomer(id, next, "cancelled", { refundText: `${!refund ? "" : b.payment === "deposit" && !b.rest ? "Your deposit is being refunded to your card." : "Your payment is being refunded to your card."}${giftBackWords(b)}${packBackWords(b)}${later}`.trim() });
        return res.status(200).json({ booking: publicBooking(id, next, settings, nowMs), ...(await runOf(id, next, key)) });
      }
      if (action === "bookingMove") {
        if (b.status !== "confirmed" || !customerCanChange(Date.parse(b.start), settings, nowMs)) {
          return fail(res, 409, `This booking can't be moved online within ${settings.cancelHours} hours of its start. Please contact the shop.`, "too_late");
        }
        if (b.course) return fail(res, 409, "A course is one sign-up for all of its dates, so it can't be moved. You can cancel it, or contact the shop.", "course");
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
        return res.status(200).json({ booking: await withEarlier(publicBooking(id, next, settings, nowMs), next) });
      }
      return fail(res, 400, "Unknown booking action.");
    } catch (err) {
      console.error("booking action failed:", action, err?.message || err);
      return fail(res, 502, "Bookings couldn't be reached just now. Please try again.");
    }
  }

  // ── Check-in at the till ─────────────────────────────────────────────────────────────────────────────────────────

  /** What the till shows about the person in front of it. */
  const arrivalCard = (id, b) => ({
    id, name: b.customer?.name || "", serviceName: b.serviceName, start: b.start, end: b.end, minutes: b.minutes,
    status: b.status, dueMinor: b.status === "confirmed" ? balanceDue(b) : 0, currency: b.currency, note: b.note || "",
    checkedInAt: b.checkedInAt || null, checkInCode: b.checkInCode || "",
  });

  /**
   * Op checkIn: `code` (typed or scanned) or `id` (from the booking's own page in the admin) marks a confirmed booking for
   * today as arrived, once; `value: false` takes it off. Answers the person's card, also when the code is refused, so the
   * till can say who it was.
   */
  async function checkIn(req, res, by) {
    const code = cleanCheckInCode(req.body?.code);
    let id = String(req.body?.id || "");
    let b;
    if (code) {
      const found = await bookings().where("checkInCode", "==", code).limit(5).get();
      if (found.empty) return fail(res, 404, "No booking has that check-in code. Check the letters, or find them in Bookings.", "unknown_code");
      const doc = found.docs.find((d) => d.data().status === "confirmed") || found.docs[0];
      id = doc.id;
      b = doc.data();
    } else {
      if (req.body?.code) return fail(res, 400, "A check-in code is eight letters and numbers, like K7QM-2XPA.", "bad_code");
      if (!ID.test(id)) return fail(res, 400, "Type or scan a check-in code.", "no_code");
      const snap = await bookings().doc(id).get();
      if (!snap.exists) return fail(res, 404, "This booking is gone.");
      b = snap.data();
    }
    const refuse = (error, why) => res.status(409).json({ error, code: why, booking: arrivalCard(id, b) });
    const at = now().toISOString();
    if (req.body?.value === false) {
      if (!b.checkedInAt) return res.status(200).json({ ok: true, booking: arrivalCard(id, b) });
      const changes = { checkedInAt: null, updatedAt: at, history: [...(b.history || []), { at, what: "check-in taken off", by }].slice(-20) };
      await bookings().doc(id).set(changes, { merge: true });
      return res.status(200).json({ ok: true, booking: arrivalCard(id, { ...b, ...changes }) });
    }
    if (b.status === "cancelled") return refuse("This booking was cancelled.", "cancelled");
    if (b.status !== "confirmed") return refuse("This booking isn't confirmed: their payment hasn't gone through yet.", "held");
    if (dayOf(Date.parse(b.start), zone()) !== dayOf(now().getTime(), zone())) return refuse(`This booking is for ${whenWords(b)}, not today.`, "not_today");
    if (b.checkedInAt) return res.status(200).json({ ok: true, already: true, booking: arrivalCard(id, b) });
    const changes = { checkedInAt: at, noShow: false, updatedAt: at, history: [...(b.history || []), { at, what: "checked in", by }].slice(-20) };
    await bookings().doc(id).set(changes, { merge: true });
    return res.status(200).json({ ok: true, booking: arrivalCard(id, { ...b, ...changes }) });
  }

  // ── The owner (createStripeCheckoutSession action "bookingsAdmin") ─────────────────────────────────────────────

  async function handleAdmin(req, res) {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const op = req.body?.op;
    const by = adminUser.email || "admin";
    try {
      // The owner flipped a Ways to sell switch (Settings › General): the website's links follow. Answered whether the
      // engine is on or not, so switching Classes off takes its link down too.
      if (op === "hint") {
        const live = (await featureOn()) && (await readSettings()).live === true;
        await tellWebsite(live);
        return res.status(200).json({ ok: true });
      }
      if (!(await featureOn())) return fail(res, 403, "Bookings aren't turned on for this shop.", "off");
      const settings = await readSettings();
      if (op === "saveService") {
        const id = ID.test(String(req.body?.service?.id || "")) ? req.body.service.id : randomId();
        const service = cleanService(req.body?.service, id);
        if (service.problem) return fail(res, 400, service.problem);
        const existing = await services().limit(MAX_SERVICES + 1).get();
        if (!existing.docs.some((d) => d.id === id) && existing.docs.length >= MAX_SERVICES) return fail(res, 400, `A shop can have up to ${MAX_SERVICES} services.`);
        await services().doc(id).set({ ...service, updatedAt: now().toISOString(), updatedBy: by });
        await tellWebsite(settings.live);
        return res.status(200).json({ ok: true, service });
      }
      if (op === "deleteService") {
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 400, "Unknown service.");
        await services().doc(id).delete();
        await tellWebsite(settings.live);
        return res.status(200).json({ ok: true });
      }
      if (op === "calendarFeed") {
        // A private calendar link (frontDoor.js answers it): the owner's (every booking) or, with `staffId`, one person's
        // own bookings (`bookingFeed/p-<id>`). Kept server-only; a new one stops the old.
        const staffId = String(req.body?.staffId || "");
        const person = staffId ? (settings.staff || []).find((p) => p.id === staffId) : null;
        if (staffId && !person) return fail(res, 400, "That person isn't on the team.");
        const ref = db.collection("bookingFeed").doc(staffId ? `p-${staffId}` : "main");
        const snap = await ref.get();
        let token = snap.exists ? snap.data()?.token : "";
        if (!KEY.test(String(token || "")) || req.body?.renew === true) {
          token = randomKey();
          await ref.set({ token, madeAt: now().toISOString(), madeBy: by, ...(person ? { staffId, staffName: person.name } : {}) });
        }
        return res.status(200).json({ path: `/calendar/${token}.ics` });
      }
      if (op === "textStatus") {
        // The Text reminders switch: open (with the price of one text part) or "Opening soon".
        const status = texts ? await texts.status().catch(() => ({ available: false, price: "" })) : { available: false, price: "" };
        return res.status(200).json({ available: status.available === true, price: status.price || "" });
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
        const found = (await readServices()).find((s) => s.id === req.body?.serviceId);
        if (!found) return fail(res, 404, "Choose a service.");
        const asked = withExtras(forPerson(found, settings, req.body?.staffId), req.body?.extras);
        if (asked.problem) return fail(res, 400, asked.problem, "extras");
        const { service } = asked;
        const day = isDay(req.body?.day) ? req.body.day : dayOf(now().getTime(), zone());
        const nowMs = now().getTime();
        const snaps = await Promise.all([addDays(day, -1), day, addDays(day, 1)].map((d) => dayRef(d).get()));
        const own = { ...settings, minNoticeHours: 0, maxDaysAhead: 366 };
        const staffId = keptPerson(settings, service.id, req.body?.staffId);
        const times = freeTimes({ service, settings: own, busy: busyFrom(snaps, nowMs, String(req.body?.except || "")), day, zone: zone(), nowMs, staffId });
        return res.status(200).json({ times: times.map((ms) => new Date(ms).toISOString()) });
      }
      if (op === "runCheck") {
        // New booking › Repeat: is each later visit of the run free? (Any hour, as the shop books it.)
        const found = (await readServices()).find((s) => s.id === req.body?.serviceId);
        if (!found) return fail(res, 404, "Choose a service.");
        const asked = withExtras(forPerson(found, settings, req.body?.staffId), req.body?.extras);
        if (asked.problem) return fail(res, 400, asked.problem, "extras");
        const { service } = asked;
        if (isClass(service)) return fail(res, 400, "A class or course can't be booked as a standing appointment.", "run");
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a time.");
        const run = cleanRun(req.body?.run);
        if (run?.problem) return fail(res, 400, run.problem, "run");
        if (!run) return res.status(200).json({ visits: [] });
        const staffId = keptPerson(settings, service.id, req.body?.staffId);
        const starts = runStarts(start, run, zone());
        return res.status(200).json({ visits: [{ start: new Date(start).toISOString(), free: true }, ...(await runPlan({ service, settings, starts: starts.slice(1), staffId, owner: true }))] });
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
        if (w?.offerStart) await tellWaitlist([w.day], [Date.parse(w.offerStart)]);
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
            ...(p.taxMinor > 0 ? { taxMinor: p.taxMinor, taxLines: Array.isArray(p.taxLines) ? p.taxLines : [] } : {}),
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
        const found = (await readServices()).find((s) => s.id === req.body?.serviceId);
        // The owner can book someone onto a course late too, when it lets people join late.
        const listed = found && (joinableCourse(found, zone(), now().getTime()) ?? found);
        if (!listed) return fail(res, 404, "Choose a service.");
        const asked = withExtras(forPerson(listed, settings, req.body?.staffId), req.body?.extras);
        if (asked.problem) return fail(res, 400, asked.problem, "extras");
        const { service, extras } = asked;
        const customer = cleanCustomer(req.body);
        if (customer.problem) return fail(res, 400, customer.problem.replace("your", "the customer's").replace("Please add an email address we can send your booking to.", "Add the customer's email address."));
        // A course is signed up for as a whole, from its first date.
        const start = isCourse(service) ? courseStarts(service, zone())[0] : Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a time.");
        if (isCourse(service) && start <= now().getTime()) return fail(res, 409, "This course has already started.", "started");
        // A standing appointment: any one-to-one service, every visit paid at the visit.
        const run = cleanRun(req.body?.run);
        if (run?.problem) return fail(res, 400, run.problem, "run");
        if (run && isClass(service)) return fail(res, 400, "A class or course can't be booked as a standing appointment.", "run");
        const runAt = run ? runStarts(start, run, zone()) : [];
        const tax = await taxOn(service, service.priceMinor);
        const id = randomId();
        const key = randomKey();
        const at = now().toISOString();
        const record = {
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: service.gapAfter, location: service.location,
          // The owner booking someone in may fill in the service's questions or leave them.
          customer: { name: customer.name, email: customer.email, phone: customer.phone, ...(customer.textOk ? { textOk: true } : {}) }, note: customer.note, answers: cleanAnswers(service.questions, req.body?.answers, false).answers,
          // Booked in by the owner: nothing is taken by card, so a priced service is all paid at the visit.
          status: "confirmed", payment: service.priceMinor > 0 ? "atShop" : "free", priceMinor: service.priceMinor + (tax?.taxMinor || 0), ...taxFields(tax), currency: currency(),
          ...(extras.length ? { extras } : {}),
          paid: false, sessions: [], holdUntil: null, manageKeyHash: hash(key), pendingKey: null, source: "admin",
          history: [{ at, what: run ? `booked (visit 1 of ${run.visits})` : "booked", by }], createdAt: at, updatedAt: at,
          ...(run ? { series: { id: `run_${id}`, everyWeeks: run.everyWeeks, visits: run.visits, visit: 1 } } : {}),
        };
        // The owner may book any time that doesn't clash, outside the hours too (a favour for a regular), with anyone on
        // the team who does the service.
        const staffId = String(req.body?.staffId || "");
        if (staffId && !keptPerson(settings, service.id, staffId)) return fail(res, 400, "That person doesn't do this service.", "staff");
        const own = ownerBookingSettings(settings);
        const took = await takeTime({ id, service: { ...service, classTimes: [] }, settings: own, start, record, staffId });
        if (!took) return fail(res, 409, isClass(service) ? "That class is full, or the time clashes with another booking." : staffId ? "That person is busy then." : "That time clashes with another booking.", "taken");
        if (run) {
          const later = await bookRun({ firstId: id, first: record, service, settings, starts: runAt, staffId, owner: true, by });
          if (later.taken.length) return res.status(409).json({ error: "Some of those dates clash with other bookings, so nothing was booked. Change the time, the gap or the number of visits.", code: "run_taken", taken: later.taken });
        }
        const booked = await syncCalendar(id, { ...record, start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString() });
        if (req.body?.sendEmail !== false) await tellCustomer(id, booked, "booked", { key, byShop: true, run: runAt.map((ms) => new Date(ms).toISOString()) });
        return res.status(200).json({ ok: true, id, ...(run ? { visits: run.visits } : {}) });
      }
      if (op === "readers" || op === "readerAdd" || op === "readerRemove") {
        // Card readers that connect over the internet (Stripe's smart readers): one place per shop, readers added with
        // the code the reader shows; Square Terminals pair the other way round (the owner types our code on the Terminal).
        const { mode, reader } = await readerDesk();
        if (!reader) {
          if (op === "readers") return res.status(200).json({ available: false, readers: [] });
          return fail(res, 409, "Card readers need card payments connected in Settings › Payments.", "not_available");
        }
        try {
          if (op === "readerAdd" && reader.pairsWithCode) {
            // Square: the shop gets a code and the owner types it on the Terminal's sign-in screen.
            const label = text(req.body?.label, 60) || "Card reader";
            const pairing = await reader.pair({ label }, `reader-pair-${now().getTime()}`);
            return res.status(200).json({ ok: true, pairing });
          }
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
          return res.status(200).json({ available: true, testMode: reader.testMode === true, pairsWithCode: reader.pairsWithCode === true, readers: place ? await reader.list(place) : [] });
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
        const tax = await taxOn(service, priceMinor);
        const id = randomId();
        const payKey = randomKey();
        const at = now().toISOString();
        const start = now().getTime();
        const record = {
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: 0, location: service.location,
          customer: { name, email, phone: "" }, note: "", answers: [],
          // The amount is before tax: a service that charges tax adds it, as on the website.
          status: "confirmed", payment: "atShop", priceMinor: priceMinor + (tax?.taxMinor || 0), ...taxFields(tax), currency: currency(),
          ...(priceMinor !== service.priceMinor ? { listPriceMinor: service.priceMinor } : {}),
          paid: false, sessions: [], holdUntil: null, manageKeyHash: hash(randomKey()), pendingKey: null, payKey, source: "desk", walkIn: true,
          // Reminders and the second reminder are for visits still to come.
          reminderSentAt: at, reminder2SentAt: at,
          start: new Date(start).toISOString(), end: new Date(start + service.minutes * MINUTE).toISOString(),
          history: [{ at, what: "taken at the desk", by }], createdAt: at, updatedAt: at, checkedInAt: at,
        };
        await bookings().doc(id).set(record);
        return res.status(200).json({ ok: true, id, url: manageUrl(id, payKey), dueMinor: record.priceMinor, taxMinor: tax?.taxMinor || 0 });
      }
      if (op === "checkIn") return checkIn(req, res, by);
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
        // refund: true is the whole payment; refundMinor a part of it (a shop keeping a deposit), 0 for none.
        const part = req.body?.refundMinor;
        const onCard = cardTaken(b);
        const amount = part === undefined ? (req.body?.refund === true ? onCard : 0) : Number(part);
        if (!Number.isInteger(amount) || amount < 0 || amount > onCard) return fail(res, 400, "The refund can't be more than they paid.");
        let out;
        try {
          out = await shopCancel(id, b, { amount, by, giftBack: req.body?.giftBack !== false, packBack: req.body?.packBack !== false, notify: req.body?.notify !== false, andLater: req.body?.andLater === true });
        } catch (err) {
          if (!err?.refundFailed) throw err;
          return fail(res, 502, "The refund couldn't be started, so the booking is still on. Try again in a minute.");
        }
        return res.status(200).json({ ok: true, ...out });
      }
      if (op === "move") {
        if (b.status !== "confirmed") return fail(res, 409, "Only a confirmed booking can be moved.");
        if (b.course) return fail(res, 409, "A course is one sign-up for all of its dates, so it can't be moved. Cancel it and sign the person up again.", "course");
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
        const { mode, reader } = await readerDesk();
        if (!reader) return fail(res, 409, "Card readers need card payments connected in Settings › Payments.", "not_available");
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
          // The reader asks for a tip first when the shop asks for tips and none was given yet (added on top).
          const settings = await readSettings();
          const askTip = settings.tips && !b.tip && (b.priceMinor || 0) > 0 && Array.isArray(settings.tipPercents) && settings.tipPercents.length > 0;
          const place = askTip ? await readerPlace(mode, reader) : "";
          const tipPercents = askTip && (await readerTips(mode, reader, place, b.currency || currency(), settings.tipPercents)) ? settings.tipPercents : [];
          const started = await reader.charge({ readerId, amountMinor, currency: b.currency || currency(), description, metadata: { booking: id, rest: "1", reader: "1" }, tipPercents, place }, `booking-reader-${id}-${amountMinor}-${tries}`);
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

  /** Whether the platform sends texts for this shop now (textSender.js caches it a few minutes). Never throws. */
  async function textsOpen() {
    if (!texts) return false;
    try { return (await texts.status())?.available === true; } catch { return false; }
  }

  /**
   * The reminder by text too (Services plan phase 7), for a client who ticked "Text me reminders" with a number, while
   * the owner's switch is on. One text per reminder (the key is the booking's id, the kind and the reminder's own key), so
   * a second sweep never sends it again, and a moved booking's new reminder gets its own text. Never throws: the email has gone either way. A client who replied STOP loses the tick.
   */
  async function textReminder(id, b, kind, key) {
    try {
      if (!texts || !b.customer?.textOk || !b.customer?.phone) return;
      const settings = await readSettings();
      if (!settings.textReminders) return;
      const when = new Intl.DateTimeFormat("en-CA", { timeZone: zone(), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(b.start));
      const shop = String(shopName() || "").trim().slice(0, 40);
      const body = `${kind === "soon" ? "Soon" : "Reminder"}: ${b.serviceName.slice(0, 60)}${shop ? ` at ${shop}` : ""}, ${when}${b.staffName ? ` with ${b.staffName.slice(0, 30)}` : ""}. Change or cancel: ${manageUrl(id, key)} Reply STOP to stop texts.`;
      const sent = await texts.send({ to: b.customer.phone, body, kind: `booking-${kind}`, idempotencyKey: `booking-${id}-${kind}-${hash(key).slice(0, 10)}` });
      if (sent?.optedOut) await bookings().doc(id).set({ customer: { ...b.customer, textOk: false } }, { merge: true });
      else if (sent?.ok) await bookings().doc(id).set({ [kind === "soon" ? "reminder2TextAt" : "reminderTextAt"]: now().toISOString() }, { merge: true });
      else if (sent && !sent.ok) console.warn(`bookings: the ${kind} text for ${id} wasn't sent: ${sent.message || "no answer"}`);
    } catch (err) {
      console.error("bookings: reminder text failed:", err?.message || err);
    }
  }

  /**
   * Emails each confirmed customer once, about a day before their booking. Skips bookings made in the last
   * REMINDER_SKIP_HOURS (the confirmation is fresh) and ones starting within the hour. Marks before sending, so a
   * second sweep never sends twice.
   */
  async function sweepReminders() {
    if (!(await featureOn())) return { reminded: 0 };
    const { reminderHours, secondReminderHours } = await readSettings();
    if (!reminderHours && !secondReminderHours) return { reminded: 0 };
    const nowMs = now().getTime();
    const snap = await bookings().where("status", "==", "confirmed").limit(1000).get();
    let reminded = 0;
    for (const doc of snap.docs) {
      const b = doc.data();
      // A course's later dates get their own reminders (both kinds); its first date goes the usual way below.
      reminded += await remindCourseDates(doc.id, b, { reminderHours, secondReminderHours }, nowMs);
      const start = Date.parse(b.start || "");
      if (!reminderHours || b.reminderSentAt || !Number.isFinite(start)) continue;
      if (start - nowMs > reminderHours * HOUR || start - nowMs < Math.min(HOUR, reminderHours * HOUR / 2)) continue;
      if (nowMs - Date.parse(b.createdAt || "") < Math.min(REMINDER_SKIP_HOURS, reminderHours / 2) * HOUR) continue;
      // Its own link, so the customer can cancel or move from the reminder; the first email's link keeps working.
      const key = randomKey();
      await bookings().doc(doc.id).set({ reminderSentAt: new Date(nowMs).toISOString(), reminderKeyHash: hash(key) }, { merge: true });
      await tellCustomer(doc.id, b, "reminder", { byShop: true, key });
      await textReminder(doc.id, b, "reminder", key);
      reminded += 1;
    }
    return { reminded };
  }

  /**
   * Reminders for the later dates of a course: the same two reminders as any booking, once for each date, kept on the
   * booking's `course.reminded` / `course.reminded2` (the dates already told). Marked before sending. Returns how many went.
   */
  async function remindCourseDates(id, b, { reminderHours, secondReminderHours }, nowMs) {
    const starts = Array.isArray(b.course?.starts) ? b.course.starts : [];
    if (starts.length < 2) return 0;
    const length = Date.parse(b.end) - Date.parse(b.start);
    let course = b.course;
    let sent = 0;
    for (const iso of starts.slice(1)) {
      const left = Date.parse(iso) - nowMs;
      const kinds = [["reminder", reminderHours, "reminded", Math.min(HOUR, (reminderHours * HOUR) / 2), "reminderKeyHash"], ["soon", secondReminderHours, "reminded2", 15 * 60_000, "reminder2KeyHash"]];
      for (const [kind, hours, list, least, keyField] of kinds) {
        if (!hours || !Number.isFinite(left) || (course[list] || []).includes(iso) || left > hours * HOUR || left < least) continue;
        // Booked inside the window: the confirmation just went out, so this date needs no reminder (as for a first date).
        const made = Date.parse(b.createdAt || "");
        if (Number.isFinite(made) && Date.parse(iso) - made <= hours * HOUR) continue;
        const key = randomKey();
        course = { ...course, [list]: [...(course[list] || []), iso] };
        await bookings().doc(id).set({ course, [keyField]: hash(key) }, { merge: true });
        // The email and the text speak of this date, not the first.
        const dated = { ...b, course, start: iso, end: new Date(Date.parse(iso) + length).toISOString() };
        await tellCustomer(id, dated, kind, { byShop: true, key });
        await textReminder(id, dated, kind, key);
        sent += 1;
      }
    }
    return sent;
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
      await textReminder(doc.id, b, "soon", key);
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
    const list = await dayBookings(day);
    if (!list.length) return { sent: false, day };
    try {
      await sendDayList(owner, day, list, { owner: true });
      return { sent: true, day, count: list.length };
    } catch (err) {
      console.warn("Bookings day summary failed:", err?.message || err);
      return { sent: false, day };
    }
  }

  /** The day's confirmed and held bookings, in time order. */
  async function dayBookings(day) {
    const from = new Date(zonedTime(day, "00:00", zone())).toISOString();
    const to = new Date(zonedTime(addDays(day, 1), "00:00", zone())).toISOString();
    const snap = await bookings().where("start", ">=", from).where("start", "<", to).orderBy("start").limit(300).get();
    return snap.docs.map((d) => d.data()).filter((b) => b.status === "confirmed" || b.status === "held");
  }

  /** One morning list email: the owner's (every booking, a link to the admin) or one person's own day. */
  async function sendDayList(to, day, list, { owner = false, person = "" } = {}) {
    const brand = await emailBrand();
    const shop = brand.shopName || shopName() || "the shop";
    const time = (iso) => new Date(iso).toLocaleTimeString("en-CA", { timeZone: zone(), hour: "numeric", minute: "2-digit" });
    const dayWords = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
    const rows = list.map((b) => {
      const due = balanceDue(b);
      const extra = [owner ? withWhom(b) : "", b.roomName ? `in ${b.roomName}` : "", b.status === "held" ? "not confirmed yet" : "", due ? `${moneyWords(due, b.currency)} to pay at the visit` : "", b.customer?.phone || ""].filter(Boolean).join(" · ");
      return `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;white-space:nowrap;"><strong>${escapeHtml(time(b.start))}</strong></td>
          <td style="padding:8px 0;vertical-align:top;"><strong>${escapeHtml(b.customer?.name || "")}</strong> · ${escapeHtml(b.serviceName || "")}${extra ? `<br><span style="opacity:.75;">${escapeHtml(extra)}</span>` : ""}${b.note ? `<br><em>“${escapeHtml(b.note)}”</em>` : ""}</td></tr>`;
    }).join("");
    const count = `${list.length} ${list.length === 1 ? "booking" : "bookings"}`;
    await sendEmail({
      to,
      subject: owner ? `[BOOKINGS] Today: ${count}, first at ${time(list[0].start)}` : `Your day at ${shop}: ${count}, first at ${time(list[0].start)}`,
      html: risoLayout(`<h4 style="margin:0 0 8px;">${owner ? "Today's bookings" : `${escapeHtml(person)}, your bookings today`}</h4>
          <h2 style="margin:0 0 12px;">${escapeHtml(dayWords)}</h2>
          <table role="presentation" style="border-collapse:collapse;width:100%;">${rows}</table>
          ${owner ? risoButton(escapeHtml(siteLink("/admin#bookings")), "Open Bookings", brand.accent, brand.theme) : ""}
          <p style="margin:16px 0 0;font-size:13px;opacity:.75;">${owner ? "You get this each morning there are bookings. Turn it off in Bookings › Hours &amp; rules." : `${escapeHtml(shop)} sends you this each morning you have bookings. Ask them to take your email off the team list to stop it.`}</p>`,
        { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
    });
  }

  /**
   * Each person's own morning list (phase 4 part 2): every active person on the team with an email gets their own day's
   * bookings from DAILY_SUMMARY_HOUR, on days they have any. Claimed per person per day in `bookingSettings/staffSummary`
   * (`days { <staffId>: day }`) first, so two sweeps never send twice. Needs no switch: adding an email is the choice.
   */
  async function sweepStaffDays() {
    if (!(await featureOn())) return { sent: 0 };
    const settings = await readSettings();
    const people = (settings.staff || []).filter((p) => p.active && EMAIL.test(p.email || ""));
    if (!people.length) return { sent: 0 };
    const nowMs = now().getTime();
    const mark = db.collection("bookingSettings").doc("staffSummary");
    const due = await db.runTransaction(async (tx) => {
      const snap = await tx.get(mark);
      const days = { ...(snap.exists ? snap.data()?.days || {} : {}) };
      const out = [];
      for (const p of people) {
        const day = summaryDue(nowMs, zone(), String(days[p.id] || ""));
        if (day) { days[p.id] = day; out.push({ p, day }); }
      }
      if (out.length) tx.set(mark, { days, at: new Date(nowMs).toISOString() });
      return out;
    });
    if (!due.length) return { sent: 0 };
    const byDay = new Map();
    let sent = 0;
    for (const { p, day } of due) {
      if (!byDay.has(day)) byDay.set(day, await dayBookings(day));
      const list = byDay.get(day).filter((b) => b.staffId === p.id);
      if (!list.length) continue;
      try {
        await sendDayList(p.email, day, list, { person: p.name });
        sent += 1;
      } catch (err) {
        console.warn("Bookings staff day failed:", err?.message || err);
      }
    }
    return { sent };
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
      await tellCustomer(doc.id, b, "tip", { byShop: true, toOwner: false, key, reviewUrl: settings.thankYou ? settings.reviewUrl : "", siteReview: !!settings.siteReviews });
      asked += 1;
    }
    return { asked };
  }

  /**
   * The thank-you email (Hours & rules › After the visit), once per visit, TIP_ASK_HOURS after it ended (within a day of
   * that): Book again, and Leave a review when the shop gave a link. Visits that get the "Add a tip" email are thanked
   * there (`thanksDue`). Marked before sending, so a second sweep never sends twice.
   */
  async function sweepThanks() {
    if (!(await featureOn())) return { thanked: 0 };
    const settings = await readSettings();
    if (!settings.thankYou) return { thanked: 0 };
    const nowMs = now().getTime();
    const from = new Date(nowMs - (TIP_ASK_HOURS + 24) * HOUR).toISOString();
    const to = new Date(nowMs - TIP_ASK_HOURS * HOUR).toISOString();
    const snap = await bookings().where("end", ">=", from).where("end", "<=", to).limit(500).get();
    let thanked = 0;
    for (const doc of snap.docs) {
      const b = doc.data();
      if (!thanksDue(b, settings, nowMs)) continue;
      // A review on the shop's own website goes through the booking page, so the email carries its own key.
      const key = settings.siteReviews ? randomKey() : "";
      await bookings().doc(doc.id).set({ thanksSentAt: new Date(nowMs).toISOString(), ...(key ? { reviewKeyHash: hash(key) } : {}) }, { merge: true });
      await tellCustomer(doc.id, b, "thanks", { byShop: true, toOwner: false, reviewUrl: settings.reviewUrl, key, siteReview: !!key });
      thanked += 1;
    }
    return { thanked };
  }

  /**
   * Rebook reminders (Services plan phase 7): `rebookWeeks` weeks after a visit to a service that asks for them, one
   * "time for your next visit?" email with Book again (the same service, and the same person when they had one), unless
   * the client booked anything since. It is marketing mail, so it carries an unsubscribe link and skips anyone who
   * unsubscribed. Marked before sending, so a second sweep never sends twice. At most MAX_REBOOKS a sweep.
   */
  const MAX_REBOOKS = 50;
  async function sweepRebook() {
    if (!optedOut || !unsubscribeUrl || !(await featureOn())) return { reminded: 0 };
    const nowMs = now().getTime();
    const wanted = (await readServices()).filter((s) => s.active && s.rebookWeeks > 0);
    let reminded = 0;
    for (const service of wanted) {
      const dueFrom = nowMs - service.rebookWeeks * 7 * DAY;
      const from = new Date(dueFrom - REBOOK_WINDOW_DAYS * DAY).toISOString();
      const snap = await bookings().where("start", ">=", from).where("start", "<=", new Date(dueFrom).toISOString()).limit(500).get();
      for (const doc of snap.docs) {
        if (reminded >= MAX_REBOOKS) return { reminded };
        const b = doc.data();
        if (b.serviceId !== service.id || !rebookDue(b, service, nowMs)) continue;
        const email = String(b.customer.email).trim().toLowerCase();
        const mark = (extra = {}) => bookings().doc(doc.id).set({ rebookSentAt: new Date(nowMs).toISOString(), ...extra }, { merge: true });
        // Booked anything since (still on, or already been): they came back by themselves.
        const theirs = await bookings().where("customer.email", "==", b.customer.email).limit(200).get();
        if (theirs.docs.some((d) => d.id !== doc.id && d.data().start > b.start && d.data().status !== "cancelled")) { await mark({ rebookSkipped: "booked" }); continue; }
        if (await optedOut(email)) { await mark({ rebookSkipped: "unsubscribed" }); continue; }
        await mark();
        await tellRebook(b, service, email);
        reminded += 1;
      }
    }
    return { reminded };
  }

  /**
   * Minimum number to run (Classes, 17 November 2026). For each class time with a minimum whose decide time has come
   * (`runDecisionDue`: from `decideHours` before it starts), once: with at least `minPlaces` confirmed it runs; with fewer,
   * that time closes (a `closed` item on its days, on every date of a course, so nobody signs up after) and every
   * confirmed sign-up is cancelled, refunded in full (gift card and pack visit put back) and emailed, and the owner gets
   * one email. A time with someone still paying is left to the next sweep. The decision is kept in
   * `bookingRuns/<serviceId>~<startMs>`, written before anything else, so a second sweep never decides twice.
   */
  const runs = () => db.collection("bookingRuns");
  async function sweepMinimum() {
    if (!(await featureOn())) return { cancelled: 0, ran: 0 };
    const nowMs = now().getTime();
    const wanted = (await readServices()).filter((s) => s.minPlaces);
    let cancelled = 0;
    let ran = 0;
    for (const service of wanted) {
      // A course is decided on its first date; a weekly class on each of its times between now and its decide time.
      const starts = isCourse(service) ? courseStarts(service, zone()).slice(0, 1)
        : Array.from({ length: Math.ceil(service.decideHours / 24) + 2 }, (_, i) => addDays(dayOf(nowMs, zone()), i)).flatMap((d) => classStartsOn(d, service, zone()));
      for (const start of starts) {
        if (!runDecisionDue(start, service, nowMs)) continue;
        const runRef = runs().doc(`${service.id}~${start}`);
        if ((await runRef.get()).exists) continue;
        const iso = new Date(start).toISOString();
        const snap = await bookings().where("start", "==", iso).limit(MAX_PLACES_READ).get();
        const mine = snap.docs.map((d) => ({ id: d.id, b: d.data() })).filter((x) => x.b.serviceId === service.id);
        if (mine.some((x) => x.b.status === "held")) continue;
        const going = mine.filter((x) => x.b.status === "confirmed");
        const decidedAt = new Date(nowMs).toISOString();
        if (going.length >= service.minPlaces) {
          await runRef.set({ serviceId: service.id, start: iso, decision: "runs", count: going.length, minPlaces: service.minPlaces, decidedAt });
          ran += 1;
          continue;
        }
        await runRef.set({ serviceId: service.id, start: iso, decision: "cancelled", count: going.length, minPlaces: service.minPlaces, decidedAt });
        await closeClassTime(service, start);
        for (const { id, b } of going) {
          try {
            const settled = await settleRest(id, b);
            await shopCancel(id, settled, { amount: cardTaken(settled), by: "minimum", tooFew: true });
          } catch (err) {
            console.error(`bookings: couldn't cancel ${id} for the minimum:`, err?.message || err);
          }
        }
        await tellOwnerTooFew(service, start, going);
        cancelled += 1;
      }
    }
    return { cancelled, ran };
  }

  /** Closes a class time (every date of a course) so nobody signs up for it again: a `closed` item on each of its days. */
  async function closeClassTime(service, start) {
    const length = (service.minutes + (service.gapAfter || 0)) * MINUTE;
    const spans = (isCourse(service) ? courseStarts(service, zone()) : [start]).map((ms, n) => ({ key: `closed~${service.id}~${start}${n ? `~${n}` : ""}`, start: ms, end: ms + length }));
    for (const x of spans) {
      const day = dayOf(x.start, zone());
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(dayRef(day));
        const items = { ...((snap.exists ? snap.data()?.items : null) || {}) };
        items[x.key] = { start: x.start, end: x.end, s: service.id, closed: true };
        tx.set(dayRef(day), { items });
      });
    }
  }

  /** The owner's email that a class time didn't reach its minimum and who was cancelled. Never throws. */
  async function tellOwnerTooFew(service, start, going) {
    try {
      const owner = ownerEmail();
      if (!owner) return;
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const when = whenWords({ start: new Date(start).toISOString() });
      const kind = isCourse(service) ? "course" : "class";
      const people = going.length ? `<ul style="margin:0 0 16px;padding-left:20px;">${going.map(({ b }) => `<li>${escapeHtml(b.customer?.name || "")} · ${escapeHtml(b.customer?.email || "")}</li>`).join("")}</ul>` : "";
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">Not enough people</h4>
        <h2 style="margin:0 0 12px;">${escapeHtml(service.name)}, ${escapeHtml(when)}</h2>
        <p style="margin:0 0 12px;">${going.length} signed up and this ${kind} needs ${service.minPlaces}, so it has been cancelled and nobody else can sign up for it.${going.length ? ` ${going.length === 1 ? "They were" : "Each of them was"} refunded in full and emailed:` : ""}</p>
        ${people}
        ${risoButton(escapeHtml(siteLink("/admin#bookings")), "Open Bookings", brand.accent, brand.theme)}
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to: owner, subject: `[BOOKING] Not enough people: ${service.name}, ${when}`, html });
    } catch (err) {
      console.error("bookings: minimum email to the owner failed:", err?.message || err);
    }
  }

  /** The rebook reminder itself. Never throws. */
  async function tellRebook(b, service, email) {
    try {
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const first = String(b.customer?.name || "").trim().split(/\s+/)[0] || "";
      const weeks = service.rebookWeeks;
      const since = weeks === 1 ? "a week" : weeks % 4 === 0 && weeks <= 48 ? `${weeks / 4 === 1 ? "a month" : `${weeks / 4} months`}` : `${weeks} weeks`;
      const query = `service=${encodeURIComponent(service.id)}${b.staffId ? `&with=${encodeURIComponent(b.staffId)}` : ""}`;
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">Time for your next visit?</h4>
        <h2 style="margin:0 0 12px;">${escapeHtml(service.name)}</h2>
        <p style="margin:0 0 16px;">${first ? `Hi ${escapeHtml(first)}, it` : "It"}'s been about ${since} since your last ${escapeHtml(service.name)} at ${escapeHtml(shop)}${b.staffName ? ` with ${escapeHtml(b.staffName)}` : ""}. Whenever you're ready, you can pick your next time online.</p>
        ${risoButton(escapeHtml(siteLink(`/book?${query}`)), "Book your next visit", brand.accent, brand.theme)}
        <p style="margin-top:28px;font-size:11px;color:#888;">Don't want reminders like this? <a href="${escapeHtml(await unsubscribeUrl(email))}">Unsubscribe</a>.</p>
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to: email, subject: `Time for your next ${service.name}?`, html });
    } catch (err) {
      console.error("bookings: rebook reminder failed:", err?.message || err);
    }
  }

  return { handlePublic, handleAdmin, sweepHolds, sweepReminders, sweepSecondReminders, sweepSummary, sweepStaffDays, sweepWaitlist, sweepTips, sweepThanks, sweepRebook, sweepMinimum, featureOn, pickupCheck };
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
  const [on, feeds] = await Promise.all([engineOn(shop), shop.collection("bookingFeed").limit(200).get()]);
  if (!on) return null;
  // The owner's link (`main`) or one person's (`p-<staffId>`); every token is compared, so the time taken never says which.
  let feed = null;
  for (const d of feeds.docs) if (sameHash(d.data()?.token, token) && !feed) feed = { id: d.id, ...d.data() };
  if (!feed) return null;
  const staffId = feed.id === "main" ? "" : String(feed.staffId || "");
  if (feed.id !== "main" && !staffId) return null;
  const snap = await shop.collection("bookings").where("status", "in", ["confirmed", "held"]).limit(2000).get();
  const from = nowMs - 31 * 24 * HOUR;
  // Someone on a course is in the calendar on every one of its dates.
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .flatMap((b) => datesOf(b).map((x, n) => ({ ...b, id: n ? `${b.id}-${n + 1}` : b.id, start: new Date(x.start).toISOString(), end: new Date(x.end).toISOString(), ...(n && b.course?.staff?.[n] ? { staffName: b.course.staff[n] } : {}), ...(n && b.course?.staffIds?.[n] ? { staffId: b.course.staffIds[n] } : {}), ...(n && !b.course?.staffIds && b.course?.staff?.[n] && b.course.staff[n] !== b.staffName ? { staffId: b.course.staff[n] === feed.staffName ? staffId : "" } : {}) })))
    .filter((b) => Date.parse(b.end || "") >= from && (!staffId || b.staffId === staffId))
    .map((b) => ({
      id: b.id, start: Date.parse(b.start), end: Date.parse(b.end), location: b.roomName ? [b.roomName, b.location].filter(Boolean).join(", ") : b.location || "",
      title: `${b.customer?.name || "Booking"}: ${b.serviceName || "Booking"}${b.staffName && !staffId ? ` (${b.staffName})` : ""}${b.status === "held" ? " (not paid yet)" : ""}`,
      details: [b.customer?.email, b.customer?.phone, extrasWords(b) ? `Extras: ${extrasWords(b)}` : "", b.meetUrl ? `Video call: ${b.meetUrl}` : "", b.note ? `“${b.note}”` : "", ...(b.answers || []).map((a) => `${a.label}: ${a.answer}`)].filter(Boolean).join("\n"),
    }));
  const person = staffId ? feed.staffName || "" : "";
  return bookingsFeedIcs(shopName ? `${shopName} bookings${person ? ` · ${person}` : ""}` : "Bookings", events, nowMs);
}

/** One booking as a calendar file, for the customer's "Add to Apple Calendar" link. null for a wrong link or a cancelled booking. */
async function customerBookingIcs({ db, shopId, id, key, shopName = "", nowMs = Date.now() }) {
  if (!ID.test(String(id || "")) || !KEY.test(String(key || ""))) return null;
  const shop = db.collection("shops").doc(shopId);
  const [on, snap] = await Promise.all([engineOn(shop), shop.collection("bookings").doc(id).get()]);
  const b = snap.exists ? snap.data() : null;
  if (!on || !b || b.status !== "confirmed") return null;
  if (!keyFits(b, key)) return null;
  const title = shopName ? `${b.serviceName} · ${shopName}` : b.serviceName;
  const spans = datesOf(b);
  // A course: one file with every date.
  if (spans.length > 1) return bookingsFeedIcs(title, spans.map((x, n) => ({ id: n ? `${id}-${n + 1}` : id, title, start: x.start, end: x.end, location: b.location || "" })), nowMs);
  return bookingIcs({ id, title, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "", nowMs });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** The booking's own link, the reminder's, the tip email's or the owner's pay link: each opens the customer's booking page. */
const keyFits = (b, key) => [b.manageKeyHash, b.reminderKeyHash, b.reminder2KeyHash, b.tipKeyHash, b.reviewKeyHash, b.payKey ? hash(b.payKey) : ""].some((h) => h && sameHash(h, hash(key)));
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

const PUBLIC_BOOKING_ACTIONS = Object.freeze(["bookingInfo", "bookingTimes", "bookingRunCheck", "bookingCode", "bookingGiftCard", "bookingStart", "bookingView", "bookingCancel", "bookingMove", "bookingWait", "bookingEarlier", "bookingEarlierView", "bookingEarlierTake", "bookingPayRest", "bookingTip", "bookingReview", "bookingPackBuy", "bookingPackView", "bookingPack", "pickupTimes"]);

module.exports = { PickupTimeProblem, bookingsFeed, customerBookingIcs, bookingActions, busyFrom, cleanCustomer, publicBooking, PUBLIC_BOOKING_ACTIONS, HOLD_MINUTES };
