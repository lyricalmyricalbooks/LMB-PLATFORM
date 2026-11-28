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
//                            source: "website" | "admin", cameFrom? (2.7: instagram, facebook, google, qr, button), noShow?, history: [{ at, what, by }], createdAt, updatedAt,
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
//   bookingForms/{emailHash}[-{formId}] { email, name, formId, signedName, signedAt, version, title, text, answers, bookingId }:
//                          a form a client filled in before a visit (Services plan 2, B4; several, plan 4, 3.1), the words
//                          they signed kept with it. Server-only (health answers). The first form ("main") keeps the bare
//                          email hash, so older signatures still count; signing again (new wording, or run out) replaces it.
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
  cleanService, cleanBookingSettings, cleanAnswers, formsFor, formVersion, formStillSigned, formRunsOut, freeTimes, isClass, isCourse, joinableCourse, runDecisionDue, classStartsOn, courseStarts, coursePlacesLeft, daysTouched, addDays, dayOf, isDay, customerCanChange,
  googleCalendarLink, bookingsFeedIcs, bookingIcs, MAX_SERVICES, depositOf, cardAsk, cardTaken, giftCardPart, giftTaken, bookedCardTaken, restTaken, balanceDue, restPayable, feeChargeable, tipTaken, tipFits, tipOpen, tipLimitMinor,
  secondReminderDue, summaryDue, thanksDue, rebookDue, reviewOpen, cleanVisitReview, REBOOK_WINDOW_DAYS, zonedTime, offersPack, packLeft, packProblem, packEndsOn, PACK_MESSAGES, MIN_CARD_MINOR,
  pickupSlots, pickupTimeProblem, PICKUP_MESSAGES, PICKUP_DAYS_AHEAD,
  whoIsFree, booksByPerson, classPlacesLeft, keptPerson, forPerson, ownerBookingSettings, cleanBlocks, MAX_BLOCKS, cleanCheckInCode, checkInCodeFrom,
  cleanRun, runStarts, runSettings, runsOnline, withExtras, withLength, processingStretch,
  MAX_VISIT_PARTS, joinsVisit, visitService, visitTimeline, visitStaff, visitFreeTimes, visitName, visitPlan,
  answerBy, approvalAllowed, bookingChannel, cleanVisitAddress, inArea, addressLine, cleanZone, zonesDiffer,
  cleanBirthday, birthdaysOn, visitHappened, WELCOME_AFTER_HOURS, KEEP_IN_TOUCH_WINDOW_DAYS,
} = require("./shared/bookingTimes");
const { waysAllowed, waysOn } = require("./shared/waysToSell");
const { hooksFor } = require("./bookingHooks");
const { cleanFeedUrl, feedHostAllowed, busyFromIcs, looksLikeCalendar, MAX_FEEDS, FEED_DAYS } = require("./shared/calendarFeeds");
const { cleanPromo, cleanGroup, promoBody, promoHours, phoneKey, RECENT_DAYS, MAX_PROMO_TEXTS, PROMO_GAP_HOURS, PROMO_FROM_HOUR, PROMO_UNTIL_HOUR } = require("./shared/promoTexts");
const { cleanLoyalty, loyaltyEarns, visitPoints, orderPoints, rewardsDue, pointsToNext, rewardCode, cleanAdjust, LOYALTY_WINDOW_DAYS } = require("./shared/loyalty");
const { cleanShift, clockState, clockStep, shiftMinutes, MAX_SHIFT_HOURS } = require("./shared/timeClock");
const { cleanRotaShift, cleanTimeOff, daysBetween, timeOffWhen, MAX_ROTA_WEEK, MAX_NOTE } = require("./shared/teamRota");
const { emailWords, textWords, fillMessage, messageLanguage } = require("./shared/bookingMessages");
const { shopLanguage } = require("./emailFrench");
const { bookingDiscountMinor, tooSmallForCard, BookingCodeProblem } = require("./bookingDiscount");
const { emailIdentity } = require("./discountClaims");
const { findCountry, regionCode } = require("./shared/shippingZones");
const { giftCardId, last4, giftCardProblem, availableMinor, withHistory, GIFT_CARD_MESSAGES } = require("./giftCards");

const HOLD_MINUTES = 10;
/**
 * What each team desk role may do (plan 4, 4.1): a front desk books, moves, cancels and checks people in for everyone,
 * never services, settings, reports, packs, readers' set-up or the missed-visit fee; a service provider checks their own
 * clients in, marks their own no-shows and (My day, 4.6) takes payment and keeps a note on their own visits.
 */
const DESK_OPS = Object.freeze({
  frontDesk: Object.freeze(["times", "create", "move", "cancel", "accept", "decline", "checkIn", "noShow", "paidAtShop", "walkIn", "payLink", "waitlist", "removeWaiting", "addBlock", "removeBlock", "clientForm", "visitNote", "points"]),
  provider: Object.freeze(["checkIn", "noShow", "paidAtShop", "payLink", "visitNote"]),
});
/** A visit note's longest length, as the client card's (src/app/admin/clientVisits.ts MAX_VISIT_NOTE, firestore.rules). */
const MAX_VISIT_NOTE = 4000;
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
/** A class at weekly times or any free time, not a course: what a class pass books. */
const weeklyClass = (s) => isClass(s) && !isCourse(s);
const courseOpen = (s, zone, nowMs) => s.active && isCourse(s) && joinableCourse(s, zone, nowMs) !== null;
/**
 * The stretches a booking holds on the days' ledger: one for an ordinary booking (under its own id), and one for each
 * session of a course (the first under the id, the rest under `<id>~<n>`).
 */
function spansOf(id, b) {
  const first = Date.parse(b.start);
  const length = Date.parse(b.end) - first + (b.gapAfter || 0) * MINUTE;
  const starts = Array.isArray(b.course?.starts) && b.course.starts.length ? b.course.starts.map((iso) => Date.parse(iso)) : [first];
  // `from`: where its time before (set-up or travel, plan 4, 1.6) begins, for the days it touches.
  const before = (b.gapBefore || 0) * MINUTE;
  // Several services in one visit (plan 4, 2.1): the first runs until the next starts; each later one is its own item
  // (`<id>~p<n>`), with its own person, and only the last keeps its tidy-up time.
  if (Array.isArray(b.parts) && b.parts.length) {
    const own = { key: id, start: first, end: Date.parse(b.parts[0].start), from: first - before };
    return [own, ...b.parts.map((p, n) => {
      const start = Date.parse(p.start);
      return { key: `${id}~p${n + 1}`, start, end: Date.parse(p.end) + (p.gapAfter || 0) * MINUTE, from: start };
    })];
  }
  return starts.map((start, n) => ({ key: n ? `${id}~${n}` : id, start, end: start + length, from: start - before }));
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
// A team member's own Google Calendar (Services plan 2, B6): their busy times are copied into the day records as items
// keyed `gcal~<person>~<start>~<end>` (`g: true`, `p`: the person), so every free-time check closes those times for them
// alone, the same way as their bookings. Read again at most every 15 minutes, 60 days ahead.
const GCAL = "gcal~";
const TEAM_BUSY_EVERY_MS = 15 * 60_000;
const TEAM_BUSY_DAYS = 60;
// Outlook, Apple and other calendars (plan 4, 5.7): busy times copied the same way as `ical~<feed>~<start>~<end>` (`g:
// true`, `p` only for a person's calendar; none closes the time for everyone). The addresses are secrets, kept only in
// server-only `bookingCalendars/main`.
const ICAL = "ical~";
const FEED_EVERY_MS = 15 * 60_000;
const FEED_MAX_BYTES = 3 * 1024 * 1024;
const FEED_TIMEOUT_MS = 10_000;

/**
 * Reads one calendar address: `{ ok: true, text }`, `{ ok: false, status }`, or throws when it can't be reached. Only
 * https to the calendars `feedHostAllowed` names, on every redirect too (at most three), 10 seconds, 3 MB.
 */
async function readFeed(url) {
  let at = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const u = new URL(at);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !feedHostAllowed(u.hostname)) throw new Error("not_allowed");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
    try {
      const res = await fetch(at, { redirect: "manual", signal: ctrl.signal, headers: { accept: "text/calendar, text/plain;q=0.5" } });
      const next = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && next) { at = new URL(next, at).toString(); continue; }
      if (!res.ok || !res.body) return { ok: false, status: res.status };
      const reader = res.body.getReader();
      const parts = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > FEED_MAX_BYTES) { await reader.cancel().catch(() => {}); return { ok: false, status: 413 }; }
        parts.push(Buffer.from(value));
      }
      return { ok: true, text: Buffer.concat(parts).toString("utf8") };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too_many_redirects");
}

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
      // Time before (plan 4, 1.6): `pre` minutes ahead of the start are kept free too.
      const pre = Number.isFinite(item.pre) && item.pre > 0 ? item.pre * MINUTE : 0;
      busy.push({ start: item.start - pre, end: item.end, serviceId: typeof item.s === "string" ? item.s : undefined,
        // Whose booking it is and which room it uses (staff and rooms); an older item without them blocks everyone.
        ...(typeof item.p === "string" && item.p ? { staffId: item.p } : {}), ...(typeof item.r === "string" && item.r ? { roomId: item.r } : {}),
        // A class time cancelled for too few people (sweepMinimum): it closes that class then, nothing else.
        ...(item.closed === true ? { closed: true } : {}),
        // A calendar busy time (`gcal~…`, `ical~…`): not a booking, so it never counts towards the daily limit.
        ...(item.g === true || id.startsWith(GCAL) || id.startsWith(ICAL) ? { away: true } : {}),
        // Processing time inside it (plan 4, 1.5): the person is free for a booking that fits wholly in there.
        ...(Array.isArray(item.g) && Number.isFinite(item.g[0]) && Number.isFinite(item.g[1]) && item.g[0] < item.g[1] ? { free: { start: item.g[0], end: item.g[1] } } : {}) });
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

/** A day item's processing time (plan 4, 1.5): `g: [from, to]`, or nothing when the booking has none. */
function gapPart(service, start) {
  const gap = processingStretch(service, start);
  return gap ? { g: [gap.start, gap.end] } : {};
}

/** What a booking keeps of its service's processing time, so a later edit to the service never moves it. */
function processingRecord(service) {
  return {
    ...(processingStretch(service, 0) ? { processAfter: service.processAfter, processMinutes: service.processMinutes } : {}),
    // Time before (plan 4, 1.6) is kept the same way.
    ...(service.gapBefore > 0 ? { gapBefore: service.gapBefore } : {}),
  };
}

/** A day item's time before (plan 4, 1.6): `pre` in minutes, or nothing. */
const prePart = (minutes) => (minutes > 0 ? { pre: minutes } : {});

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
  return { name, email, phone, textOk: body?.textOk === true && /\d{7}/.test(phone.replace(/\D/g, "")), promoOk: body?.promoOk === true && /\d{7}/.test(phone.replace(/\D/g, "")), note: typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "", birthday: cleanBirthday(body?.birthday) };
}

/** A booking's add-ons in words ("Deep conditioning, Long hair"), "" with none. */
function extrasWords(b) {
  return (Array.isArray(b.extras) ? b.extras : []).map((e) => e?.name).filter((n) => typeof n === "string" && n).join(", ");
}

/** What the customer's page may see of a booking (never the payment ids or the key's hash). */
/**
 * The booking as a client may see it (plan 4, 2.4): with the shop's "hide names" choice, no person's name anywhere
 * (the booking, each service of a visit, a course's dates). The shop's own copies keep them.
 */
function namesForClient(b, settings) {
  if (settings?.teamShown !== "hidden" || !b) return b;
  return {
    ...b, staffName: "",
    ...(Array.isArray(b.parts) ? { parts: b.parts.map((p) => ({ ...p, staffName: "" })) } : {}),
    ...(b.course?.staff ? { course: { ...b.course, staff: b.course.staff.map(() => "") } } : {}),
  };
}

function publicBooking(id, booking, settings, nowMs) {
  const b = namesForClient(booking, settings);
  const start = Date.parse(b.start);
  return {
    id, serviceId: b.serviceId, serviceName: visitName(b), minutes: b.minutes, location: b.location || "", start: b.start, end: b.end,
    staffId: b.staffId || "", staffName: b.staffName || "",
    ...(b.lengthId ? { lengthId: b.lengthId } : {}),
    // Several services in one visit (plan 4, 2.1): each in turn, with its time and who takes it.
    ...(Array.isArray(b.parts) && b.parts.length ? { visit: visitPlan(b) } : {}),
    ...(Array.isArray(b.extras) && b.extras.length ? { extras: b.extras.map((e) => ({ id: e.id, name: e.name, minutes: e.minutes, priceMinor: e.priceMinor })) } : {}),
    // A course: every one of its dates (the first is `start`).
    ...(Array.isArray(b.course?.starts) && b.course.starts.length > 1 ? { courseStarts: b.course.starts } : {}),
    // A standing appointment: which visit of the run this is.
    ...(b.series?.id ? { run: { visit: b.series.visit || 1, visits: b.series.visits || 1, everyWeeks: b.series.everyWeeks || 1 } } : {}),
    meetUrl: b.status === "confirmed" ? b.meetUrl || "" : "",
    ...(cleanZone(b.clientZone) ? { clientZone: b.clientZone } : {}),
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
    // A request waiting for the owner (plan 4, 2.5): when it must be answered by; the client may withdraw it any time.
    ...(b.status === "requested" ? { answerBy: b.answerBy || "", canWithdraw: true } : {}),
    ...(b.declined ? { declined: true } : {}),
    // A course is one sign-up for all of its dates: it can be cancelled online, never moved.
    // A visit with several services is moved by the shop (each person's time has to fit again).
    canMove: b.status === "confirmed" && customerCanChange(start, settings, nowMs) && !b.course && !b.parts?.length,
    // "Tell me if an earlier time opens": a one-to-one visit still ahead (never a class or a course).
    canEarlier: b.status === "confirmed" && start > nowMs && !b.course && !b.parts?.length, earlier: b.earlierWanted === true,
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
    // Confirm requests (plan 4, 3.3): whether the client said "Yes, I'll be there", and whether the page asks them to.
    clientConfirmed: !!b.clientConfirmedAt && b.status === "confirmed",
    askConfirm: !!settings.askToConfirm && b.status === "confirmed" && !b.clientConfirmedAt && start > nowMs,
  };
}

function bookingActions({
  db, requireAdmin, requireBookingsTeam = null, payments, shopTestMode, hitLimit, LIMITS, siteLink, shopName = () => "", zone, currency,
  // My bookings in the customer account (plan 4, 2.10): (req) → { email } for a signed-in customer with a verified
  // email, else null. None: the account shows no bookings.
  identify = async () => null,
  sendEmail = async () => {}, emailBrand = async () => ({}), claimEmailSend = async () => true, ownerEmail = () => "",
  escapeHtml, risoLayout, risoButton, now = () => new Date(), randomId = () => crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(8, "0"),
  randomKey = () => crypto.randomBytes(24).toString("hex"),
  // Bookings straight into the owner's Google Calendar (googleConnect.js googleCalendarSync): { put, remove }, or none.
  calendar = null,
  // Discount codes on bookings: (code, email) → the shop's discount, checked like checkout's (on, dates, usage limit,
  // who may use it, one use per customer across orders), or throws with the customer's words. None: codes are refused.
  findDiscount = null,
  // Outlook, Apple and other calendars (plan 4, 5.7): (url) → { ok, text } | { ok: false, status }; tests pass a fake.
  fetchFeed = readFeed,
  // Send bookings to other apps (plan 4, 5.8): the post and the name lookup; tests pass fakes. None: the real ones.
  fetchHook = undefined, lookupHost = undefined,
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
  const formsList = () => db.collection("bookingForms");
  const formDoc = (email, formId = "main") => {
    const base = hash(String(email || "").trim().toLowerCase()).slice(0, 40);
    return formsList().doc(formId === "main" ? base : `${base}-${formId}`);
  };
  /**
   * The shop's forms for this booking's service, each with its client's signed record and whether it still counts at
   * the visit (this wording, not run out by then); null with none.
   */
  async function formState(b, settings) {
    const forms = formsFor(settings?.intakeForms, b.serviceId);
    if (!forms.length || !EMAIL.test(String(b.customer?.email || ""))) return null;
    const at = Date.parse(b.start) || now().getTime();
    const list = await Promise.all(forms.map(async (form) => {
      const snap = await formDoc(b.customer.email, form.id).get();
      const record = snap.exists ? snap.data() : null;
      return { form, record, signed: formStillSigned(record, form, at) };
    }));
    const waiting = list.filter((x) => !x.signed);
    return { list, waiting, next: waiting[0] || null, signed: !waiting.length };
  }
  /**
   * A booking card with the next form still to fill in (`form`, with how many are left in `formsLeft`) or, once every
   * one counts, when the last was signed (`formSigned`).
   */
  async function withForm(card, b, settings) {
    const state = b.status === "cancelled" ? null : await formState(b, settings);
    if (!state) return card;
    if (state.signed) return { ...card, formSigned: state.list.map((x) => x.record.signedAt).sort().pop() };
    const { form, record } = state.next;
    const ranOut = !!record?.signedAt && record.version === formVersion(form);
    return { ...card, form: { id: form.id, title: form.title, text: form.text, questions: form.questions, ...(ranOut ? { renew: true } : {}) }, formsLeft: state.waiting.length };
  }
  const packs = () => db.collection("bookingPacks");
  // Clock in and out (plan 4, 4.2): timeClock/{id} { email, name, staffId?, day, in, out | null, breaks[], open, by,
  // updatedAt }. Written only here; `open` is true while the person is on the clock (at most one each).
  const shifts = () => db.collection("timeClock");
  // Shifts and time off (plan 4, 4.3): rota/{id} { email, name, staffId?, day, start, end, note? } planned by the owner;
  // timeOff/{id} { email, name, staffId?, from, to, start?, end?, note?, status, answer?, createdAt, answeredAt? }.
  const rota = () => db.collection("rota");
  const timeOffs = () => db.collection("timeOff");

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
  /**
   * The services a client added after the first (plan 4, 2.1), from `also: [{ serviceId, staffId }]`: each a one-to-one
   * service taking bookings, at the picked person's own length and price. { more } or { problem }.
   */
  async function visitParts(body, first, settings) {
    const raw = Array.isArray(body?.also) ? body.also : [];
    if (!raw.length) return { more: [] };
    if (raw.length > MAX_VISIT_PARTS) return { problem: `One visit can hold at most ${MAX_VISIT_PARTS + 1} services.` };
    if (!joinsVisit(first)) return { problem: "A class can't share a visit with other services. Please book it on its own." };
    const listed = await readServices();
    const more = [];
    for (const a of raw) {
      const s = listed.find((x) => x.id === a?.serviceId && x.active);
      if (!s) return { problem: "One of those services isn't taking bookings right now." };
      if (!joinsVisit(s)) return { problem: `${s.name} is a class, so it can't share a visit. Please book it on its own.` };
      const staffId = String(a?.staffId || "");
      if (staffId && !keptPerson(settings, s.id, staffId)) return { problem: `That person doesn't take ${s.name}. Please pick someone else.` };
      more.push({ service: forPerson(s, settings, staffId), staffId });
    }
    return { more };
  }
  /**
   * The service as the client asked for it: the length they chose (plan 4, 2.2), then the person's own rates, then the
   * add-ons they ticked, so every rule after it sees the booking's real length and price. `{ problem, code }` when not.
   */
  function askedFor(listed, settings, body) {
    const sized = withLength(listed, body?.length);
    if (sized.problem) return { problem: sized.problem, code: "length" };
    const asked = withExtras(forPerson(sized.service, settings, body?.staffId), body?.extras);
    return asked.problem ? { problem: asked.problem, code: "extras" } : asked;
  }
  /** The visit as one service for the price rules (the first service's own when nothing was added). */
  const visitPriced = (service, more) => (more.length ? visitService(service, more.map((m) => m.service)) : service);
  /** Tax on a visit: only on the share of `amountMinor` from services that charge it. */
  const taxBase = (service, amountMinor) => (service.taxedMinor === undefined || !(service.priceMinor > 0) ? amountMinor : Math.round((amountMinor * service.taxedMinor) / service.priceMinor));

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
    return { title: `${who}: ${visitName(b) || "Booking"}${b.staffName ? ` (${b.staffName})` : ""}`, start: b.start, end: b.end, location: b.location || "", details };
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

  function whenWords(b, at = b.start, lang = "en") {
    const start = new Date(at);
    const opts = { timeZone: zone() };
    const locale = lang === "fr" ? "fr-CA" : "en-CA";
    const dayText = start.toLocaleDateString(locale, { ...opts, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeText = start.toLocaleTimeString(locale, { ...opts, hour: "numeric", minute: "2-digit" });
    return `${dayText} ${lang === "fr" ? "à" : "at"} ${timeText}${theirClock(b.clientZone, start, lang)}`;
  }
  /** An online visit booked from another time zone (plan 4, 2.9): " (8:00 p.m. Saturday your time, London)". */
  function theirClock(clientZone, start, lang = "en") {
    const theirs = cleanZone(clientZone);
    if (!theirs || !zonesDiffer(theirs, zone(), start.getTime())) return "";
    const locale = lang === "fr" ? "fr-CA" : "en-CA";
    const time = start.toLocaleTimeString(locale, { timeZone: theirs, hour: "numeric", minute: "2-digit" });
    const sameDay = dayOf(start.getTime(), theirs) === dayOf(start.getTime(), zone());
    const day = sameDay ? "" : ` ${start.toLocaleDateString(locale, { timeZone: theirs, weekday: "long" })}`;
    return ` (${time}${day} ${lang === "fr" ? "chez vous" : "your time"}, ${theirs.split("/").pop().replace(/_/g, " ")})`;
  }
  /** "11:00 a.m." in the shop's zone. */
  const clockOf = (at, lang = "en") => new Date(at).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA", { timeZone: zone(), hour: "numeric", minute: "2-digit" });

  /** The client's language for a booking (plan 4, 3.5): the booking page's, else the shop's. Never throws. */
  async function clientLanguage(b) {
    if (b?.locale) return messageLanguage(b.locale, "en");
    return messageLanguage("", await shopLanguage(db).catch(() => "en"));
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
      b = namesForClient(b, await readSettings().catch(() => null));
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const settings0 = await readSettings().catch(() => null);
      const lang = await clientLanguage(b);
      const T = EMAIL_LABELS[lang];
      const money$ = (minor, l = lang) => moneyWords(minor, b.currency, l);
      const arriving = ["booked", "moved", "reminder", "soon"].includes(kind);
      if (arriving) b = await withCheckInCode(id, b).catch(() => b);
      const ended = kind === "cancelled" || kind === "declined" || kind === "notCleared" || kind === "fee" || kind === "tip" || kind === "tipPaid" || kind === "thanks";
      const due = balanceDue(b);
      const taken = bookedCardTaken(b);
      const cancelHours = ended || !b.card ? 0 : settings0?.cancelHours || 0;
      /** The details under the words, in one language (the client's; English for the owner's copy). */
      const details = (l) => {
        const L = EMAIL_LABELS[l];
        const m$ = (minor) => moneyWords(minor, b.currency, l);
        const dates = Array.isArray(b.course?.starts) && b.course.starts.length > 1
          ? `<p style="margin:12px 0 4px;"><strong>${escapeHtml(L.allDates(b.course.starts.length))}</strong></p><ul style="margin:0 0 8px;padding-left:20px;">${b.course.starts.map((iso) => `<li>${escapeHtml(whenWords(b, iso, l))}</li>`).join("")}</ul>` : "";
        const runDates = run.length > 1
          ? `<p style="margin:12px 0 4px;"><strong>${escapeHtml(L.allVisits(run.length, b.series?.everyWeeks))}</strong></p><ul style="margin:0 0 8px;padding-left:20px;">${run.map((iso) => `<li>${escapeHtml(whenWords(b, iso, l))}</li>`).join("")}</ul><p style="margin:0 0 4px;font-size:13px;">${escapeHtml(L.eachVisit)}</p>` : "";
        const plan = visitPlan(b);
        const visitList = plan.length > 1
          ? `<p style="margin:12px 0 4px;"><strong>${escapeHtml(L.yourVisit)}</strong></p><ul style="margin:0 0 8px;padding-left:20px;">${plan.map((p) => `<li>${escapeHtml(`${clockOf(p.start, l)} ${p.serviceName}${p.staffName ? `, ${L.withLower} ${p.staffName}` : ""}`)}</li>`).join("")}</ul>` : "";
        const packLine = ended || !b.pack ? "" : `<p style="margin:0 0 4px;"><strong>${escapeHtml(L.paidWithPack(b.pack.last4 || ""))}</strong> ${escapeHtml(L.visitOf(b.pack.visit || 1, b.pack.visits || 1))}</p>`;
        const taxNames = (Array.isArray(b.taxLines) ? b.taxLines : []).map((x) => x?.name).filter(Boolean).join(", ");
        const money = ended || !(b.priceMinor > 0) ? packLine : [
          b.discount?.amountMinor ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(L.discount(b.discount.code))}</strong> ${escapeHtml(L.off(m$(b.discount.amountMinor)))}</p>` : "",
          b?.taxMinor > 0 ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(L.tax(taxNames))}</strong> ${escapeHtml(m$(b.taxMinor))}</p>` : "",
          giftTaken(b) ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(L.giftCard(b.giftCard.last4 || ""))}</strong> ${escapeHtml(m$(giftTaken(b)))}</p>` : "",
          b.payment === "deposit" && taken ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(L.depositPaid)}</strong> ${escapeHtml(m$(taken))}</p>` : "",
          due ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(kind === "payRest" ? L.leftToPay : L.toPayAtVisit)}</strong> ${escapeHtml(m$(due))}</p>` : `<p style="margin:0 0 4px;"><strong>${escapeHtml(L.paid)}</strong> ${escapeHtml(m$(b.priceMinor))}</p>`,
        ].join("");
        const held = ended || !b.card ? "" : `<p style="margin:0 0 4px;"><strong>${escapeHtml(L.cardOnFile)}</strong> ${escapeHtml(L.cardWords(cardWords(b.card, l), cancelHours, m$(b.lateFeeMinor || 0)))}</p>`;
        return { dates, runDates, visitList, money, held };
      };
      const mine = details(lang);
      const when = whenWords(b, b.start, lang);
      const where = b.location ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(T.where)}</strong> ${escapeHtml(b.location)}</p>` : "";
      const video = b.meetUrl && b.status !== "cancelled" ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(T.videoCall)}</strong> <a href="${escapeHtml(b.meetUrl)}">${escapeHtml(T.joinMeet)}</a></p>` : "";
      const checkIn = arriving && b.checkInCode ? `<p style="margin:16px 0 4px;"><strong>${escapeHtml(T.checkInCode)}</strong> <span style="font-family:'DM Mono',Menlo,Consolas,monospace;font-size:20px;letter-spacing:.12em;">${escapeHtml(b.checkInCode)}</span></p>
        <p style="margin:0 0 4px;font-size:13px;">${escapeHtml(T.showAtDesk)}${key ? ` ${escapeHtml(T.codeToScan)}` : ""}</p>` : "";
      const due0 = money$(due);
      const tipText = moneyWords(tipTaken(b), b.currency);
      // Confirm requests (plan 4, 3.3): the reminder asks for a tap on "Yes, I'll be there".
      const askConfirm = kind === "reminder" && !!key && b.status === "confirmed" && !b.clientConfirmedAt && !!settings0?.askToConfirm;
      // The words (plan 4, 3.5): the owner's for this kind and language, else the standard ones; then what the server adds.
      const wordsKind = askConfirm ? "reminderConfirm" : kind === "cancelled" && tooFew ? "classCancelled" : kind;
      const words = emailWords(settings0?.messages, lang, wordsKind);
      const amount = { fee: money$(b.fee?.amountMinor || 0), payRest: due0, restPaid: money$(restTaken(b)), tipPaid: money$(tipTaken(b)) }[kind] || "";
      const values = { client: String(b.customer?.name || "").trim().split(/\s+/)[0] || "", service: visitName(b), when, shop, amount };
      const fill = (template) => fillMessage(template, values);
      const refundWords = typeof refundText === "string" ? refundText : refundText?.[lang] || refundText?.en || "";
      const added = [
        kind === "requested" && b.answerBy ? T.answerBy(whenWords(b, b.answerBy, lang)) : "",
        kind === "restPaid" && tipTaken(b) ? T.tipIncluded(money$(tipTaken(b))) : "",
        kind === "fee" && b.card?.last4 ? T.feeCard(cardWords(b.card, lang)) : "",
        (kind === "thanks" || kind === "tip") && (reviewUrl || siteReview) ? T.reviewAsk : "",
        kind === "cancelled" ? refundWords : "",
      ].filter(Boolean).join(" ");
      // A decline with the owner's own reason says only that.
      const leadText = kind === "declined" && refundWords ? refundWords : `${fill(words.lead)}${added ? ` ${added}` : ""}`;
      const lead = escapeHtml(leadText).replace(/\n/g, "<br>");
      const subject = fill(words.subject);
      const calendar = ended ? "" : `<p style="margin:16px 0 0;"><a href="${escapeHtml(googleCalendarLink({ title: `${visitName(b)} · ${shop}`, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "" }))}">${escapeHtml(T.addGoogle)}</a>${key ? ` &nbsp;·&nbsp; <a href="${escapeHtml(siteLink(`/calendar/b/${encodeURIComponent(id)}/${key}.ics`))}">${escapeHtml(T.addApple)}</a>` : ""}</p>`;
      const manage = (!ended || kind === "tip") && key ? risoButton(escapeHtml(manageUrl(id, key)), kind === "tip" ? T.addTip : kind === "payRest" ? T.pay(due0) : T.seeOrChange, brand.accent, brand.theme) : "";
      // After the visit: leave a review (the shop's own link) and book the same service again.
      // On the shop's own website (Client reviews) when it takes them, through the booking page; else the shop's link.
      const afterVisit = kind === "thanks" || kind === "tip";
      const own = afterVisit && siteReview && key ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(manageUrl(id, key))}#review">${escapeHtml(T.leaveReview)}</a></p>` : "";
      const review = own || (reviewUrl && afterVisit ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(reviewUrl)}">${escapeHtml(T.leaveReview)}</a></p>` : "");
      const again = kind === "thanks" || kind === "declined" ? risoButton(escapeHtml(siteLink(b.serviceId ? `/book?service=${encodeURIComponent(b.serviceId)}` : "/book")), T.bookAgain, brand.accent, brand.theme) : "";
      // The form before the first visit, while it isn't signed: on the confirmation and the reminders.
      const formState0 = ["booked", "requested", "moved", "reminder"].includes(kind) && key ? await formState(b, settings0).catch(() => null) : null;
      const formNote = formState0 && !formState0.signed ? `<p style="margin:16px 0 4px;"><strong>${escapeHtml(T.beforeVisit)}</strong> ${T.fillIn(formState0.waiting.map((x) => `"${escapeHtml(x.form.title)}"`))}</p>` : "";
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">${escapeHtml(fill(words.heading))}</h4>
        <h2 style="margin:0 0 12px;">${escapeHtml(visitName(b))}</h2>
        <p style="margin:0 0 16px;">${lead}</p>
        <p style="margin:0 0 4px;"><strong>${escapeHtml(T.when)}</strong> ${escapeHtml(when)}</p>
        <p style="margin:0 0 4px;"><strong>${escapeHtml(T.howLong)}</strong> ${escapeHtml(T.minutes(b.minutes))}</p>
        ${extrasWords(b) ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(T.extras)}</strong> ${escapeHtml(extrasWords(b))}</p>` : ""}
        ${b.staffName && !mine.visitList ? `<p style="margin:0 0 4px;"><strong>${escapeHtml(T.with)}</strong> ${escapeHtml(b.staffName)}</p>` : ""}
        ${where}
        ${mine.visitList}
        ${mine.dates}
        ${mine.runDates}
        ${video}
        ${mine.money}
        ${mine.held}
        ${checkIn}
        ${formNote}
        ${askConfirm ? risoButton(escapeHtml(`${manageUrl(id, key)}&confirm=1`), T.yesThere, brand.accent, brand.theme) : ""}
        ${manage}
        ${again}
        ${review}
        ${calendar}
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to, subject, html });
      const owners = lang === "en" ? mine : details("en");
      const ownerWhen = whenWords(b);
      const runDates = owners.runDates, money = owners.money, held = owners.held;
      const owner = ownerEmail();
      if (owner && toOwner) {
        await sendEmail({
          to: owner,
          subject: `[BOOKING] ${{ booked: "New", requested: "Please answer",  moved: "Moved", notCleared: "Payment didn't clear", restPaid: "Paid in full", tipPaid: `${tipText} tip` }[kind] || "Cancelled"}: ${visitName(b)}, ${ownerWhen}`,
          html: risoLayout(`<h2 style="margin:0 0 12px;">${escapeHtml(b.customer.name)}: ${escapeHtml(visitName(b))}</h2>
            <p style="margin:0 0 4px;">${escapeHtml(ownerWhen)} · ${b.minutes} minutes${b.staffName ? ` · ${escapeHtml(withWhom(b))}` : ""}</p>
            <p style="margin:0 0 4px;">${escapeHtml(b.customer.email)}${b.customer.phone ? ` · ${escapeHtml(b.customer.phone)}` : ""}</p>
            ${extrasWords(b) ? `<p style="margin:0 0 4px;">Extras: ${escapeHtml(extrasWords(b))}</p>` : ""}
            ${runDates}
            ${money}
            ${held}
            ${kind === "requested" ? `<p style="margin:12px 0 0;"><strong>This is a request.</strong> Accept or decline it in Bookings${b.answerBy ? ` by ${escapeHtml(whenWords(b, b.answerBy))}` : ""}. If you don't, the time is let go and they are told.</p>` : ""}
            ${kind === "notCleared" ? `<p style="margin:12px 0 0;">Their bank payment was still clearing when the booking was due, so the time was released and nothing was taken. You may want to get in touch with them.</p>` : ""}
            ${b.note ? `<p style="margin:12px 0 0;">“${escapeHtml(b.note)}”</p>` : ""}
            ${(b.answers || []).map((a) => `<p style="margin:12px 0 0;"><strong>${escapeHtml(a.label)}</strong><br>${escapeHtml(a.answer)}</p>`).join("")}
            ${risoButton(escapeHtml(siteLink("/admin#bookings")), kind === "requested" ? "Accept or decline" : "Open Bookings", brand.accent, brand.theme)}`, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
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
    const days = daysTouched(start - (service.gapBefore || 0) * MINUTE, blockEnd, zone());
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
        items[itemKey] = { start, end: blockEnd, held: true, at: nowMs, s: service.id, ...item, ...gapPart(service, start), ...prePart(service.gapBefore), offer: true, until };
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
          const service = { ...listed, minutes: b.minutes, gapAfter: b.gapAfter || 0, gapBefore: b.gapBefore || 0 };
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
              <p style="margin:0 0 16px;">${escapeHtml(when)}${namesForClient(b, settings).staffName ? ` ${escapeHtml(withWhom(b))}` : ""} is free, and ${escapeHtml(shop)} is holding it for you until ${escapeHtml(untilText)}. Your booking is now ${escapeHtml(was)}. Take the earlier time and your booking moves to it. If you do nothing, you keep your booking.</p>
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
  async function takeTime({ id, service, settings, start, record, check = true, offer = null, staffId = "", visit = null }) {
    // A discount code's use is counted with the time, so its usage limit holds even when many book at once.
    const code = record.discount?.id ? db.collection("discounts").doc(record.discount.id) : null;
    // A gift card is debited with the time too, so one balance can never pay for two bookings.
    const gift = record.giftCard?.id ? db.collection("giftCards").doc(record.giftCard.id) : null;
    const testMode = gift ? await shopTestMode() : false;
    // A pack's visit is counted with the time too, so one pack can never book more visits than it holds.
    const pack = record.pack?.id ? packs().doc(record.pack.id) : null;
    // Several services in one visit (plan 4, 2.1): `visit.more` runs back to back after `service`, each with its own
    // person; the booking ends when the last ends, and only the last keeps its tidy-up time.
    const more = visit?.more?.length && !isCourse(service) ? visit.more : [];
    const lead = more.length ? { ...service, gapAfter: 0 } : service;
    const timeline = more.length ? visitTimeline(start, [lead, ...more.map((m) => m.service)]) : null;
    const end = timeline ? timeline[timeline.length - 1].end : start + service.minutes * MINUTE;
    const blockEnd = timeline ? timeline[timeline.length - 1].blockEnd : end + service.gapAfter * MINUTE;
    // A course takes a place in every one of its sessions with the one sign-up.
    const sessions = isCourse(service) ? courseStarts(service, zone()) : [start];
    if (sessions[0] !== start) return false;
    const length = blockEnd - start;
    const before = (service.gapBefore || 0) * MINUTE;
    const days = [...new Set(sessions.flatMap((ms) => daysTouched(ms - before, ms + length, zone())))];
    const all = offer ? [...new Set([...days, ...offer.days])] : days;
    // `days` (shop days) lets the admin find a course's people in any week it runs, with one query.
    if (sessions.length > 1) {
      const startsIso = sessions.map((ms) => new Date(ms).toISOString());
      record.course = { starts: startsIso, days: [...new Set(sessions.map((ms) => dayOf(ms, zone())))] };
      record.courseLastStart = startsIso[startsIso.length - 1];
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
      // A visit is checked whole: each service has someone free when it starts, never one person twice at once.
      const people = timeline ? visitStaff({ services: [lead, ...more.map((m) => m.service)], staffIds: [staffId, ...more.map((m) => m.staffId)], settings, busy, start, zone: zone(), nowMs }) : null;
      if (timeline && check && people === null) return false;
      const who = timeline ? (people ? people[0] : null) : whoIsFree({ service, settings, busy, start, zone: zone(), nowMs, staffId });
      if (check && who === null) return false;
      const partStaff = more.map((m, n) => staffParts(settings, people ? people[n + 1] : m.staffId, m.service.roomId));
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
      if (packSnap && packProblem(packData, record.serviceId, dayOf(start, zone()), weeklyClass(service))) return "pack_used";
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
          if (!daysTouched(ms - before, ms + length, zone()).includes(d)) return;
          items[n ? `${id}~${n}` : id] = { start: ms, end: timeline ? timeline[0].end : ms + length, held, at: nowMs, s: record.serviceId, ...(n ? later[n - 1].item : assigned.item), ...(n ? {} : { ...gapPart(service, ms), ...prePart(service.gapBefore) }) };
        });
        more.forEach((m, n) => {
          const t = timeline[n + 1];
          if (!daysTouched(t.start, t.blockEnd, zone()).includes(d)) return;
          items[`${id}~p${n + 1}`] = { start: t.start, end: t.blockEnd, held, at: nowMs, s: m.service.id, ...partStaff[n].item, ...gapPart(m.service, t.start) };
        });
        tx.set(dayRef(d), { items });
      });
      // The caller's record carries the person too (it is what the confirmation email reads).
      Object.assign(record, assigned.record);
      if (more.length) {
        record.parts = more.map((m, n) => ({
          serviceId: m.service.id, serviceName: m.service.name, minutes: m.service.minutes, gapAfter: n === more.length - 1 ? m.service.gapAfter || 0 : 0,
          priceMinor: m.service.payment === "free" ? 0 : Math.max(0, m.service.priceMinor || 0),
          staffId: partStaff[n].record.staffId || "", staffName: partStaff[n].record.staffName || "", roomId: partStaff[n].record.roomId || "", roomName: partStaff[n].record.roomName || "",
          start: new Date(timeline[n + 1].start).toISOString(), end: new Date(timeline[n + 1].end).toISOString(),
        }));
        record.minutes = Math.round((end - start) / MINUTE);
        record.gapAfter = 0;
        // The first service's own share of the price, so the team pay page can split the takings by service.
        record.leadPriceMinor = Math.max(0, (record.priceMinor || 0) - record.parts.reduce((n, p) => n + p.priceMinor, 0));
      }
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
   * `still(booking)`, when given, is checked on the booking as it stands inside the same transaction: if it no longer
   * holds (paid for since it was read, say), nothing is written and it returns null.
   */
  async function freeTime(id, b, changes, { giftBack = true, packBack = true, still = null } = {}) {
    const spans = spansOf(id, b);
    const days = [...new Set(spans.flatMap((x) => daysTouched(x.from, x.end, zone())))];
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
      const fresh = gift || pack || still ? (await tx.get(bookings().doc(id))).data() : null;
      if (still && !(fresh && still(fresh))) return null;
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
    if (!written) return null;
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
  async function moveTime(id, b, service, settings, start, { check = true, by = "customer", staffId, alsoFree = "", minutes = b.minutes } = {}) {
    if (Array.isArray(b.parts) && b.parts.length) return moveVisit(id, b, settings, start, { check, by });
    const before = (b.gapBefore || 0) * MINUTE;
    const oldDays = daysTouched(Date.parse(b.start) - before, Date.parse(b.end) + (b.gapAfter || 0) * MINUTE, zone());
    // `minutes`: the owner stretched or shortened it on the calendar (plan 4, 1.2); the price stays as booked.
    const end = start + minutes * MINUTE;
    const blockEnd = end + (b.gapAfter || 0) * MINUTE;
    const newDays = daysTouched(start - before, blockEnd, zone());
    const all = [...new Set([...oldDays, ...newDays])];
    // The booking's own processing time moves with it (kept on the booking when it was made, plan 4, 1.5).
    const checked = { ...service, minutes, processAfter: b.processAfter || 0, processMinutes: b.processMinutes || 0, gapBefore: b.gapBefore || 0 };
    const moved = await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(all.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      const nearby = snaps.filter((_, i) => newDays.includes(all[i]));
      const wanted = staffId === undefined ? keptPerson(settings, b.serviceId, b.staffId) : String(staffId || "");
      // `alsoFree`: a time held for this very booking (an earlier time it is taking) doesn't count against it, and goes.
      const who = whoIsFree({ service: checked, settings, busy: busyFrom(nearby, nowMs, alsoFree ? [id, alsoFree] : id), start, zone: zone(), nowMs, staffId: wanted });
      if (check && who === null) return false;
      const assigned = staffParts(settings, who ?? wanted, service.roomId);
      all.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        delete items[id];
        if (alsoFree) delete items[alsoFree];
        if (newDays.includes(d)) items[id] = { start, end: blockEnd, held: false, at: nowMs, s: b.serviceId, ...assigned.item, ...gapPart(checked, start), ...prePart(b.gapBefore) };
        tx.set(dayRef(d), { items });
      });
      // A booking that had a person and now has none (the team was cleared) loses the old name.
      const staffChange = b.staffId || b.roomId ? { staffId: "", staffName: "", roomId: "", roomName: "", ...assigned.record } : assigned.record;
      const newName = assigned.record.staffName;
      const resized = minutes !== b.minutes;
      const what = `moved from ${b.start}${resized ? ` (${b.minutes} to ${minutes} min)` : ""}${newName && assigned.record.staffId !== b.staffId ? ` to ${newName}` : ""}`;
      const changes = {
        start: new Date(start).toISOString(), end: new Date(end).toISOString(), updatedAt: new Date(nowMs).toISOString(), reminderSentAt: null, clientConfirmedAt: null,
        ...(resized ? { minutes } : {}),
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

  /**
   * Moves a visit with several services (plan 4, 2.1): every service shifts by the same amount and keeps its person when
   * they are free then (else anyone who does it, unless `check` is off: the owner's book-over). Resolves to false, or to
   * what changed on the booking.
   */
  async function moveVisit(id, b, settings, start, { check = true, by = "owner" } = {}) {
    const shift = start - Date.parse(b.start);
    const oldSpans = spansOf(id, b);
    const parts = b.parts.map((p) => ({ ...p, start: new Date(Date.parse(p.start) + shift).toISOString(), end: new Date(Date.parse(p.end) + shift).toISOString() }));
    const end = Date.parse(b.end) + shift;
    const listed = await readServices();
    const svc = (sid, minutes, gapAfter) => ({ ...(listed.find((x) => x.id === sid) || { roomId: "" }), id: sid, places: 1, courseDates: [], minutes, gapAfter });
    const firstMinutes = Math.round((Date.parse(b.parts[0].start) - Date.parse(b.start)) / MINUTE);
    const lead = { ...svc(b.serviceId, firstMinutes, 0), processAfter: b.processAfter || 0, processMinutes: b.processMinutes || 0, gapBefore: b.gapBefore || 0 };
    const services = [lead, ...parts.map((p) => svc(p.serviceId, p.minutes, p.gapAfter || 0))];
    const newSpans = spansOf(id, { ...b, start: new Date(start).toISOString(), end: new Date(end).toISOString(), parts });
    const daysOfSpans = (spans) => spans.flatMap((x) => daysTouched(x.from, x.end, zone()));
    const oldDays = [...new Set(daysOfSpans(oldSpans))];
    const newDays = [...new Set(daysOfSpans(newSpans))];
    const all = [...new Set([...oldDays, ...newDays])];
    const keys = oldSpans.map((x) => x.key);
    const moved = await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(all.map((d) => tx.get(dayRef(d))));
      const nowMs = now().getTime();
      const busy = busyFrom(snaps.filter((_, i) => newDays.includes(all[i])), nowMs, keys);
      const kept = [keptPerson(settings, b.serviceId, b.staffId), ...parts.map((p) => keptPerson(settings, p.serviceId, p.staffId))];
      const ask = (staffIds) => visitStaff({ services, staffIds, settings, busy, start, zone: zone(), nowMs });
      const people = ask(kept) ?? ask(kept.map(() => ""));
      if (check && people === null) return false;
      const who = people || kept;
      const assigned = services.map((s, n) => staffParts(settings, who[n], s.roomId));
      all.forEach((d, i) => {
        const items = { ...((snaps[i].exists ? snaps[i].data()?.items : null) || {}) };
        for (const k of keys) delete items[k];
        newSpans.forEach((x, n) => {
          if (!daysTouched(x.from, x.end, zone()).includes(d)) return;
          items[x.key] = { start: x.start, end: x.end, held: false, at: nowMs, s: services[n].id, ...assigned[n].item,
            ...gapPart(services[n], x.start), ...(n ? {} : prePart(b.gapBefore)) };
        });
        tx.set(dayRef(d), { items });
      });
      const nextParts = parts.map((p, n) => ({ ...p, staffId: assigned[n + 1].record.staffId || "", staffName: assigned[n + 1].record.staffName || "" }));
      const at = new Date(nowMs).toISOString();
      const changes = {
        start: new Date(start).toISOString(), end: new Date(end).toISOString(), updatedAt: at, reminderSentAt: null, clientConfirmedAt: null,
        staffId: "", staffName: "", roomId: "", roomName: "", ...assigned[0].record, parts: nextParts,
        history: [...(b.history || []), { at, what: `moved from ${b.start}`, by }].slice(-20),
      };
      tx.set(bookings().doc(id), changes, { merge: true });
      return changes;
    });
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
    const { discount: _d, listPriceMinor: _l, intro: _i, giftCard: _g, pack: _p, depositMinor: _dm, depositPaid: _dp, taxMinor: _t, taxLines: _tl, ...base } = first;
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
    const untouched = (v) => v.status === "confirmed" && !(v.paid || v.depositPaid || cardTaken(v) > 0 || tipTaken(v) > 0 || v.readerOpen || v.restOpen);
    let cancelled = 0;
    let skipped = 0;
    for (const v of await runVisits(b)) {
      if (v.id === id || v.status !== "confirmed" || Date.parse(v.start) <= Date.parse(b.start)) continue;
      const { id: vid, ...vb } = v;
      if (!untouched(vb)) { skipped += 1; continue; }
      // Checked again inside the cancel itself: a payment that lands between the read and the write keeps the visit.
      const written = await freeTime(vid, vb, { status: "cancelled", cancelledAt: at, cancelledBy: by, updatedAt: at,
        history: [...(vb.history || []), { at, what: "cancelled with the rest of the run", by }].slice(-20) }, { still: untouched });
      if (!written) { skipped += 1; continue; }
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
    const days = [...new Set(spans.flatMap((x) => daysTouched(x.from, x.end, zone())))];
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
    const refundText = backWords(b, { refunded: !!refund, partMinor: refund && refund.amountMinor < onCard ? refund.amountMinor : 0, giftBack, packBack, later: run?.cancelled || 0 });
    if (notify && b.status === "confirmed") await tellCustomer(id, { ...b, ...changes }, "cancelled", { byShop: true, tooFew, refundText });
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
  /**
   * The service at its first-visit price (`intro: true`) for someone who has never booked with the shop (no booking
   * held or confirmed under their email; cancelled ones don't count), else as it is.
   */
  async function introFor(service, email, claimFor = "") {
    // The service's own price now (a late-join course is already prorated), without the ticked extras: a first-visit
    // price only ever lowers it.
    const base = service.priceMinor - (service.extrasMinor || 0);
    if (!service.introPriceMinor || !email || service.introPriceMinor >= base) return service;
    const who = String(email).trim().toLowerCase();
    // Asked by status, so any number of cancelled bookings can't hide an earlier visit.
    for (const status of ["confirmed", "held"]) {
      const snap = await bookings().where("customer.email", "==", who).where("status", "==", status).limit(1).get();
      if (!snap.empty) return service;
    }
    // Booking for real: the first visit is claimed for this booking in one step (`bookingIntros/<email hash>`), so two
    // bookings started at the same moment can't both get it. A claim whose booking was let go, or never went ahead
    // within five minutes, is taken over.
    if (claimFor && !(await claimIntro(who, claimFor))) return service;
    // Priced extras the client ticked still cost what they cost on top of the first-visit price.
    const intro = { ...service, priceMinor: service.introPriceMinor + (service.extrasMinor || 0), intro: true };
    // A missed-booking fee never comes to more than the visit it is for.
    if (Number(intro.lateFeeMinor) > intro.priceMinor) intro.lateFeeMinor = intro.priceMinor;
    // A percentage deposit of the lower price can fall under what a card page takes (0.50): ask for that much instead
    // (never more than the price, which is itself at least 0.50), so the first visit can always be booked.
    const deposit = depositOf(intro);
    if (intro.payment === "deposit" && deposit > 0 && deposit < MIN_CARD_MINOR) return { ...intro, depositMinor: Math.min(intro.priceMinor, MIN_CARD_MINOR) };
    return intro;
  }
  async function claimIntro(email, bookingId) {
    const ref = db.collection("bookingIntros").doc(hash(email));
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const other = snap.exists ? snap.data()?.bookingId : "";
      if (other && other !== bookingId) {
        const was = await tx.get(bookings().doc(other));
        if (was.exists && ["confirmed", "held"].includes(was.data()?.status)) return false;
        // Not written yet: another booking is being made this very moment.
        if (!was.exists && now().getTime() - Date.parse(snap.data()?.at || 0) < 5 * MINUTE) return false;
      }
      tx.set(ref, { bookingId, at: now().toISOString() });
      return true;
    });
  }

  /** Gives back a first-visit claim made for a booking that didn't go through (only that booking's own claim). */
  async function releaseIntro(email, bookingId) {
    const ref = db.collection("bookingIntros").doc(hash(String(email).trim().toLowerCase()));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()?.bookingId === bookingId) tx.delete(ref);
    }).catch((err) => console.error("First-visit claim not given back:", err?.message || err));
  }

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

  /**
   * What the cancel email adds about money and later visits, in English and French (plan 4, 3.5): the card refund (all,
   * or `partMinor` of it), the gift card's part, the pack's visit and how many later visits went too.
   */
  function backWords(b, { refunded = false, partMinor = 0, giftBack = false, packBack = false, later = 0 } = {}) {
    const out = {};
    for (const lang of ["en", "fr"]) {
      const fr = lang === "fr";
      const deposit = b.payment === "deposit" && !b.rest;
      const what = fr ? (deposit ? "dépôt" : "paiement") : (deposit ? "deposit" : "payment");
      const card = !refunded ? "" : partMinor
        ? (fr ? `${moneyWords(partMinor, b.currency, lang)} de votre ${what} vous est remboursé sur votre carte.` : `${moneyWords(partMinor, b.currency)} of your ${what} is being refunded to your card.`)
        : (fr ? `Votre ${what} vous est remboursé sur votre carte.` : `Your ${what} is being refunded to your card.`);
      const gift = giftBack && b.giftCard?.amountMinor
        ? (fr ? ` Les ${moneyWords(b.giftCard.amountMinor, b.currency, lang)} de votre carte-cadeau y sont remis.` : ` The ${moneyWords(b.giftCard.amountMinor, b.currency)} from your gift card is back on it.`) : "";
      const pack = packBack && b.pack ? (fr ? " La visite est remise sur votre forfait, vous pouvez donc réserver une autre fois." : " The visit is back on your pack, so you can book another time.") : "";
      const runs = !later ? "" : fr
        ? (later === 1 ? " Votre prochaine visite est aussi annulée." : ` Vos ${later} visites suivantes sont aussi annulées.`)
        : ` Your ${later === 1 ? "next visit is" : `${later} later visits are`} cancelled too.`;
      out[lang] = `${card}${gift}${pack}${runs}`.trim();
    }
    return out;
  }

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
      // Clients pick a person only while the shop shows its team (plan 4, 2.4): otherwise anyone free takes it.
      if (settings.teamShown && req.body && typeof req.body === "object") {
        delete req.body.staffId;
        if (Array.isArray(req.body.also)) req.body.also = req.body.also.map((a) => ({ ...a, staffId: "" }));
      }
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
      if (action === "bookingMine") {
        // My bookings in the customer account (plan 4, 2.10): every booking made with their verified email, newest
        // first, coming ones before past ones. Works with the switch off too: these are bookings already made.
        const who = await identify(req);
        if (!who?.email) return fail(res, 401, "Please sign in again to see your bookings.", "sign_in");
        const snap = await bookings().where("customer.email", "==", who.email).limit(MINE_READ).get();
        const rows = snap.docs.map((d) => ({ id: d.id, b: d.data() }))
          .filter(({ b }) => b && b.status !== "held" && typeof b.start === "string");
        const coming = rows.filter(({ b }) => Date.parse(b.end || b.start) > nowMs && b.status !== "cancelled")
          .sort((x, y) => Date.parse(x.b.start) - Date.parse(y.b.start));
        const past = rows.filter((r) => !coming.includes(r)).sort((x, y) => Date.parse(y.b.start) - Date.parse(x.b.start)).slice(0, MINE_PAST);
        const card = ({ id, b }) => {
          const p = publicBooking(id, b, settings, nowMs);
          return { id, serviceId: p.serviceId, serviceName: p.serviceName, start: p.start, end: p.end, location: p.location, staffName: p.staffName,
            status: b.status, noShow: !!b.noShow, ...(b.declined ? { declined: true } : {}), ...(p.clientZone ? { clientZone: p.clientZone } : {}), ...(p.meetUrl ? { online: true } : {}) };
        };
        return res.status(200).json({ on: true, zone: zone(), live: !!settings.live, coming: coming.map(card), past: past.map(card) });
      }
      if (action === "bookingOpen") {
        // Open one of my bookings from the account: a fresh link key for that booking, only for its own customer.
        const who = await identify(req);
        if (!who?.email) return fail(res, 401, "Please sign in again to see your bookings.", "sign_in");
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 404, "We couldn't find that booking.", "missing");
        const snap = await bookings().doc(id).get();
        const b = snap.exists ? snap.data() : null;
        if (!b || String(b.customer?.email || "").trim().toLowerCase() !== who.email || b.status === "held") return fail(res, 404, "We couldn't find that booking.", "missing");
        const key = randomKey();
        await bookings().doc(id).set({ accountKeyHash: hash(key) }, { merge: true });
        return res.status(200).json({ path: `/book?booking=${encodeURIComponent(id)}&key=${key}` });
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
          // Whether the form offers "Text me offers" (plan 4, 5.6): the owner's promo switch, and the platform sending texts.
          ...(settings.promoTexts && (await textsOpen()) ? { promoTexts: true } : {}),
          // Whether the form asks for a birthday (plan 4, 5.4): only while the shop sends birthday emails.
          ...(settings.birthdayEmail ? { birthday: true } : {}),
          // The people a client can pick (the "With" choice); none when the shop books as one calendar.
          // With "anyone available" the page lists them (the Your team section) but offers no choice; with names hidden, nobody.
          staff: booksByPerson(settings) && settings.teamShown !== "hidden" ? settings.staff.filter((p) => p.active).map(({ id, name, serviceIds, rates, photo, bio }) => ({ id, name, serviceIds, ...(rates?.length ? { rates } : {}), ...(photo ? { photo } : {}), ...(bio ? { bio } : {}) })) : [],
          ...(settings.teamShown === "anyone" ? { staffPick: false } : {}),
          services: list.map(({ id, name, description, minutes, priceMinor, payment, depositMinor, depositPercent, location, questions, places, holdCard, lateFeeMinor, packVisits, packPriceMinor, packDays, courseDates, joining, repeats, minPlaces, packAnyClass, introPriceMinor, extras, lengths, group, photo, approval, atClient, areas, meet }, i) => ({
            id, name, description, minutes, priceMinor, payment, depositMinor, depositPercent, location, questions, places,
            // The owner accepts each booking first (plan 4, 2.5): the page says it is a request.
            ...(approval ? { approval: true } : {}),
            // At the client's address (plan 4, 2.8): the form asks for it, and checks the postal code against the area.
            ...(atClient ? { atClient: true, areas: areas || [] } : {}),
            // An online visit (plan 4, 2.9): the page offers the client's own clock.
            ...(meet && places <= 1 ? { online: true } : {}),
            // Its group heading and photo on the booking page (plan 4, 2.3).
            ...(group ? { group } : {}),
            ...(photo ? { photo } : {}),
            // Standing appointments: a run of visits can be booked at once.
            ...(runsOnline({ payment, places, holdCard: holdCard && canHoldCard(), repeats }) ? { repeats: true } : {}),
            // Add-ons and options the client may tick: each adds its minutes and price.
            ...(extras?.length ? { extras } : {}),
            ...(lengths?.length ? { lengths } : {}),
            // A course: every one of its dates (signed up for as a whole, from the first).
            ...(isCourse({ places, courseDates }) ? { courseStarts: courseStarts({ places, courseDates }, zone()).map((ms) => new Date(ms).toISOString()) } : {}),
            // Joining a course late: how many dates were missed, of how many, and the whole course's price.
            ...(joining ? { joining } : {}),
            ...(minPlaces ? { minPlaces } : {}),
            ...(packAnyClass ? { packAnyClass } : {}),
            ...(introPriceMinor ? { introPriceMinor } : {}),
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
        const asked = askedFor(listed, settings, req.body);
        if (asked.problem) return fail(res, 400, asked.problem, asked.code);
        const { service } = asked;
        const parts = await visitParts(req.body, service, settings);
        if (parts.problem) return fail(res, 400, parts.problem, "also");
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
        // Several services: only the starts where the whole visit fits, each with someone free.
        const visitArgs = parts.more.length ? { services: [service, ...parts.more.map((m) => m.service)], staffIds: [staffId, ...parts.more.map((m) => m.staffId)], settings, busy, zone: zone(), nowMs } : null;
        for (const day of days) {
          out[day] = (visitArgs ? visitFreeTimes({ ...visitArgs, day }) : freeTimes({ service, settings, busy, day, zone: zone(), nowMs, staffId })).map((ms) => {
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
        const fullDays = visitArgs ? [] : days.filter((day) => !out[day].length && !full[day] && freeTimes({ service, settings, busy: [], day, zone: zone(), nowMs, staffId }).length > 0);
        return res.status(200).json({ on: true, days: out, fullDays, ...(isClass(service) ? { places: service.places, left, full } : {}),
          ...(offer ? { held: { start: new Date(offer.start).toISOString(), until: offer.until } } : {}) });
      }
      if (action === "bookingCode") {
        // Try a discount code before booking: what it takes off and what is paid now. Booking checks it again.
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const listed = await publicService(req.body?.serviceId);
        if (!listed) return fail(res, 404, "This service isn't taking bookings right now.");
        // The add-ons the client ticked lengthen the booking and add to its price, for every rule below.
        const asked = askedFor(listed, settings, req.body);
        if (asked.problem) return fail(res, 400, asked.problem, asked.code);
        const parts = await visitParts(req.body, asked.service, settings);
        if (parts.problem) return fail(res, 400, parts.problem, "also");
        const service = visitPriced(asked.service, parts.more);
        const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200);
        try {
          const offered = await introFor(service, email);
          const priced = await codeFor(offered, req.body?.code, email);
          const tax = await taxOn(service, taxBase(service, priced.priceMinor));
          const total = priced.priceMinor + (tax?.taxMinor || 0);
          return res.status(200).json({ code: priced.discount.code, discountMinor: priced.discount.amountMinor, priceMinor: total, ...(tax ? { taxMinor: tax.taxMinor } : {}), payNowMinor: depositOf({ ...offered, priceMinor: total }) });
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
        const asked = askedFor(listed, settings, req.body);
        if (asked.problem) return fail(res, 400, asked.problem, asked.code);
        const parts = await visitParts(req.body, asked.service, settings);
        if (parts.problem) return fail(res, 400, parts.problem, "also");
        const service = visitPriced(asked.service, parts.more);
        const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200);
        // Someone new pays the first-visit price, as booking will: the gift card is quoted on that.
        const offered = await introFor(service, email);
        let upFront = depositOf(offered);
        if (String(req.body?.code || "").trim()) {
          try { upFront = (await codeFor(offered, req.body.code, email)).upFront; } catch (err) {
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
          last4: code.slice(-4), serviceId: service.id, serviceName: service.packAnyClass ? "Any class" : service.name, visits: service.packVisits, days: service.packDays,
          ...(service.packAnyClass ? { anyClass: true } : {}),
          priceMinor: payMinor, ...taxFields(tax), currency: currency(), mode, customer: { name: customer.name, email: customer.email },
          status: "held", sessions: [], uses: [], holdUntil: new Date(until).toISOString(), createdAt: at, updatedAt: at,
          // Kept only until it is paid, so the email can carry the code; afterwards only its hash (the id) is left.
          pendingCode: code,
        });
        const description = `${shopName() ? `${shopName()}: ` : ""}${service.name}, ${service.packAnyClass ? `class pass of ${service.packVisits} classes` : `pack of ${service.packVisits} visits`}`.slice(0, 250);
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
        const problem = packProblem(p, service.id, dayOf(Number.isFinite(when) ? when : nowMs, zone()), weeklyClass(service));
        if (problem) return fail(res, 400, PACK_MESSAGES[problem], "pack");
        return res.status(200).json({ last4: p.last4, left: packLeft(p), visits: p.visits, expiresOn: p.expiresOn || null });
      }
      if (action === "bookingRunCheck") {
        // Before booking a standing appointment: is each later visit free? (The page lists the dates with this.)
        if (!settings.live) return fail(res, 409, "Bookings are closed right now.");
        const listed = (await readServices()).find((s) => s.id === req.body?.serviceId && s.active);
        if (!listed) return fail(res, 404, "This service isn't taking bookings right now.");
        const asked = askedFor(listed, settings, req.body);
        if (asked.problem) return fail(res, 400, asked.problem, asked.code);
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
        const asked = askedFor(listed, settings, req.body);
        if (asked.problem) return fail(res, 400, asked.problem, asked.code);
        const { extras } = asked;
        // Several services in one visit (plan 4, 2.1): priced as one, booked back to back.
        const parts = await visitParts(req.body, asked.service, settings);
        if (parts.problem) return fail(res, 400, parts.problem, "also");
        const service = visitPriced(asked.service, parts.more);
        const visit = parts.more.length ? { more: parts.more } : null;
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
        // At the client's address (plan 4, 2.8): the visit's address is needed, inside the area the shop travels to.
        const visitAt = service.atClient ? cleanVisitAddress(req.body?.address) : null;
        if (service.atClient && !visitAt) return fail(res, 400, "Please give the address for the visit: street, city and postal code.", "address");
        if (visitAt && !inArea(visitAt.postcode, service.areas)) return fail(res, 400, "Sorry, that address is outside the area this service travels to.", "area");
        // A standing appointment: a run of visits booked at once, each its own booking (services that take no card).
        const run = cleanRun(req.body?.run);
        if (run?.problem) return fail(res, 400, run.problem, "run");
        if (visit && run) return fail(res, 400, "A visit with several services can't repeat yet. Please book one visit.", "run");
        if (visit && String(req.body?.pack || "").trim()) return fail(res, 400, "A pack pays for one service. Please book the other services on their own, or leave the pack off.", "pack");
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
          const problem = packProblem(p, service.id, dayOf(start, zone()), weeklyClass(service));
          if (problem) return fail(res, 400, PACK_MESSAGES[problem], "pack");
          pack = { id: p.id, last4: p.last4 };
        }
        // Someone new to the shop pays the first-visit price (not with a pack); a code then comes off that.
        const id = randomId();
        const offered = pack ? service : await introFor(service, customer.email, id);
        // A booking that doesn't go through gives its first-visit claim back, so trying again keeps the price.
        const refuse = async (...args) => { if (offered.intro) await releaseIntro(customer.email, id); return fail(...args); };
        // A discount code comes off the price first; a deposit is then worked out on what is left.
        let priced = null;
        if (!pack && String(req.body?.code || "").trim()) {
          try {
            priced = await codeFor(offered, req.body.code, customer.email);
          } catch (err) {
            if (err instanceof BookingCodeProblem) return refuse(res, 400, err.message, "code");
            throw err;
          }
        }
        const before = service.payment === "free" || pack ? 0 : priced ? priced.priceMinor : offered.priceMinor;
        // Sales tax (a service with chargeTax) goes on top of the price after any code; the booking's price includes it.
        const tax = await taxOn(service, taxBase(service, before));
        const price = before + (tax?.taxMinor || 0);
        // What the card page takes now: the whole price, the deposit, or nothing (free, all paid at the visit, or a pack).
        const upFront = pack ? 0 : depositOf({ ...offered, priceMinor: price });
        const deposit = upFront > 0 && service.payment === "deposit" && upFront < price;
        // A gift card pays part or all of what is paid now; the card page takes the rest.
        let gift = null;
        if (!pack && String(req.body?.giftCard || "").trim()) {
          try { gift = await giftFor(req.body.giftCard, upFront); } catch (err) {
            if (err instanceof BookingCodeProblem) return refuse(res, 400, err.message, "gift");
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
          if (!checkout && cardDue > 0) return refuse(res, 409, "This shop can't take card payments for bookings yet. Please contact the shop.", "not_available");
        }
        // The customer goes to a card page to pay now, to save a card for the missed-booking fee, or both.
        const paid = cardDue > 0 || holdCard;
        // The owner accepts it first (plan 4, 2.5): a request holding the time. The shared rules only allow it where
        // nothing is paid when booking; a gift card or a code that leaves something to pay by card books as usual.
        const asking = service.approval === true && approvalAllowed(service) && !paid && !run && !visit;
        // Paid in full by the gift card with no page to visit: the booking's payment is done now.
        const giftPaid = gift && !paid ? (deposit ? { depositPaid: true } : { paid: true }) : {};
        const key = randomKey();
        const at = new Date(nowMs).toISOString();
        const record = {
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: service.gapAfter, ...processingRecord(service),
          // A visit at the client's place happens at their address: emails, calendars and the day list all show it.
          location: visitAt ? addressLine(visitAt) : service.location, ...(visitAt ? { atClient: true } : {}),
          // A birthday (month and day only) is kept only while the shop sends birthday emails (plan 4, 5.4).
          customer: { name: customer.name, email: customer.email, phone: customer.phone, ...(customer.textOk ? { textOk: true } : {}), ...(customer.promoOk && settings.promoTexts ? { promoOk: true } : {}), ...(customer.birthday && settings.birthdayEmail ? { birthday: customer.birthday } : {}) }, note: customer.note, answers: answered.answers,
          status: paid ? "held" : asking ? "requested" : "confirmed", payment: pack ? "pack" : deposit ? "deposit" : upFront > 0 ? "card" : price > 0 ? "atShop" : "free",
          priceMinor: price, ...taxFields(tax), ...(deposit ? { depositMinor: upFront, depositPaid: false } : {}), currency: currency(),
          ...(priced ? { discount: priced.discount, listPriceMinor: service.priceMinor } : {}),
          ...(gift ? { giftCard: gift } : {}),
          ...(pack ? { pack, listPriceMinor: service.priceMinor } : {}),
          // The first-visit price: listPriceMinor is the usual price.
          ...(offered.intro ? { intro: true, listPriceMinor: service.priceMinor } : {}),
          ...(extras.length ? { extras } : {}),
          ...(service.lengthId ? { lengthId: service.lengthId } : {}),
          paid: false, ...giftPaid, sessions: [], holdUntil: paid ? new Date(nowMs + HOLD_MINUTES * MINUTE).toISOString() : null, manageKeyHash: hash(key),
          ...(holdCard ? { cardHold: true, lateFeeMinor: offered.lateFeeMinor, cardMode: mode } : {}),
          // Kept only until the payment is confirmed, so the confirmation email can carry the customer's link.
          pendingKey: paid || asking ? key : null,
          ...(asking ? { answerBy: new Date(answerBy(nowMs, start)).toISOString() } : {}),
          // Which ready link it came through (plan 4, 2.7): Instagram, Facebook, Google, the QR code or the Book now button.
          ...(bookingChannel(req.body.from) ? { cameFrom: bookingChannel(req.body.from) } : {}),
          // An online visit booked from another time zone (plan 4, 2.9): the emails and its page show their clock too.
          ...(service.meet && zonesDiffer(cleanZone(req.body.zone), zone(), start) ? { clientZone: cleanZone(req.body.zone) } : {}),
          // The booking page's language (plan 4, 3.5): its emails and texts follow it.
          ...(/^[a-z]{2}(-[A-Za-z]{2})?$/.test(String(req.body.locale || "")) ? { locale: String(req.body.locale) } : {}),
          source: "website", history: [{ at, what: run ? `booked (visit 1 of ${run.visits})` : "booked", by: "customer" }], createdAt: at, updatedAt: at,
          ...(run ? { series: { id: `run_${id}`, everyWeeks: run.everyWeeks, visits: run.visits, visit: 1 } } : {}),
        };
        const took = await takeTime({ id, service, settings, start, record, offer: visit ? null : await offerFor(req.body, service.id, nowMs), staffId, visit });
        if (took === "code_used") return refuse(res, 409, "This code has reached its usage limit.", "code");
        if (took === "gift_short") return refuse(res, 409, "This gift card's balance just changed. Please check it and try again.", "gift");
        if (took === "pack_used") return refuse(res, 409, "This pack can't book another visit just now. Please check it and try again.", "pack");
        if (!took && isCourse(service)) return refuse(res, 409, "This course just filled up, or one of its dates is no longer free. Please contact the shop.", "taken");
        if (!took && visit) return refuse(res, 409, "Someone just took part of that visit. Please pick another time.", "taken");
        if (!took) return refuse(res, 409, isClass(service) ? "That class just filled up. Please pick another time." : staffId ? "That person was just booked then. Please pick another time or anyone free." : "Someone just took that time. Please pick another.", "taken");
        if (run && !paid) {
          const later = await bookRun({ firstId: id, first: record, service, settings, starts: runAt, staffId, by: "customer" });
          if (later.taken.length) { if (offered.intro) await releaseIntro(customer.email, id); return res.status(409).json({ error: "Someone just took one of those dates. Choose another time, gap or number of visits.", code: "run_taken", taken: later.taken }); }
        }
        if (asking) {
          const written = pack ? (await bookings().doc(id).get()).data() : record;
          await tellCustomer(id, { ...written, start: new Date(start).toISOString(), end: new Date(start + record.minutes * MINUTE).toISOString() }, "requested", { key });
          return res.status(200).json({ id, key, status: "requested" });
        }
        if (!paid) {
          const written = pack ? (await bookings().doc(id).get()).data() : record;
          const booked = await syncCalendar(id, { ...written, start: new Date(start).toISOString(), end: new Date(start + record.minutes * MINUTE).toISOString() });
          await tellCustomer(id, booked, "booked", { key, run: runAt.map((ms) => new Date(ms).toISOString()) });
          return res.status(200).json({ id, key, status: "confirmed", ...(run ? { visits: run.visits } : {}) });
        }
        try {
          const description = `${shopName() ? `${shopName()}: ` : ""}${visitName(record)}${deposit ? " (deposit)" : ""}`.slice(0, 250);
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
          await freeTime(id, { ...record, start: new Date(start).toISOString(), end: new Date(start + record.minutes * MINUTE).toISOString() }, { status: "cancelled", holdUntil: null, updatedAt: now().toISOString() });
          if (err?.code === "currency_mismatch") return refuse(res, 409, err.message, "currency_mismatch");
          if (["test_only", "not_connected", "not_available"].includes(err?.code)) {
            console.error(`Booking ${id} card payment refused:`, err.code, err?.message || err);
            return refuse(res, 409, "This shop can't take card payments for bookings yet. Please contact the shop.", "not_available");
          }
          console.error(`Booking ${id} payment page refused:`, err?.type || "", err?.code || "", err?.param || "", err?.message || err);
          if (offered.intro) await releaseIntro(customer.email, id);
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
          return res.status(200).json({ offer: { serviceName: held.serviceName, staffName: namesForClient(held, settings).staffName || "", minutes: held.minutes, start: held.start, offerStart: e.offerStart, offerUntil: e.offerUntil } });
        }
        const service = (await readServices()).find((x) => x.id === held.serviceId) || { roomId: "" };
        const moved = await moveTime(bid, held, { ...service, id: held.serviceId, minutes: held.minutes, gapAfter: held.gapAfter || 0, gapBefore: held.gapBefore || 0, places: 1 }, settings, Date.parse(e.offerStart), { by: "customer (earlier time)", alsoFree: earlierItem(bid) });
        if (!moved) return fail(res, 409, "Someone just took this time. You keep your booking.", "taken");
        await earlierList().doc(bid).delete();
        await bookings().doc(bid).set({ earlierWanted: false }, { merge: true });
        const next = await syncCalendar(bid, { ...held, ...moved, earlierWanted: false });
        await tellCustomer(bid, next, "moved");
        return res.status(200).json({ offer: { serviceName: next.serviceName, staffName: namesForClient(next, settings).staffName || "", minutes: next.minutes, start: next.start, taken: true } });
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
        const description = `${shopName() ? `${shopName()}: ` : ""}${visitName(b)} (${label})`.slice(0, 250);
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
        // Loyalty points (plan 4, 5.5): the client's balance and how far to the next reward, while points are on.
        const loyal = cleanLoyalty(settings.loyalty);
        const points = loyal.on && b.customer?.email ? await pointsOf(b.customer.email, loyal).catch(() => null) : null;
        return res.status(200).json({ booking: await withForm(await withEarlier(publicBooking(id, b, settings, nowMs), b), b, settings), ...(await runOf(id, b, key)),
          ...(points ? { points: { points: points.points, toNext: points.toNext, rewardMinor: points.rewardMinor } } : {}) });
      }
      if (action === "bookingForm") {
        // The form before the first visit, signed with the client's typed name and a tick.
        const state = b.status === "cancelled" ? null : await formState(b, settings);
        // The form named (each is signed on its own), else the next one waiting.
        const named = typeof req.body?.formId === "string" ? state?.list.find((x) => x.form.id === req.body.formId) : state?.next;
        if (!state || !named) return fail(res, 409, "There is no form to fill in for this booking.", "no_form");
        const signedName = text(req.body?.signedName, 100);
        if (!signedName) return fail(res, 400, "Type your full name to sign.", "no_name");
        if (req.body?.agree !== true) return fail(res, 400, "Tick the box to agree.", "no_agree");
        const answered = cleanAnswers(named.form.questions, req.body?.answers);
        if ("problem" in answered) return fail(res, 400, answered.problem, "answer");
        const signedAt = new Date(nowMs).toISOString();
        await formDoc(b.customer.email, named.form.id).set({ email: b.customer.email.trim().toLowerCase(), name: b.customer.name || "", formId: named.form.id, signedName, agreed: true, signedAt,
          version: formVersion(named.form), title: named.form.title, text: named.form.text, answers: answered.answers, bookingId: id });
        return res.status(200).json({ booking: await withForm(await withEarlier(publicBooking(id, b, settings, nowMs), b), b, settings) });
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
      if (action === "bookingConfirm") {
        // "Yes, I'll be there" (plan 4, 3.3), from the reminder's button or the booking page. Saying it twice changes nothing.
        if (b.status !== "confirmed" || !(Date.parse(b.start) > nowMs)) return fail(res, 409, "This booking can't be confirmed now.", "no_confirm");
        if (!b.clientConfirmedAt) {
          const at = new Date(nowMs).toISOString();
          await bookings().doc(id).set({ clientConfirmedAt: at }, { merge: true });
          b = { ...b, clientConfirmedAt: at };
        }
        return res.status(200).json({ booking: await withForm(await withEarlier(publicBooking(id, b, settings, nowMs), b), b, settings) });
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
        // A request the owner hasn't answered can always be withdrawn: nothing was paid and nothing confirmed.
        if (b.status !== "requested" && (b.status !== "confirmed" || !customerCanChange(Date.parse(b.start), settings, nowMs))) {
          return fail(res, 409, `This booking can't be cancelled online within ${settings.cancelHours} hours of its start. Please contact the shop.`, "too_late");
        }
        // "Cancel this and the later visits" on a standing appointment, with the run's own key: its later visits go too.
        const cancelled = await cancelByCustomer(id, b, { andLater: req.body?.andLater === true && hash(key) === b.manageKeyHash });
        if (!cancelled) return fail(res, 502, "Your refund couldn't be started, so the booking is still on. Please try again in a minute.");
        return res.status(200).json({ booking: publicBooking(id, cancelled.next, settings, nowMs), ...(await runOf(id, cancelled.next, key)) });
      }
      if (action === "bookingMove") {
        if (b.status !== "confirmed" || !customerCanChange(Date.parse(b.start), settings, nowMs)) {
          return fail(res, 409, `This booking can't be moved online within ${settings.cancelHours} hours of its start. Please contact the shop.`, "too_late");
        }
        if (b.course) return fail(res, 409, "A course is one sign-up for all of its dates, so it can't be moved. You can cancel it, or contact the shop.", "course");
        if (b.parts?.length) return fail(res, 409, "A visit with several services can't be moved online. You can cancel it, or contact the shop to move it.", "visit");
        const service = (await readServices()).find((s) => s.id === b.serviceId) || { minutes: b.minutes, gapAfter: b.gapAfter || 0 };
        const start = Date.parse(String(req.body?.start || ""));
        if (!Number.isFinite(start)) return fail(res, 400, "Pick a new time first.");
        // A visit booked with a pack stays inside the pack's dates.
        if (b.pack?.id) {
          const p = (await packs().doc(b.pack.id).get()).data();
          if (p?.expiresOn && dayOf(start, zone()) > p.expiresOn) return fail(res, 409, "Your pack runs out before that day. Please pick an earlier time.", "pack");
        }
        // A length chosen when booking (plan 4, 2.2) keeps only the processing time that fitted it.
        const sized = b.lengthId ? { processAfter: b.processAfter || 0, processMinutes: b.processMinutes || 0 } : {};
        const moved = await moveTime(id, b, { ...service, ...sized, id: b.serviceId, minutes: b.minutes, gapAfter: b.gapAfter || 0, gapBefore: b.gapBefore || 0 }, settings, start);
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
    return runAdmin(req, res, adminUser.email || "admin");
  }

  /** One owner action, `by` the person signed in (the owner, staff, or a front desk or service provider through handleDesk). */
  async function runAdmin(req, res, by) {
    const op = req.body?.op;
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
      if (op === "importServices") {
        // Bring your services from a spreadsheet (plan 4, 2.11, Beta). Each line is checked like a saved service; a name
        // the shop already has is skipped, and each new service's id comes from its name, so a second run adds nothing.
        const list = Array.isArray(req.body?.services) ? req.body.services.slice(0, MAX_SERVICES) : [];
        if (!list.length) return fail(res, 400, "There are no services to bring in.");
        const show = req.body?.show === true;
        const snap = await services().limit(MAX_SERVICES + 1).get();
        const taken = new Set(snap.docs.map((d) => String(d.data()?.name || "").trim().toLowerCase()));
        let count = snap.docs.length;
        let order = snap.docs.reduce((most, d) => Math.max(most, Number(d.data()?.order) || 0), 0);
        const added = [];
        const skipped = [];
        const at = now().toISOString();
        for (const raw of list) {
          const name = String(raw?.name || "").trim().slice(0, 80);
          if (!name) { skipped.push({ name: "", why: "It has no name." }); continue; }
          if (taken.has(name.toLowerCase())) { skipped.push({ name, why: "You already have a service with this name." }); continue; }
          if (count >= MAX_SERVICES) { skipped.push({ name, why: `A shop can have up to ${MAX_SERVICES} services.` }); continue; }
          const id = `im${crypto.createHash("sha256").update(name.toLowerCase()).digest("hex").slice(0, 16)}`;
          const clean = cleanService({
            name, minutes: raw?.minutes, priceMinor: raw?.priceMinor, payment: raw?.payment === "atShop" ? "atShop" : "free",
            description: raw?.description, group: raw?.group, places: raw?.places, active: show, order: Math.min(999, order + 1),
          }, id);
          if (clean.problem) { skipped.push({ name, why: clean.problem }); continue; }
          await services().doc(id).set({ ...clean, imported: true, updatedAt: at, updatedBy: by });
          taken.add(name.toLowerCase());
          count += 1;
          order += 1;
          added.push({ id, name: clean.name });
        }
        if (added.length) await tellWebsite(settings.live);
        return res.status(200).json({ ok: true, added, skipped });
      }
      if (op === "deleteService") {
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 400, "Unknown service.");
        await services().doc(id).delete();
        await tellWebsite(settings.live);
        return res.status(200).json({ ok: true });
      }
      if (op === "otherCalendars") {
        // Outlook, Apple and other calendars (plan 4, 5.7). step "list"; "add" { url, who, name } (read once first, so a
        // wrong link is refused at once); "remove" { id }; "refresh". Owner only: the addresses are secret links.
        const step = String(req.body?.step || "list");
        if (step === "list") return res.status(200).json({ feeds: await feedsView() });
        if (step === "refresh") {
          await sweepOtherCalendars({ force: true });
          return res.status(200).json({ feeds: await feedsView() });
        }
        if (step === "add") {
          const clean = cleanFeedUrl(req.body?.url);
          if ("problem" in clean) return fail(res, 400, clean.problem);
          const who = String(req.body?.who || "");
          if (who && !(settings.staff || []).some((p) => p.id === who && p.active)) return fail(res, 400, "That person isn't taking bookings.");
          const name = text(req.body?.name, 60);
          const ref = calendarsDoc();
          const snap = await ref.get();
          const feeds = snap.exists && Array.isArray(snap.data()?.feeds) ? snap.data().feeds : [];
          if (feeds.length >= MAX_FEEDS) return fail(res, 400, `You can add up to ${MAX_FEEDS} calendars.`);
          if (feeds.some((f) => f.url === clean.url && (f.who || "") === who)) return fail(res, 400, "That calendar is already added.");
          const nowMs = now().getTime();
          const from = zonedTime(dayOf(nowMs, zone()), "00:00", zone());
          const tried = await readOne({ url: clean.url }, from, from + FEED_DAYS * DAY);
          if (tried.problem) return fail(res, 400, tried.problem);
          const id = `f${hash(`${clean.url}|${who}`).slice(0, 10)}`;
          await db.runTransaction(async (tx) => {
            const cur = await tx.get(ref);
            const data = cur.exists ? cur.data() || {} : {};
            const list = Array.isArray(data.feeds) ? data.feeds.filter((f) => f.id !== id) : [];
            tx.set(ref, { ...data, feeds: [...list, { id, url: clean.url, kind: clean.kind, name, who, addedAt: new Date(nowMs).toISOString(), ok: true, problem: "", count: tried.spans.length }], at: "" });
          });
          await sweepOtherCalendars({ force: true });
          return res.status(200).json({ feeds: await feedsView(), added: id });
        }
        if (step === "remove") {
          const id = String(req.body?.id || "");
          await db.runTransaction(async (tx) => {
            const cur = await tx.get(calendarsDoc());
            const data = cur.exists ? cur.data() || {} : {};
            tx.set(calendarsDoc(), { ...data, feeds: (Array.isArray(data.feeds) ? data.feeds : []).filter((f) => f.id !== id) });
          });
          await sweepOtherCalendars({ force: true });
          return res.status(200).json({ feeds: await feedsView() });
        }
        return fail(res, 400, "Unknown step.");
      }
      if (op === "bookingHooks") {
        // Send bookings to other apps (plan 4, 5.8): owner only, since the secrets sign what goes out.
        const out = await hooks.ownerStep(req.body, { shop: shopName() });
        return out.problem ? fail(res, out.status, out.problem) : res.status(out.status).json(out.json);
      }
      if (op === "teamCalendar") {
        // A person's own Google Calendar (Services plan 2, B6). step "status": who is linked (and busy times read again
        // when a minute has passed); "link": a one-use link for them, emailed when `send` and they have an email;
        // "unlink": their link is forgotten and their busy times cleared.
        if (!calendar?.peopleStatus) return res.status(200).json({ available: false });
        const step = String(req.body?.step || "");
        if (step === "status") {
          const ids = (settings.staff || []).map((p) => p.id);
          const answer = ids.length ? await calendar.peopleStatus(ids) : { available: true, people: {} };
          if (!answer?.available) return res.status(200).json({ available: false });
          const mark = await db.collection("bookingSettings").doc("googleBusy").get();
          const at = Date.parse(mark.exists ? mark.data()?.at || "" : "");
          if (!Number.isFinite(at) || now().getTime() - at > 60_000) await sweepTeamCalendars({ force: true }).catch((err) => console.warn("Team calendars:", err?.message || err));
          return res.status(200).json({ available: true, people: answer.people || {} });
        }
        const person = (settings.staff || []).find((p) => p.id === String(req.body?.staffId || ""));
        if (!person) return fail(res, 400, "That person isn't on the team.");
        if (step === "link") {
          const answer = await calendar.personLink(person.id);
          if (!answer) return fail(res, 502, "The link couldn't be made. Try again in a minute.");
          if (!answer.available) return res.status(200).json({ available: false });
          let sent = false;
          if (req.body?.send === true) {
            if (!EMAIL.test(person.email || "")) return fail(res, 400, `Add ${person.name}'s email first, or copy the link instead.`);
            await sendCalendarLink(person, answer.url);
            sent = true;
          }
          return res.status(200).json({ available: true, url: answer.url, sent });
        }
        if (step === "unlink") {
          const answer = await calendar.personDisconnect(person.id);
          if (!answer) return fail(res, 502, "Google didn't answer. Try again in a minute.");
          await sweepTeamCalendars({ force: true }).catch((err) => console.warn("Team calendars:", err?.message || err));
          return res.status(200).json({ ok: true });
        }
        return fail(res, 400, "Unknown step.");
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
        const status = texts ? await texts.status().catch(() => ({ available: false, price: "", replies: false })) : { available: false, price: "", replies: false };
        return res.status(200).json({ available: status.available === true, price: status.price || "", replies: status.available === true && status.replies === true });
      }
      if (op === "saveSettings") {
        // Blocked time has its own ops (an open Hours page must never undo a block made on the calendar meanwhile).
        const { blocks: _sent, ...cleaned } = cleanBookingSettings(req.body?.settings);
        const next = settings.blocks?.length ? { ...cleaned, blocks: settings.blocks } : cleaned;
        await settingsRef().set({ ...next, updatedAt: now().toISOString(), updatedBy: by });
        await tellWebsite(next.live);
        // Someone taken off the team: their Google Calendar link goes too, so Colophon stops holding their access.
        // Best effort: a link that can't be given back now stays listed in Google's own account page for them.
        const kept = new Set((next.staff || []).map((p) => p.id));
        for (const gone of (settings.staff || []).filter((p) => !kept.has(p.id))) {
          await Promise.resolve().then(() => calendar.personDisconnect(gone.id)).catch((err) => console.warn("Team calendars:", err?.message || err));
        }
        // Just switched on: the coming bookings go in too, and the owner learns whether Google is linked.
        const googleCalendar = next.googleCalendar && !settings.googleCalendar ? await fillCalendar() : undefined;
        return res.status(200).json({ ok: true, settings: next, ...(googleCalendar ? { googleCalendar } : {}) });
      }
      // Hours worked (plan 4, 4.2): the owner sees, adds, fixes and removes shifts. Never from the desk.
      if (op === "shifts") {
        const from = String(req.body?.from || ""), to = String(req.body?.to || "");
        if (!isDay(from) || !isDay(to) || to < from) return fail(res, 400, "Pick the days.");
        const snap = await shifts().where("day", ">=", from).where("day", "<=", to).limit(2000).get();
        const open = await shifts().where("open", "==", true).limit(200).get();
        const seen = new Set();
        const list = [...snap.docs, ...open.docs].filter((d) => !seen.has(d.id) && seen.add(d.id)).map((d) => shiftView(d.id, d.data()));
        return res.status(200).json({ shifts: list.sort((a, b) => a.in.localeCompare(b.in)) });
      }
      if (op === "saveShift") {
        const made = cleanShift({ ...(req.body?.shift || {}), by: "owner" });
        if ("error" in made) return fail(res, 400, made.error);
        const id = req.body?.shift?.id ? String(req.body.shift.id) : `s${crypto.randomBytes(8).toString("hex")}`;
        if (!ID.test(id)) return fail(res, 400, "Unknown shift.");
        const shift = made.shift;
        const saved = await db.runTransaction(async (t) => {
          const ref = shifts().doc(id);
          const was = await t.get(ref);
          if (req.body?.shift?.id && !was.exists) return { error: "This shift was removed. Refresh and try again." };
          // One open shift a person: a second one left open would make the desk's Clock out ambiguous.
          if (!shift.out) {
            const other = await t.get(shifts().where("email", "==", shift.email).where("open", "==", true).limit(2));
            if (other.docs.some((d) => d.id !== id)) return { error: `${shift.name} is already on the clock. Add a finish time to this one.` };
          }
          t.set(ref, { ...shift, open: !shift.out, updatedAt: now().toISOString(), updatedBy: by });
          return { ok: true };
        });
        if (saved.error) return fail(res, 409, saved.error);
        return res.status(200).json({ ok: true, shift: shiftView(id, { ...shift, open: !shift.out }) });
      }
      if (op === "removeShift") {
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 400, "Unknown shift.");
        await shifts().doc(id).delete();
        return res.status(200).json({ ok: true });
      }
      // The rota (plan 4, 4.3): planned shifts for a stretch of days, and who can be on it.
      if (op === "rota") {
        const from = String(req.body?.from || ""), to = String(req.body?.to || "");
        if (!isDay(from) || !isDay(to) || to < from || daysBetween(from, to).length > 42) return fail(res, 400, "Pick the days.");
        const snap = await rota().where("day", ">=", from).where("day", "<=", to).limit(MAX_ROTA_WEEK * 6).get();
        const asks = await timeOffs().where("to", ">=", from).limit(500).get();
        return res.status(200).json({
          shifts: snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start)),
          timeOff: asks.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.status === "approved" && t.from <= to),
          people: await rotaPeople(settings),
        });
      }
      if (op === "saveRota") {
        const made = cleanRotaShift(req.body?.shift);
        if ("error" in made) return fail(res, 400, made.error);
        const id = req.body?.shift?.id ? String(req.body.shift.id) : `r${crypto.randomBytes(8).toString("hex")}`;
        if (!ID.test(id)) return fail(res, 400, "Unknown shift.");
        await rota().doc(id).set({ ...made.shift, updatedAt: now().toISOString(), updatedBy: by });
        return res.status(200).json({ ok: true, shift: { id, ...made.shift } });
      }
      if (op === "removeRota") {
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 400, "Unknown shift.");
        await rota().doc(id).delete();
        return res.status(200).json({ ok: true });
      }
      // Copy one week's plan onto another (each shift moved by whole weeks); a shift already there isn't doubled.
      if (op === "copyRota") {
        const from = String(req.body?.from || ""), to = String(req.body?.to || "");
        if (!isDay(from) || !isDay(to) || from === to) return fail(res, 400, "Pick the weeks.");
        const shift = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
        if (shift % 7 !== 0) return fail(res, 400, "Pick the weeks.");
        const src = await rota().where("day", ">=", from).where("day", "<=", addDays(from, 6)).limit(MAX_ROTA_WEEK).get();
        const there = await rota().where("day", ">=", to).where("day", "<=", addDays(to, 6)).limit(MAX_ROTA_WEEK).get();
        const key = (x) => `${x.email}|${x.day}|${x.start}|${x.end}`;
        const have = new Set(there.docs.map((d) => key(d.data())));
        let copied = 0;
        for (const d of src.docs) {
          const x = d.data();
          const next = { ...x, day: addDays(x.day, shift), updatedAt: now().toISOString(), updatedBy: by };
          if (have.has(key(next))) continue;
          await rota().doc(`r${crypto.randomBytes(8).toString("hex")}`).set(next);
          copied++;
        }
        return res.status(200).json({ ok: true, copied });
      }
      // Time off (plan 4, 4.3): the asks, newest first, with how many bookings each waiting one would clash with.
      if (op === "timeOff") {
        const snap = await timeOffs().orderBy("createdAt").limit(500).get();
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse().slice(0, 100);
        for (const t of list) if (t.status === "waiting") t.clashes = (await clashesFor(t)).length;
        return res.status(200).json({ timeOff: list });
      }
      if (op === "answerTimeOff") {
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 400, "Unknown request.");
        const yes = req.body?.yes === true;
        const answer = typeof req.body?.answer === "string" ? req.body.answer.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) : "";
        const result = await db.runTransaction(async (tx) => {
          const snap = await tx.get(timeOffs().doc(id));
          if (!snap.exists) return { error: "This request was removed." };
          const t = snap.data();
          if (t.status !== "waiting") return { error: "This request was already answered." };
          // Approved for someone on Team & rooms: their days off or blocked time, so clients can't book them.
          let applied = "";
          const set = await tx.get(settingsRef());
          const stored = cleanBookingSettings(set.exists ? set.data() : null);
          const person = (stored.staff || []).find((p) => (t.staffId && p.id === t.staffId) || (p.email && p.email.toLowerCase() === t.email));
          if (yes && person) {
            if (t.start && t.end) {
              const blocks = cleanBlocks(stored.blocks, dayOf(now().getTime(), zone()));
              if (blocks.length >= MAX_BLOCKS) return { error: `You can keep up to ${MAX_BLOCKS} blocks. Remove an old one first.` };
              const [made] = cleanBlocks([{ id: `b${crypto.randomBytes(6).toString("hex")}`, title: "Time off", staffId: person.id, day: t.from, start: t.start, end: t.end, weekly: false, until: "" }]);
              tx.set(settingsRef(), { blocks: [...blocks, made], updatedAt: now().toISOString(), updatedBy: by }, { merge: true });
              applied = "block";
            } else {
              const staff = stored.staff.map((p) => (p.id === person.id ? { ...p, daysOff: [...new Set([...(p.daysOff || []), ...daysBetween(t.from, t.to)])].sort() } : p));
              tx.set(settingsRef(), { staff, updatedAt: now().toISOString(), updatedBy: by }, { merge: true });
              applied = "daysOff";
            }
          }
          const next = { ...t, status: yes ? "approved" : "declined", ...(answer ? { answer } : {}), answeredAt: now().toISOString(), answeredBy: by, ...(applied ? { applied } : {}) };
          tx.set(timeOffs().doc(id), next);
          return { t: next };
        });
        if (result.error) return fail(res, 409, result.error);
        await tellTimeOff(result.t);
        return res.status(200).json({ ok: true, timeOff: { id, ...result.t } });
      }
      if (op === "addBlock" || op === "removeBlock") {
        // Block time on the calendar (plan 4, 1.3): lunch, a dentist visit, a weekly meeting. Clients can't book it; the
        // owner still can. Read and written in one go, so two tabs adding blocks never lose one.
        const today = dayOf(now().getTime(), zone());
        const id = op === "addBlock" ? `b${crypto.randomBytes(6).toString("hex")}` : String(req.body?.id || "");
        let problem = "";
        const blocks = await db.runTransaction(async (tx) => {
          const snap = await tx.get(settingsRef());
          const stored = cleanBookingSettings(snap.exists ? snap.data() : null);
          const kept = cleanBlocks(stored.blocks, today);
          let nextBlocks = kept;
          if (op === "removeBlock") nextBlocks = kept.filter((b) => b.id !== id);
          else {
            const [made] = cleanBlocks([{ ...(req.body?.block || {}), id }]);
            if (!made) { problem = "Pick a day and a start before the end."; return kept; }
            if (made.staffId && !(stored.staff || []).some((p) => p.id === made.staffId)) { problem = "That person isn't on your team."; return kept; }
            if (kept.length >= MAX_BLOCKS) { problem = `You can keep up to ${MAX_BLOCKS} blocks. Remove an old one first.`; return kept; }
            nextBlocks = [...kept, made];
          }
          tx.set(settingsRef(), { blocks: nextBlocks, updatedAt: now().toISOString(), updatedBy: by }, { merge: true });
          return nextBlocks;
        });
        if (problem) return fail(res, 400, problem, "block");
        return res.status(200).json({ ok: true, blocks, ...(op === "addBlock" ? { id } : {}) });
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
        const asked = askedFor(found, settings, req.body);
        if (asked.problem) return fail(res, 400, asked.problem, asked.code);
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
        const asked = askedFor(found, settings, req.body);
        if (asked.problem) return fail(res, 400, asked.problem, asked.code);
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
      if (op === "promoAudience") {
        // Send a promo text: how many it reaches, what one text costs, and when the last one went.
        const group = cleanGroup(req.body?.group);
        const people = await promoAudience(group, String(req.body?.serviceId || ""), now().getTime());
        const status = texts ? await texts.status().catch(() => ({ available: false, price: "" })) : { available: false, price: "" };
        const last = await lastPromo();
        return res.status(200).json({ available: status.available === true, price: status.price || "", count: people.length, open: promoHours(now().getTime(), zone()),
          lastAt: last?.at || null, nextAt: last ? new Date(Date.parse(last.at) + PROMO_GAP_HOURS * HOUR).toISOString() : null });
      }
      if (op === "promoSend") {
        const r = await sendPromo({ settings, group: cleanGroup(req.body?.group), serviceId: String(req.body?.serviceId || ""), text: req.body?.text, by });
        if (r.problem) return fail(res, r.code === "too_soon" || r.code === "nobody" ? 409 : 400, r.problem, r.code);
        return res.status(200).json(r);
      }
      if (op === "promoHistory") {
        const snap = await promoLog().orderBy("at", "desc").limit(10).get();
        return res.status(200).json({ promos: snap.docs.map((d) => { const p = d.data(); return { id: d.id, text: p.text, group: p.group, serviceId: p.serviceId || "", at: p.at, status: p.status, people: p.people || 0, sent: p.sent || 0, failed: p.failed || 0, stopped: p.stopped || 0 }; }) });
      }
      if (op === "points" || op === "pointsAdjust") {
        // A client's loyalty points (client card): the balance and newest rows; pointsAdjust adds or takes points by hand.
        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!EMAIL.test(email)) return fail(res, 400, "Unknown client.");
        const s = cleanLoyalty(settings.loyalty);
        if (op === "pointsAdjust") {
          if (!s.on) return fail(res, 400, "Turn on loyalty points first.");
          const points = cleanAdjust(req.body?.points);
          if (points === null) return fail(res, 400, "Type a whole number of points to add or take, not zero.");
          const note = String(req.body?.note || "").trim().slice(0, 120);
          const result = await earnPoints(email, `adjust_${crypto.randomBytes(8).toString("hex")}`, points, s, { kind: "adjust", note });
          for (const r of result.codes) await tellReward(email, r.code, r.expiry, s, settings, null);
          return res.status(200).json({ ...(await pointsOf(email, s, true)), on: s.on, rewardsSent: result.codes.length });
        }
        return res.status(200).json({ ...(await pointsOf(email, s, true)), on: s.on });
      }
      if (op === "clientForm") {
        // The form a client signed before their first visit (client card and booking drawer), and whether it is the
        // current wording.
        const email = String(req.body?.email || "").trim().toLowerCase();
        if (!EMAIL.test(email)) return fail(res, 400, "Unknown client.");
        const forms = settings.intakeForms || [];
        const nowMs0 = now().getTime();
        const rows = await Promise.all(forms.map(async (f) => {
          const snap = await formDoc(email, f.id).get();
          const r = snap.exists ? snap.data() : null;
          if (!r) return { id: f.id, title: f.title, on: f.on, signed: null };
          const current = r.version === formVersion(f);
          const runsOut = formRunsOut(r.signedAt, f.renewMonths);
          return { id: f.id, title: f.title, on: f.on, signed: { signedName: r.signedName, signedAt: r.signedAt, title: r.title, text: r.text, answers: r.answers || [], current,
            ...(runsOut !== null ? { runsOut: new Date(runsOut).toISOString(), ranOut: runsOut <= nowMs0 } : {}) } };
        }));
        const shown = rows.filter((r) => r.on || r.signed);
        // `form`: the first form's record, for older pages.
        const first = shown[0]?.signed || null;
        return res.status(200).json({ forms: shown, form: first, asks: forms.some((f) => f.on) });
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
        const asked = askedFor(listed, settings, req.body);
        if (asked.problem) return fail(res, 400, asked.problem, asked.code);
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
          serviceId: service.id, serviceName: service.name, minutes: service.minutes, gapAfter: service.gapAfter, ...processingRecord(service), location: service.location,
          // The owner booking someone in may fill in the service's questions or leave them.
          customer: { name: customer.name, email: customer.email, phone: customer.phone, ...(customer.textOk ? { textOk: true } : {}) }, note: customer.note, answers: cleanAnswers(service.questions, req.body?.answers, false).answers,
          // Booked in by the owner: nothing is taken by card, so a priced service is all paid at the visit.
          status: "confirmed", payment: service.priceMinor > 0 ? "atShop" : "free", priceMinor: service.priceMinor + (tax?.taxMinor || 0), ...taxFields(tax), currency: currency(),
          ...(extras.length ? { extras } : {}),
          ...(service.lengthId ? { lengthId: service.lengthId } : {}),
          paid: false, sessions: [], holdUntil: null, manageKeyHash: hash(key), pendingKey: null, source: "admin",
          history: [{ at, what: run ? `booked (visit 1 of ${run.visits})` : "booked", by }], createdAt: at, updatedAt: at,
          ...(run ? { series: { id: `run_${id}`, everyWeeks: run.everyWeeks, visits: run.visits, visit: 1 } } : {}),
        };
        // The owner may book any time that doesn't clash, outside the hours too (a favour for a regular), with anyone on
        // the team who does the service.
        const staffId = String(req.body?.staffId || "");
        if (staffId && !keptPerson(settings, service.id, staffId)) return fail(res, 400, "That person doesn't do this service.", "staff");
        const own = ownerBookingSettings(settings);
        // Book over (plan 4, 1.4): after the calendar warned them, the owner may double-book a one-to-one time on purpose.
        const over = req.body?.over === true && !isClass(service) && !run;
        if (over) record.history[0].what = "booked over a taken time";
        const took = await takeTime({ id, service: { ...service, classTimes: [] }, settings: own, start, record, staffId, check: !over });
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
      if (op === "visitNote") {
        // A note on this visit (plan 4, 4.6 My day): kept on the client card with the owner's visit notes, one per booking
        // (id bk-<booking>), so writing it again changes it and sending it twice is harmless. Empty takes it off.
        const email = String(b.customer?.email || "").trim().toLowerCase();
        if (!EMAIL.test(email)) return fail(res, 400, "This booking has no client email to keep a note under.");
        const note = String(req.body?.note || "").trim();
        if (note.length > MAX_VISIT_NOTE) return fail(res, 400, `Keep the note under ${MAX_VISIT_NOTE} characters.`);
        const ref = db.collection("clientVisits").doc(`bk-${id}`);
        const had = await ref.get();
        const old = had.exists ? had.data() : null;
        const at = now().toISOString();
        if (!note && !(old?.photos || []).length) {
          if (old) await ref.delete();
        } else {
          await ref.set({ client: hash(email), email, day: dayOf(Date.parse(b.start), zone()), note, photos: old?.photos || [], createdAt: old?.createdAt || at, updatedAt: at });
        }
        await bookings().doc(id).set({ history: [...(b.history || []), { at, what: note ? "visit note saved" : "visit note taken off", by }].slice(-20) }, { merge: true });
        return res.status(200).json({ ok: true, note });
      }
      // Owner approves (plan 4, 2.5): accept turns a request into a booking; decline lets the time go and tells them.
      if (op === "accept") {
        if (b.status === "confirmed") return res.status(200).json({ ok: true });
        if (b.status !== "requested") return fail(res, 409, "This request was already answered, or its time ran out.", "answered");
        const at = now().toISOString();
        const changes = { status: "confirmed", answerBy: null, pendingKey: null, acceptedAt: at, updatedAt: at, history: [...(b.history || []), { at, what: "accepted", by }].slice(-20) };
        const accepted = await db.runTransaction(async (tx) => {
          const snap = await tx.get(bookings().doc(id));
          if (snap.data()?.status !== "requested") return false;
          tx.set(bookings().doc(id), changes, { merge: true });
          return true;
        });
        if (!accepted) return fail(res, 409, "This request was already answered, or its time ran out.", "answered");
        const next = await syncCalendar(id, { ...b, ...changes });
        await tellCustomer(id, next, "booked", { key: b.pendingKey || "", byShop: true });
        return res.status(200).json({ ok: true });
      }
      if (op === "decline") {
        if (b.status === "cancelled") return res.status(200).json({ ok: true });
        if (b.status !== "requested") return fail(res, 409, "Only a request can be declined. To call off a booking, cancel it.", "answered");
        const reason = String(req.body?.reason || "").trim().slice(0, 300);
        await declineRequest(id, b, by, reason);
        return res.status(200).json({ ok: true });
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
        // A new length (dragging a booking's bottom edge on the calendar): whole five minutes, 5 minutes to 12 hours, one-to-one only.
        const minutes = req.body?.minutes === undefined ? b.minutes : Number(req.body.minutes);
        if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720 || minutes % 5) return fail(res, 400, "Pick a length in whole five minutes, up to 12 hours.", "minutes");
        if (minutes !== b.minutes && isClass(theirs)) return fail(res, 409, "A class keeps its own length. Change it on the service.", "class_length");
        if (minutes !== b.minutes && b.parts?.length) return fail(res, 409, "A visit with several services keeps each service's length. Move it, or cancel and book it again.", "visit_length");
        // Book over (plan 4, 1.4): a one-to-one booking may land on a taken time once the owner said yes to the warning.
        const over = req.body?.over === true && !isClass(theirs);
        const moved = await moveTime(id, b, { id: b.serviceId, places: theirs?.places || 1, minutes, gapAfter: b.gapAfter || 0, gapBefore: b.gapBefore || 0, roomId: theirs?.roomId || "" }, own, start, { by, staffId, minutes, check: !over });
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
            description: `${shopName() ? `${shopName()}: ` : ""}${visitName(b)}, ${reason} fee`.slice(0, 250), metadata: { booking: id, fee: reason },
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
          const description = `${shopName() ? `${shopName()}: ` : ""}${visitName(b)} (${b.customer?.name || "desk"})`.slice(0, 250);
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
  /**
   * Lets a request go (plan 4, 2.5): frees its time (a code, gift card or pack visit goes back), and tells the client,
   * with the owner's own words when there are some. `by` "not answered" when the owner didn't answer in time.
   */
  async function declineRequest(id, b, by, reason = "") {
    const at = now().toISOString();
    const late = by === "not answered";
    const changes = { status: "cancelled", cancelledAt: at, cancelledBy: by, declined: true, answerBy: null, pendingKey: null, updatedAt: at,
      history: [...(b.history || []), { at, what: late ? "request not answered in time" : "declined", by }].slice(-20) };
    // Only while it is still a request: an accept or a withdrawal at the same moment wins.
    const written = await freeTime(id, b, changes, { still: (fresh) => fresh.status === "requested" });
    if (!written) return false;
    const shop = shopName() || "The shop";
    const words = late ? `${shop} couldn't answer your request in time, so the time has been let go. Nothing was taken. You're welcome to choose another time.`
      : `${shop} can't take this booking, sorry.${reason ? ` They said: “${reason}”` : ""} You're welcome to choose another time.`;
    await tellCustomer(id, { ...b, ...changes }, "declined", { byShop: true, refundText: words });
    return true;
  }

  /** Requests the owner didn't answer by their `answerBy`: let go (from the five-minute sweep). */
  async function sweepRequests() {
    const snap = await bookings().where("status", "==", "requested").limit(100).get();
    const nowMs = now().getTime();
    let freed = 0;
    for (const doc of snap.docs) {
      const b = doc.data();
      if (!(Date.parse(b.answerBy || b.start || "") <= nowMs)) continue;
      if (await declineRequest(doc.id, b, "not answered").catch((err) => console.warn(`Booking ${doc.id}: letting a request go failed:`, err?.message || err))) freed += 1;
    }
    return freed;
  }

  async function sweepHolds() {
    if (!(await featureOn())) return { confirmed: 0, freed: 0 };
    await sweepPacks().catch((err) => console.warn("bookings: the packs sweep failed:", err?.message || err));
    await sweepRequests().catch((err) => console.warn("bookings: the requests sweep failed:", err?.message || err));
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
   * The client cancels (their booking page, or C by text): any rest settled, the payment refunded, the time freed, the
   * calendar and the client told. `andLater` also cancels a standing appointment's later visits. Answers null, with the
   * booking still on, when the refund couldn't be started.
   */
  async function cancelByCustomer(id, b, { andLater = false, how = "" } = {}) {
    b = await settleRest(id, b);
    let refund = null;
    try { refund = await refundBooking(id, b); } catch (err) {
      console.error(`Booking ${id} refund failed:`, err?.message || err);
      return null;
    }
    const at = now().toISOString();
    const changes = { status: "cancelled", cancelledAt: at, cancelledBy: "customer", updatedAt: at, ...(refund ? { refund } : {}),
      history: [...(b.history || []), { at, what: `${refund ? "cancelled and refunded" : "cancelled"}${how}`, by: "customer" }].slice(-20) };
    const written = await freeTime(id, b, changes);
    const next = await syncCalendar(id, { ...b, ...written });
    const alsoCancelled = andLater ? (await cancelLater(id, b, "customer", at)).cancelled : 0;
    const refundText = backWords(b, { refunded: !!refund, giftBack: true, packBack: true, later: alsoCancelled });
    await tellCustomer(id, next, "cancelled", { refundText });
    return { next, refund, refundText };
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
      b = namesForClient(b, settings);
      // In the client's language, with the owner's own words when written (plan 4, 3.5).
      const lang = await clientLanguage(b);
      const L = TEXT_LABELS[lang];
      const when = new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { timeZone: zone(), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(b.start));
      const shop = String(shopName() || "").trim().slice(0, 40) || L.theShop;
      // Answers by text (plan 4, 3.4): Y, C or M instead of the link, when the owner and the platform both allow it.
      const answers = settings.textReplies === true && (await texts.status().catch(() => null))?.replies === true;
      const ask = answers ? L.askReply : `${L.changeOrCancel} ${manageUrl(id, key)}`;
      const head = fillMessage(textWords(settings.messages, lang, kind === "soon" ? "textSoon" : "textReminder"), { service: visitName(b).slice(0, 60), shop, when, with: b.staffName ? `${L.with} ${b.staffName.slice(0, 30)}` : "" });
      const body = `${head} ${ask} ${L.stop}`;
      const sent = await texts.send({ to: b.customer.phone, body, kind: `booking-${kind}`, idempotencyKey: `booking-${id}-${kind}-${hash(key).slice(0, 10)}`, ...(answers ? { replyRef: id } : {}) });
      if (sent?.optedOut) await bookings().doc(id).set({ customer: { ...b.customer, textOk: false } }, { merge: true });
      else if (sent?.ok) await bookings().doc(id).set({ [kind === "soon" ? "reminder2TextAt" : "reminderTextAt"]: now().toISOString() }, { merge: true });
      else if (sent && !sent.ok) console.warn(`bookings: the ${kind} text for ${id} wasn't sent: ${sent.message || "no answer"}`);
    } catch (err) {
      console.error("bookings: reminder text failed:", err?.message || err);
    }
  }

  /**
   * Answers by text (plan 4, 3.4): the platform keeps each client's Y, C or M for the booking its reminder was about; this
   * takes them every sweep and answers each by text. Y marks the booking confirmed, C cancels it when the cancel rules
   * allow (with the refund, as on the booking page), M sends a link to pick a new time. A reply about a booking that's
   * gone, past or changed gets a plain answer. Each reply is handled once: it's taken off the platform's list after.
   */
  async function sweepTextReplies() {
    if (!texts?.replies || !(await featureOn())) return { answered: 0 };
    const waiting = await texts.replies().catch(() => []);
    if (!waiting.length) return { answered: 0 };
    const settings = await readSettings();
    const nowMs = now().getTime();
    let answered = 0;
    for (const r of waiting) {
      try {
        const ref = ID.test(r.ref) ? bookings().doc(r.ref) : null;
        const b = ref ? (await ref.get()).data() : null;
        if (!b?.customer?.phone) continue;
        const named = namesForClient(b, settings);
        const lang = await clientLanguage(b);
        const L = TEXT_LABELS[lang];
        const shop = String(shopName() || "").trim().slice(0, 40) || L.theShop;
        const when = new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { timeZone: zone(), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(b.start));
        const visit = `${visitName(named).slice(0, 60)}, ${when}`;
        const start = Date.parse(b.start || "");
        let body;
        if (b.status !== "confirmed" || !(start > nowMs)) {
          body = L.notBooked(visit, shop);
        } else if (r.word === "yes") {
          if (!b.clientConfirmedAt) {
            const at = now().toISOString();
            await ref.set({ clientConfirmedAt: at, history: [...(b.history || []), { at, what: "said they'll be there (by text)", by: "customer" }].slice(-20) }, { merge: true });
          }
          body = L.confirmed(visit);
        } else if (r.word === "cancel") {
          if (!customerCanChange(start, settings, nowMs)) body = L.tooClose(visit, shop);
          else {
            const done = await cancelByCustomer(r.ref, b, { how: " by text" });
            body = done ? `${L.cancelled(visit)} ${done.refundText[lang] || ""}`.trim() : L.couldNotCancel(visit, shop);
          }
        } else {
          if (!customerCanChange(start, settings, nowMs) || b.course || b.parts?.length) body = L.cantMove(visit, shop);
          else {
            const key = randomKey();
            await ref.set({ textKeyHash: hash(key) }, { merge: true });
            body = L.pickNew(visit, manageUrl(r.ref, key));
          }
        }
        const sent = await texts.send({ to: b.customer.phone, body: body.slice(0, 450), kind: "booking-reply", idempotencyKey: `booking-${r.ref}-reply-${String(r.id).slice(-24)}` });
        if (sent?.optedOut) await ref.set({ customer: { ...b.customer, textOk: false } }, { merge: true });
        answered += 1;
      } catch (err) {
        console.error(`bookings: the text reply for ${r.ref} failed:`, err?.message || err);
      }
    }
    // Taken whatever happened: a reply that broke once is answered by the shop by hand, never twice by text.
    await texts.repliesTaken(waiting.map((r) => r.id)).catch(() => {});
    return { answered };
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
    const maxHours = Math.max(Number(reminderHours) || 0, Number(secondReminderHours) || 0);
    const nowIso = new Date(nowMs).toISOString();
    const endIso = new Date(nowMs + maxHours * HOUR).toISOString();
    const [upcoming, courses] = await Promise.all([
      bookings().where("status", "==", "confirmed").where("start", ">=", nowIso).where("start", "<=", endIso).limit(500).get(),
      bookings().where("status", "==", "confirmed").where("courseLastStart", ">=", nowIso).limit(200).get(),
    ]);
    const docs = new Map();
    for (const doc of upcoming.docs) docs.set(doc.id, doc);
    for (const doc of courses.docs) docs.set(doc.id, doc);
    let reminded = 0;
    for (const doc of docs.values()) {
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

  /** The day records' items for each person's busy times: day → { key: item }. */
  function teamBusyItems(spans) {
    const days = new Map();
    for (const [id, list] of Object.entries(spans || {})) {
      for (const x of Array.isArray(list) ? list : []) {
        if (!Number.isFinite(x?.s) || !Number.isFinite(x?.e) || x.e <= x.s) continue;
        for (const d of daysTouched(x.s, x.e, zone())) {
          if (!days.has(d)) days.set(d, {});
          days.get(d)[`${GCAL}${id}~${x.s}~${x.e}`] = { start: x.s, end: x.e, p: id, g: true };
        }
      }
    }
    return days;
  }

  /**
   * Copies each person's busy times from their own Google Calendar into the day records (Services plan 2, B6), at most
   * every 15 minutes unless `force`. Only active people are asked; someone off the team or unlinked has theirs cleared.
   * A calendar the platform couldn't read keeps what it had. Only days whose busy times changed are written, each in a
   * transaction that leaves every booking's item as it is. What was last written is kept in `bookingSettings/googleBusy`.
   */
  async function sweepTeamCalendars({ force = false } = {}) {
    if (!calendar?.peopleBusy || !(await featureOn())) return { days: 0 };
    const settings = await readSettings();
    const ref = db.collection("bookingSettings").doc("googleBusy");
    const snap = await ref.get();
    const before = snap.exists ? snap.data() || {} : {};
    const nowMs = now().getTime();
    const last = Date.parse(before.at || "");
    if (!force && Number.isFinite(last) && nowMs - last < TEAM_BUSY_EVERY_MS) return { days: 0 };
    const team = (settings.staff || []).filter((p) => p.active).map((p) => p.id);
    const old = before.spans && typeof before.spans === "object" ? before.spans : {};
    const ids = [...new Set([...team, ...Object.keys(old)])];
    if (!ids.length) return { days: 0 };
    const from = zonedTime(dayOf(nowMs, zone()), "00:00", zone());
    const to = from + TEAM_BUSY_DAYS * 24 * 3_600_000;
    const answer = team.length ? await calendar.peopleBusy(team, new Date(from).toISOString(), new Date(to).toISOString()) : { available: true, busy: {} };
    // The platform couldn't be reached: try again next time, change nothing.
    if (!answer) return { days: 0 };
    const busy = answer.available ? answer.busy || {} : {};
    const next = {};
    for (const id of ids) {
      const got = team.includes(id) ? busy[id] : [];
      if (got === null) { if (old[id]?.length) next[id] = old[id]; continue; }
      const list = (Array.isArray(got) ? got : [])
        .map((x) => ({ s: Math.max(from, Date.parse(x?.start)), e: Math.min(to, Date.parse(x?.end)) }))
        .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s)
        .slice(0, 2000);
      if (list.length) next[id] = list;
    }
    const was = teamBusyItems(old);
    const will = teamBusyItems(next);
    const keysOf = (items) => Object.keys(items || {}).sort().join("|");
    const today = dayOf(nowMs, zone());
    const changed = [...new Set([...was.keys(), ...will.keys()])].filter((d) => d >= today && keysOf(was.get(d)) !== keysOf(will.get(d))).sort();
    for (const d of changed) {
      await db.runTransaction(async (tx) => {
        const daySnap = await tx.get(dayRef(d));
        const items = Object.fromEntries(Object.entries((daySnap.exists ? daySnap.data()?.items : null) || {}).filter(([k]) => !k.startsWith(GCAL)));
        tx.set(dayRef(d), { items: { ...items, ...(will.get(d) || {}) } });
      });
    }
    await ref.set({ at: new Date(nowMs).toISOString(), spans: next, ...(answer.available ? {} : { off: true }) });
    return { days: changed.length };
  }

  // ── Outlook, Apple and other calendars (Bookings plan 4, step 5.7) ───────────────────────────────────────────
  // `bookingCalendars/main` (server only, no rule): `feeds` [{ id, url, kind, name, who, addedAt, readAt, ok, problem,
  // count }] and `spans` { feedId: [{ s, e }] }, what was last written into the day records. Rules: shared/calendarFeeds.ts.
  const calendarsDoc = () => db.collection("bookingCalendars").doc("main");
  // Send bookings to other apps (plan 4, 5.8; bookingHooks.js).
  const hooks = hooksFor({ db, now, fetchImpl: fetchHook, lookup: lookupHost });

  /** A calendar's problem in plain words, from what reading it gave. */
  function feedProblem(got) {
    if (got?.ok && looksLikeCalendar(got.text)) return "";
    if (got?.ok || [401, 403, 404, 410].includes(got?.status)) return "The calendar can't be read. Check it's still shared or published, then copy its link again.";
    if (got?.status === 413) return "The calendar is too big to read. Share a smaller calendar.";
    return "The calendar didn't answer. It will be tried again soon.";
  }

  async function readOne(feed, from, to) {
    const got = await fetchFeed(feed.url).catch((err) => ({ ok: false, status: err?.message === "not_allowed" ? 403 : 0 }));
    const problem = feedProblem(got);
    return problem ? { problem } : { spans: busyFromIcs(got.text, from, to, zone()) };
  }

  /** The day records' items for the calendars' busy times: day → { key: item }. */
  function feedBusyItems(feeds, spans) {
    const days = new Map();
    for (const f of feeds) {
      for (const x of Array.isArray(spans?.[f.id]) ? spans[f.id] : []) {
        if (!Number.isFinite(x?.s) || !Number.isFinite(x?.e) || x.e <= x.s) continue;
        for (const d of daysTouched(x.s, x.e, zone())) {
          if (!days.has(d)) days.set(d, {});
          days.get(d)[`${ICAL}${f.id}~${x.s}~${x.e}`] = { start: x.s, end: x.e, g: true, ...(f.who ? { p: f.who } : {}) };
        }
      }
    }
    return days;
  }

  /**
   * Reads every calendar again (at most every 15 minutes unless `force`) and writes only the days whose busy times
   * changed, each in a transaction that leaves every booking's item as it is. A calendar that can't be read keeps the
   * busy times it had and shows its problem; one whose person left the team stops closing times.
   */
  async function sweepOtherCalendars({ force = false } = {}) {
    if (!(await featureOn())) return { days: 0 };
    const ref = calendarsDoc();
    const snap = await ref.get();
    const before = snap.exists ? snap.data() || {} : {};
    const feeds = Array.isArray(before.feeds) ? before.feeds : [];
    const old = before.spans && typeof before.spans === "object" ? before.spans : {};
    if (!feeds.length && !Object.keys(old).length) return { days: 0 };
    const nowMs = now().getTime();
    const last = Date.parse(before.at || "");
    if (!force && Number.isFinite(last) && nowMs - last < FEED_EVERY_MS) return { days: 0 };
    const settings = await readSettings();
    const team = new Set((settings.staff || []).filter((p) => p.active).map((p) => p.id));
    const from = zonedTime(dayOf(nowMs, zone()), "00:00", zone());
    const to = from + FEED_DAYS * DAY;
    const spans = {};
    const read = new Date(nowMs).toISOString();
    const nextFeeds = [];
    for (const f of feeds) {
      if (f.who && !team.has(f.who)) { nextFeeds.push({ ...f, ok: false, problem: "That person isn't taking bookings, so this calendar is paused." }); continue; }
      const got = await readOne(f, from, to);
      if (got.problem) {
        if (Array.isArray(old[f.id]) && old[f.id].length) spans[f.id] = old[f.id];
        nextFeeds.push({ ...f, ok: false, problem: got.problem });
      } else {
        if (got.spans.length) spans[f.id] = got.spans;
        nextFeeds.push({ ...f, ok: true, problem: "", readAt: read, count: got.spans.length });
      }
    }
    // What was written before, by every calendar that had busy times (one just removed included).
    const was = feedBusyItems(Object.keys(old).map((id) => ({ id, who: feeds.find((f) => f.id === id)?.who || "" })), old);
    const will = feedBusyItems(nextFeeds.filter((f) => !f.who || team.has(f.who)), spans);
    const keysOf = (items) => Object.keys(items || {}).sort().join("|");
    const today = dayOf(nowMs, zone());
    const changed = [...new Set([...was.keys(), ...will.keys()])].filter((d) => d >= today && keysOf(was.get(d)) !== keysOf(will.get(d))).sort();
    for (const d of changed) {
      await db.runTransaction(async (tx) => {
        const daySnap = await tx.get(dayRef(d));
        const items = Object.fromEntries(Object.entries((daySnap.exists ? daySnap.data()?.items : null) || {}).filter(([k]) => !k.startsWith(ICAL)));
        tx.set(dayRef(d), { items: { ...items, ...(will.get(d) || {}) } });
      });
    }
    await ref.set({ feeds: nextFeeds, spans, at: read });
    return { days: changed.length };
  }

  /** The calendars as the admin sees them: never the address (it is a secret link). */
  async function feedsView() {
    const snap = await calendarsDoc().get();
    const feeds = snap.exists && Array.isArray(snap.data()?.feeds) ? snap.data().feeds : [];
    return feeds.map((f) => ({ id: f.id, kind: f.kind, name: f.name || "", who: f.who || "", ok: f.ok !== false, problem: f.problem || "", readAt: f.readAt || null, count: f.count || 0, addedAt: f.addedAt || null }));
  }

  /** The email with a team member's own link to share their busy times. */
  async function sendCalendarLink(person, url) {
    const brand = await emailBrand();
    const shop = brand.shopName || shopName() || "the shop";
    await sendEmail({
      to: person.email,
      subject: `${shop}: link your calendar so clients can't book you when you're busy`,
      html: risoLayout(`<h4 style="margin:0 0 8px;">${escapeHtml(person.name)}, link your calendar</h4>
          <p style="margin:0 0 12px;">${escapeHtml(shop)} would like clients to book you only when you're free. Sign in with your own Google account and allow Colophon to see when you're busy. Only busy or free is shared, never what your events are.</p>
          ${risoButton(escapeHtml(url), "Link my calendar", brand.accent, brand.theme)}
          <p style="margin:16px 0 0;font-size:13px;opacity:.75;">The link works once, for a day. Ask ${escapeHtml(shop)} for a new one if it runs out. You can unlink at any time from your Google account.</p>`,
        { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop }),
    });
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
          <td style="padding:8px 0;vertical-align:top;"><strong>${escapeHtml(b.customer?.name || "")}</strong> · ${escapeHtml(visitName(b))}${extra ? `<br><span style="opacity:.75;">${escapeHtml(extra)}</span>` : ""}${b.note ? `<br><em>“${escapeHtml(b.note)}”</em>` : ""}</td></tr>`;
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
   * Keep in touch (plan 4, 5.4, Beta): the welcome email the day after a client's first visit, the birthday email on the
   * day, and "we miss you" `missYouWeeks` after their last visit with nothing booked since. One record per client,
   * `clientMail/<hash of the email>` (server only, no address kept), says what went: `welcomeAt`, `birthdayYear`,
   * `missYouFor` (the visit it was about). Marked before sending, so a second sweep never sends twice. Marketing mail:
   * an unsubscribe link, and nobody who unsubscribed. At most MAX_KEEP_IN_TOUCH of each a sweep.
   */
  const MAX_KEEP_IN_TOUCH = 50;
  const clientMail = (email) => db.collection("clientMail").doc(hash(email));
  /** Every booking a client made, at most 200 (the same read the rebook reminder uses). */
  const bookingsOf = async (email) => (await bookings().where("customer.email", "==", email).limit(200).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  async function sweepKeepInTouch() {
    const none = { welcomed: 0, birthdays: 0, missed: 0 };
    if (!optedOut || !unsubscribeUrl || !(await featureOn())) return none;
    const settings = await readSettings();
    if (!settings.welcomeEmail && !settings.birthdayEmail && !(settings.missYouWeeks > 0)) return none;
    const nowMs = now().getTime();
    const out = { ...none };
    const emailOf = (b) => String(b?.customer?.email || "").trim().toLowerCase();
    /** Claims one kind for a client in a transaction; false when it went already (or the record says not to). */
    const claim = (email, fits, mark) => db.runTransaction(async (tx) => {
      const ref = clientMail(email);
      const doc = await tx.get(ref);
      const had = doc.exists ? doc.data() : {};
      if (!fits(had)) return false;
      tx.set(ref, { ...mark, updatedAt: new Date(nowMs).toISOString() }, { merge: true });
      return true;
    });

    if (settings.welcomeEmail) {
      // First visits that ended WELCOME_AFTER_HOURS ago, within the window.
      const to = new Date(nowMs - WELCOME_AFTER_HOURS * HOUR).toISOString();
      const from = new Date(nowMs - WELCOME_AFTER_HOURS * HOUR - KEEP_IN_TOUCH_WINDOW_DAYS * DAY).toISOString();
      const snap = await bookings().where("end", ">=", from).where("end", "<=", to).limit(500).get();
      for (const doc of snap.docs) {
        if (out.welcomed >= MAX_KEEP_IN_TOUCH) break;
        const b = doc.data();
        const email = emailOf(b);
        if (!EMAIL.test(email) || !visitHappened(b, nowMs)) continue;
        // Their first: no earlier visit that happened.
        const theirs = await bookingsOf(b.customer.email);
        if (theirs.some((o) => o.id !== doc.id && o.start < b.start && visitHappened(o, nowMs))) continue;
        if (await optedOut(email)) continue;
        if (!(await claim(email, (had) => !had.welcomeAt, { welcomeAt: new Date(nowMs).toISOString() }))) continue;
        await tellKeepInTouch("welcome", { id: doc.id, ...b }, email, settings);
        out.welcomed += 1;
      }
    }

    if (settings.birthdayEmail) {
      const today = dayOf(nowMs, zone());
      const year = today.slice(0, 4);
      // From 9 a.m. shop time, so nobody is woken by it.
      if (nowMs >= zonedTime(today, "09:00", zone())) {
        const seen = new Set();
        for (const md of birthdaysOn(today)) {
          const snap = await bookings().where("customer.birthday", "==", md).limit(500).get();
          for (const doc of snap.docs) {
            if (out.birthdays >= MAX_KEEP_IN_TOUCH) break;
            const b = doc.data();
            const email = emailOf(b);
            if (!EMAIL.test(email) || seen.has(email) || b.status === "held") continue;
            seen.add(email);
            // Their newest birthday wins: a later booking may have corrected it.
            const theirs = (await bookingsOf(b.customer.email)).filter((o) => o.customer?.birthday).sort((x, y) => String(y.createdAt || y.start).localeCompare(String(x.createdAt || x.start)));
            if (theirs[0] && theirs[0].customer.birthday !== md) continue;
            if (await optedOut(email)) continue;
            if (!(await claim(email, (had) => had.birthdayYear !== year, { birthdayYear: year }))) continue;
            await tellKeepInTouch("birthday", { id: doc.id, ...b }, email, settings);
            out.birthdays += 1;
          }
        }
      }
    }

    if (settings.missYouWeeks > 0) {
      const dueAt = nowMs - settings.missYouWeeks * 7 * DAY;
      const from = new Date(dueAt - KEEP_IN_TOUCH_WINDOW_DAYS * DAY).toISOString();
      const snap = await bookings().where("end", ">=", from).where("end", "<=", new Date(dueAt).toISOString()).limit(500).get();
      for (const doc of snap.docs) {
        if (out.missed >= MAX_KEEP_IN_TOUCH) break;
        const b = doc.data();
        const email = emailOf(b);
        if (!EMAIL.test(email) || !visitHappened(b, nowMs)) continue;
        // Their last: nothing booked since (still to come or already been), and no rebook reminder about this visit.
        if (b.rebookSentAt) continue;
        const theirs = await bookingsOf(b.customer.email);
        if (theirs.some((o) => o.id !== doc.id && o.start > b.start && o.status !== "cancelled")) continue;
        if (await optedOut(email)) continue;
        if (!(await claim(email, (had) => had.missYouFor !== doc.id, { missYouFor: doc.id }))) continue;
        await tellKeepInTouch("missYou", { id: doc.id, ...b }, email, settings);
        out.missed += 1;
      }
    }
    return out;
  }

  /** One keep-in-touch email (welcome, birthday, missYou) in the client's language and the owner's words. Never throws. */
  async function tellKeepInTouch(kind, b, email, settings) {
    try {
      const brand = await emailBrand();
      const lang = await clientLanguage(b);
      const shop = brand.shopName || shopName() || (lang === "fr" ? "la boutique" : "the shop");
      const T = EMAIL_LABELS[lang];
      const words = emailWords(settings?.messages, lang, kind);
      const lastDay = new Date(b.start).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { timeZone: zone(), day: "numeric", month: "long", year: "numeric" });
      const values = { client: String(b.customer?.name || "").trim().split(/\s+/)[0] || "", service: visitName(b), when: kind === "missYou" ? lastDay : "", shop };
      const fill = (template) => fillMessage(template, values);
      const lead = escapeHtml(fill(words.lead)).replace(/\n/g, "<br>");
      // With names hidden, the Book link doesn't pick the person either.
      const withPerson = b.staffId && settings?.teamShown !== "hidden" ? `&with=${encodeURIComponent(b.staffId)}` : "";
      const link = siteLink(kind === "birthday" || !b.serviceId ? "/book" : `/book?service=${encodeURIComponent(b.serviceId)}${withPerson}`);
      const html = risoLayout(`
        <h2 style="margin:0 0 12px;">${escapeHtml(fill(words.heading))}</h2>
        <p style="margin:0 0 16px;">${lead}</p>
        ${risoButton(escapeHtml(link), kind === "birthday" ? T.bookATime : T.bookNext, brand.accent, brand.theme)}
        <p style="margin-top:28px;font-size:11px;color:#888;">${escapeHtml(T.noMoreEmails)} <a href="${escapeHtml(await unsubscribeUrl(email))}">${escapeHtml(T.unsubscribe)}</a>.</p>
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to: email, subject: fill(words.subject), html });
    } catch (err) {
      console.error(`bookings: ${kind} email failed:`, err?.message || err);
    }
  }

  // ── Promo texts (Bookings plan 4, step 5.6) ────────────────────────────────────────────────────────────────────
  // One text to a group of clients who ticked "Text me offers" (`customer.promoOk`, its own yes, apart from reminder
  // texts). Each promo is kept in `promoTexts/{id}` ({ text, group, serviceId, at, by, status, sent, failed, stopped });
  // the record is made first, in a transaction that also checks the last one was PROMO_GAP_HOURS ago, so two clicks
  // can't send twice. Rules: shared/promoTexts.ts.
  const promoLog = () => db.collection("promoTexts");

  /** The clients a promo reaches, one per phone number: `[{ phone, ids, b }]` (`b`, their newest booking). */
  async function promoAudience(group, serviceId, nowMs) {
    const snap = await bookings().where("customer.promoOk", "==", true).limit(3000).get();
    const byPhone = new Map();
    for (const doc of snap.docs) {
      const b = doc.data();
      const key = phoneKey(b.customer?.phone);
      if (key.length < 10) continue;
      const start = Date.parse(b.start);
      const fits = group === "all"
        || (group === "recent" && b.status === "confirmed" && !b.noShow && start <= nowMs && start >= nowMs - RECENT_DAYS * DAY)
        || (group === "service" && b.status !== "cancelled" && b.serviceId === serviceId);
      const had = byPhone.get(key) || { phone: b.customer.phone, ids: [], b, fits: false };
      had.ids.push(doc.id);
      had.fits = had.fits || fits;
      if (String(b.start) > String(had.b.start)) { had.b = b; had.phone = b.customer.phone; }
      byPhone.set(key, had);
    }
    return [...byPhone.values()].filter((c) => c.fits).slice(0, MAX_PROMO_TEXTS);
  }

  /** The last promo sent, or null. */
  async function lastPromo() {
    const snap = await promoLog().orderBy("at", "desc").limit(1).get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  /**
   * Sends one promo: `{ sent, failed, stopped }`, or `{ problem, code }` when it can't go (texts not open, off, at night,
   * too soon after the last, nobody to send to, wrong words).
   */
  async function sendPromo({ settings, group, serviceId, text, by }) {
    if (!settings.promoTexts) return { problem: "Turn on promo texts first.", code: "off" };
    if (!(await textsOpen())) return { problem: "Texts aren't open for your shop yet.", code: "closed" };
    const nowMs = now().getTime();
    if (!promoHours(nowMs, zone())) return { problem: `Promo texts go out between ${PROMO_FROM_HOUR} a.m. and ${PROMO_UNTIL_HOUR - 12} p.m. your time.`, code: "hours" };
    const words = cleanPromo(text);
    if ("problem" in words) return { problem: words.problem, code: "words" };
    const people = await promoAudience(group, serviceId, nowMs);
    if (!people.length) return { problem: "Nobody in this group has said yes to texts yet.", code: "nobody" };
    const ref = promoLog().doc();
    const at = new Date(nowMs).toISOString();
    const claimed = await db.runTransaction(async (tx) => {
      const last = await tx.get(promoLog().orderBy("at", "desc").limit(1));
      const lastAt = last.empty ? 0 : Date.parse(last.docs[0].data().at);
      if (nowMs - lastAt < PROMO_GAP_HOURS * HOUR) return false;
      tx.set(ref, { text: words.text, group, serviceId: group === "service" ? serviceId : "", at, by, status: "sending", people: people.length, sent: 0, failed: 0, stopped: 0 });
      return true;
    });
    if (!claimed) return { problem: "You sent a promo text in the last day. You can send the next one tomorrow.", code: "too_soon" };
    const brand = await emailBrand().catch(() => ({}));
    const shop = brand.shopName || shopName() || "";
    const out = { sent: 0, failed: 0, stopped: 0 };
    // Ten at a time: quick enough for 500 people, gentle on the text company.
    for (let i = 0; i < people.length; i += 10) {
      await Promise.all(people.slice(i, i + 10).map(async (c) => {
        const lang = await clientLanguage(c.b).catch(() => "en");
        const sent = await texts.send({ to: c.phone, body: promoBody(words.text, shop, lang), kind: "booking-promo", idempotencyKey: `promo-${ref.id}-${phoneKey(c.phone)}` }).catch(() => null);
        if (sent?.optedOut) {
          out.stopped += 1;
          // They texted STOP: no more promos to them, on any of their bookings.
          await Promise.all(c.ids.map((id) => bookings().doc(id).get().then((d) => d.exists && bookings().doc(id).set({ customer: { ...d.data().customer, promoOk: false, textOk: false } }, { merge: true }))));
        } else if (sent?.ok) out.sent += 1;
        else out.failed += 1;
      }));
    }
    await ref.set({ ...out, status: "sent", doneAt: now().toISOString() }, { merge: true });
    return out;
  }

  // ── Loyalty points (Bookings plan 4, step 5.5) ─────────────────────────────────────────────────────────────────
  // `loyalty/<hash(email)>` holds a client's balance; `loyalty/<hash>/entries/<key>` one row per earning, reward or
  // change, keyed so the same visit or order never earns twice (`visit_<id>`, `order_<id>`). At `rewardPoints` the
  // points become a one-use discount code (`discounts/{id}`, only for that email, works on bookings and the shop),
  // made in the same transaction and emailed after it. Rules: shared/loyalty.ts.
  const MAX_LOYALTY = 200;
  const LOYALTY_VISIT_WAIT_HOURS = 24;
  const loyaltyDoc = (email) => db.collection("loyalty").doc(hash(email));

  /** The discount record a reward makes: fixed money off, one use, only for this email, until `expiry` (a shop day). */
  function rewardDiscount(code, email, s, nowIso, expiry) {
    return {
      code, type: "fixed", value: s.rewardMinor / 100, isActive: true, startDate: null, expiryDate: expiry,
      minOrderAmount: null, minQuantity: null, maxDiscountAmount: null, usageLimit: 1, usageCount: 0, onePerCustomer: true,
      forBookings: true, forTickets: false, appliesTo: "all", selectedCategories: [], selectedProducts: [],
      allowedEmailDomains: "", allowedCustomerEmails: email, description: "Loyalty reward", buyQuantity: null, getQuantity: null,
      getDiscountValue: null, tiers: null, method: "code", title: "", giftBookId: null, giftVariantId: null,
      loyaltyReward: true, createdAt: nowIso, updatedAt: nowIso,
    };
  }

  /**
   * Adds `points` (negative takes) for one client under entry `key`, once, and pays out any rewards now due. Returns
   * `{ added, balance, codes }` (`added` false when that key was already counted). The reward codes are made inside the
   * transaction, so a reward is never paid twice and never lost.
   */
  async function earnPoints(email, key, points, s, row) {
    const who = String(email || "").trim().toLowerCase();
    const nowMs = now().getTime();
    const nowIso = new Date(nowMs).toISOString();
    const expiry = dayOf(nowMs + s.rewardDays * DAY, zone());
    return db.runTransaction(async (tx) => {
      const ref = loyaltyDoc(who);
      const entry = ref.collection("entries").doc(key);
      const [had, seen] = await Promise.all([tx.get(ref), tx.get(entry)]);
      const before = had.exists ? had.data() : { email: who, points: 0, earned: 0, spent: 0, rewards: 0 };
      if (seen.exists) return { added: false, balance: before.points || 0, codes: [] };
      const balance = Math.max(0, (before.points || 0) + points);
      const { rewards, left } = rewardsDue(s, balance);
      const codes = [];
      for (let i = 0; i < rewards; i += 1) {
        let code = rewardCode(Math.random);
        for (let tries = 0; tries < 3; tries += 1) {
          const taken = await tx.get(db.collection("discounts").where("code", "==", code).limit(1));
          if (taken.empty) break;
          code = rewardCode(Math.random);
        }
        const discount = db.collection("discounts").doc();
        tx.set(discount, rewardDiscount(code, who, s, nowIso, expiry));
        tx.set(ref.collection("entries").doc(`reward_${discount.id}`), { kind: "reward", points: -s.rewardPoints, code, rewardMinor: s.rewardMinor, expiry, at: nowIso });
        codes.push({ code, expiry });
      }
      tx.set(entry, { ...row, points, at: nowIso });
      tx.set(ref, {
        email: who, points: left,
        earned: (before.earned || 0) + Math.max(0, points),
        spent: (before.spent || 0) + rewards * s.rewardPoints + Math.max(0, -points),
        rewards: (before.rewards || 0) + rewards, updatedAt: nowIso,
      });
      return { added: true, balance: left, codes };
    });
  }

  /** "You've earned a reward" with the code, in the client's language and the owner's words. Never throws. */
  async function tellReward(email, code, expiry, s, settings, b) {
    try {
      const brand = await emailBrand();
      const lang = b ? await clientLanguage(b) : "en";
      const shop = brand.shopName || shopName() || (lang === "fr" ? "la boutique" : "the shop");
      const words = emailWords(settings?.messages, lang, "loyaltyReward");
      const until = new Date(`${expiry}T12:00:00Z`).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
      const values = { client: String(b?.customer?.name || "").trim().split(/\s+/)[0] || "", amount: moneyWords(s.rewardMinor, currency(), lang), code, when: until, shop };
      const fill = (template) => fillMessage(template, values);
      const T = EMAIL_LABELS[lang];
      const html = risoLayout(`
        <h2 style="margin:0 0 12px;">${escapeHtml(fill(words.heading))}</h2>
        <p style="margin:0 0 16px;">${escapeHtml(fill(words.lead)).replace(/\n/g, "<br>")}</p>
        <p style="margin:0 0 16px;font-size:22px;letter-spacing:2px;"><strong>${escapeHtml(code)}</strong></p>
        ${risoButton(escapeHtml(siteLink("/book")), T.bookATime, brand.accent, brand.theme)}
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to: email, subject: fill(words.subject), html });
    } catch (err) {
      console.error("bookings: reward email failed:", err?.message || err);
    }
  }

  /**
   * Points for visits that happened and paid shop orders, each once, then the reward emails. `{ visits, orders, rewards }`.
   * Reads only what is new since the last sweep: `loyaltyState/main` keeps how far visits (`visitsTo`, by end) and
   * orders (`ordersTo`, by paidAt) were read. A visit earns a day after it ends (LOYALTY_VISIT_WAIT_HOURS), so one marked
   * a no-show the next morning never earns; an order earns an hour after it is paid. Switching points on reads back
   * LOYALTY_WINDOW_DAYS at most. Off, or nothing to earn: nothing is read.
   */
  async function sweepLoyalty() {
    const none = { visits: 0, orders: 0, rewards: 0 };
    if (!(await featureOn())) return none;
    const settings = await readSettings();
    const s = cleanLoyalty(settings.loyalty);
    if (!loyaltyEarns(s)) return none;
    const nowMs = now().getTime();
    const stateRef = db.collection("loyaltyState").doc("main");
    const state = (await stateRef.get()).data() || {};
    const oldest = new Date(nowMs - LOYALTY_WINDOW_DAYS * DAY).toISOString();
    const startOf = (saved) => (typeof saved === "string" && saved > oldest ? saved : oldest);
    const out = { ...none };
    const pay = async (email, result, b) => {
      for (const r of result.codes) { await tellReward(email, r.code, r.expiry, s, settings, b); out.rewards += 1; }
    };
    let budget = MAX_LOYALTY;

    // Visits: ended after the last sweep's mark, up to a day ago.
    const visitsUpTo = new Date(nowMs - LOYALTY_VISIT_WAIT_HOURS * HOUR).toISOString();
    let visitsTo = startOf(state.visitsTo);
    if (visitsTo < visitsUpTo) {
      const snap = await bookings().where("end", ">", visitsTo).where("end", "<=", visitsUpTo).orderBy("end").limit(MAX_LOYALTY).get();
      let stopped = false;
      for (const doc of snap.docs) {
        if (budget <= 0) { stopped = true; break; }
        const b = doc.data();
        const email = String(b?.customer?.email || "").trim().toLowerCase();
        if (EMAIL.test(email) && visitHappened(b, nowMs)) {
          // A visit paid with a pack earns only the visit bonus: the pack itself was paid when it was bought.
          const paidMinor = b.pack ? 0 : Math.max(0, Number(b.priceMinor) || 0);
          const points = visitPoints(s, paidMinor, dayOf(Date.parse(b.start), zone()));
          if (points > 0) {
            budget -= 1;
            const result = await earnPoints(email, `visit_${doc.id}`, points, s, { kind: "visit", ref: doc.id, service: visitName(b), paidMinor });
            if (result.added) { out.visits += 1; await pay(email, result, { id: doc.id, ...b }); }
          }
        }
        visitsTo = b.end;
      }
      if (!stopped && snap.docs.length < MAX_LOYALTY) visitsTo = visitsUpTo;
    }

    // Paid shop orders: paid after the last mark, up to an hour ago (refunds are taken off what earns).
    const ordersUpTo = new Date(nowMs - HOUR).toISOString();
    let ordersTo = startOf(state.ordersTo);
    if (s.onOrders && ordersTo < ordersUpTo) {
      const snap = await db.collection("orders").where("paidAt", ">", ordersTo).where("paidAt", "<=", ordersUpTo).orderBy("paidAt")
        .select("customer", "total", "refundedAmountMinor", "paymentStatus", "isTest", "sandboxPayment", "practiceOrder", "practice", "paidAt").limit(MAX_LOYALTY).get();
      let stopped = false;
      for (const doc of snap.docs) {
        if (budget <= 0) { stopped = true; break; }
        const o = doc.data();
        const email = String(o?.customer?.email || "").trim().toLowerCase();
        const real = o.paymentStatus === "paid" && !o.isTest && !o.sandboxPayment && !o.practiceOrder && !o.practice;
        if (real && EMAIL.test(email)) {
          const paidMinor = Math.max(0, Math.round((Number(o.total) || 0) * 100) - (Number(o.refundedAmountMinor) || 0));
          const points = orderPoints(s, paidMinor, dayOf(Date.parse(o.paidAt), zone()));
          if (points > 0) {
            budget -= 1;
            const result = await earnPoints(email, `order_${doc.id}`, points, s, { kind: "order", ref: doc.id, paidMinor });
            if (result.added) { out.orders += 1; await pay(email, result, { customer: o.customer }); }
          }
        }
        ordersTo = o.paidAt;
      }
      if (!stopped && snap.docs.length < MAX_LOYALTY) ordersTo = ordersUpTo;
    } else if (!s.onOrders) {
      ordersTo = ordersUpTo;
    }
    await stateRef.set({ visitsTo, ordersTo, at: new Date(nowMs).toISOString() }, { merge: true });
    return out;
  }

  /** A client's points for the client card and their booking page: balance, to the next reward, newest rows. */
  async function pointsOf(email, s, withRows = false) {
    const who = String(email || "").trim().toLowerCase();
    const snap = await loyaltyDoc(who).get();
    const acc = snap.exists ? snap.data() : { points: 0, earned: 0, rewards: 0 };
    const out = { points: acc.points || 0, earned: acc.earned || 0, rewards: acc.rewards || 0, toNext: pointsToNext(s, acc.points || 0), rewardPoints: s.rewardPoints, rewardMinor: s.rewardMinor };
    if (!withRows) return out;
    const rows = await loyaltyDoc(who).collection("entries").orderBy("at", "desc").limit(20).get();
    return { ...out, rows: rows.docs.map((d) => { const r = d.data(); return { id: d.id, kind: r.kind, points: r.points, at: r.at, note: r.note || r.service || "", code: r.code || "" }; }) };
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
    let cancelled = 0;
    let ran = 0;
    // Cancelled times with a sign-up left over (a refund the payment service refused): try again on every sweep, even
    // after the time has passed, until none are left. Least recently tried first (`retryAt`, set to now on each try and
    // cleared once done), so a batch that keeps failing can't keep later ones waiting.
    const nowIso = new Date(nowMs).toISOString();
    const retryState = (left) => ({ left, retry: left.length > 0, retryAt: left.length > 0 ? nowIso : null });
    const retries = await runs().where("retryAt", "<=", nowIso).orderBy("retryAt").limit(50).get();
    const allServices = await readServices();
    const wanted = allServices.filter((s) => s.minPlaces);
    for (const doc of retries.docs) {
      const r = doc.data() || {};
      const found = allServices.find((s) => s.id === r.serviceId);
      const service = found || { id: r.serviceId };
      // A sweep cut short before the time was closed closes it now, so nobody signs up for a cancelled class.
      if (r.closed === false && found && r.start) await closeClassTime(found, Date.parse(r.start));
      const left = await cancelForMinimum(service, r.left || []);
      await doc.ref.set({ ...retryState(left), closed: true }, { merge: true });
    }
    for (const service of wanted) {
      // A course is decided on its first date; a weekly class on each of its times between now and its decide time.
      const starts = isCourse(service) ? courseStarts(service, zone()).slice(0, 1)
        : Array.from({ length: Math.ceil(service.decideHours / 24) + 2 }, (_, i) => addDays(dayOf(nowMs, zone()), i)).flatMap((d) => classStartsOn(d, service, zone()));
      for (const start of starts) {
        if (!runDecisionDue(start, service, nowMs)) continue;
        const runRef = runs().doc(`${service.id}~${start}`);
        if ((await runRef.get()).exists) continue;
        const iso = new Date(start).toISOString();
        // This class's own bookings only, so other services at the same time never crowd them out of the read.
        const snap = await bookings().where("start", "==", iso).where("serviceId", "==", service.id).limit(MAX_PLACES_READ).get();
        const mine = snap.docs.map((d) => ({ id: d.id, b: d.data() })).filter((x) => x.b.serviceId === service.id);
        if (mine.some((x) => x.b.status === "held")) continue;
        const going = mine.filter((x) => x.b.status === "confirmed");
        const decidedAt = new Date(nowMs).toISOString();
        if (going.length >= service.minPlaces) {
          await runRef.set({ serviceId: service.id, start: iso, decision: "runs", count: going.length, minPlaces: service.minPlaces, decidedAt });
          ran += 1;
          continue;
        }
        // The decision goes first (with everyone still to cancel, marked to retry), so a second sweep never decides
        // twice and a refund that fails, or a sweep cut short here, stays on the list for the next one.
        await runRef.set({ serviceId: service.id, start: iso, decision: "cancelled", count: going.length, minPlaces: service.minPlaces, decidedAt, closed: false, left: going.map((x) => x.id), retry: true, retryAt: nowIso });
        await closeClassTime(service, start);
        const left = await cancelForMinimum(service, going.map((x) => x.id));
        await runRef.set({ ...retryState(left), closed: true }, { merge: true });
        await tellOwnerTooFew(service, start, going, left);
        cancelled += 1;
      }
    }
    return { cancelled, ran };
  }

  /**
   * Cancels and refunds in full each booking in `ids` that is still on, for a class that didn't reach its minimum.
   * Answers the ids that couldn't be done (a refund the payment service refused), for the next sweep to try again.
   */
  async function cancelForMinimum(service, ids) {
    const left = [];
    for (const id of ids) {
      try {
        const snap = await bookings().doc(id).get();
        const b = snap.exists ? snap.data() : null;
        if (!b || b.status !== "confirmed") continue;
        const settled = await settleRest(id, b);
        await shopCancel(id, settled, { amount: cardTaken(settled), by: "minimum", tooFew: true });
      } catch (err) {
        console.error(`bookings: couldn't cancel ${id} for the minimum of ${service.id}:`, err?.message || err);
        left.push(id);
      }
    }
    return left;
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
  async function tellOwnerTooFew(service, start, going, failed = []) {
    try {
      const owner = ownerEmail();
      if (!owner) return;
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const when = whenWords({ start: new Date(start).toISOString() });
      const kind = isCourse(service) ? "course" : "class";
      const list = (rows) => `<ul style="margin:0 0 16px;padding-left:20px;">${rows.map(({ b }) => `<li>${escapeHtml(b.customer?.name || "")} · ${escapeHtml(b.customer?.email || "")}</li>`).join("")}</ul>`;
      const stuck = going.filter((x) => failed.includes(x.id));
      const done = going.filter((x) => !failed.includes(x.id));
      const people = done.length ? list(done) : "";
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">Not enough people</h4>
        <h2 style="margin:0 0 12px;">${escapeHtml(service.name)}, ${escapeHtml(when)}</h2>
        <p style="margin:0 0 12px;">${going.length} signed up and this ${kind} needs ${service.minPlaces}, so it has been cancelled and nobody else can sign up for it.${done.length ? ` ${done.length === 1 ? "This person was" : "These people were"} refunded in full and emailed:` : ""}</p>
        ${people}
        ${stuck.length ? `<p style="margin:0 0 12px;">The refund didn't go through yet for ${stuck.length === 1 ? "this person" : "these people"}. Colophon tries again every few minutes; you can also cancel them yourself in Bookings:</p>${list(stuck)}` : ""}
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
      // With names hidden, the Book again link doesn't pick the person either.
      if ((await readSettings().catch(() => null))?.teamShown === "hidden") b = { ...namesForClient(b, { teamShown: "hidden" }), staffId: "" };
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

  // ── The team desk (plan 4, 4.1, Beta) ───────────────────────────────────────────────────────────────────────────
  // Team roles "frontDesk" and "provider" (functions/roles.js deskRole) open the team desk instead of the admin
  // (admin/TeamDesk.tsx). They read nothing from the database themselves: every read and action comes through here.
  // A front desk sees every calendar and books for everyone, with no reports or settings (DESK_OPS); a service provider
  // sees only their own bookings (the staff member whose email is their sign-in) and checks their own clients in.

  /** The bookings one desk may see: a provider's are the ones they take (the visit's lead or one of its parts). */
  const takes = (b, staffId) => !!staffId && (b.staffId === staffId || (b.parts || []).some((p) => p.staffId === staffId) || (b.course?.staff || []).includes(staffId));
  /** A booking as the desk sees it: no link keys, saved card, pay key or check-in code hashes. */
  const deskBooking = (id, b) => {
    const { manageKeyHash, reminderKeyHash, reminder2KeyHash, payKey, card, pendingKey, offerKeyHash, restPages, ...rest } = b || {};
    return { id, ...rest, card: card ? { brand: card.brand || "", last4: card.last4 || "" } : null };
  };

  /**
   * Visit notes for the desk's list (plan 4, 4.6 My day): this visit's own note, and the client's latest note from an
   * earlier day ("Last time…"), so the person taking them sees the formula before they sit down. At most 40 clients read.
   */
  async function deskNotes(list) {
    const out = new Map();
    const emails = [...new Set(list.map((b) => String(b.customer?.email || "").trim().toLowerCase()).filter((e) => EMAIL.test(e)))].slice(0, 40);
    const byClient = new Map(await Promise.all(emails.map(async (e) => {
      const snap = await db.collection("clientVisits").where("client", "==", hash(e)).limit(60).get();
      return [e, snap.docs.map((d) => ({ id: d.id, ...d.data() }))];
    })));
    for (const b of list) {
      const visits = byClient.get(String(b.customer?.email || "").trim().toLowerCase());
      if (!visits) continue;
      const day = dayOf(Date.parse(b.start), zone());
      const own = visits.find((v) => v.id === `bk-${b.id}`);
      const last = visits.filter((v) => v.day < day && String(v.note || "").trim()).sort((x, y) => y.day.localeCompare(x.day) || String(y.updatedAt).localeCompare(String(x.updatedAt)))[0];
      out.set(b.id, { visitNote: own?.note || "", ...(last ? { lastVisit: { day: last.day, note: String(last.note).slice(0, 600) } } : {}) });
    }
    return out;
  }

  /** Who can be on the rota: people on Team & rooms with a sign-in email, and Front desk and Service provider members. */
  async function rotaPeople(settings) {
    const out = new Map();
    for (const p of settings.staff || []) {
      const email = String(p.email || "").trim().toLowerCase();
      if (email && p.active !== false) out.set(email, { email, name: p.name, staffId: p.id });
    }
    const members = await db.collection("members").limit(300).get();
    for (const d of members.docs) {
      const m = d.data() || {};
      if (!["frontDesk", "provider"].includes(m.role) || out.has(d.id)) continue;
      out.set(d.id, { email: d.id, name: String(m.name || "").trim() || nameFromEmail(d.id), staffId: "" });
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  /** The bookings a time off ask would leave without their person: confirmed or waiting visits they take then. */
  async function clashesFor(t) {
    if (!t.staffId) return [];
    const from = new Date(zonedTime(t.from, t.start || "00:00", zone())).toISOString();
    const to = new Date(t.end ? zonedTime(t.from, t.end, zone()) : zonedTime(addDays(t.to, 1), "00:00", zone())).toISOString();
    const snap = await bookings().where("start", ">=", new Date(Date.parse(from) - 12 * 3_600_000).toISOString()).where("start", "<", to).orderBy("start").limit(300).get();
    return snap.docs.map((d) => d.data()).filter((b) => ["confirmed", "requested"].includes(b.status) && b.end > from && takes(b, t.staffId));
  }
  /** The desk person's own planned shifts for the next two weeks and their time off asks from the last month on. */
  async function myRotaAndTimeOff(email) {
    if (!email) return { rota: [], timeOff: [] };
    const today = dayOf(now().getTime(), zone());
    const mine = await rota().where("email", "==", email).limit(400).get();
    const asks = await timeOffs().where("email", "==", email).limit(200).get();
    return {
      rota: mine.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.day >= today && x.day <= addDays(today, 13)).sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start)).map(({ updatedBy: _u, ...x }) => x),
      timeOff: asks.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.to >= addDays(today, -30)).sort((a, b) => b.from.localeCompare(a.from)).map(({ answeredBy: _a, ...t }) => t),
    };
  }
  /** The owner hears of a new time off ask. Never throws. */
  async function tellOwnerTimeOff(t) {
    try {
      const to = ownerEmail();
      if (!to) return;
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">Time off to answer</h4>
        <h2 style="margin:0 0 12px;">${escapeHtml(t.name)} asked for ${escapeHtml(timeOffWhen(t))}</h2>
        ${t.note ? `<p style="margin:0 0 16px;">“${escapeHtml(t.note)}”</p>` : ""}
        ${risoButton(escapeHtml(siteLink("/admin#bookings")), "Approve or decline", brand.accent, brand.theme)}
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to, subject: `${t.name} asked for time off`, html });
    } catch (err) {
      console.error("bookings: time off email to the owner failed:", err?.message || err);
    }
  }
  /** The person hears the owner's answer. Never throws. */
  async function tellTimeOff(t) {
    try {
      const brand = await emailBrand();
      const shop = brand.shopName || shopName() || "the shop";
      const yes = t.status === "approved";
      const html = risoLayout(`
        <h4 style="margin:0 0 8px;">Your time off</h4>
        <h2 style="margin:0 0 12px;">${yes ? "Approved" : "Not this time"}: ${escapeHtml(timeOffWhen(t))}</h2>
        ${t.answer ? `<p style="margin:0 0 16px;">“${escapeHtml(t.answer)}”</p>` : ""}
        <p style="margin:0 0 16px;">${yes ? "Enjoy it. Clients can't book you then." : `Talk to ${escapeHtml(shop)} if you'd like to ask for other days.`}</p>
      `, { logoUrl: brand.logoUrl || "", accent: brand.accent || "", theme: brand.theme || "light", shopName: shop });
      await sendEmail({ to: t.email, subject: yes ? "Your time off is approved" : "About your time off", html });
    } catch (err) {
      console.error("bookings: time off answer email failed:", err?.message || err);
    }
  }
  /** A name for someone on the desk with no Team & rooms entry: the part of their email before the @. */
  const nameFromEmail = (email) => String(email).split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
  /** The person's open shift, or null. */
  async function openShiftOf(email) {
    if (!email) return null;
    const snap = await shifts().where("email", "==", email).where("open", "==", true).limit(1).get();
    return snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
  }
  /** Where the desk's person stands, with the minutes worked so far on this shift. */
  const clockView = (open) => ({ ...clockState(open), minutes: open ? shiftMinutes(open, now().getTime()) : 0 });
  /** A shift as the owner's Team pay sees it, with its minutes and whether it was left open too long. */
  const shiftView = (id, x) => ({
    id, email: x.email, name: x.name, staffId: x.staffId || "", day: x.day, in: x.in, out: x.out || null, breaks: x.breaks || [], by: x.by || "self",
    minutes: shiftMinutes(x, now().getTime()), forgotten: !x.out && now().getTime() - Date.parse(x.in) > MAX_SHIFT_HOURS * 3_600_000,
  });

  async function handleDesk(req, res) {
    const who = requireBookingsTeam ? await requireBookingsTeam(req, res) : (fail(res, 403, "Admin access required"), null);
    if (!who) return;
    const role = who.role; // "admin" | "frontDesk" | "provider"
    const op = String(req.body?.op || "");
    const by = who.email || role;
    try {
      if (!(await featureOn())) return fail(res, 403, "Bookings aren't turned on for this shop.", "off");
      const settings = await readSettings();
      const email = String(who.email || "").trim().toLowerCase();
      const me = (settings.staff || []).find((p) => email && String(p.email || "").trim().toLowerCase() === email) || null;
      // Clock in and out (plan 4, 4.2): anyone on the team desk clocks themselves; the owner and staff use Team pay.
      if (op === "clock") {
        if (role === "admin") return fail(res, 403, "Add your hours under Bookings › Team pay.", "desk_only");
        const step = String(req.body?.step || "");
        if (!["in", "break", "back", "out"].includes(step)) return fail(res, 400, "Unknown step.");
        if (!email) return fail(res, 403, "Sign in again to clock in.");
        const nowIso = now().toISOString();
        const who = { email, name: me?.name || nameFromEmail(email), staffId: me?.id || "", day: dayOf(now().getTime(), zone()) };
        const done = await db.runTransaction(async (t) => {
          const snap = await t.get(shifts().where("email", "==", email).where("open", "==", true).limit(1));
          const doc = snap.docs[0] || null;
          const open = doc ? { id: doc.id, ...doc.data() } : null;
          const next = clockStep(open, step, nowIso, who);
          if ("error" in next) return next;
          const id = doc ? doc.id : `s${crypto.randomBytes(8).toString("hex")}`;
          const { id: _drop, ...shift } = next.shift;
          t.set(shifts().doc(id), { ...shift, open: !shift.out, updatedAt: nowIso, updatedBy: by });
          return { shift: { id, ...shift } };
        });
        if (done.error) return fail(res, 409, done.error, done.code);
        return res.status(200).json({ ok: true, clock: clockView(done.shift.out ? null : done.shift) });
      }
      // Time off (plan 4, 4.3): anyone on the desk asks for days off or part of a day, and can withdraw a waiting ask.
      if (op === "askTimeOff") {
        if (role === "admin") return fail(res, 403, "Plan your own time off with blocked time on the calendar.", "desk_only");
        const made = cleanTimeOff({ ...(req.body?.ask || {}), email, name: me?.name || nameFromEmail(email), staffId: me?.id || "" }, dayOf(now().getTime(), zone()));
        if ("error" in made) return fail(res, 400, made.error);
        const open = await timeOffs().where("email", "==", email).where("status", "==", "waiting").limit(21).get();
        if (open.docs.length >= 20) return fail(res, 409, "You have 20 requests waiting. Ask the owner to answer some first.", "too_many");
        const id = `t${crypto.randomBytes(8).toString("hex")}`;
        const ask = { ...made.ask, createdAt: now().toISOString() };
        await timeOffs().doc(id).set(ask);
        await tellOwnerTimeOff(ask);
        return res.status(200).json({ ok: true, timeOff: { id, ...ask } });
      }
      if (op === "withdrawTimeOff") {
        if (role === "admin") return fail(res, 403, "Answer it in Bookings instead.", "desk_only");
        const id = String(req.body?.id || "");
        if (!ID.test(id)) return fail(res, 400, "Unknown request.");
        const done = await db.runTransaction(async (tx) => {
          const snap = await tx.get(timeOffs().doc(id));
          if (!snap.exists || snap.data().email !== email) return { error: "This request isn't one of yours.", code: "not_yours" };
          if (snap.data().status !== "waiting") return { error: "The owner already answered this one. Ask them to change it.", code: "answered" };
          tx.set(timeOffs().doc(id), { ...snap.data(), status: "withdrawn", answeredAt: now().toISOString() });
          return { ok: true };
        });
        if (done.error) return fail(res, done.code === "not_yours" ? 404 : 409, done.error, done.code);
        return res.status(200).json({ ok: true });
      }
      if (op === "desk") {
        const day = isDay(String(req.body?.day || "")) ? req.body.day : dayOf(now().getTime(), zone());
        const days = Math.min(7, Math.max(1, Math.round(Number(req.body?.days) || 1)));
        const from = new Date(zonedTime(day, "00:00", zone())).toISOString();
        const to = new Date(zonedTime(addDays(day, days), "00:00", zone())).toISOString();
        const snap = await bookings().where("start", ">=", from).where("start", "<", to).orderBy("start").limit(500).get();
        const list = snap.docs
          .map((d) => ({ id: d.id, b: d.data() }))
          .filter(({ b }) => b.status !== "held" && (role !== "provider" || takes(b, me?.id)))
          .map(({ id, b }) => deskBooking(id, b));
        const notes = await deskNotes(list);
        const svc = await services().limit(MAX_SERVICES + 1).get();
        return res.status(200).json({
          role, day, days, zone: zone(),
          me: me ? { id: me.id, name: me.name } : null,
          staff: (settings.staff || []).filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name })),
          services: role === "provider" ? [] : svc.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.active !== false).map((x) => ({ id: x.id, name: x.name, minutes: x.minutes, places: x.places || 1 })),
          bookings: list.map((b) => ({ ...b, ...notes.get(b.id) })),
          clock: role === "admin" ? null : clockView(await openShiftOf(email)),
          ...(role === "admin" ? {} : await myRotaAndTimeOff(email)),
        });
      }
      if (role === "admin") return runAdmin(req, res, by);
      if (role === "frontDesk") {
        if (!DESK_OPS.frontDesk.includes(op)) return fail(res, 403, "Ask the owner to do this.", "desk_only");
        return runAdmin(req, res, by);
      }
      // A service provider: only their own bookings: checking in, no-shows, taking payment and visit notes (DESK_OPS).
      if (!DESK_OPS.provider.includes(op)) return fail(res, 403, "Ask the owner or the front desk to do this.", "desk_only");
      if (!me) return fail(res, 403, "Ask the owner to add your email to your entry on the Team & rooms tab.", "not_on_team");
      if (req.body?.code) return fail(res, 400, "Open the booking from your list to check them in.", "no_code");
      const id = String(req.body?.id || "");
      if (!ID.test(id)) return fail(res, 400, "Unknown booking.");
      const snap = await bookings().doc(id).get();
      if (!snap.exists || !takes(snap.data(), me.id)) return fail(res, 404, "This booking isn't one of yours.", "not_yours");
      return runAdmin(req, res, by);
    } catch (err) {
      console.error("bookingsDesk failed:", op, err?.message || err);
      return fail(res, 502, "That didn't go through just now. Please try again.");
    }
  }

  return { handlePublic, handleAdmin, handleDesk, sweepHolds, sweepReminders, sweepSecondReminders, sweepTextReplies, sweepSummary, sweepStaffDays, sweepWaitlist, sweepTips, sweepThanks, sweepRebook, sweepKeepInTouch, sweepLoyalty, sweepMinimum, sweepTeamCalendars, sweepOtherCalendars, bookingChanged: (id, before, after) => hooks.bookingChanged(id, before, after, shopName()), sweepBookingHooks: () => hooks.sweepDeliveries(), featureOn, pickupCheck };
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
    // A person's own calendar shows only their part of a visit with several services (plan 4, 2.1).
    .flatMap((b) => (staffId && Array.isArray(b.parts) && b.parts.length ? visitPlan(b).map((p, n) => ({ ...b, id: n ? `${b.id}-p${n}` : b.id, start: p.start, end: p.end,
      staffId: n ? b.parts[n - 1].staffId || "" : b.staffId, staffName: p.staffName, serviceName: p.serviceName, parts: null })) : [b]))
    .flatMap((b) => datesOf(b).map((x, n) => ({ ...b, id: n ? `${b.id}-${n + 1}` : b.id, start: new Date(x.start).toISOString(), end: new Date(x.end).toISOString(), ...(n && b.course?.staff?.[n] ? { staffName: b.course.staff[n] } : {}), ...(n && b.course?.staffIds?.[n] ? { staffId: b.course.staffIds[n] } : {}), ...(n && !b.course?.staffIds && b.course?.staff?.[n] && b.course.staff[n] !== b.staffName ? { staffId: b.course.staff[n] === feed.staffName ? staffId : "" } : {}) })))
    .filter((b) => Date.parse(b.end || "") >= from && (!staffId || b.staffId === staffId))
    .map((b) => ({
      id: b.id, start: Date.parse(b.start), end: Date.parse(b.end), location: b.roomName ? [b.roomName, b.location].filter(Boolean).join(", ") : b.location || "",
      title: `${b.customer?.name || "Booking"}: ${visitName(b) || "Booking"}${b.staffName && !staffId ? ` (${b.staffName})` : ""}${b.status === "held" ? " (not paid yet)" : ""}`,
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
  const title = shopName ? `${visitName(b)} · ${shopName}` : visitName(b);
  const spans = datesOf(b);
  // A course: one file with every date.
  if (spans.length > 1) return bookingsFeedIcs(title, spans.map((x, n) => ({ id: n ? `${id}-${n + 1}` : id, title, start: x.start, end: x.end, location: b.location || "" })), nowMs);
  return bookingIcs({ id, title, start: Date.parse(b.start), end: Date.parse(b.end), location: b.location || "", nowMs });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** The booking's own link, the reminder's, the tip email's or the owner's pay link: each opens the customer's booking page. */
/** My bookings (plan 4, 2.10): how many bookings one customer's list reads, and how many past ones it shows. */
const MINE_READ = 200;
const MINE_PAST = 20;
const keyFits = (b, key) => [b.manageKeyHash, b.reminderKeyHash, b.reminder2KeyHash, b.textKeyHash, b.tipKeyHash, b.reviewKeyHash, b.accountKeyHash, b.payKey ? hash(b.payKey) : ""].some((h) => h && sameHash(h, hash(key)));
/** How long a page to pay the rest stays open, and how long before its end a fresh one is opened instead. */
const REST_PAGE_MINUTES = 60;
/** A payment sent to a card reader and left waiting is stopped after this long (the sweep). */
const READER_MINUTES = 15;
const REST_REUSE_MINUTES = 15;
/** The "Add a tip" email goes this many hours after a visit ends. */
const TIP_ASK_HOURS = 2;
/** "Visa ending 4242", or "Your card" when its brand and number weren't read. */
const cardWords = (card, lang = "en") => (card?.last4
  ? `${card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : lang === "fr" ? "Carte" : "Card"} ${lang === "fr" ? "se terminant par" : "ending"} ${card.last4}`
  : lang === "fr" ? "Votre carte" : "Your card");

/** The fixed words of booking texts, in English and French (plan 4, 3.4 and 3.5). */
const TEXT_LABELS = Object.freeze({
  en: {
    theShop: "the shop", with: "with", stop: "Reply STOP to stop texts.", changeOrCancel: "Change or cancel:",
    askReply: "Reply Y to confirm, C to cancel, M to move.",
    notBooked: (visit, shop) => `${visit} isn't booked any more, so there's nothing to change. Questions? Contact ${shop}.`,
    confirmed: (visit) => `Thanks, you're confirmed: ${visit}. See you then.`,
    tooClose: (visit, shop) => `${visit} is too close to cancel by text. Please contact ${shop}.`,
    cancelled: (visit) => `Cancelled: ${visit}.`,
    couldNotCancel: (visit, shop) => `We couldn't cancel ${visit} just now. Please try again in a few minutes, or contact ${shop}.`,
    cantMove: (visit, shop) => `${visit} can't be moved by text. Please contact ${shop}.`,
    pickNew: (visit, link) => `Pick a new time for ${visit}: ${link}`,
  },
  fr: {
    theShop: "la boutique", with: "avec", stop: "Répondez STOP pour ne plus recevoir de textos.", changeOrCancel: "Modifier ou annuler :",
    askReply: "Répondez Y pour confirmer, C pour annuler, M pour déplacer.",
    notBooked: (visit, shop) => `${visit} n'est plus réservé, il n'y a donc rien à changer. Des questions? Contactez ${shop}.`,
    confirmed: (visit) => `Merci, c'est confirmé : ${visit}. À bientôt.`,
    tooClose: (visit, shop) => `${visit} est trop proche pour être annulé par texto. Veuillez contacter ${shop}.`,
    cancelled: (visit) => `Annulé : ${visit}.`,
    couldNotCancel: (visit, shop) => `Nous n'avons pas pu annuler ${visit} pour l'instant. Réessayez dans quelques minutes, ou contactez ${shop}.`,
    cantMove: (visit, shop) => `${visit} ne peut pas être déplacé par texto. Veuillez contacter ${shop}.`,
    pickNew: (visit, link) => `Choisissez une nouvelle heure pour ${visit} : ${link}`,
  },
});

/**
 * The fixed words around a client's booking email (plan 4, 3.5), in English and French. The owner edits the subject,
 * heading and opening words (shared/bookingMessages); these labels stay as they are.
 */
const EMAIL_LABELS = Object.freeze({
  en: {
    when: "When:", howLong: "How long:", minutes: (n) => `${n} minutes`, extras: "Extras:", with: "With:", withLower: "with", where: "Where:",
    yourVisit: "Your visit:", allDates: (n) => `All ${n} dates:`,
    allVisits: (n, weeks) => `All ${n} visits, every ${weeks === 1 ? "week" : `${weeks || ""} weeks`}:`,
    eachVisit: "Each visit gets its own reminder, and can be moved or cancelled on its own from your booking page.",
    videoCall: "Video call:", joinMeet: "Join with Google Meet",
    checkInCode: "Check-in code:", showAtDesk: "Show it at the desk when you arrive.", codeToScan: "Your booking page has it as a code to scan.",
    paidWithPack: (last4) => `Paid with your pack ••••${last4}:`, visitOf: (n, of) => `visit ${n} of ${of}`,
    discount: (code) => `Discount (${code}):`, off: (amount) => `${amount} off`, tax: (names) => `Includes tax${names ? ` (${names})` : ""}:`,
    giftCard: (last4) => `Gift card ••••${last4}:`, depositPaid: "Deposit paid:", leftToPay: "Left to pay:", toPayAtVisit: "To pay at your visit:", paid: "Paid:",
    cardOnFile: "Card on file:",
    cardWords: (card, hours, fee) => `${card}. Missing this booking${hours ? `, or cancelling less than ${hours} hours before,` : ""} may cost ${fee}.`,
    addGoogle: "Add to Google Calendar", addApple: "Add to Apple Calendar",
    addTip: "Add a tip", pay: (amount) => `Pay ${amount}`, seeOrChange: "See or change your booking", yesThere: "Yes, I'll be there",
    leaveReview: "Leave a review", bookAgain: "Book again",
    bookNext: "Book your next visit", bookATime: "Book a time", noMoreEmails: "Don't want emails like this?", unsubscribe: "Unsubscribe",
    beforeVisit: "Before your visit:", fillIn: (titles) => `please fill in ${titles.join(" and ")} on your booking page. It takes a minute.`,
    answerBy: (when) => `They'll answer by ${when} at the latest.`,
    tipIncluded: (amount) => `That includes your ${amount} tip.`,
    feeCard: (card) => `It went on your ${card.replace(/^Card\b/, "card")}.`,
    reviewAsk: "If you have a moment, a short review helps others find us.",
  },
  fr: {
    when: "Quand :", howLong: "Durée :", minutes: (n) => `${n} minutes`, extras: "Suppléments :", with: "Avec :", withLower: "avec", where: "Où :",
    yourVisit: "Votre visite :", allDates: (n) => `Les ${n} dates :`,
    allVisits: (n, weeks) => `Les ${n} visites, ${weeks === 1 ? "chaque semaine" : `toutes les ${weeks || ""} semaines`} :`,
    eachVisit: "Chaque visite a son propre rappel, et peut être déplacée ou annulée seule depuis votre page de réservation.",
    videoCall: "Appel vidéo :", joinMeet: "Rejoindre avec Google Meet",
    checkInCode: "Code d'arrivée :", showAtDesk: "Montrez-le à l'accueil en arrivant.", codeToScan: "Votre page de réservation l'affiche aussi en code à scanner.",
    paidWithPack: (last4) => `Payé avec votre forfait ••••${last4} :`, visitOf: (n, of) => `visite ${n} sur ${of}`,
    discount: (code) => `Rabais (${code}) :`, off: (amount) => `${amount} de rabais`, tax: (names) => `Taxes incluses${names ? ` (${names})` : ""} :`,
    giftCard: (last4) => `Carte-cadeau ••••${last4} :`, depositPaid: "Dépôt payé :", leftToPay: "Reste à payer :", toPayAtVisit: "À payer sur place :", paid: "Payé :",
    cardOnFile: "Carte au dossier :",
    cardWords: (card, hours, fee) => `${card}. Manquer cette réservation${hours ? `, ou l'annuler moins de ${hours} heures avant,` : ""} peut coûter ${fee}.`,
    addGoogle: "Ajouter à Google Agenda", addApple: "Ajouter au calendrier Apple",
    addTip: "Laisser un pourboire", pay: (amount) => `Payer ${amount}`, seeOrChange: "Voir ou modifier votre réservation", yesThere: "Oui, je serai là",
    leaveReview: "Laisser un avis", bookAgain: "Réserver de nouveau",
    bookNext: "Réserver votre prochaine visite", bookATime: "Réserver une heure", noMoreEmails: "Vous ne voulez plus recevoir ces courriels?", unsubscribe: "Se désabonner",
    beforeVisit: "Avant votre visite :", fillIn: (titles) => `veuillez remplir ${titles.join(" et ")} sur votre page de réservation. Ça prend une minute.`,
    answerBy: (when) => `On vous répondra au plus tard le ${when}.`,
    tipIncluded: (amount) => `Cela comprend votre pourboire de ${amount}.`,
    feeCard: (card) => `Montant porté à votre ${card.replace(/^Carte\b/, "carte")}.`,
    reviewAsk: "Si vous avez un moment, un court avis aide les autres à nous trouver.",
  },
});
const moneyWords = (minor, currency, lang = "en") => new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: String(currency || "CAD").toUpperCase() }).format(minor / 100);
const REMINDER_SKIP_HOURS = 6;

const PUBLIC_BOOKING_ACTIONS = Object.freeze(["bookingMine", "bookingOpen", "bookingInfo", "bookingTimes", "bookingRunCheck", "bookingCode", "bookingGiftCard", "bookingStart", "bookingView", "bookingCancel", "bookingMove", "bookingWait", "bookingEarlier", "bookingEarlierView", "bookingEarlierTake", "bookingConfirm", "bookingForm", "bookingPayRest", "bookingTip", "bookingReview", "bookingPackBuy", "bookingPackView", "bookingPack", "pickupTimes"]);

module.exports = { PickupTimeProblem, engineOn, DESK_OPS, bookingsFeed, customerBookingIcs, bookingActions, busyFrom, cleanCustomer, publicBooking, PUBLIC_BOOKING_ACTIONS, HOLD_MINUTES };
