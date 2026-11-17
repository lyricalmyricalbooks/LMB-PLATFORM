// Book a time page (features/site/BookTime.tsx): the pure rules. Days and times are the shop's own (the server sends its
// time zone), so a shopper abroad sees the times the shop keeps, with the zone named under the picker.
import { addDays, depositOf, MAX_RUN_DAYS, MAX_RUN_VISITS, MAX_RUN_WEEKS } from "../../../shared/bookingTimes";

import type { BookingQuestion } from "../../../shared/bookingTimes";
export type BookingServiceView = { id: string; name: string; description: string; minutes: number; priceMinor: number; payment: "free" | "full" | "deposit" | "atShop"; /** With payment "deposit": the deposit as an amount, or as a percent of the price. */ depositMinor?: number; depositPercent?: number; location: string; questions?: BookingQuestion[]; /** Above 1: a group class with this many places at each time. */ places?: number; /** Card on file: the customer saves a card, and missing the booking may cost `lateFeeMinor`. */ holdCard?: boolean; lateFeeMinor?: number;
  /** A pack of visits sold with it: `packVisits` visits for `packPriceMinor`, to use within `packDays` (0: no end). */ packVisits?: number; packPriceMinor?: number; packDays?: number;
  /** Sales tax added on top of `priceMinor` when booked (the service charges tax). */ taxMinor?: number;
  /** A course: every one of its dates, earliest first. One sign-up takes a place on them all. */ courseStarts?: string[];
  /** Joining a course already under way: the dates missed, of how many, and the whole course's price. */
  joining?: { missed: number; of: number; fullPriceMinor: number };
  /** Clients may book it as a standing appointment: the same time every few weeks, several visits at once. */ repeats?: boolean;
  /** A class that runs only with at least this many signed up (otherwise cancelled and refunded). */ minPlaces?: number;
  /** Its pack is a class pass: it books any weekly class. */ packAnyClass?: boolean;
  /** What someone new to the shop pays the first time (the server decides who is new). */ introPriceMinor?: number;
  /** Add-ons and options the client may tick: each adds minutes and, on a paid service, money. */ extras?: BookingExtraView[] };
/** An add-on or option of a one-to-one service. */
export type BookingExtraView = { id: string; name: string; minutes: number; priceMinor: number };
/** The service as the client picked it: its length and price with the ticked extras added (the tax grows in step).
 *  Display only: the server works the same out again from the ids. */
export function withPicked<S extends BookingServiceView>(service: S, ids: readonly string[]): S {
  const picked = (service.extras || []).filter((x) => ids.includes(x.id));
  if (!picked.length) return service;
  const minutes = picked.reduce((n, x) => n + x.minutes, 0);
  const money = picked.reduce((n, x) => n + x.priceMinor, 0);
  const taxMinor = service.taxMinor && service.priceMinor > 0 ? Math.round((service.taxMinor * (service.priceMinor + money)) / service.priceMinor) : service.taxMinor;
  return { ...service, minutes: service.minutes + minutes, priceMinor: service.priceMinor + money, ...(taxMinor !== undefined ? { taxMinor } : {}) };
}
/** The ticked extras that cost something (a pack can't pay for those). */
export const pricedPicks = (service: Pick<BookingServiceView, "extras"> | null | undefined, ids: readonly string[]): boolean =>
  (service?.extras || []).some((x) => ids.includes(x.id) && x.priceMinor > 0);
export type BookingInfo = { on: boolean; zone?: string; currency?: string; cancelHours?: number; maxDaysAhead?: number; today?: string; services?: BookingServiceView[];
  /** The shop's opening hours, Sunday first ("09:00" to "17:00" windows; none = closed). */
  hours?: Array<Array<{ start: string; end: string }>>;
  /** Approved reviews of visits, newest first, for the Client reviews section (empty while the shop doesn't take them). */
  reviews?: VisitReview[];
  /** The shop has a discount code that works on bookings, so the form offers a code box. */
  codes?: boolean;
  /** The shop has gift cards, so the form offers a gift card box on paid services. */
  giftCards?: boolean;
  /** The shop sends reminders by text, so the form offers "Text me reminders" next to the phone number. */
  texts?: boolean;
  /** The people who take bookings (none when the shop lists nobody): who does which service (no services listed = all). */
  staff?: BookingPerson[] };
/** Someone who takes bookings, as the Book a time page sees them. */
export type BookingPerson = { id: string; name: string; serviceIds: string[] };
/** The people a client may pick for a service: those who do it (an empty list of services means every one). */
export const peopleFor = (info: Pick<BookingInfo, "staff"> | null | undefined, serviceId: string): BookingPerson[] =>
  (info?.staff || []).filter((p) => !p.serviceIds.length || p.serviceIds.includes(serviceId));
/** A pack the server accepted for this service: its code as typed, last four, visits left of how many. */
export type BookingPackUse = { code: string; last4: string; left: number; visits: number };
/** A pack as its own page shows it (`bookingPackView`). */
export type BookingPackView = { last4: string; serviceId: string; serviceName: string; visits: number; left: number; status: "held" | "active" | "closed"; expiresOn: string | null; priceMinor: number; currency: string; coming: string[] };
/** What a pack saves against booking each visit on its own, in cents (never below nothing). */
export const packSaving = (s: Pick<BookingServiceView, "priceMinor" | "packVisits" | "packPriceMinor">): number =>
  Math.max(0, (s.packVisits || 0) * s.priceMinor - (s.packPriceMinor || 0));
/** A pack's code from the address (`/book?pack=…` opens the pack, `usepack=…` books with it), or "". */
export function packFromSearch(search: string, name: "pack" | "usepack" = "pack"): string {
  const raw = (new URLSearchParams(search).get(name) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 12 ? raw.match(/.{4}/g)!.join("-") : "";
}
/** "16 December 2026" for a shop day. */
export const longDayText = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
/** A gift card the server accepted: its last four, what it pays now and what is left for the card page. */
export type BookingGift = { code: string; last4: string; giftMinor: number; payNowMinor: number };
/** A discount code the server accepted for one service: what it takes off, the price after it and what is paid now. */
export type BookingCode = { code: string; discountMinor: number; priceMinor: number; /** The sales tax in priceMinor. */ taxMinor?: number; payNowMinor: number };
/** The service as booked: its price with the sales tax added (the server works the deposit out on that too). */
export function withTax<S extends BookingServiceView>(service: S): S {
  return service.taxMinor ? { ...service, priceMinor: service.priceMinor + service.taxMinor } : service;
}
/** The service as priced with a code (the server's figures), so every line and button shows what will really be asked. */
export function withCode<S extends BookingServiceView>(service: S, code: BookingCode | null): S {
  if (!code) return service;
  return { ...service, priceMinor: code.priceMinor, ...(service.payment === "deposit" ? { depositMinor: code.payNowMinor, depositPercent: 0 } : {}) };
}
export type BookingView = {
  id: string; serviceId: string; serviceName: string; minutes: number; location: string; /** A Google Meet link, for a video-call service. */ meetUrl?: string; start: string; end: string;
  /** Who takes it, when the shop lists people. */
  staffId?: string; staffName?: string;
  /** A course: every date this sign-up holds a place on. `canMove` false: it can be cancelled online but not moved. */
  courseStarts?: string[]; canMove?: boolean;
  /** Add-ons and options booked with it (minutes and priceMinor already include them). */
  extras?: BookingExtraView[];
  /** A standing appointment: which visit of the run this is, how many there are and how often. */
  run?: { visit: number; visits: number; everyWeeks: number };
  status: "held" | "confirmed" | "cancelled"; payment: "free" | "card" | "deposit" | "atShop" | "pack"; paid: boolean; priceMinor: number; currency: string;
  /** With payment "deposit": what was asked by card when booking, whether it is paid, and what is left for the visit. */
  depositMinor?: number; depositPaid?: boolean; dueMinor?: number;
  name: string; email: string; refunded: boolean; canChange: boolean; cancelHours: number;
  /** Card on file: whether one is kept, its last four numbers, the fee for missing it, and a fee once charged. */
  cardHold?: boolean; cardLast4?: string; lateFeeMinor?: number; feeMinor?: number;
  /** Pay the rest: whether what is left can be paid by card from this page, and what was paid that way. */
  canPayRest?: boolean; restPaidMinor?: number;
  /** A discount code used when booking, and what it took off (priceMinor is after it). */
  discountCode?: string; discountMinor?: number;
  /** Sales tax: the part of priceMinor that is tax. */ taxMinor?: number;
  /** A gift card that paid part or all of it when booked, and whether that went back onto the card. */
  giftCardLast4?: string; giftMinor?: number; giftReturned?: boolean;
  /** A visit booked with a pack: its last four, which visit of how many, and whether it went back on the pack. */
  packLast4?: string; packVisit?: number; packVisits?: number; packReturned?: boolean;
  /** Tips: the shop's choices (empty when it doesn't ask), whether a tip can be added on its own, the tip given and the most one may be. */
  tipPercents?: number[]; canTip?: boolean; tipMinor?: number; tipLimitMinor?: number;
  /** The code to show at the desk while the visit is still to come, and whether the shop has checked them in. */
  checkInCode?: string; checkedIn?: boolean;
  /** A review of the visit on the shop's website: whether one can be written now, and whether it was. */
  canReview?: boolean; reviewed?: boolean;
};

/** A tip pick on the booking page: a percent of the price, none, or an amount the client types. */
export type TipPick = { kind: "percent"; percent: number } | { kind: "none" } | { kind: "other"; text: string };
/** The tip a pick comes to, in cents (0 for none or for a typed amount that isn't money). */
export function tipMinorOf(pick: TipPick, priceMinor: number): number {
  if (pick.kind === "percent") return Math.round((Math.max(0, priceMinor) * pick.percent) / 100);
  if (pick.kind === "none") return 0;
  const n = Number(pick.text.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
/** Is the typed or chosen tip one the server takes? 0 is fine (no tip) unless a tip is required. */
export const tipOk = (tipMinor: number, limitMinor: number, required = false): boolean =>
  tipMinor === 0 ? !required : tipMinor >= 50 && tipMinor <= limitMinor;

/** How many days the picker shows at once. */
export const DAYS_SHOWN = 7;

/** What the card page takes when this service is booked: the whole price, its deposit, or nothing. */
export const upFrontMinor = (s: Pick<BookingServiceView, "payment" | "priceMinor" | "depositMinor" | "depositPercent">) => depositOf(s);
/** A service is paid up front (all of it, or a deposit) only when the owner asked for payment when booking. */
export const paysUpFront = (s: Pick<BookingServiceView, "payment" | "priceMinor" | "depositMinor" | "depositPercent">) => upFrontMinor(s) > 0;
/** A service that takes only a deposit when booked, the rest at the visit. */
export const takesDeposit = (s: Pick<BookingServiceView, "payment" | "priceMinor" | "depositMinor" | "depositPercent">) => s.payment === "deposit" && upFrontMinor(s) > 0 && upFrontMinor(s) < s.priceMinor;

export function moneyText(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** "45 min", "1 h", "1 h 30 min". */
export function lengthText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** The days a picker page shows, from `from`, never past the last bookable day. */
export function pageDays(from: string, lastDay: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < DAYS_SHOWN; i++) {
    const day = addDays(from, i);
    if (day > lastDay) break;
    out.push(day);
  }
  return out;
}

/** Where the earlier / later arrows go, or null when there is nothing that way. */
export function pageStep(from: string, today: string, lastDay: string, dir: -1 | 1): string | null {
  if (dir < 0) {
    if (from <= today) return null;
    const back = addDays(from, -DAYS_SHOWN);
    return back < today ? today : back;
  }
  const next = addDays(from, DAYS_SHOWN);
  return next > lastDay ? null : next;
}

/** The first day on the page with a free time, else the first day. */
export function firstOpenDay(days: string[], times: Record<string, string[]>): string {
  return days.find((d) => (times[d] || []).length > 0) || days[0] || "";
}

/** The hour (0–23) a time falls on in the shop's zone. */
export function hourIn(iso: string, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value || 0);
}

export type TimeGroup = "morning" | "afternoon" | "evening";

/** A day's times as Morning (before noon) / Afternoon (before 5 pm) / Evening, empty groups left out. */
export function groupTimes(times: string[], zone: string): { group: TimeGroup; times: string[] }[] {
  const groups: Record<TimeGroup, string[]> = { morning: [], afternoon: [], evening: [] };
  for (const t of times) {
    const h = hourIn(t, zone);
    groups[h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"].push(t);
  }
  return (["morning", "afternoon", "evening"] as const).filter((g) => groups[g].length).map((g) => ({ group: g, times: groups[g] }));
}

export const timeText = (iso: string, zone: string) => new Date(iso).toLocaleTimeString(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" });

/** "Tuesday 17 November, 10:00 – 11:00". */
/** A course's dates, one line each: "Saturday, November 28, 6:00 PM". */
export function courseDateLines(starts: readonly string[], zone: string): string[] {
  return starts.map((iso) => `${new Date(iso).toLocaleDateString(undefined, { timeZone: zone, weekday: "long", day: "numeric", month: "long" })}, ${timeText(iso, zone)}`);
}

export function whenText(start: string, end: string, zone: string): string {
  const day = new Date(start).toLocaleDateString(undefined, { timeZone: zone, weekday: "long", day: "numeric", month: "long" });
  return `${day}, ${timeText(start, zone)} – ${timeText(end, zone)}`;
}

/** A day pill's parts: short weekday, day number, short month. */
export function dayParts(day: string): { weekday: string; date: string; month: string } {
  const d = new Date(`${day}T12:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, { timeZone: "UTC", ...o });
  return { weekday: f({ weekday: "short" }), date: String(d.getUTCDate()), month: f({ month: "short" }) };
}

/** "November 2026", or across months "Nov – Dec 2026", over the days a page shows. */
export function monthLabel(days: string[]): string {
  if (!days.length) return "";
  const a = new Date(`${days[0]}T12:00:00Z`);
  const b = new Date(`${days[days.length - 1]}T12:00:00Z`);
  const f = (d: Date, month: "long" | "short") => d.toLocaleDateString(undefined, { timeZone: "UTC", month });
  return f(a, "long") === f(b, "long") ? `${f(a, "long")} ${b.getUTCFullYear()}` : `${f(a, "short")} – ${f(b, "short")} ${b.getUTCFullYear()}`;
}

/** The manage link's parts from the address, or null. Ids and keys keep the server's own shapes. */
export function manageFromSearch(search: string): { id: string; key: string } | null {
  const q = new URLSearchParams(search);
  const id = q.get("booking") || "";
  const key = q.get("key") || "";
  return /^[A-Za-z0-9_-]{6,40}$/.test(id) && /^[a-f0-9]{48}$/.test(key) ? { id, key } : null;
}

/** The service and day a waiting-list email links to (`/book?service=…&day=…`), each empty when missing or misshapen. */
export function wantedFromSearch(search: string): { service: string; day: string; offer: string; offerKey: string; person: string } {
  const q = new URLSearchParams(search);
  const service = q.get("service") || "";
  // Someone picked already (the team section's "Book with …" button).
  const person = q.get("with") || "";
  const day = q.get("day") || "";
  // A place held for this person from the waiting list (the email's link): both parts or neither.
  const offer = q.get("offer") || "";
  const offerKey = q.get("offerKey") || "";
  const held = /^[a-f0-9]{32}$/.test(offer) && /^[a-f0-9]{48}$/.test(offerKey);
  return {
    service: /^[A-Za-z0-9_-]{1,60}$/.test(service) ? service : "", day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "",
    offer: held ? offer : "", offerKey: held ? offerKey : "",
    person: /^[A-Za-z0-9_-]{1,60}$/.test(person) ? person : "",
  };
}

/** The services a "Book a time" section shows: none while bookings are off, else the first few in the shop's order. */
export function sectionServices(info: BookingInfo | null, max: unknown): BookingServiceView[] {
  if (!info?.on || !info.services?.length) return [];
  const n = Math.round(Number(max));
  return info.services.slice(0, Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : 3);
}

/** An approved review of a visit, as the website shows it (first name and initial only). */
export type VisitReview = { authorName: string; rating: number; body: string; serviceName: string; date: string; reply?: string };

/** A standing appointment the client picked: every `everyWeeks` weeks, `visits` times. */
export type BookingRun = { everyWeeks: number; visits: number };
/** One visit of a run as the booking page lists it (`current`: the booking on screen). */
export type RunVisit = { id: string; start: string; status: "held" | "confirmed" | "cancelled"; current?: boolean };

/** The "how often" choices: 1 to 12 weeks apart. */
export const RUN_WEEK_CHOICES = Array.from({ length: MAX_RUN_WEEKS }, (_, i) => i + 1);

/** How many visits a run may have at that gap: 2 to 12, all within a year of the first. */
export function runVisitChoices(everyWeeks: number): number[] {
  return Array.from({ length: MAX_RUN_VISITS - 1 }, (_, i) => i + 2).filter((n) => (n - 1) * everyWeeks * 7 <= MAX_RUN_DAYS);
}

/** Keeps the number of visits allowed when the gap changes (the most that still fits, if it no longer does). */
export function fitRun(run: BookingRun): BookingRun {
  const choices = runVisitChoices(run.everyWeeks);
  return choices.includes(run.visits) ? run : { ...run, visits: choices[choices.length - 1] ?? 2 };
}
