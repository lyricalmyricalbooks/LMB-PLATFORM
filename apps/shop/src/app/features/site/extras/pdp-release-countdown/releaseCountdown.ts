// Release countdown on pre-order book pages (Studio › Style › Book page · photos & layout › showPdpReleaseCountdown,
// off by default). A pre-order with a Publication date (Books › edit › Inventory, a Toronto shop date) opens at
// midnight Toronto that day (`releaseArrived` in liveBook.ts); inside the last `withinHours` the stock line counts down
// to it instead of "Pre-order · ships {date}". Pure.
import { shopInstant } from "../../shopTime";
import type { SaleCountdown } from "../../saleCountdown";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Time left until the release day starts, rounded up to the minute, or null outside the window / once it has come. */
export function releaseCountdown(releaseDate: string, nowMs: number, withinHours: number): SaleCountdown | null {
  const date = String(releaseDate || "");
  if (!DATE_ONLY.test(date)) return null;
  const start = shopInstant(date);
  if (!Number.isFinite(start) || !Number.isFinite(nowMs)) return null;
  const left = start - nowMs;
  if (left <= 0 || !(withinHours > 0) || left > withinHours * 3_600_000) return null;
  const total = Math.ceil(left / 60_000);
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** Which Text & labels line says it, and its {placeholders}. */
export function releaseCountdownCopy(c: SaleCountdown): { key: string; values: Record<string, string> } {
  const values = { days: String(c.days), hours: String(c.hours), minutes: String(c.minutes) };
  if (c.days > 0) return { key: "pdpReleaseCountdownDays", values };
  if (c.hours > 0) return { key: "pdpReleaseCountdownHours", values };
  return { key: "pdpReleaseCountdownMinutes", values };
}
