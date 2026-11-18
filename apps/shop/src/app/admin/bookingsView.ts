// Bookings (beta): the admin page's pure rules (bookingsView.test.ts). Days and times are the shop's own
// (src/shared/shopTimeZone.ts), whatever the owner's computer is set to.
import { addDays, balanceDue, cardAsk, cardTaken, commissionOf, dayOf, moneyKept, moneyTaken, taxIn, tipTaken, weekdayOf, zonedTime, type BookingSettings, type HoursWindow, type StaffMember } from "../../shared/bookingTimes";
import type { Booking, PackRow, Waiting } from "./bookingsApi";
import { shopMoney } from "../../shared/shopCurrency";

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
  if (currency === "CAD" || currency === "USD") return shopMoney(minor / 100, currency);
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

/** A saved card as the owner sees it: "Visa ending 4242". */
export function cardText(card: { brand?: string; last4?: string } | null | undefined): string {
  if (!card) return "";
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card";
  return card.last4 ? `${brand} ending ${card.last4}` : "A card";
}

/** How a booking is paid, in plain words. */
export function paymentText(b: Pick<Booking, "payment" | "paid" | "priceMinor" | "depositMinor" | "depositPaid" | "currency" | "refund" | "status" | "clearing" | "rest" | "giftCard"> & { pack?: Booking["pack"] }): string {
  if (b.payment === "pack") {
    const visit = b.pack?.visit && b.pack.visits ? `, visit ${b.pack.visit} of ${b.pack.visits}` : "";
    return `With their pack${b.pack?.last4 ? ` ending ${b.pack.last4}` : ""}${visit}${b.pack?.returned ? " (visit put back)" : ""}`;
  }
  const onCard = cardTaken(b);
  // How what was paid when booked came in: by card, a gift card, or both.
  const by = !b.giftCard?.amountMinor ? "by card" : cardAsk(b) > 0 ? "by card and gift card" : "by gift card";
  // The rest paid later from the booking page: all of it by card in the end.
  if (b.rest?.amountMinor && !b.refund?.amountMinor) return `Paid ${moneyText(onCard, b.currency)} by card${b.payment === "deposit" ? " (deposit, then the rest online)" : " online"}`;
  if (b.refund?.amountMinor) return b.refund.amountMinor < onCard ? `Refunded ${moneyText(b.refund.amountMinor, b.currency)} of ${moneyText(onCard, b.currency)}` : `Refunded ${moneyText(b.refund.amountMinor, b.currency)}`;
  if ((b.payment === "card" || b.payment === "deposit") && !onCard && b.status === "held" && b.clearing) return "Bank payment clearing";
  if (b.payment === "free") return "Free";
  if (b.payment === "deposit") {
    if (b.paid) return `Paid ${moneyText(b.priceMinor, b.currency)} (${moneyText(b.depositMinor || 0, b.currency)} deposit ${by}, the rest at the shop)`;
    if (b.depositPaid) return `${moneyText(b.depositMinor || 0, b.currency)} deposit paid ${by}, ${moneyText(balanceDue(b), b.currency)} to pay at the shop`;
    return b.status === "held" ? "Paying the deposit now" : "Deposit not paid";
  }
  if (b.payment === "card") return b.paid ? `Paid ${moneyText(b.priceMinor, b.currency)} ${by}` : b.status === "held" ? "Paying now" : "Not paid";
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

/** What the Calendar's list shows: what is still to come, what has happened, or what was cancelled. */
export type ListMode = "upcoming" | "past" | "cancelled";
/** How far the list looks: three months ahead, two months back (cancelled covers both). */
export const LIST_AHEAD_DAYS = 90;
export const LIST_BACK_DAYS = 60;

/** The start times the list reads for a mode, as ISO times around now. */
export function listRange(mode: ListMode, nowMs: number): { from: string; to: string } {
  const iso = (ms: number) => new Date(ms).toISOString();
  const day = 86_400_000;
  if (mode === "upcoming") return { from: iso(nowMs - day), to: iso(nowMs + LIST_AHEAD_DAYS * day) };
  if (mode === "past") return { from: iso(nowMs - LIST_BACK_DAYS * day), to: iso(nowMs + 3600_000) };
  return { from: iso(nowMs - LIST_BACK_DAYS * day), to: iso(nowMs + LIST_AHEAD_DAYS * day) };
}

/** Lower case with accents taken off, so "zoe" finds "Zoë". */
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** One day of the Calendar's list. */
export type ListDay = { day: string; rows: Booking[] };

/**
 * The Calendar's list: bookings for the mode, matching the search (name, email, phone or service) and the service
 * picked, grouped by the shop's day. What is to come reads earliest first; the past and cancelled read newest first.
 */
export function bookingList(rows: readonly Booking[], opts: { mode: ListMode; query: string; serviceId: string; nowMs: number; zone: string }): ListDay[] {
  const words = plain(opts.query).split(/\s+/).filter(Boolean);
  const keep = rows.filter((b) => {
    if (opts.mode === "cancelled" ? b.status !== "cancelled" : b.status === "cancelled") return false;
    if (opts.mode === "upcoming" && Date.parse(b.end) <= opts.nowMs) return false;
    if (opts.mode === "past" && Date.parse(b.end) > opts.nowMs) return false;
    if (opts.serviceId && b.serviceId !== opts.serviceId) return false;
    if (!words.length) return true;
    const hay = plain([b.customer.name, b.customer.email, b.customer.phone || "", b.serviceName].join(" "));
    return words.every((w) => hay.includes(w));
  });
  const newestFirst = opts.mode !== "upcoming";
  keep.sort((x, y) => (newestFirst ? y.start.localeCompare(x.start) : x.start.localeCompare(y.start)) || x.customer.name.localeCompare(y.customer.name));
  const out: ListDay[] = [];
  for (const b of keep) {
    const day = dayOf(Date.parse(b.start), opts.zone);
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(b);
    else out.push({ day, rows: [b] });
  }
  // Within a past day, read the day top to bottom as it happened.
  if (newestFirst) for (const d of out) d.rows.reverse();
  return out;
}

/** The short tag a list row carries, or "" when the booking is plainly on. */
export function listTag(b: Pick<Booking, "status" | "noShow" | "clearing">): string {
  if (b.status === "cancelled") return "Cancelled";
  if (b.status === "held") return b.clearing ? "Payment clearing" : "Paying now";
  return b.noShow ? "No-show" : "";
}

/** Where a pack stands, for the Packs list: what the badge says and its tone. `today` is the shop's day (YYYY-MM-DD). */
export function packState(p: Pick<PackRow, "status" | "left" | "expiresOn">, today: string): { label: string; tone: "success" | "neutral" | "warning" } {
  if (p.status === "closed") return { label: "Closed", tone: "neutral" };
  if (p.left <= 0) return { label: "Used up", tone: "neutral" };
  if (p.expiresOn && p.expiresOn < today) return { label: "Ended", tone: "neutral" };
  if (p.expiresOn && p.expiresOn <= addDays(today, 14)) return { label: "Ends soon", tone: "warning" };
  return { label: "Active", tone: "success" };
}

/** "3 of 5 left", the pack's visits still to book. */
export const packLeftText = (p: Pick<PackRow, "left" | "visits">): string => `${Math.max(0, p.left)} of ${p.visits} left`;

/** The Packs list: open packs first (fewest visits left first, so the ones running out show), then the rest, newest first. */
export function packList(rows: readonly PackRow[], { query = "", today }: { query?: string; today: string }): PackRow[] {
  const q = plain(query.trim());
  const open = (p: PackRow) => packState(p, today).tone !== "neutral";
  return rows
    .filter((p) => !q || [p.name, p.email, p.serviceName, p.last4].some((v) => plain(v || "").includes(q)))
    .sort((a, b) => Number(open(b)) - Number(open(a)) || (open(a) ? a.left - b.left : String(b.paidAt || "").localeCompare(String(a.paidAt || ""))));
}

// ── The team's day (Services plan phase 4 part 2): one column per person ─────────────────────────────────────────

/** One card in a person's column: a visit, or everyone in one start of a class. `top`/`height` are minutes from the grid's start. */
export type TeamBlock = { key: string; start: string; end: string; serviceName: string; people: Booking[]; top: number; height: number; lane: number; lanes: number };
/** One column: a person (off that day or not), or the bookings nobody is named on. */
export type TeamColumn = { id: string; name: string; off: boolean; hours: HoursWindow[]; blocks: TeamBlock[] };
export type TeamDay = { startMin: number; endMin: number; columns: TeamColumn[]; count: number };
/** The column for bookings with no person on them (made before the team was listed, or by the owner for nobody). */
export const NOBODY = "";

const minutesOf = (hhmm: string): number => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

/**
 * A day laid out for the team view. Columns: every active person in team order, anyone switched off who still has
 * bookings that day, then "Not assigned" when a booking names nobody (or someone no longer listed). The grid runs from
 * the earliest opening (the shop's or a person's) to the latest close, stretched to fit every booking, in whole hours.
 * Cards that overlap in one column sit side by side (`lane` of `lanes`).
 */
export function teamDay(rows: readonly Booking[], settings: Pick<BookingSettings, "staff" | "hours" | "daysOff">, day: string, zone: string): TeamDay {
  const wd = weekdayOf(day);
  const shopOff = settings.daysOff.includes(day);
  const dayStart = zonedTime(day, "00:00", zone);
  const list = (byDay(rows, zone).get(day) || []);
  const staff = settings.staff || [];
  const known = new Set(staff.map((p) => p.id));
  const whose = (b: Booking) => (b.staffId && known.has(b.staffId) ? b.staffId : NOBODY);
  const columns: TeamColumn[] = staff
    .filter((p) => p.active || list.some((b) => b.staffId === p.id))
    .map((p) => {
      const hours = shopOff || p.daysOff.includes(day) ? [] : (p.ownHours ? p.hours[wd] : settings.hours[wd]) || [];
      return { id: p.id, name: p.name, off: hours.length === 0, hours, blocks: [] };
    });
  if (list.some((b) => whose(b) === NOBODY)) columns.push({ id: NOBODY, name: "Not assigned", off: false, hours: [], blocks: [] });
  const minute = (iso: string) => Math.round((Date.parse(iso) - dayStart) / 60_000);
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of columns) for (const w of c.hours) { lo = Math.min(lo, minutesOf(w.start)); hi = Math.max(hi, minutesOf(w.end)); }
  if (!shopOff) for (const w of settings.hours[wd] || []) { lo = Math.min(lo, minutesOf(w.start)); hi = Math.max(hi, minutesOf(w.end)); }
  for (const b of list) { lo = Math.min(lo, minute(b.start)); hi = Math.max(hi, minute(b.end)); }
  if (!Number.isFinite(lo)) { lo = 9 * 60; hi = 17 * 60; }
  const startMin = Math.max(0, Math.floor(lo / 60) * 60);
  const endMin = Math.min(24 * 60, Math.max(startMin + 60, Math.ceil(hi / 60) * 60));
  for (const c of columns) {
    const mine = list.filter((b) => whose(b) === c.id);
    const groups = new Map<string, TeamBlock>();
    for (const b of mine) {
      const key = `${b.serviceId}|${b.start}`;
      const found = groups.get(key);
      if (found) { found.people.push(b); continue; }
      const top = Math.max(0, minute(b.start) - startMin);
      groups.set(key, { key, start: b.start, end: b.end, serviceName: b.serviceName, people: [b], top, height: Math.max(15, minute(b.end) - startMin - top), lane: 0, lanes: 1 });
    }
    const blocks = sideBySide([...groups.values()]);
    c.blocks = blocks;
  }
  return { startMin, endMin, columns, count: list.length };
}

/** Cards that overlap sit side by side: each takes the first lane free at its start; a cluster shares one width. Sorted by top. */
function sideBySide<T extends { top: number; height: number; lane: number; lanes: number }>(cards: T[]): T[] {
  const blocks = [...cards].sort((x, y) => x.top - y.top);
  let cluster: T[] = [];
  let clusterEnd = -1;
  const close = () => { const lanes = Math.max(1, ...cluster.map((x) => x.lane + 1)); for (const x of cluster) x.lanes = lanes; cluster = []; };
  for (const blk of blocks) {
    if (blk.top >= clusterEnd) { close(); clusterEnd = -1; }
    const busy = new Set(cluster.filter((x) => x.top + x.height > blk.top).map((x) => x.lane));
    let lane = 0;
    while (busy.has(lane)) lane += 1;
    blk.lane = lane;
    cluster.push(blk);
    clusterEnd = Math.max(clusterEnd, blk.top + blk.height);
  }
  close();
  return blocks;
}

// ── The week as an hour grid (bookings plan 4, step 1.1) ────────────────────────────────────────────────────────────

/** Four inks a card can wear; a person keeps theirs (team order), else the service does (services order). */
export const INKS = 4;
/** One card on the week grid: a visit, or everyone in one start of a class. `top`/`height` are minutes from the grid's start. */
export type WeekBlock = TeamBlock & { serviceId: string; places: number; ink: number };
export type WeekColumn = { day: string; closed: boolean; hours: HoursWindow[]; blocks: WeekBlock[] };
export type WeekGrid = { startMin: number; endMin: number; days: WeekColumn[] };

/**
 * The week on show as an hour grid: seven day columns, each booking placed by its time and length, overlapping ones side
 * by side, the people in one start of a class on one card. The grid runs from the week's earliest opening to its latest
 * close (the shop's or a person's), stretched to fit every booking, in whole hours; 9 to 5 when nothing is set.
 */
export function weekGrid(rows: readonly Booking[], settings: Pick<BookingSettings, "staff" | "hours" | "daysOff">, services: readonly { id: string; places?: number }[], monday: string, zone: string): WeekGrid {
  const groups = byDay(rows, zone);
  const staffInk = new Map((settings.staff || []).map((p, i) => [p.id, i % INKS]));
  const serviceInk = new Map(services.map((sv, i) => [sv.id, i % INKS]));
  const placesOf = (id: string) => services.find((sv) => sv.id === id)?.places || 1;
  let lo = Infinity;
  let hi = -Infinity;
  const days = weekDays(monday).map((day) => {
    const wd = weekdayOf(day);
    const shut = settings.daysOff.includes(day);
    const hours = shut ? [] : settings.hours[wd] || [];
    for (const w of hours) { lo = Math.min(lo, minutesOf(w.start)); hi = Math.max(hi, minutesOf(w.end)); }
    if (!shut) for (const p of settings.staff || []) if (p.active && p.ownHours && !p.daysOff.includes(day)) for (const w of p.hours[wd] || []) { lo = Math.min(lo, minutesOf(w.start)); hi = Math.max(hi, minutesOf(w.end)); }
    const dayStart = zonedTime(day, "00:00", zone);
    const list = groups.get(day) || [];
    for (const b of list) { lo = Math.min(lo, (Date.parse(b.start) - dayStart) / 60_000); hi = Math.max(hi, (Date.parse(b.end) - dayStart) / 60_000); }
    return { day, closed: hours.length === 0, hours, list, dayStart };
  });
  if (!Number.isFinite(lo)) { lo = 9 * 60; hi = 17 * 60; }
  const startMin = Math.max(0, Math.floor(lo / 60) * 60);
  const endMin = Math.min(24 * 60, Math.max(startMin + 60, Math.ceil(hi / 60) * 60));
  return {
    startMin, endMin,
    days: days.map(({ day, closed, hours, list, dayStart }) => {
      const minute = (iso: string) => Math.round((Date.parse(iso) - dayStart) / 60_000);
      const cards = new Map<string, WeekBlock>();
      for (const b of list) {
        const places = placesOf(b.serviceId);
        const key = places > 1 ? `${b.serviceId}|${b.start}` : b.id;
        const found = cards.get(key);
        if (found) { found.people.push(b); continue; }
        const top = Math.max(0, minute(b.start) - startMin);
        const ink = b.staffId && staffInk.has(b.staffId) ? staffInk.get(b.staffId)! : serviceInk.get(b.serviceId) ?? 0;
        cards.set(key, { key, start: b.start, end: b.end, serviceId: b.serviceId, serviceName: b.serviceName, places, people: [b], top, height: Math.max(15, minute(b.end) - startMin - top), lane: 0, lanes: 1, ink });
      }
      return { day, closed, hours, blocks: sideBySide([...cards.values()]) };
    }),
  };
}

/** The start a tap on an empty part of a day column asks for: the minute rounded down to a quarter hour, as a time. */
export function tappedTime(day: string, minuteOfDay: number, zone: string): string {
  const m = Math.max(0, Math.min(24 * 60 - 15, Math.floor(minuteOfDay / 15) * 15));
  return new Date(zonedTime(day, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, zone)).toISOString();
}

/** "9 AM", "12 PM", "1:30 PM" for a minute of the day on the grid's edge. */
export function hourLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Team pay (Services plan 2, extras): for one month (YYYY-MM, the shop's own days), each person's visits, what their
 * bookings took before tax (`moneyKept` less the tax in it, so a kept fee or deposit counts and refunds come off), their
 * commission on that at their own share, and their tips. Worked out to show, never paid from here. A booking with no
 * person goes on an "Not given to anyone" line; a person removed since keeps their name from the booking.
 */
export type PayLine = { id: string; name: string; visits: number; takenMinor: number; percent: number; commissionMinor: number; tipsMinor: number };
export type TeamPay = { month: string; people: PayLine[]; takenMinor: number; commissionMinor: number; tipsMinor: number };

export function teamPay(rows: readonly Booking[], staff: readonly StaffMember[], zone: string, month: string, now = Date.now()): TeamPay {
  const lines = new Map<string, PayLine>();
  const line = (id: string, name: string, percent: number) => {
    if (!lines.has(id)) lines.set(id, { id, name, visits: 0, takenMinor: 0, percent, commissionMinor: 0, tipsMinor: 0 });
    return lines.get(id)!;
  };
  for (const p of staff) line(p.id, p.name, commissionOf(p.commissionPercent));
  for (const b of rows) {
    if (b.status === "held" || dayOf(Date.parse(b.start), zone).slice(0, 7) !== month) continue;
    const id = b.staffId || NOBODY;
    const l = line(id, id ? b.staffName || "Someone no longer listed" : "Not given to anyone", 0);
    const kept = moneyKept(b);
    l.takenMinor += kept - taxIn(b, kept);
    l.tipsMinor += tipTaken(b);
    // A visit counts once it has started; later ones this month aren't visits yet.
    if (b.status === "confirmed" && !b.noShow && Date.parse(b.start) <= now) l.visits += 1;
  }
  const people = [...lines.values()]
    .filter((l) => l.visits || l.takenMinor || l.tipsMinor || staff.some((p) => p.id === l.id && p.active))
    .map((l) => ({ ...l, commissionMinor: l.id ? Math.round((l.takenMinor * l.percent) / 100) : 0 }))
    .sort((a, b) => Number(!a.id) - Number(!b.id) || b.takenMinor - a.takenMinor || a.name.localeCompare(b.name));
  const sum = (k: "takenMinor" | "commissionMinor" | "tipsMinor") => people.reduce((n, l) => n + l[k], 0);
  return { month, people, takenMinor: sum("takenMinor"), commissionMinor: sum("commissionMinor"), tipsMinor: sum("tipsMinor") };
}

/** The pay report as spreadsheet rows (amounts as plain numbers in the shop's currency). */
export function teamPayRows(pay: TeamPay): string[][] {
  const money = (minor: number) => (minor / 100).toFixed(2);
  return [
    ["Person", "Visits", "Taken before tax", "Commission %", "Commission", "Tips", "Commission and tips"],
    ...pay.people.map((l) => [l.name, String(l.visits), money(l.takenMinor), l.id ? String(l.percent) : "", money(l.commissionMinor), money(l.tipsMinor), money(l.commissionMinor + l.tipsMinor)]),
    ["Total", String(pay.people.reduce((n, l) => n + l.visits, 0)), money(pay.takenMinor), "", money(pay.commissionMinor), money(pay.tipsMinor), money(pay.commissionMinor + pay.tipsMinor)],
  ];
}


/**
 * Share your booking page (Beta, Services plan 2 extras): the link that opens the booking page, a service already picked
 * (`service`), and a person (`with`), as the booking page reads them (`wantedFromSearch` in features/site/bookTimeRules).
 */
export function bookingShareLink(pageUrl: string, pick: { service?: string; person?: string } = {}): string {
  const url = new URL(pageUrl);
  if (pick.service) url.searchParams.set("service", pick.service);
  if (pick.person) url.searchParams.set("with", pick.person);
  return url.toString();
}

const htmlText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A Book now button to paste into another website: a plain link that opens the booking page in a new tab (the shop's
 * pages never open inside another site's frame). Its look is written into the button so it works on any website.
 */
export function bookButtonHtml(link: string, label: string, look: "dark" | "light" = "dark"): string {
  const colours = look === "dark" ? "background:#111111;color:#ffffff;border:2px solid #111111" : "background:#ffffff;color:#111111;border:2px solid #111111";
  return `<a href="${htmlText(link)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;border-radius:999px;${colours};font:600 16px/1.2 system-ui,sans-serif;text-decoration:none">${htmlText(label.trim() || "Book now")}</a>`;
}
