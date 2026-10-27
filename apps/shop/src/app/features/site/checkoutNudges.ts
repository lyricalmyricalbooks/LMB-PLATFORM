// Small, honest checkout nudges: a concrete arrival date and the gap to free shipping.

/** Latest day in a delivery estimate like "3-7", "5" or "2–4 days"; null when unreadable. */
export function maxDeliveryDays(estimate: string | number | undefined | null): number | null {
  if (estimate === null || estimate === undefined) return null;
  const nums = String(estimate).match(/\d+/g);
  if (!nums) return null;
  const max = Math.max(...nums.map(Number));
  return Number.isFinite(max) && max > 0 && max <= 60 ? max : null;
}

/** Adds business days (skips Saturday and Sunday). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/** "Tue, Oct 8"-style arrival date for a delivery estimate, or null. */
export function arrivalDateLabel(estimate: string | number | undefined | null, now = new Date(), locale?: string): string | null {
  const days = maxDeliveryDays(estimate);
  if (!days) return null;
  return addBusinessDays(now, days).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

/** Amount still needed for free shipping; 0 when reached, null when there's no threshold. */
export function freeShippingGap(subtotal: number, threshold: number | null | undefined): number | null {
  if (!threshold || threshold <= 0) return null;
  return Math.max(0, threshold - (subtotal || 0));
}
