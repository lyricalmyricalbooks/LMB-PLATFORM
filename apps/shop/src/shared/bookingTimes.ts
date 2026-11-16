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
};

/** One weekly start of a group class: weekday 0 = Sunday … 6 = Saturday, time "HH:MM" on the shop's clock. */
export type ClassTime = { weekday: number; time: string };
export const MAX_PLACES = 100;
export const MAX_CLASS_TIMES = 21;
/** A service that takes more than one person at a time. */
export const isClass = (s: { places?: number } | null | undefined): boolean => Number(s?.places) > 1;

/** A question the customer answers when booking this service ("What would you like to work on?"). */
export type BookingQuestion = { id: string; label: string; /** A few lines instead of one. */ long: boolean; required: boolean };
/** What the customer answered, kept with the question's words as they were asked. */
export type BookingAnswer = { label: string; answer: string };
export const MAX_QUESTIONS = 5;

export type HoursWindow = { start: string; end: string };

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
  /** A place freed for the waiting list is held this many minutes for the first person in line (WAIT_HOLD_MINUTES). */
  waitHoldMinutes: number;
};

/** A booked or held stretch of time: [start, end) in milliseconds, its rest after it included. */
export type Busy = { start: number; end: number; /** Whose booking it is, so a class can tell its own from another's. */ serviceId?: string };

/** What the free-time rules need of a service. Without `id` and `places` it is one customer at a time. */
export type Bookable = Pick<BookingService, "minutes" | "gapAfter"> & Partial<Pick<BookingService, "id" | "places" | "classTimes">>;

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
  waitHoldMinutes: 60,
};

/** How long a freed place may be held for the first person on the waiting list. */
export const WAIT_HOLD_MINUTES = [15, 30, 60, 120, 240, 720] as const;

/** The reminder choices the owner picks from: none, or this many hours before. */
export const REMINDER_HOURS = [0, 2, 12, 24, 48, 72] as const;

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
 * The money side of one booking, in cents. `payment` on a booking: "free", "card" (all by card when booked), "deposit"
 * (part by card when booked, the rest at the visit) or "atShop". `paid` means all of it is paid; `depositPaid` that the
 * deposit is. Every screen, email and the server read a booking's money through these.
 */
export type BookingMoney = { payment?: string; priceMinor?: number; depositMinor?: number; paid?: boolean; depositPaid?: boolean; refund?: { amountMinor?: number } | null; status?: string };
/** What the card page asks for when this booking is made. */
export const cardAsk = (b: BookingMoney): number => (b.payment === "card" ? b.priceMinor || 0 : b.payment === "deposit" ? b.depositMinor || 0 : 0);
/** What was taken by card for this booking (the most that can go back to the card). */
export const cardTaken = (b: BookingMoney): number => (b.payment === "card" ? (b.paid ? b.priceMinor || 0 : 0) : b.payment === "deposit" ? (b.depositPaid ? b.depositMinor || 0 : 0) : 0);
/** Everything the shop has received for this booking, before refunds. */
export const moneyTaken = (b: BookingMoney): number => (b.paid ? b.priceMinor || 0 : cardTaken(b));
/** What the shop keeps: received less refunded. */
export const moneyKept = (b: BookingMoney): number => Math.max(0, moneyTaken(b) - (b.refund?.amountMinor || 0));
/** What is still to pay at the visit. Nothing for a cancelled booking. */
export const balanceDue = (b: BookingMoney): number => (b.status === "cancelled" ? 0 : Math.max(0, (b.priceMinor || 0) - moneyTaken(b)));

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
    places: whole(s.places, 1, MAX_PLACES, 1),
    classTimes: cleanClassTimes(s.classTimes),
  };
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
  const rawHours = Array.isArray(s.hours) && s.hours.length === 7 ? s.hours : DEFAULT_BOOKING_SETTINGS.hours;
  const hours = rawHours.map((day) => {
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
  const daysOff = [...new Set((Array.isArray(s.daysOff) ? s.daysOff : []).filter((d): d is string => typeof d === "string" && DAY.test(d)))].sort().slice(-200);
  const step = (BOOKING_STEPS as readonly number[]).includes(Number(s.step)) ? Number(s.step) : DEFAULT_BOOKING_SETTINGS.step;
  return {
    live: s.live === true,
    hours,
    daysOff,
    minNoticeHours: whole(s.minNoticeHours, 0, 24 * 14, DEFAULT_BOOKING_SETTINGS.minNoticeHours),
    maxDaysAhead: whole(s.maxDaysAhead, 1, 365, DEFAULT_BOOKING_SETTINGS.maxDaysAhead),
    cancelHours: whole(s.cancelHours, 0, 24 * 14, DEFAULT_BOOKING_SETTINGS.cancelHours),
    step,
    reminderHours: (REMINDER_HOURS as readonly number[]).includes(Number(s.reminderHours)) ? Number(s.reminderHours) : DEFAULT_BOOKING_SETTINGS.reminderHours,
    waitHoldMinutes: (WAIT_HOLD_MINUTES as readonly number[]).includes(Number(s.waitHoldMinutes)) ? Number(s.waitHoldMinutes) : DEFAULT_BOOKING_SETTINGS.waitHoldMinutes,
  };
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
export function placesLeft(start: number, service: Bookable, busy: readonly Busy[]): number {
  const end = start + (service.minutes + service.gapAfter) * MINUTE;
  const places = isClass(service) && service.id ? Math.round(Number(service.places)) : 1;
  let taken = 0;
  for (const b of busy) {
    if (!(start < b.end && end > b.start)) continue;
    if (places > 1 && b.serviceId === service.id && b.start === start) taken += 1;
    else return 0;
  }
  return Math.max(0, places - taken);
}

/** Whether a booking of `service` starting at `start` can't be taken: something overlaps it, or the class is full. */
export function clashes(start: number, service: Bookable, busy: readonly Busy[]): boolean {
  return placesLeft(start, service, busy) === 0;
}

/** The last day customers may book, and the earliest moment, as of `nowMs`. */
export function bookingWindow(settings: BookingSettings, zone: string, nowMs: number): { earliest: number; lastDay: string } {
  return { earliest: nowMs + settings.minNoticeHours * 60 * MINUTE, lastDay: addDays(dayOf(nowMs, zone), settings.maxDaysAhead) };
}

/**
 * The start times (milliseconds) a customer can book on one shop day, earliest first: inside the day's opening hours,
 * whole service inside a window, at the step, after the notice, before the last day, clashing with nothing busy.
 */
export function freeTimes({ service, settings, busy, day, zone, nowMs }: {
  service: Bookable; settings: BookingSettings; busy: readonly Busy[]; day: string; zone: string; nowMs: number;
}): number[] {
  if (!isDay(day) || settings.daysOff.includes(day)) return [];
  const { earliest, lastDay } = bookingWindow(settings, zone, nowMs);
  if (day > lastDay || day < dayOf(nowMs, zone)) return [];
  const out: number[] = [];
  // A class with its own weekly times runs at those, whatever the opening hours say.
  if (isClass(service) && service.classTimes?.length) {
    for (const t of service.classTimes) {
      if (t.weekday !== weekdayOf(day)) continue;
      const start = zonedTime(day, t.time, zone);
      if (start >= earliest && !clashes(start, service, busy) && !out.includes(start)) out.push(start);
    }
    return out.sort((a, b) => a - b);
  }
  for (const w of settings.hours[weekdayOf(day)] || []) {
    const close = minutesOf(w.end);
    for (let m = minutesOf(w.start); m + service.minutes <= close; m += settings.step) {
      const start = zonedTime(day, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, zone);
      if (start < earliest || clashes(start, service, busy)) continue;
      // A clock change can make two wall times one moment; offer it once.
      if (out[out.length - 1] !== start) out.push(start);
    }
  }
  return out;
}

/** Whether `start` is one of the times free on its day (the server's check before it takes a booking). */
export function isFreeTime(args: { service: Bookable; settings: BookingSettings; busy: readonly Busy[]; start: number; zone: string; nowMs: number }): boolean {
  const { start, zone } = args;
  return Number.isFinite(start) && freeTimes({ ...args, day: dayOf(start, zone) }).includes(start);
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
