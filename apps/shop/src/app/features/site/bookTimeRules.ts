// Book a time page (features/site/BookTime.tsx): the pure rules. Days and times are the shop's own (the server sends its
// time zone), so a shopper abroad sees the times the shop keeps, with the zone named under the picker.
import { addDays, depositOf } from "../../../shared/bookingTimes";

import type { BookingQuestion } from "../../../shared/bookingTimes";
export type BookingServiceView = { id: string; name: string; description: string; minutes: number; priceMinor: number; payment: "free" | "full" | "deposit" | "atShop"; /** With payment "deposit": the deposit as an amount, or as a percent of the price. */ depositMinor?: number; depositPercent?: number; location: string; questions?: BookingQuestion[]; /** Above 1: a group class with this many places at each time. */ places?: number };
export type BookingInfo = { on: boolean; zone?: string; currency?: string; cancelHours?: number; maxDaysAhead?: number; today?: string; services?: BookingServiceView[] };
export type BookingView = {
  id: string; serviceId: string; serviceName: string; minutes: number; location: string; start: string; end: string;
  status: "held" | "confirmed" | "cancelled"; payment: "free" | "card" | "deposit" | "atShop"; paid: boolean; priceMinor: number; currency: string;
  /** With payment "deposit": what was asked by card when booking, whether it is paid, and what is left for the visit. */
  depositMinor?: number; depositPaid?: boolean; dueMinor?: number;
  name: string; email: string; refunded: boolean; canChange: boolean; cancelHours: number;
};

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
export function wantedFromSearch(search: string): { service: string; day: string; offer: string; offerKey: string } {
  const q = new URLSearchParams(search);
  const service = q.get("service") || "";
  const day = q.get("day") || "";
  // A place held for this person from the waiting list (the email's link): both parts or neither.
  const offer = q.get("offer") || "";
  const offerKey = q.get("offerKey") || "";
  const held = /^[a-f0-9]{32}$/.test(offer) && /^[a-f0-9]{48}$/.test(offerKey);
  return {
    service: /^[A-Za-z0-9_-]{1,60}$/.test(service) ? service : "", day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "",
    offer: held ? offer : "", offerKey: held ? offerKey : "",
  };
}

/** The services a "Book a time" section shows: none while bookings are off, else the first few in the shop's order. */
export function sectionServices(info: BookingInfo | null, max: unknown): BookingServiceView[] {
  if (!info?.on || !info.services?.length) return [];
  const n = Math.round(Number(max));
  return info.services.slice(0, Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : 3);
}
