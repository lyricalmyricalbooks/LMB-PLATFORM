// Bookings (beta): the admin page's pure rules (bookingsView.test.ts). Days and times are the shop's own
// (src/shared/shopTimeZone.ts), whatever the owner's computer is set to.
import { addDays, balanceDue, cardTaken, dayOf, moneyKept, moneyTaken, weekdayOf } from "../../shared/bookingTimes";
import type { Booking, Waiting } from "./bookingsApi";

/** One card in a day's column: a single booking, or a group class with everyone booked into it. */
export type DaySlot = { kind: "one"; booking: Booking } | { kind: "class"; key: string; serviceId: string; start: string; serviceName: string; places: number; people: Booking[] };

/** A day's bookings as cards: the people in one start of a group class share a card, everything else has its own. */
export function daySlots(list: readonly Booking[], placesOf: (serviceId: string) => number): DaySlot[] {
  const out: DaySlot[] = [];
  const classes = new Map<string, Extract<DaySlot, { kind: "class" }>>();
  for (const b of list) {
    const places = placesOf(b.serviceId);
    if (places <= 1) { out.push({ kind: "one", booking: b }); continue; }
    const key = `${b.serviceId}|${b.start}`;
    let slot = classes.get(key);
    if (!slot) {
      slot = { kind: "class", key, serviceId: b.serviceId, start: b.start, serviceName: b.serviceName, places, people: [] };
      classes.set(key, slot);
      out.push(slot);
    }
    slot.people.push(b);
  }
  return out;
}

/** One person on a day's list of who is coming. */
export type DayListPerson = { id: string; name: string; phone: string; email: string; payment: string; note: string; answers: { label: string; answer: string }[]; tag: string };
/** One start on that list: a class with everyone in it, or a single visit. */
export type DayListGroup = { key: string; time: string; serviceName: string; people: DayListPerson[] };

/**
 * Who is coming on one day, in time order, for the door: each start with its people, their contact details, what is
 * paid or still owed, their note and their answers. `list` is one day of `byDay` (cancelled bookings already left out).
 */
export function dayList(list: readonly Booking[], zone: string): DayListGroup[] {
  const groups = new Map<string, DayListGroup>();
  for (const b of [...list].sort((x, y) => x.start.localeCompare(y.start) || x.serviceName.localeCompare(y.serviceName))) {
    if (b.status === "cancelled") continue;
    const key = `${b.serviceId}|${b.start}`;
    if (!groups.has(key)) groups.set(key, { key, time: timeText(b.start, zone), serviceName: b.serviceName, people: [] });
    groups.get(key)!.people.push({
      id: b.id, name: b.customer.name, phone: b.customer.phone || "", email: b.customer.email, payment: paymentText(b), note: b.note || "",
      answers: (b.answers || []).filter((a) => a.answer), tag: b.status === "held" ? "Not confirmed yet" : b.noShow ? "No-show" : "",
    });
  }
  return [...groups.values()];
}

/** The same list as spreadsheet rows, a header first. Each question the day's services ask gets its own column. */
export function dayListRows(groups: readonly DayListGroup[]): string[][] {
  const questions = [...new Set(groups.flatMap((g) => g.people.flatMap((p) => p.answers.map((a) => a.label))))];
  const rows = [["Time", "Service", "Name", "Phone", "Email", "Payment", "Note", ...questions]];
  for (const g of groups) for (const p of g.people) {
    rows.push([g.time, g.serviceName, p.name, p.phone, p.email, p.tag ? `${p.payment} (${p.tag})` : p.payment, p.note, ...questions.map((q) => p.answers.find((a) => a.label === q)?.answer || "")]);
  }
  return rows;
}

/** "5 of 8 booked", or "Full" when every place is taken. */
export const classCount = (people: number, places: number): string => (people >= places ? `Full · ${people} booked` : `${people} of ${places} booked`);

/** The waiting list by day, each day's people in the order they asked. */
export function waitingByDay(list: readonly Waiting[]): Map<string, Waiting[]> {
  const out = new Map<string, Waiting[]>();
  for (const w of [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) out.set(w.day, [...(out.get(w.day) || []), w]);
  return out;
}

/** A place held for someone on the waiting list, on the calendar: a class card shows it among its people, any other one as its own row. */
export type HeldPlace = Waiting & { heldUntil: string; heldStart: string };

/** The places held for the waiting list on one day, earliest first. */
export function heldPlaces(list: readonly Waiting[]): HeldPlace[] {
  return list.filter((w): w is HeldPlace => !!w.heldUntil && !!w.heldStart).sort((a, b) => a.heldStart.localeCompare(b.heldStart));
}

/** Splits a day's held places into those inside a class card (by service and start) and the rest. */
export function placeHolds(held: readonly HeldPlace[], classes: readonly { serviceId: string; start: string }[]): { inClass: (serviceId: string, start: string) => HeldPlace[]; loose: HeldPlace[] } {
  const key = (serviceId: string, start: string) => `${serviceId}|${Date.parse(start)}`;
  const slots = new Set(classes.map((c) => key(c.serviceId, c.start)));
  return {
    inClass: (serviceId, start) => held.filter((h) => key(h.serviceId, h.heldStart) === key(serviceId, start)),
    loose: held.filter((h) => !slots.has(key(h.serviceId, h.heldStart))),
  };
}

/** "1 waiting", "3 waiting". */
export const waitingText = (count: number): string => `${count} waiting`;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** The Monday of the week a day falls in. */
export function weekStartOf(day: string): string {
  const wd = weekdayOf(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

/** The seven days from a Monday. */
export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export function timeText(iso: string, zone: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" });
}

export function dayText(day: string, style: "short" | "long" = "short"): string {
  const d = new Date(`${day}T12:00:00Z`);
  return style === "long"
    ? d.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
    : d.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", day: "numeric" });
}

/** "16–22 November 2026", or across months "30 November – 6 December 2026". */
export function weekText(monday: string): string {
  const a = new Date(`${monday}T12:00:00Z`);
  const b = new Date(`${addDays(monday, 6)}T12:00:00Z`);
  const month = (d: Date) => d.toLocaleDateString(undefined, { timeZone: "UTC", month: "long" });
  const year = b.getUTCFullYear();
  return month(a) === month(b)
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${month(b)} ${year}`
    : `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)} ${year}`;
}

export function moneyText(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Bookings still on (held or confirmed), grouped by the shop's day, earliest first. */
export function byDay(rows: readonly Booking[], zone: string): Map<string, Booking[]> {
  const out = new Map<string, Booking[]>();
  for (const b of [...rows].sort((x, y) => x.start.localeCompare(y.start))) {
    if (b.status === "cancelled") continue;
    const day = dayOf(Date.parse(b.start), zone);
    out.set(day, [...(out.get(day) || []), b]);
  }
  return out;
}

/** The next booking still to come (or under way), or null. */
export function nextUp(rows: readonly Booking[], nowMs: number): Booking | null {
  return [...rows]
    .filter((b) => b.status === "confirmed" && Date.parse(b.end) > nowMs)
    .sort((a, b) => a.start.localeCompare(b.start))[0] || null;
}

/** "in 25 minutes", "in 3 hours", "tomorrow", "on Friday", "now" for the Next up tile. */
export function whenFromNow(b: Booking, nowMs: number, zone: string): string {
  const start = Date.parse(b.start);
  if (start <= nowMs) return "now";
  const mins = Math.round((start - nowMs) / 60_000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const today = dayOf(nowMs, zone);
  const day = dayOf(start, zone);
  if (day === today) return `in ${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? "" : "s"}`;
  if (day === addDays(today, 1)) return "tomorrow";
  if (day <= addDays(today, 6)) return `on ${WEEKDAYS[weekdayOf(day)]}`;
  return `on ${dayText(day, "long")}`;
}

/** How a booking is paid, in plain words. */
export function paymentText(b: Pick<Booking, "payment" | "paid" | "priceMinor" | "depositMinor" | "depositPaid" | "currency" | "refund" | "status" | "clearing">): string {
  const onCard = cardTaken(b);
  if (b.refund?.amountMinor) return b.refund.amountMinor < onCard ? `Refunded ${moneyText(b.refund.amountMinor, b.currency)} of ${moneyText(onCard, b.currency)}` : `Refunded ${moneyText(b.refund.amountMinor, b.currency)}`;
  if ((b.payment === "card" || b.payment === "deposit") && !onCard && b.status === "held" && b.clearing) return "Bank payment clearing";
  if (b.payment === "free") return "Free";
  if (b.payment === "deposit") {
    if (b.paid) return `Paid ${moneyText(b.priceMinor, b.currency)} (${moneyText(b.depositMinor || 0, b.currency)} deposit by card, the rest at the shop)`;
    if (b.depositPaid) return `${moneyText(b.depositMinor || 0, b.currency)} deposit paid by card, ${moneyText(balanceDue(b), b.currency)} to pay at the shop`;
    return b.status === "held" ? "Paying the deposit now" : "Deposit not paid";
  }
  if (b.payment === "card") return b.paid ? `Paid ${moneyText(b.priceMinor, b.currency)} by card` : b.status === "held" ? "Paying now" : "Not paid";
  return b.paid ? `Paid ${moneyText(b.priceMinor, b.currency)} at the shop` : `${moneyText(b.priceMinor, b.currency)} to pay at the shop`;
}

/** The figures over the week strip: bookings this week, hours booked, and money taken by card. */
export function weekFigures(rows: readonly Booking[]): { count: number; hours: number; takenMinor: number } {
  const live = rows.filter((b) => b.status === "confirmed");
  return {
    count: live.length,
    hours: Math.round(live.reduce((n, b) => n + b.minutes, 0) / 6) / 10,
    takenMinor: live.reduce((n, b) => n + moneyTaken(b), 0),
  };
}

/** The opening hours one line per day ("Mon 10:00–17:00"). */
export const hoursLine = (windows: { start: string; end: string }[]): string => (windows.length ? windows.map((w) => `${w.start}–${w.end}`).join(", ") : "Closed");

// ── Figures (the Figures tab): the last few months, by each booking's own day in the shop's zone ──────────────────

export type MonthFigures = { month: string; count: number; takenMinor: number; noShows: number; cancelled: number };
export type BookingFigures = {
  months: MonthFigures[]; count: number; takenMinor: number; noShows: number; cancelled: number;
  /** No-shows out of the bookings whose time has passed, 0 to 100, or null before any has. */
  noShowPercent: number | null;
  /** Bookings by weekday, Monday first. */
  weekdays: { day: string; count: number }[];
  /** The most booked services, most first. */
  services: { name: string; count: number }[];
};

/** The last `n` months up to the one `today` (YYYY-MM-DD) is in, oldest first, as YYYY-MM. */
export function lastMonths(today: string, n: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(year, month - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** Money to the nearest whole unit ("CA$280"), for the small labels under a chart. */
export function moneyShort(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(minor / 100));
  } catch {
    return `${Math.round(minor / 100)} ${currency}`;
  }
}

/** "Nov", or "Nov 2026" in the long style. */
export function monthText(month: string, style: "short" | "long" = "short"): string {
  const d = new Date(`${month}-15T12:00:00Z`);
  return d.toLocaleDateString(undefined, { timeZone: "UTC", month: style === "long" ? "long" : "short", ...(style === "long" ? { year: "numeric" } : {}) });
}

/**
 * What the months held. A booking counts once it is confirmed (a no-show still counts: the time was kept for them);
 * one still being paid for doesn't. Money is what was paid, by card or at the shop, less anything refunded, so a
 * cancelled booking's kept deposit is in. Cancelled bookings are only counted as cancelled.
 */
export function bookingFigures(rows: readonly Booking[], zone: string, months: readonly string[], nowMs: number): BookingFigures {
  const byMonth = new Map<string, MonthFigures>(months.map((m) => [m, { month: m, count: 0, takenMinor: 0, noShows: 0, cancelled: 0 }]));
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  const services = new Map<string, number>();
  let past = 0;
  for (const b of rows) {
    const startMs = Date.parse(b.start);
    const day = dayOf(startMs, zone);
    const m = byMonth.get(day.slice(0, 7));
    if (!m || b.status === "held") continue;
    m.takenMinor += moneyKept(b);
    if (b.status === "cancelled") { m.cancelled += 1; continue; }
    m.count += 1;
    if (b.noShow) m.noShows += 1;
    if (startMs < nowMs) past += 1;
    weekdays[(weekdayOf(day) + 6) % 7] += 1;
    services.set(b.serviceName, (services.get(b.serviceName) || 0) + 1);
  }
  const list = [...byMonth.values()];
  const sum = (pick: (m: MonthFigures) => number) => list.reduce((n, m) => n + pick(m), 0);
  const noShows = sum((m) => m.noShows);
  return {
    months: list, count: sum((m) => m.count), takenMinor: sum((m) => m.takenMinor), noShows, cancelled: sum((m) => m.cancelled),
    noShowPercent: past ? Math.round((noShows / past) * 100) : null,
    weekdays: weekdays.map((count, i) => ({ day: WEEKDAYS[(i + 1) % 7], count })),
    services: [...services].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
  };
}
