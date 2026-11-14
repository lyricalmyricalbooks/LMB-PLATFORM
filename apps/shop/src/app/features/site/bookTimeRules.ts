// Book a time page (features/site/BookTime.tsx): the pure rules. Days and times are the shop's own (the server sends its
// time zone), so a shopper abroad sees the times the shop keeps, with the zone named under the picker.
import { addDays } from "../../../shared/bookingTimes";

export type BookingServiceView = { id: string; name: string; description: string; minutes: number; priceMinor: number; payment: "free" | "full"; location: string };
export type BookingInfo = { on: boolean; zone?: string; currency?: string; cancelHours?: number; maxDaysAhead?: number; today?: string; services?: BookingServiceView[] };
export type BookingView = {
  id: string; serviceId: string; serviceName: string; minutes: number; location: string; start: string; end: string;
  status: "held" | "confirmed" | "cancelled"; payment: "free" | "card" | "atShop"; paid: boolean; priceMinor: number; currency: string;
  name: string; email: string; refunded: boolean; canChange: boolean; cancelHours: number;
};

/** How many days the picker shows at once. */
export const DAYS_SHOWN = 7;

/** A service is paid up front only when it costs something and the owner asked for payment. */
export const paysUpFront = (s: Pick<BookingServiceView, "payment" | "priceMinor">) => s.payment === "full" && s.priceMinor > 0;

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
