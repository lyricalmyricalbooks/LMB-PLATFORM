// Sale countdown on book pages (Studio › Style › Book page · photos & layout › showPdpSaleCountdown, off by
// default). A dated sale (Books › edit › Pricing › Sale ends, a Toronto shop date, inclusive) ends at the next
// Toronto midnight; inside the last `withinHours` the "Sale ends {date}" line counts down instead. Pure.
import { shopInstant } from "./shopTime";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The instant a sale whose last day is `endDate` (YYYY-MM-DD) stops: midnight Toronto after that day. NaN if invalid. */
export function saleStopsAt(endDate: string): number {
  const m = DATE_ONLY.exec(String(endDate || ""));
  if (!m) return NaN;
  const next = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1)).toISOString().slice(0, 10);
  return shopInstant(next);
}

export type SaleCountdown = { days: number; hours: number; minutes: number };

/** Time left, rounded up to the minute, or null when there is no end, it has passed or it is further off than `withinHours`. */
export function saleCountdown(endDate: string, nowMs: number, withinHours: number): SaleCountdown | null {
  const stop = saleStopsAt(endDate);
  if (!Number.isFinite(stop) || !Number.isFinite(nowMs)) return null;
  const left = stop - nowMs;
  if (left <= 0 || !(withinHours > 0) || left > withinHours * 3_600_000) return null;
  const total = Math.ceil(left / 60_000);
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** Which Text & labels line says it, and its {placeholders}. */
export function saleCountdownCopy(c: SaleCountdown): { key: string; values: Record<string, string> } {
  const values = { days: String(c.days), hours: String(c.hours), minutes: String(c.minutes) };
  if (c.days > 0) return { key: "pdpSaleCountdownDays", values };
  if (c.hours > 0) return { key: "pdpSaleCountdownHours", values };
  return { key: "pdpSaleCountdownMinutes", values };
}
