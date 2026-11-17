// Bookings (beta, 14 November 2026; tasks/todo/2026-11-14-bookings-beta.md): the times a customer can book, worked out
// the same way by the Book a time page, the admin and the server (src/shared/CLAUDE.md). Pure: no Firebase, no network.
//
// A service is one thing a customer books (a studio visit, a printing class for one, a portfolio review): how long it
// lasts, the rest the owner wants after it, and its price. The opening hours say when the shop takes bookings, week by
// week, with days off. A time is free when it fits inside the day's hours, is far enough ahead, isn't past the last day
// customers may book, and overlaps no other booking (with its rest after it). One customer at a time, unless the service is a group class
// (`places` above 1): then several people share one start, up to its places.

/**
 * When the customer pays: nothing ("free"), all of it by card when booking ("full"), part of it by card when booking and
 * the rest at the visit ("deposit"), or all of it at the visit ("atShop").
 */
export type BookingPayment = "free" | "full" | "deposit" | "atShop";

export type BookingService = {
  id: string;
  name: string;
  description: string;
  minutes: number;
  /** Rest after each booking, in minutes, so the owner isn't booked back to back. */
  gapAfter: number;
  /** In the shop's smallest money unit (cents). 0 with payment "free". */
  priceMinor: number;
  payment: BookingPayment;
  /** With payment "deposit": the deposit as an amount (cents), or 0 when it is a share of the price. */
  depositMinor: number;
  /** With payment "deposit" and no amount: the deposit as a whole percent of the price (1 to 99), else 0. */
  depositPercent: number;
  location: string;
  active: boolean;
  order: number;
  /** The owner's own questions on the booking form, asked after name and email. */
  questions: BookingQuestion[];
  /** How many people can book the same time: 1 is one customer at a time, more is a group class. */
  places: number;
  /** A class's own weekly start times ("Saturdays at 14:00"). Empty: every free time in the opening hours. */
  classTimes: ClassTime[];
  /**
   * A course (Classes, 17 November 2026): its dated sessions as shop-clock "YYYY-MM-DDTHH:MM", earliest first. Set (two
   * or more), the class is sold only as a whole: one sign-up, one price, a place in every session. Empty: not a course.
   */
  courseDates?: string[];
  /** A course people may still join after it starts, paying for the dates left (while at least 2 are left). */
  lateJoin?: boolean;
  /**
   * Card on file: the customer saves a card when booking (nothing is taken for it), so the owner can charge `lateFeeMinor`
   * after a missed booking or a late cancellation. Not with payment "full" (all of it is already paid).
   */
  holdCard: boolean;
  /** With `holdCard`: the most the owner may charge for a missed booking or a late cancellation, in cents. */
  lateFeeMinor: number;
  /** A video call: with bookings going into Google Calendar, each booking gets its own Google Meet link. */
  meet: boolean;
  /**
   * A pack of visits sold on the Book a time page (16 November 2026): `packVisits` visits (0 = no pack) for
   * `packPriceMinor`, paid by card up front, each visit then booked with the pack's code. `packDays`: how many days the
   * pack lasts from the day it is bought (0 = it never runs out).
   */
  packVisits: number;
  packPriceMinor: number;
  packDays: number;
  /** The room or chair the service needs (Services plan phase 4): "" for none. Two bookings never share a room. */
  roomId: string;
  /**
   * Charge sales tax (17 November 2026): the shop's own tax rate for where it is (Settings › Taxes, matched to Settings ›
   * General › Location) is added on top of the price when someone books. Only for a priced service.
   */
  chargeTax: boolean;
  /**
   * Rebook reminder (Services plan phase 7): this many weeks after a visit the client gets one "time for your next
   * visit?" email with a Book again button, unless they have booked again since. 0 = never.
   */
  rebookWeeks?: number;
};

/** One weekly start of a group class: weekday 0 = Sunday … 6 = Saturday, time "HH:MM" on the shop's clock. */
export type ClassTime = { weekday: number; time: string };
export const MAX_PLACES = 100;
export const MAX_CLASS_TIMES = 21;
/** A service that takes more than one person at a time. */
export const isClass = (s: { places?: number } | null | undefined): boolean => Number(s?.places) > 1;
/** The most sessions one course can have. */
export const MAX_COURSE_DATES = 30;
/** A course: a group class with its own dated sessions, signed up for as a whole. */
export const isCourse = (s: { places?: number; courseDates?: readonly string[] } | null | undefined): boolean => isClass(s) && (s?.courseDates?.length || 0) >= 2;

/** A question the customer answers when booking this service ("What would you like to work on?"). */
export type BookingQuestion = { id: string; label: string; /** A few lines instead of one. */ long: boolean; required: boolean };
/** What the customer answered, kept with the question's words as they were asked. */
export type BookingAnswer = { label: string; answer: string };
export const MAX_QUESTIONS = 5;

export type HoursWindow = { start: string; end: string };

/**
 * One person clients can book (Services plan phase 4, 17 November 2026). With nobody listed the shop books as one
 * calendar, as before.
 */
export type StaffMember = {
  id: string;
  name: string;
  /** Off: kept with their bookings, but not offered for new ones. */
  active: boolean;
  /** The services they do; empty means every service. */
  serviceIds: string[];
  /** Their own weekly hours instead of the shop's opening hours. */
  ownHours: boolean;
  hours: HoursWindow[][];
  /** Their own days off (holidays), on top of the shop's. */
  daysOff: string[];
  /** Their sign-in address on the Team page, so they can see their own day (phase 4 part 2). */
  email: string;
};
/** A room or chair that only one booking can use at a time. */
export type BookingRoom = { id: string; name: string };
export const MAX_STAFF = 20;
export const MAX_ROOMS = 10;

export type BookingSettings = {
  /** Shown on the website (the Book a time page answers) once the owner turns it on. */
  live: boolean;
  /** Opening hours by weekday, 0 = Sunday … 6 = Saturday. An empty list is a closed day. */
  hours: HoursWindow[][];
  /** Days the shop takes no bookings, YYYY-MM-DD in the shop's time zone. */
  daysOff: string[];
  /** How far ahead a booking must be made. */
  minNoticeHours: number;
  /** How many days ahead customers may book. */
  maxDaysAhead: number;
  /** Customers may cancel or move online until this many hours before; later, they contact the shop. */
  cancelHours: number;
  /** Start times are offered every this many minutes (15, 30 or 60). */
  step: number;
  /** Customers are emailed a reminder this many hours before; 0 sends none. */
  reminderHours: number;
  /** Tips: clients may add one when paying what's left, and get an "Add a tip" email after a paid visit. */
  tips: boolean;
  /** The tip choices, as a share of the price (1 to 4 of them, each 1 to 50). */
  tipPercents: number[];
  /** A place freed for the waiting list is held this many minutes for the first person in line (WAIT_HOLD_MINUTES). */
  waitHoldMinutes: number;
  /** A second, shorter reminder this many hours before (SECOND_REMINDER_HOURS); 0 sends none. Always under `reminderHours`. */
  secondReminderHours: number;
  /** The owner gets one email each morning (DAILY_SUMMARY_HOUR, the shop's time) listing the day's bookings. */
  dailySummary: boolean;
  /** Each confirmed booking goes into the shop's Colophon calendar in the owner's Google account (Connect Google's Calendar box). */
  googleCalendar: boolean;
  /** Pickup times: shoppers who choose pickup at checkout pick a time inside these same opening hours. */
  pickupTimes: boolean;
  /** Pickup times are offered every this many minutes (PICKUP_SLOT_MINUTES). */
  pickupSlotMinutes: number;
  /** How many orders may be picked up in one slot (1 to MAX_PICKUP_PER_SLOT). */
  pickupPerSlot: number;
  /** The first pickup time is at least this many hours after the order (0 to 72), so there's time to pack it. */
  pickupReadyHours: number;
  /** The people clients book with; empty: the shop is one calendar. */
  staff: StaffMember[];
  /** Rooms and chairs services can need. */
  rooms: BookingRoom[];
  /** A thank-you email a couple of hours after each visit, with Book again (and `reviewUrl` when set). */
  thankYou: boolean;
  /** Where clients leave a review (a Google review link, say): https only, "" for none. */
  reviewUrl: string;
  /**
   * Reviews on the shop's own website (Services plan phase 7): the after-visit email asks for a review on the client's
   * booking page; the owner approves each one before it shows in the Client reviews section.
   */
  siteReviews?: boolean;
  /**
   * Text-message reminders (Services plan phase 7): the reminder and the second reminder also go by text to a client who
   * ticked "Text me reminders" and gave a mobile number. Sent through the platform, billed to the shop at cost.
   */
  textReminders?: boolean;
};

/**
 * A booked or held stretch of time: [start, end) in milliseconds, its rest after it included. `staffId` is the person
 * booked (none: the whole shop, as every booking made before there were people), `roomId` the room it uses.
 */
export type Busy = { start: number; end: number; /** Whose booking it is, so a class can tell its own from another's. */ serviceId?: string; staffId?: string; roomId?: string };

/** What the free-time rules need of a service. Without `id` and `places` it is one customer at a time. */
export type Bookable = Pick<BookingService, "minutes" | "gapAfter"> & Partial<Pick<BookingService, "id" | "places" | "classTimes" | "roomId" | "courseDates">>;

export const BOOKING_STEPS = [15, 30, 60] as const;
export const MAX_SERVICES = 30;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MINUTE = 60_000;

/** Monday to Friday, ten to five: what a new shop starts with, so the page is never empty. */
export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  live: false,
  hours: [[], [{ start: "10:00", end: "17:00" }], [{ start: "10:00", end: "17:00" }], [{ start: "10:00", end: "17:00" }], [{ start: "10:00", end: "17:00" }], [{ start: "10:00", end: "17:00" }], []],
  daysOff: [],
  minNoticeHours: 12,
  maxDaysAhead: 60,
  cancelHours: 24,
  step: 30,
  reminderHours: 24,
  tips: false,
  tipPercents: [15, 18, 20],
  waitHoldMinutes: 60,
  secondReminderHours: 0,
  dailySummary: false,
  googleCalendar: false,
  pickupTimes: false,
  pickupSlotMinutes: 30,
  pickupPerSlot: 4,
  pickupReadyHours: 2,
  thankYou: false,
  reviewUrl: "",
  siteReviews: false,
  textReminders: false,
  staff: [],
  rooms: [],
};

/** How long a freed place may be held for the first person on the waiting list. */
export const WAIT_HOLD_MINUTES = [15, 30, 60, 120, 240, 720] as const;

/** The reminder choices the owner picks from: none, or this many hours before. */
export const REMINDER_HOURS = [0, 2, 12, 24, 48, 72] as const;
/** The second reminder's choices: none, or this many hours before. */
export const SECOND_REMINDER_HOURS = [0, 1, 2, 3] as const;
/** The owner's day summary goes out from this hour of the shop's morning. */
export const DAILY_SUMMARY_HOUR = 7;

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const whole = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** What a service takes by card when it is booked, in cents: all of it, its deposit, or nothing. */
export function depositOf(s: { payment?: string; priceMinor?: number; depositMinor?: number; depositPercent?: number } | null | undefined): number {
  const price = Math.max(0, Math.round(Number(s?.priceMinor) || 0));
  if (s?.payment === "full") return price;
  if (s?.payment !== "deposit") return 0;
  const amount = Math.round(Number(s.depositMinor) || 0);
  if (amount > 0) return Math.min(amount, price);
  return Math.min(price, Math.round((price * (Number(s.depositPercent) || 0)) / 100));
}

/**
 * Sales tax on a booking (17 November 2026). A service with `chargeTax` adds the shop's rate on top of its price when it
 * is booked: the booking's `priceMinor` is then the whole amount with the tax, `taxMinor` the tax in it and `taxLines`
 * the tax by its name in the books ([{ name, cents }]). The tax in `amountMinor` of what was paid or kept: the same share
 * of the tax as of the price, so a deposit, a part refund or a kept fee each carry their own part.
 */
export function taxIn(b: { priceMinor?: number; taxMinor?: number } | null | undefined, amountMinor: number): number {
  const price = Math.round(Number(b?.priceMinor) || 0);
  const tax = Math.round(Number(b?.taxMinor) || 0);
  if (!(tax > 0) || !(price > 0) || !(amountMinor > 0)) return 0;
  return Math.min(tax, Math.round((tax * Math.min(amountMinor, price)) / price));
}

/**
 * The money side of one booking, in cents. `payment` on a booking: "free", "card" (all by card when booked), "deposit"
 * (part by card when booked, the rest at the visit) or "atShop". `paid` means all of it is paid; `depositPaid` that the
 * deposit is. `rest` is what was left, paid later by card from the client's own booking page. Every screen, email and
 * the server read a booking's money through these. `giftCard` is a gift card's part of what is paid when booked: it is
 * taken off the card page (`cardAsk`) and counts as received once the booking is paid (`giftTaken`).
 */
export type BookingMoney = { payment?: string; priceMinor?: number; depositMinor?: number; paid?: boolean; depositPaid?: boolean; refund?: { amountMinor?: number } | null; status?: string; fee?: { amountMinor?: number } | null; rest?: { amountMinor?: number } | null; giftCard?: { amountMinor?: number; returned?: boolean } | null };
/** What the card page asks for when this booking is made. */
export const cardAsk = (b: BookingMoney): number => Math.max(0, bookedAsk(b) - giftMinor(b));
/** What is paid when booked, card and gift card together: the whole price, the deposit or nothing. */
const bookedAsk = (b: BookingMoney): number => (b.payment === "card" ? b.priceMinor || 0 : b.payment === "deposit" ? b.depositMinor || 0 : 0);
/** Did the booking's own payment (card page, gift card or both) go through? */
const bookedPaid = (b: BookingMoney): boolean => (b.payment === "card" ? !!b.paid : b.payment === "deposit" ? !!b.depositPaid : false);
/** The gift card's part of what is paid when booked. */
const giftMinor = (b: BookingMoney): number => Math.max(0, Math.min(b.giftCard?.amountMinor || 0, bookedAsk(b)));
/** What a gift card paid towards this booking (counted once the booking's payment went through). */
export const giftTaken = (b: BookingMoney): number => (bookedPaid(b) ? giftMinor(b) : 0);
/** What went back onto the gift card when the booking was cancelled. */
export const giftReturned = (b: BookingMoney): number => (b.giftCard?.returned ? giftTaken(b) : 0);
/**
 * How much of `available` on a gift card goes towards `upFront` (what is paid when booked). What is left for the card
 * page is never between nothing and the smallest card payment, so the gift card then covers a little less.
 */
export function giftCardPart(upFront: number, available: number): number {
  const due = Math.max(0, Math.round(upFront) || 0);
  const part = Math.min(due, Math.max(0, Math.floor(available) || 0));
  const left = due - part;
  return left > 0 && left < MIN_CARD_MINOR ? Math.max(0, due - MIN_CARD_MINOR) : part;
}
/** What was taken by card for this booking (the most that can go back to the card). */
export const cardTaken = (b: BookingMoney): number => bookedCardTaken(b) + restTaken(b);
/** What the card page took when the booking was made (the deposit, or the whole price). */
export const bookedCardTaken = (b: BookingMoney): number => (bookedPaid(b) ? cardAsk(b) : 0);
/** What was left and later paid by card from the booking page. */
export const restTaken = (b: BookingMoney): number => Math.max(0, b.rest?.amountMinor || 0);
/** A missed-booking or late-cancellation fee charged to the saved card. */
export const feeTaken = (b: BookingMoney): number => Math.max(0, b.fee?.amountMinor || 0);
/** What was received towards the price itself (not counting a fee). */
const priceTaken = (b: BookingMoney): number => (b.paid ? b.priceMinor || 0 : cardTaken(b) + giftTaken(b));
/** Everything the shop has received for this booking, a fee included, before refunds. */
export const moneyTaken = (b: BookingMoney): number => priceTaken(b) + feeTaken(b);
/** What the shop keeps: received less refunded (to the card, or back onto the gift card). */
export const moneyKept = (b: BookingMoney): number => Math.max(0, moneyTaken(b) - (b.refund?.amountMinor || 0) - giftReturned(b));
/** What is still to pay at the visit. Nothing for a cancelled booking. */
export const balanceDue = (b: BookingMoney): number => (b.status === "cancelled" ? 0 : Math.max(0, (b.priceMinor || 0) - priceTaken(b)));
/** The smallest amount a card page takes. */
export const MIN_CARD_MINOR = 50;
/** Can the client pay what is left by card from their booking page? A confirmed booking with at least 0.50 still due. */
export const restPayable = (b: BookingMoney): boolean => b.status === "confirmed" && balanceDue(b) >= MIN_CARD_MINOR;

// ── Tips (16 November 2026) ─────────────────────────────────────────────────────────────────────────────────────

/** The owner's tip choices: 1 to 4 whole percents from 1 to 50, smallest first; anything else is the defaults. */
export function cleanTipPercents(raw: unknown): number[] {
  const list = [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 50))].sort((a, b) => a - b).slice(0, 4);
  return list.length ? list : [...DEFAULT_BOOKING_SETTINGS.tipPercents];
}
/** The tip given, by card. Never part of the price, a refund or the shop's takings. */
export const tipTaken = (b: { tip?: { amountMinor?: number } | null }): number => Math.max(0, b.tip?.amountMinor || 0);
/** Each tip choice in money, from the price. */
export const tipChoices = (priceMinor: number, percents: readonly number[]): { percent: number; amountMinor: number }[] =>
  percents.map((percent) => ({ percent, amountMinor: Math.round((Math.max(0, priceMinor) * percent) / 100) }));
/** The biggest tip a client may type: the price itself, and never under 100.00 for a cheap service. */
export const tipLimitMinor = (priceMinor: number): number => Math.max(10_000, Math.max(0, priceMinor));
/** A tip amount the server takes: whole cents, at least the card minimum, at most the limit. */
export const tipFits = (tipMinor: unknown, priceMinor: number): boolean =>
  Number.isInteger(tipMinor) && (tipMinor as number) >= MIN_CARD_MINOR && (tipMinor as number) <= tipLimitMinor(priceMinor);
/**
 * Can the client add a tip on its own (nothing else left to pay)? The shop asks for tips, the visit has started and
 * was kept (not a no-show), it had a price, no tip yet, and at most 14 days have passed since it ended.
 */
export function tipOpen(b: BookingMoney & { noShow?: boolean; tip?: unknown; start?: string; end?: string }, tipsOn: boolean, nowMs: number): boolean {
  if (!tipsOn || b.status !== "confirmed" || b.noShow || b.tip || !((b.priceMinor || 0) > 0)) return false;
  return Date.parse(b.start || "") <= nowMs && nowMs <= Date.parse(b.end || "") + 14 * 24 * 3_600_000;
}

/** The most a missed-booking fee may be: the price for a priced service, else this. */
export const MAX_FREE_LATE_FEE = 50_000;

/** A booking's saved card (server-side ids; the admin shows only the brand and last four). */
export type SavedCard = { customer: string; paymentMethod: string; brand?: string; last4?: string };
/**
 * Can the owner charge the missed-booking fee now? Only with a saved card and no fee yet, once the booking has started
 * (a no-show) or after the shop cancelled it. A customer who cancelled online did so in time, so they are never charged.
 */
export function feeChargeable(b: { card?: SavedCard | null; fee?: unknown; lateFeeMinor?: number; status?: string; cancelledBy?: string; start?: string }, nowMs: number): boolean {
  if (!b.card?.paymentMethod || b.fee || !((b.lateFeeMinor || 0) >= 50)) return false;
  if (b.status === "cancelled") return b.cancelledBy !== "customer" && b.cancelledBy !== "hold ran out";
  return b.status === "confirmed" && Date.parse(b.start || "") <= nowMs;
}

/** A service as the owner typed it, cleaned, or { problem } in plain words. */
export function cleanService(raw: unknown, id = ""): BookingService | { problem: string } {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const name = text(s.name, 80);
  if (!name) return { problem: "Give the service a name, like Studio visit." };
  const minutes = Math.round(Number(s.minutes));
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 8 * 60) return { problem: "A booking lasts between 5 minutes and 8 hours." };
  const payment: BookingPayment = s.payment === "full" || s.payment === "deposit" || s.payment === "atShop" ? s.payment : "free";
  const priceMinor = payment !== "free" ? Math.round(Number(s.priceMinor)) : 0;
  if (payment !== "free" && (!Number.isFinite(priceMinor) || priceMinor < 50)) return { problem: "A paid booking costs at least 0.50." };
  if (priceMinor > 1_000_000) return { problem: "That price is too high for one booking." };
  // A deposit is an amount, or a share of the price; an amount wins when both are sent.
  let depositMinor = 0;
  let depositPercent = 0;
  if (payment === "deposit") {
    const amount = Math.round(Number(s.depositMinor));
    const percent = Math.round(Number(s.depositPercent));
    if (Number.isFinite(amount) && amount > 0) depositMinor = amount;
    else if (Number.isFinite(percent) && percent >= 1 && percent <= 99) depositPercent = percent;
    else return { problem: "Say how much the deposit is: an amount, or a share of the price from 1 to 99 percent." };
    const due = depositOf({ payment, priceMinor, depositMinor, depositPercent });
    if (due < 50) return { problem: "A deposit is at least 0.50." };
    if (due >= priceMinor) return { problem: "A deposit is less than the price. To take it all when they book, choose paying in full." };
  }
  // Card on file, for a fee after a missed booking. Paid in full has nothing left to charge, so it never holds a card.
  const holdCard = s.holdCard === true && payment !== "full";
  // A pack of visits: only for a priced service, two visits or more, at least the smallest card payment.
  const packVisits = payment !== "free" ? whole(s.packVisits, 0, MAX_PACK_VISITS, 0) : 0;
  let packPriceMinor = 0;
  let packDays = 0;
  if (packVisits === 1) return { problem: "A pack has at least 2 visits." };
  if (packVisits >= 2) {
    packPriceMinor = Math.round(Number(s.packPriceMinor));
    if (!Number.isFinite(packPriceMinor) || packPriceMinor < MIN_CARD_MINOR) return { problem: "Say what the pack costs: at least 0.50." };
    if (packPriceMinor > 5_000_000) return { problem: "That pack price is too high." };
    packDays = whole(s.packDays, 0, MAX_PACK_DAYS, 0);
  }
  let lateFeeMinor = 0;
  if (holdCard) {
    lateFeeMinor = Math.round(Number(s.lateFeeMinor));
    if (!Number.isFinite(lateFeeMinor) || lateFeeMinor < 50) return { problem: "Say what a missed booking costs: at least 0.50." };
    if (lateFeeMinor > (priceMinor || MAX_FREE_LATE_FEE)) return { problem: priceMinor ? "A missed-booking fee can't be more than the price." : "That missed-booking fee is too high." };
  }
  const places = whole(s.places, 1, MAX_PLACES, 1);
  const rawDates = Array.isArray(s.courseDates) ? s.courseDates.filter((d) => d !== "" && d != null) : [];
  const courseDates = cleanCourseDates(rawDates);
  if (rawDates.length && courseDates.length < 2) return { problem: "A course has at least 2 dates. For a single date, leave the course dates empty." };
  if (courseDates.length && places < 2) return { problem: "A course needs room for at least 2 people." };
  return {
    id: text(id || s.id, 40).replace(/[^A-Za-z0-9_-]/g, ""),
    name,
    description: typeof s.description === "string" ? s.description.trim().slice(0, 600) : "",
    minutes,
    gapAfter: whole(s.gapAfter, 0, 120, 0),
    priceMinor,
    payment,
    depositMinor,
    depositPercent,
    location: text(s.location, 160),
    active: s.active !== false,
    order: whole(s.order, 0, 999, 0),
    questions: cleanQuestions(s.questions),
    places,
    // A course runs on its own dates, never at weekly times as well.
    classTimes: courseDates.length ? [] : cleanClassTimes(s.classTimes),
    ...(courseDates.length ? { courseDates } : {}),
    ...(courseDates.length && s.lateJoin === true ? { lateJoin: true } : {}),
    holdCard,
    lateFeeMinor,
    meet: s.meet === true,
    // A pack pays for single visits; a course is one sign-up for all of its dates.
    packVisits: courseDates.length ? 0 : packVisits,
    packPriceMinor: courseDates.length ? 0 : packPriceMinor,
    packDays: courseDates.length ? 0 : packDays,
    roomId: text(s.roomId, 40).replace(/[^A-Za-z0-9_-]/g, ""),
    chargeTax: payment !== "free" && s.chargeTax === true,
    rebookWeeks: whole(s.rebookWeeks, 0, MAX_REBOOK_WEEKS, 0),
  };
}

/** A course's dates, cleaned: real shop-clock "YYYY-MM-DDTHH:MM" moments, no repeats, earliest first. */
export function cleanCourseDates(raw: unknown): string[] {
  const out = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (typeof item !== "string") continue;
    const [day, time] = item.trim().slice(0, 16).split("T");
    if (!isDay(day) || !TIME.test(time || "")) continue;
    // A day the calendar doesn't have (30 February) is dropped.
    if (new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) continue;
    out.add(`${day}T${time}`);
  }
  return [...out].sort().slice(0, MAX_COURSE_DATES);
}

/** A course's session starts (milliseconds), earliest first; a clock change never lists one moment twice. */
export function courseStarts(service: { places?: number; courseDates?: readonly string[] } | null | undefined, zone: string): number[] {
  if (!isCourse(service)) return [];
  const out: number[] = [];
  for (const d of service!.courseDates!) {
    const ms = zonedTime(d.slice(0, 10), d.slice(11, 16), zone);
    if (Number.isFinite(ms) && !out.includes(ms)) out.push(ms);
  }
  return out.sort((a, b) => a - b);
}

/** A course joined late needs at least this many dates still to come. */
export const MIN_LATE_DATES = 2;

/** How a late joiner's course differs: the dates they missed, of how many, and the whole course's price. */
export type CourseJoining = { missed: number; of: number; fullPriceMinor: number };

/**
 * The course as someone signing up now gets it: the whole course before it starts; after it starts, only when the owner
 * lets people join late (`lateJoin`) and at least MIN_LATE_DATES dates are still to come, as a course of the dates left
 * at the price of those dates (the whole price shared evenly across the dates, rounded to the cent; a set deposit never
 * more than that). null when it can't be joined any more. Anything that isn't a course comes back as it is.
 */
export function joinableCourse<T extends Partial<BookingService> & { places?: number; courseDates?: readonly string[] }>(service: T, zone: string, nowMs: number): (T & { joining?: CourseJoining }) | null {
  if (!isCourse(service)) return service;
  const dates = service.courseDates!;
  const left = dates.filter((d) => zonedTime(d.slice(0, 10), d.slice(11, 16), zone) > nowMs);
  if (left.length === dates.length) return service;
  if (!service.lateJoin || left.length < MIN_LATE_DATES) return null;
  const full = Math.max(0, Math.round(Number(service.priceMinor) || 0));
  const priceMinor = Math.round((full * left.length) / dates.length);
  return {
    ...service,
    courseDates: left,
    priceMinor,
    ...(service.depositMinor ? { depositMinor: Math.min(service.depositMinor, priceMinor) } : {}),
    joining: { missed: dates.length - left.length, of: dates.length, fullPriceMinor: full },
  };
}

/**
 * The fewest places left across a course's sessions (a sign-up needs one in each), for whoever could run each one.
 * 0 when any session is full or something else is in its way.
 */
export function coursePlacesLeft(service: Bookable, settings: Pick<BookingSettings, "staff">, busy: readonly Busy[], zone: string): number {
  const starts = courseStarts(service, zone);
  return starts.length ? Math.min(...starts.map((ms) => classPlacesLeft(ms, service, settings, busy))) : 0;
}

/** A class's weekly start times, cleaned: real weekdays and times, no repeats, in week order. */
export function cleanClassTimes(raw: unknown): ClassTime[] {
  const seen = new Set<string>();
  const out: ClassTime[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const t = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const weekday = Number(t.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof t.time !== "string" || !TIME.test(t.time)) continue;
    const key = `${weekday}-${t.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ weekday, time: t.time });
  }
  return out.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)).slice(0, MAX_CLASS_TIMES);
}

/** The owner's questions, cleaned: empty ones dropped, at most MAX_QUESTIONS, each with its own id. */
export function cleanQuestions(raw: unknown): BookingQuestion[] {
  const out: BookingQuestion[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const q = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const label = text(q.label, 140);
    if (!label || out.length >= MAX_QUESTIONS) continue;
    let id = text(q.id, 24).replace(/[^A-Za-z0-9_-]/g, "") || `q${out.length + 1}`;
    while (out.some((o) => o.id === id)) id += "x";
    out.push({ id, label, long: q.long === true, required: q.required === true });
  }
  return out;
}

/**
 * The customer's answers to a service's questions, or which required one is missing. Only the service's own questions
 * are kept (whatever else a page sends is ignored), and an unanswered optional question is left out.
 */
export function cleanAnswers(questions: readonly BookingQuestion[], raw: unknown, enforce = true): { answers: BookingAnswer[] } | { problem: string; questionId: string } {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: BookingAnswer[] = [];
  for (const q of questions) {
    const answer = typeof given[q.id] === "string" ? (given[q.id] as string).trim().slice(0, q.long ? 1000 : 200) : "";
    if (!answer && q.required && enforce) return { problem: `Please answer: ${q.label}`, questionId: q.id };
    if (answer) answers.push({ label: q.label, answer });
  }
  return { answers };
}

/** The opening hours and rules, cleaned; anything missing or broken takes the default. */
export function cleanBookingSettings(raw: unknown): BookingSettings {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hours = cleanHours(s.hours, DEFAULT_BOOKING_SETTINGS.hours);
  const daysOff = cleanDaysOff(s.daysOff);
  const step = (BOOKING_STEPS as readonly number[]).includes(Number(s.step)) ? Number(s.step) : DEFAULT_BOOKING_SETTINGS.step;
  const reminderHours = (REMINDER_HOURS as readonly number[]).includes(Number(s.reminderHours)) ? Number(s.reminderHours) : DEFAULT_BOOKING_SETTINGS.reminderHours;
  return {
    live: s.live === true,
    hours,
    daysOff,
    minNoticeHours: whole(s.minNoticeHours, 0, 24 * 14, DEFAULT_BOOKING_SETTINGS.minNoticeHours),
    maxDaysAhead: whole(s.maxDaysAhead, 1, 365, DEFAULT_BOOKING_SETTINGS.maxDaysAhead),
    cancelHours: whole(s.cancelHours, 0, 24 * 14, DEFAULT_BOOKING_SETTINGS.cancelHours),
    step,
    reminderHours,
    tips: s.tips === true,
    tipPercents: cleanTipPercents(s.tipPercents),
    waitHoldMinutes: (WAIT_HOLD_MINUTES as readonly number[]).includes(Number(s.waitHoldMinutes)) ? Number(s.waitHoldMinutes) : DEFAULT_BOOKING_SETTINGS.waitHoldMinutes,
    secondReminderHours: secondReminder(s.secondReminderHours, reminderHours),
    dailySummary: s.dailySummary === true,
    googleCalendar: s.googleCalendar === true,
    pickupTimes: s.pickupTimes === true,
    pickupSlotMinutes: (PICKUP_SLOT_MINUTES as readonly number[]).includes(Number(s.pickupSlotMinutes)) ? Number(s.pickupSlotMinutes) : DEFAULT_BOOKING_SETTINGS.pickupSlotMinutes,
    pickupPerSlot: whole(s.pickupPerSlot, 1, MAX_PICKUP_PER_SLOT, DEFAULT_BOOKING_SETTINGS.pickupPerSlot),
    pickupReadyHours: whole(s.pickupReadyHours, 0, 72, DEFAULT_BOOKING_SETTINGS.pickupReadyHours),
    rooms: cleanRooms(s.rooms),
    staff: cleanStaff(s.staff, hours),
    thankYou: s.thankYou === true,
    reviewUrl: reviewLink(s.reviewUrl),
    siteReviews: s.siteReviews === true,
    textReminders: s.textReminders === true,
  };
}

export const MAX_REBOOK_WEEKS = 52;
/** A rebook reminder goes out within this many days of falling due; a visit older than that is left alone. */
export const REBOOK_WINDOW_DAYS = 14;

/**
 * Is a visit due its rebook reminder? The service asks for one, the visit happened (confirmed, not a no-show), the
 * client left an email, `rebookWeeks` weeks have passed (but not `REBOOK_WINDOW_DAYS` more, so turning it on never
 * mails old clients), and none went yet. Whether they booked again since is the caller's to check.
 */
export function rebookDue(
  b: { status?: string; noShow?: boolean; start?: string; rebookSentAt?: string | null; customer?: { email?: string } | null },
  service: { rebookWeeks?: number } | null | undefined,
  nowMs: number,
): boolean {
  const weeks = Number(service?.rebookWeeks) || 0;
  if (!(weeks > 0) || b.status !== "confirmed" || b.noShow || b.rebookSentAt || !b.customer?.email) return false;
  const start = Date.parse(b.start || "");
  if (!Number.isFinite(start)) return false;
  const dueAt = start + weeks * 7 * 86_400_000;
  return dueAt <= nowMs && nowMs < dueAt + REBOOK_WINDOW_DAYS * 86_400_000;
}

/** Can the client review this visit on their booking page? The shop takes reviews, the visit happened, none yet. */
export function reviewOpen(
  b: { status?: string; noShow?: boolean; start?: string; reviewId?: string | null },
  settings: { siteReviews?: boolean },
  nowMs: number,
): boolean {
  if (!settings.siteReviews || b.reviewId || b.status !== "confirmed" || b.noShow) return false;
  return Date.parse(b.start || "") <= nowMs;
}

export const REVIEW_BODY_MAX = 2000;
/**
 * A client's review as they wrote it, cleaned: a whole rating 1–5 and some words (up to REVIEW_BODY_MAX), or { problem }.
 * The name shown is their first name and the first letter of their last ("Ada R."), never the full name.
 */
export function cleanVisitReview(raw: unknown, fullName: string): { rating: number; body: string; authorName: string } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rating = Number(r.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { problem: "Please choose from one to five stars." };
  const body = typeof r.body === "string" ? r.body.trim().slice(0, REVIEW_BODY_MAX) : "";
  if (body.length < 3) return { problem: "Please write a few words about your visit." };
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const authorName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] || "A client";
  return { rating, body, authorName: authorName.slice(0, 80) };
}

/** A review link as typed: an https address of at most 500 characters, else "". */
export function reviewLink(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || text.length > 500) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * Should the visit get the thank-you email? The shop sends them, the visit happened (confirmed, not a no-show, started)
 * and none went yet. A visit that gets the "Add a tip" email (`tipOpen`) is thanked in that email instead.
 */
export function thanksDue(b: BookingMoney & { noShow?: boolean; tip?: unknown; start?: string; end?: string; thanksSentAt?: string | null; tipAskedAt?: string | null }, settings: Pick<BookingSettings, "thankYou" | "tips">, nowMs: number): boolean {
  if (!settings.thankYou || b.thanksSentAt || b.tipAskedAt || b.status !== "confirmed" || b.noShow) return false;
  if (!(Date.parse(b.start || "") <= nowMs)) return false;
  return !tipOpen(b, settings.tips, nowMs);
}

/** A week of opening hours, cleaned (7 days, up to 4 windows each, in order, no overlaps); `fallback` when broken. */
function cleanHours(raw: unknown, fallback: HoursWindow[][]): HoursWindow[][] {
  const rawHours = Array.isArray(raw) && raw.length === 7 ? raw : fallback;
  return rawHours.map((day) => {
    const windows = (Array.isArray(day) ? day : [])
      .map((w) => (w && typeof w === "object" ? (w as Record<string, unknown>) : {}))
      .filter((w) => typeof w.start === "string" && typeof w.end === "string" && TIME.test(w.start) && TIME.test(w.end) && minutesOf(w.start) < minutesOf(w.end))
      .map((w) => ({ start: String(w.start), end: String(w.end) }))
      .sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
      .slice(0, 4);
    // Overlapping windows on one day read as one: keep each only when it starts after the last one ended.
    const kept: HoursWindow[] = [];
    for (const w of windows) if (!kept.length || minutesOf(w.start) >= minutesOf(kept[kept.length - 1].end)) kept.push(w);
    return kept;
  });
}

const cleanDaysOff = (raw: unknown): string[] =>
  [...new Set((Array.isArray(raw) ? raw : []).filter((d): d is string => typeof d === "string" && DAY.test(d)))].sort().slice(-200);

/** An id kept from what was sent, else made from the position; never a repeat. */
function ownId(raw: unknown, prefix: string, taken: Set<string>, index: number): string {
  let id = text(raw, 40).replace(/[^A-Za-z0-9_-]/g, "") || `${prefix}${index + 1}`;
  while (taken.has(id)) id += "x";
  taken.add(id);
  return id;
}

/** The rooms and chairs, cleaned: named, at most MAX_ROOMS, each with its own id. */
export function cleanRooms(raw: unknown): BookingRoom[] {
  const taken = new Set<string>();
  const out: BookingRoom[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const r = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const name = text(r.name, 60);
    if (!name || out.length >= MAX_ROOMS) continue;
    out.push({ id: ownId(r.id, "room", taken, out.length), name });
  }
  return out;
}

/** The people, cleaned: named, at most MAX_STAFF, each with its own id; own hours start from the shop's. */
export function cleanStaff(raw: unknown, shopHours: HoursWindow[][] = DEFAULT_BOOKING_SETTINGS.hours): StaffMember[] {
  const taken = new Set<string>();
  const out: StaffMember[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const p = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const name = text(p.name, 60);
    if (!name || out.length >= MAX_STAFF) continue;
    const ownHours = p.ownHours === true;
    const email = text(p.email, 320).toLowerCase();
    out.push({
      id: ownId(p.id, "p", taken, out.length),
      name,
      active: p.active !== false,
      serviceIds: [...new Set((Array.isArray(p.serviceIds) ? p.serviceIds : []).map((v) => text(v, 40)).filter((v) => /^[A-Za-z0-9_-]+$/.test(v)))].slice(0, MAX_SERVICES),
      ownHours,
      hours: ownHours ? cleanHours(p.hours, shopHours) : shopHours.map((d) => d.map((w) => ({ ...w }))),
      daysOff: cleanDaysOff(p.daysOff),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "",
    });
  }
  return out;
}

/** How far apart pickup times are offered. */
export const PICKUP_SLOT_MINUTES = [15, 30, 60] as const;
export const MAX_PICKUP_PER_SLOT = 20;
/** Shoppers see this many days of pickup times. */
export const PICKUP_DAYS_AHEAD = 14;

/** A second reminder only when it comes after the first one: one of the choices, and fewer hours before. */
function secondReminder(value: unknown, first: number): number {
  const hours = Number(value);
  if (!(SECOND_REMINDER_HOURS as readonly number[]).includes(hours)) return 0;
  return first && hours >= first ? 0 : hours;
}

// ── The shop's clock ────────────────────────────────────────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(zone: string, ms: number): Record<string, number> {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(zone, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}
function offsetAt(zone: string, ms: number): number {
  const p = partsIn(zone, ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The moment a wall-clock time on a day in the shop's zone happens ("2026-11-20", "14:30"). */
export function zonedTime(day: string, hhmm: string, zone: string): number {
  const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
  const first = guess - offsetAt(zone, guess);
  const second = guess - offsetAt(zone, first);
  return second;
}

/** The shop's day (YYYY-MM-DD) a moment falls on. */
export function dayOf(ms: number, zone: string): string {
  const p = partsIn(zone, ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The day after (or `n` days after) a YYYY-MM-DD day. */
export function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD day (the calendar's own weekday, whatever the zone). */
/**
 * The shop day whose morning summary is due now, or "" when it isn't: from DAILY_SUMMARY_HOUR in the shop's time zone,
 * once a day (`lastDay` is the day last sent).
 */
export function summaryDue(nowMs: number, zone: string, lastDay: string): string {
  const day = dayOf(nowMs, zone);
  if (day === lastDay) return "";
  return nowMs >= zonedTime(day, `${String(DAILY_SUMMARY_HOUR).padStart(2, "0")}:00`, zone) ? day : "";
}

/** Whether the second reminder is due for a booking: inside its hours, at least 15 minutes ahead, not booked inside them. */
export function secondReminderDue(b: { start: string; createdAt?: string; reminder2SentAt?: string | null }, hours: number, nowMs: number): boolean {
  if (!hours || b.reminder2SentAt) return false;
  const start = Date.parse(b.start);
  if (!Number.isFinite(start)) return false;
  const left = start - nowMs;
  if (left > hours * 3_600_000 || left < 15 * MINUTE) return false;
  const made = Date.parse(b.createdAt || "");
  return !(Number.isFinite(made) && start - made <= hours * 3_600_000);
}

export const weekdayOf = (day: string): number => new Date(`${day}T12:00:00Z`).getUTCDay();

export const isDay = (value: unknown): value is string => typeof value === "string" && DAY.test(value);

/** Every shop day a stretch of time touches, for the per-day records the server keeps to stop two bookings clashing. */
export function daysTouched(start: number, end: number, zone: string): string[] {
  const out = [dayOf(start, zone)];
  const last = dayOf(Math.max(start, end - 1), zone);
  while (out[out.length - 1] < last && out.length < 3) out.push(addDays(out[out.length - 1], 1));
  return out;
}

// ── Free times ──────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * How many more people can book `service` at `start`: 0 when anything else overlaps it (its rest included). A group
 * class shares its time only with bookings of the same class at the very same start, up to its places.
 */
export function placesLeft(start: number, service: Bookable, busy: readonly Busy[], staffId = ""): number {
  const end = start + (service.minutes + service.gapAfter) * MINUTE;
  const places = isClass(service) && service.id ? Math.round(Number(service.places)) : 1;
  const room = service.roomId || "";
  let taken = 0;
  for (const b of busy) {
    if (!(start < b.end && end > b.start)) continue;
    // With people, a stretch matters when it is this person's, the whole shop's, or in the room this service needs.
    const mine = !staffId || !b.staffId || b.staffId === staffId;
    const sameRoom = !!room && b.roomId === room;
    if (!mine && !sameRoom) continue;
    const sameClass = places > 1 && b.serviceId === service.id && b.start === start && (!staffId || (b.staffId || "") === staffId);
    if (sameClass) taken += 1;
    else return 0;
  }
  return Math.max(0, places - taken);
}

/** The people who can be booked for a service: active, and doing it (nobody listed for a service means everyone). */
export function staffFor(settings: Pick<BookingSettings, "staff">, serviceId: string | undefined): StaffMember[] {
  return (settings.staff || []).filter((p) => p.active && (!p.serviceIds.length || (!!serviceId && p.serviceIds.includes(serviceId))));
}

/** Does the shop book by person? Only when someone is listed and active. */
export const booksByPerson = (settings: Pick<BookingSettings, "staff">): boolean => (settings.staff || []).some((p) => p.active);

/** Whether a booking of `service` starting at `start` can't be taken: something overlaps it, or the class is full. */
export function clashes(start: number, service: Bookable, busy: readonly Busy[], staffId = ""): boolean {
  return placesLeft(start, service, busy, staffId) === 0;
}

/** The last day customers may book, and the earliest moment, as of `nowMs`. */
export function bookingWindow(settings: BookingSettings, zone: string, nowMs: number): { earliest: number; lastDay: string } {
  return { earliest: nowMs + settings.minNoticeHours * 60 * MINUTE, lastDay: addDays(dayOf(nowMs, zone), settings.maxDaysAhead) };
}

/**
 * The start times (milliseconds) a customer can book on one shop day, earliest first: inside the day's opening hours,
 * whole service inside a window, at the step, after the notice, before the last day, clashing with nothing busy.
 */
export function freeTimes(args: {
  service: Bookable; settings: BookingSettings; busy: readonly Busy[]; day: string; zone: string; nowMs: number;
  /** Only this person's free times (a client who picked someone). Empty: anyone who does the service. */
  staffId?: string;
}): number[] {
  const { service, settings, day } = args;
  if (!booksByPerson(settings)) return freeTimesFor(args, settings.hours, "");
  const people = staffFor(settings, service.id).filter((p) => !args.staffId || p.id === args.staffId);
  const all = new Set<number>();
  for (const p of people) {
    if (p.daysOff.includes(day)) continue;
    for (const ms of freeTimesFor(args, p.ownHours ? p.hours : settings.hours, p.id)) all.add(ms);
  }
  return [...all].sort((a, b) => a - b);
}

/** One calendar's free times on a day: the shop's (no person) or one person's, with their working hours. */
function freeTimesFor({ service, settings, busy, day, zone, nowMs }: {
  service: Bookable; settings: BookingSettings; busy: readonly Busy[]; day: string; zone: string; nowMs: number;
}, hours: HoursWindow[][], staffId: string): number[] {
  if (!isDay(day) || settings.daysOff.includes(day)) return [];
  const { earliest, lastDay } = bookingWindow(settings, zone, nowMs);
  if (day < dayOf(nowMs, zone)) return [];
  const open = (start: number) => placesLeft(start, service, busy, staffId) > 0;
  // A course is signed up for at its first session only, however far ahead it starts and whatever the opening hours
  // say. (The server checks a place in every later session when it takes the sign-up.)
  if (isCourse(service)) {
    const first = courseStarts(service, zone)[0];
    return dayOf(first, zone) === day && first >= earliest && open(first) ? [first] : [];
  }
  if (day > lastDay) return [];
  const out: number[] = [];
  // A class with its own weekly times runs at those, whatever the opening hours say.
  if (isClass(service) && service.classTimes?.length) {
    for (const t of service.classTimes) {
      if (t.weekday !== weekdayOf(day)) continue;
      const start = zonedTime(day, t.time, zone);
      if (start >= earliest && open(start) && !out.includes(start)) out.push(start);
    }
    return out.sort((a, b) => a - b);
  }
  for (const w of hours[weekdayOf(day)] || []) {
    const close = minutesOf(w.end);
    for (let m = minutesOf(w.start); m + service.minutes <= close; m += settings.step) {
      const start = zonedTime(day, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, zone);
      if (start < earliest || !open(start)) continue;
      // A clock change can make two wall times one moment; offer it once.
      if (out[out.length - 1] !== start) out.push(start);
    }
  }
  return out;
}

/**
 * A class's own starts (milliseconds) on one shop day, earliest first: its weekly class times that fall on that weekday,
 * whether or not anyone has booked and however full it is. Nothing for a service that isn't a class, or a class with no
 * weekly times (it runs at any free time in the opening hours). Days off and notice are the caller's to apply.
 */
export function classStartsOn(day: string, service: Pick<BookingService, "places" | "classTimes">, zone: string): number[] {
  if (!isDay(day) || !isClass(service)) return [];
  const out: number[] = [];
  for (const t of service.classTimes || []) {
    if (t.weekday !== weekdayOf(day)) continue;
    const start = zonedTime(day, t.time, zone);
    // A clock change can make two wall times one moment; list it once.
    if (!out.includes(start)) out.push(start);
  }
  return out.sort((x, y) => x - y);
}

/**
 * Who takes a booking of `service` at `start`: the person asked for when they are free, else (anyone) someone already
 * running that class then, else whoever has the fewest bookings that day, then the list's order. "" when the shop books
 * as one calendar and the time is free; null when nobody can take it (the server's check before it takes a booking).
 */
export function whoIsFree(args: { service: Bookable; settings: BookingSettings; busy: readonly Busy[]; start: number; zone: string; nowMs: number; staffId?: string }): string | null {
  const { service, settings, busy, start, zone } = args;
  if (!Number.isFinite(start)) return null;
  const day = dayOf(start, zone);
  if (!booksByPerson(settings)) return freeTimesFor({ ...args, day }, settings.hours, "").includes(start) ? "" : null;
  const people = staffFor(settings, service.id).filter((p) => (!args.staffId || p.id === args.staffId) && !p.daysOff.includes(day)
    && freeTimesFor({ ...args, day }, p.ownHours ? p.hours : settings.hours, p.id).includes(start));
  if (!people.length) return null;
  const teaching = isClass(service) ? people.find((p) => busy.some((b) => b.staffId === p.id && b.serviceId === service.id && b.start === start)) : undefined;
  if (teaching) return teaching.id;
  const load = (id: string) => busy.filter((b) => b.staffId === id && dayOf(b.start, zone) === day).length;
  return people.reduce((best, p) => (load(p.id) < load(best.id) ? p : best)).id;
}

/** A class's places left at `start` for whoever could run it (the most any one person has), or the one person asked for. */
export function classPlacesLeft(start: number, service: Bookable, settings: Pick<BookingSettings, "staff">, busy: readonly Busy[], staffId = ""): number {
  if (!booksByPerson(settings)) return placesLeft(start, service, busy);
  const people = staffFor(settings, service.id).filter((p) => !staffId || p.id === staffId);
  return people.reduce((most, p) => Math.max(most, placesLeft(start, service, busy, p.id)), 0);
}

/** The person to keep when a booking moves: theirs while they still do the service, else "" (anyone free). */
export function keptPerson(settings: Pick<BookingSettings, "staff">, serviceId: string | undefined, staffId: unknown): string {
  return typeof staffId === "string" && staffId && staffFor(settings, serviceId).some((p) => p.id === staffId) ? staffId : "";
}

/** Settings for the owner booking someone in: any hour of any day, for anyone on the team (a favour for a regular). */
export function ownerBookingSettings(settings: BookingSettings): BookingSettings {
  const allDay = Array.from({ length: 7 }, () => [{ start: "00:00", end: "23:59" }]);
  return { ...settings, minNoticeHours: 0, maxDaysAhead: 366, hours: allDay, daysOff: [], step: 5,
    staff: (settings.staff || []).map((p) => ({ ...p, ownHours: false, hours: allDay, daysOff: [] })) };
}

/** Whether `start` is free for a booking (someone can take it, or the shop's one calendar is free there). */
export function isFreeTime(args: { service: Bookable; settings: BookingSettings; busy: readonly Busy[]; start: number; zone: string; nowMs: number; staffId?: string }): boolean {
  return whoIsFree(args) !== null;
}

/** Whether the customer may still cancel or move online: up to `cancelHours` before it starts. */
export function customerCanChange(startMs: number, settings: Pick<BookingSettings, "cancelHours">, nowMs: number): boolean {
  return nowMs <= startMs - settings.cancelHours * 60 * MINUTE;
}

// ── Calendars ───────────────────────────────────────────────────────────────────────────────────────────────────────

const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** A calendar file (.ics) for one booking, which every calendar app opens. */
export function bookingIcs({ id, title, start, end, location = "", details = "", nowMs = Date.now() }: {
  id: string; title: string; start: number; end: number; location?: string; details?: string; nowMs?: number;
}): string {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Colophon//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    ...icsEvent({ id, title, start, end, location, details }, nowMs),
    "END:VCALENDAR", "",
  ].join("\r\n");
}

type IcsEventInput = { id: string; title: string; start: number; end: number; location?: string; details?: string };

function icsEvent({ id, title, start, end, location = "", details = "" }: IcsEventInput, nowMs: number): string[] {
  return [
    "BEGIN:VEVENT", `UID:${id}@bookings`, `DTSTAMP:${icsTime(nowMs)}`, `DTSTART:${icsTime(start)}`, `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(title)}`, ...(location ? [`LOCATION:${icsText(location)}`] : []), ...(details ? [`DESCRIPTION:${icsText(details)}`] : []),
    "END:VEVENT",
  ];
}

/**
 * The owner's calendar feed: every booking as one calendar that Google or Apple Calendar subscribes to and refreshes
 * by itself. `name` is what the calendar is called in their app.
 */
export function bookingsFeedIcs(name: string, events: readonly IcsEventInput[], nowMs = Date.now()): string {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Colophon//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap((e) => icsEvent(e, nowMs)),
    "END:VCALENDAR", "",
  ].join("\r\n");
}

/** A link that opens Google Calendar with the booking filled in. */
export function googleCalendarLink({ title, start, end, location = "", details = "" }: { title: string; start: number; end: number; location?: string; details?: string }): string {
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${icsTime(start)}/${icsTime(end)}`, ...(location ? { location } : {}), ...(details ? { details } : {}) });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// ── Packs of visits (16 November 2026) ──────────────────────────────────────────────────────────────────────────

export const MAX_PACK_VISITS = 50;
export const MAX_PACK_DAYS = 730;
/** Does this service sell a pack of visits? */
export const offersPack = (s: { packVisits?: number; packPriceMinor?: number } | null | undefined): boolean =>
  (Number(s?.packVisits) || 0) >= 2 && (Number(s?.packPriceMinor) || 0) >= MIN_CARD_MINOR;

/** A bought pack as the server keeps it (`bookingPacks/{id}`). Each booking made with it is one use. */
export type BookingPack = {
  serviceId?: string;
  visits?: number;
  uses?: { bookingId: string; at?: string; returned?: boolean }[];
  /** "held" while its card page is open, "active" once paid, "closed" when refunded or ended by the shop. */
  status?: string;
  /** The last shop day it can be booked for, or null when it never runs out. */
  expiresOn?: string | null;
};
/** The visits booked with a pack and not given back. */
export const packUsed = (p: BookingPack): number => (p.uses || []).filter((u) => !u.returned).length;
/** The visits still to book. */
export const packLeft = (p: BookingPack): number => Math.max(0, (Number(p.visits) || 0) - packUsed(p));
/** The last shop day a pack bought on `day` can be booked for: `days` later, or null when it never runs out. */
export const packEndsOn = (day: string, days: number): string | null => (days > 0 ? addDays(day, days) : null);

export type PackProblem = "not_found" | "not_paid" | "closed" | "other_service" | "expired" | "used_up";
/** The customer's words for each reason a pack can't book this visit. */
export const PACK_MESSAGES: Record<PackProblem, string> = {
  not_found: "We couldn't find that pack. Check the code in your email.",
  not_paid: "This pack isn't paid for yet.",
  closed: "This pack has been closed. Please contact the shop.",
  other_service: "This pack is for another service.",
  expired: "This pack has run out of time.",
  used_up: "Every visit in this pack has been booked.",
};
/**
 * Why `pack` can't book a visit to `serviceId` on shop day `day` (the visit's own day), or null when it can. A pack
 * running out only stops visits after its last day; a visit booked before then keeps its place.
 */
export function packProblem(pack: BookingPack | null | undefined, serviceId: string, day: string): PackProblem | null {
  if (!pack) return "not_found";
  if (pack.status === "held") return "not_paid";
  if (pack.status !== "active") return "closed";
  if (pack.serviceId !== serviceId) return "other_service";
  if (pack.expiresOn && day > pack.expiresOn) return "expired";
  if (packLeft(pack) <= 0) return "used_up";
  return null;
}

// ── Pickup times ────────────────────────────────────────────────────────────────────────────────────────────────────

export type PickupSettings = Pick<BookingSettings, "hours" | "daysOff" | "pickupSlotMinutes" | "pickupPerSlot" | "pickupReadyHours">;

/** Why a pickup time can't be taken: closed then, too soon to pack, already full, or further ahead than shown. */
export type PickupProblem = "closed" | "too_soon" | "full" | "too_far";

const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Every pickup slot start on one shop day inside its opening hours (a slot must end by closing), ignoring notice and taken. */
function slotsOn(settings: PickupSettings, day: string, zone: string): number[] {
  if (!isDay(day) || settings.daysOff.includes(day)) return [];
  const out: number[] = [];
  for (const w of settings.hours[weekdayOf(day)] || []) {
    const close = minutesOf(w.end);
    for (let m = minutesOf(w.start); m + settings.pickupSlotMinutes <= close; m += settings.pickupSlotMinutes) {
      const start = zonedTime(day, hhmm(m), zone);
      if (out[out.length - 1] !== start) out.push(start);
    }
  }
  return out;
}

/**
 * The pickup times a shopper may choose, by shop day (YYYY-MM-DD → slot starts in milliseconds, earliest first), over
 * the next PICKUP_DAYS_AHEAD days: inside opening hours, at least `pickupReadyHours` from now, and not yet full
 * (`taken` counts orders per slot start). Days with no time left are left out.
 */
export function pickupSlots({ settings, zone, nowMs, taken = {}, days = PICKUP_DAYS_AHEAD }: {
  settings: PickupSettings; zone: string; nowMs: number; taken?: Record<string, number>; days?: number;
}): Record<string, number[]> {
  const earliest = nowMs + settings.pickupReadyHours * 60 * MINUTE;
  const first = dayOf(nowMs, zone);
  const out: Record<string, number[]> = {};
  for (let i = 0; i < days; i++) {
    const day = addDays(first, i);
    const free = slotsOn(settings, day, zone).filter((start) => start >= earliest && (taken[String(start)] || 0) < settings.pickupPerSlot);
    if (free.length) out[day] = free;
  }
  return out;
}

/** The server's check before it takes an order with a pickup time: null when the time is still free. */
export function pickupTimeProblem({ settings, zone, nowMs, start, taken = 0 }: {
  settings: PickupSettings; zone: string; nowMs: number; start: number; taken?: number;
}): PickupProblem | null {
  if (!Number.isFinite(start)) return "closed";
  const day = dayOf(start, zone);
  if (!slotsOn(settings, day, zone).includes(start)) return "closed";
  if (start < nowMs + settings.pickupReadyHours * 60 * MINUTE) return "too_soon";
  if (day > addDays(dayOf(nowMs, zone), PICKUP_DAYS_AHEAD - 1)) return "too_far";
  if (taken >= settings.pickupPerSlot) return "full";
  return null;
}

export const PICKUP_MESSAGES: Record<PickupProblem, string> = {
  closed: "The shop isn't open for pickup at that time. Please choose another.",
  too_soon: "That pickup time is too soon for the shop to have your order ready. Please choose a later one.",
  full: "That pickup time has just filled up. Please choose another.",
  too_far: "Pickup times can only be chosen up to two weeks ahead. Please choose an earlier one.",
};

// ── Check-in codes (17 November 2026) ──────────────────────────────────────────────────────────────────────────────
// Each confirmed booking gets a short code (in its emails and on the customer's booking page, also as a QR code). The
// shop types or scans it at the Fair till or Take a payment to mark the person as arrived. Letters and digits that can't
// be mistaken for each other (no 0/O, 1/I).

export const CHECK_IN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A check-in code as typed, scanned or read aloud ("k7qm 2xpa", "K7QM-2XPA"): "K7QM-2XPA", or "" when it isn't one. */
export function cleanCheckInCode(raw: unknown): string {
  const text = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (text.length !== 8 || [...text].some((ch) => !CHECK_IN_ALPHABET.includes(ch))) return "";
  return `${text.slice(0, 4)}-${text.slice(4)}`;
}

/** A new code from eight random numbers (0 to 255 each), so both sides can make one with their own randomness. */
export function checkInCodeFrom(bytes: ArrayLike<number>): string {
  let text = "";
  for (let i = 0; i < 8; i++) text += CHECK_IN_ALPHABET[(bytes[i] ?? 0) % CHECK_IN_ALPHABET.length];
  return `${text.slice(0, 4)}-${text.slice(4)}`;
}
