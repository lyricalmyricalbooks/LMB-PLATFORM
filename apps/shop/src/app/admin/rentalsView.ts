// Rentals (beta): the pure rules behind Admin › Rentals (Rentals.tsx): the item form and what it sends, how a rental
// reads, the figures at the top and where each rental sits on a unit's timeline. Times show on the shop's own clock.
import { priceMinorOf, priceText } from "./eventsView";
import type { RentalItem } from "../../shared/rentalRules";
import type { AdminRental, RentalStatus } from "./rentalsApi";

export type ItemForm = {
  id: string; name: string; description: string; photo: string; units: string; basis: "hour" | "day";
  hour: string; day: string; week: string; minLength: string; maxLength: string; cleanMinutes: string;
  opens: string; closes: string; daysAhead: string; chargeTax: boolean; status: "live" | "draft"; repair: number[];
};

export const blankItem = (): ItemForm => ({
  id: "", name: "", description: "", photo: "", units: "1", basis: "day", hour: "", day: "", week: "", minLength: "1", maxLength: "14",
  cleanMinutes: "0", opens: "10:00", closes: "18:00", daysAhead: "90", chargeTax: true, status: "live", repair: [],
});

export const formFromItem = (i: RentalItem): ItemForm => ({
  id: i.id, name: i.name, description: i.description, photo: i.photo, units: String(i.units), basis: i.basis,
  hour: priceText(i.hourMinor), day: priceText(i.dayMinor), week: priceText(i.weekMinor), minLength: String(i.minLength), maxLength: String(i.maxLength),
  cleanMinutes: String(i.cleanMinutes), opens: i.opens, closes: i.closes, daysAhead: String(i.daysAhead), chargeTax: i.chargeTax, status: i.status, repair: i.repair || [],
});

/** What the form sends, or the problem in plain words (the server checks the rest). */
export function itemToSave(f: ItemForm): Record<string, unknown> | { problem: string } {
  const prices = { hourMinor: priceMinorOf(f.hour), dayMinor: priceMinorOf(f.day), weekMinor: priceMinorOf(f.week) };
  if (Object.values(prices).some((p) => Number.isNaN(p))) return { problem: "Type prices as amounts, like 25 or 12.50." };
  const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
  const nums = { units: whole(f.units), minLength: whole(f.minLength), maxLength: whole(f.maxLength), cleanMinutes: whole(f.cleanMinutes || "0"), daysAhead: whole(f.daysAhead) };
  if (Object.values(nums).some((n) => Number.isNaN(n))) return { problem: "Use whole numbers for units, lengths and days." };
  return {
    ...(f.id ? { id: f.id } : {}), name: f.name, description: f.description, photo: f.photo, basis: f.basis, ...prices, ...nums,
    opens: f.opens, closes: f.closes, chargeTax: f.chargeTax, status: f.status, repair: f.repair,
  };
}

const STATUS: Record<RentalStatus, { label: string; tone: "info" | "success" | "warning" | "neutral" | "danger" }> = {
  held: { label: "Paying now", tone: "warning" }, paid: { label: "Booked", tone: "info" }, out: { label: "Picked up", tone: "success" },
  returned: { label: "Returned", tone: "neutral" }, cancelled: { label: "Cancelled", tone: "neutral" },
};
export const statusOf = (r: AdminRental) => STATUS[r.status];
/** A rental still out after its return time. */
export const isLate = (r: AdminRental, nowMs: number) => r.status === "out" && r.endMs < nowMs;

export function priceLine(i: RentalItem, money: (m: number) => string): string {
  const parts = [i.hourMinor && `${money(i.hourMinor)} an hour`, i.dayMinor && `${money(i.dayMinor)} a day`, i.weekMinor && `${money(i.weekMinor)} a week`].filter(Boolean);
  return parts.join(" · ");
}
export const lengthWords = (r: Pick<AdminRental, "length" | "basis">) => `${r.length} ${r.basis === "hour" ? (r.length === 1 ? "hour" : "hours") : (r.length === 1 ? "day" : "days")}`;

/** "Fri 20 Nov, 10:00 – 12:00" or "Fri 20 Nov – Thu 26 Nov", on the shop's clock. */
export function whenText(r: Pick<AdminRental, "startMs" | "endMs">, zone: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, weekday: "short", day: "numeric", month: "short" });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const a = new Date(r.startMs);
  const b = new Date(r.endMs);
  return day.format(a) === day.format(b) ? `${day.format(a)}, ${time.format(a)} – ${time.format(b)}` : `${day.format(a)} – ${day.format(b)}`;
}

/** The figures at the top: out now, picked up today, coming in the next week, and money taken this month. */
export function rentalTotals(rentals: AdminRental[], nowMs: number) {
  const week = nowMs + 7 * 86_400_000;
  const month = new Date(nowMs).toISOString().slice(0, 7);
  const live = rentals.filter((r) => r.status !== "cancelled" && r.status !== "held");
  return {
    out: live.filter((r) => r.status === "out").length,
    late: live.filter((r) => isLate(r, nowMs)).length,
    coming: live.filter((r) => r.status === "paid" && r.startMs > nowMs && r.startMs < week).length,
    monthMinor: rentals.filter((r) => r.paidAt.slice(0, 7) === month).reduce((s, r) => s + r.chargedMinor - r.refundedMinor, 0),
  };
}

/** Where each rental sits on a unit's row in a window: left and width as percentages. */
export function timelineRows(item: RentalItem, rentals: AdminRental[], fromMs: number, toMs: number, nowMs = fromMs) {
  const span = toMs - fromMs;
  return Array.from({ length: item.units }, (_, i) => i + 1).map((unit) => ({
    unit,
    repair: !!item.repair?.includes(unit),
    bars: rentals
      // A rental still out after its return time runs on to now, so a late one stays in sight.
      .map((r) => (r.status === "out" && r.endMs < nowMs ? { ...r, endMs: nowMs } : r))
      .filter((r) => r.itemId === item.id && r.unit === unit && r.status !== "cancelled" && r.endMs > fromMs && r.startMs < toMs)
      .map((r) => {
        const left = Math.max(0, (r.startMs - fromMs) / span) * 100;
        const right = Math.min(1, (r.endMs - fromMs) / span) * 100;
        return { rental: r, left, width: Math.max(1, right - left), late: r.status === "out" && r.endMs === nowMs && nowMs > fromMs };
      }),
  }));
}
