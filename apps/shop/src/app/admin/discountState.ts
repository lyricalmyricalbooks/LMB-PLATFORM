import { shopDayLabel } from "./discountDescribe";

export type BadgeTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

/** The shop's calendar day (Toronto), the same day the server checks codes against (paymentGuards shopDate). */
export const today = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** Effective state of a discount code for admin display. Checkout always re-validates server-side. */
export function discountState(d: any, now: string = today()): { key: "active" | "scheduled" | "paused" | "expired" | "exhausted"; tone: BadgeTone; label: string } {
  if (d.expiryDate && d.expiryDate < now) return { key: "expired", tone: "danger", label: "Expired" };
  if (d.usageLimit && (d.usageCount || 0) >= d.usageLimit) return { key: "exhausted", tone: "warning", label: "Exhausted" };
  if (d.isActive && d.startDate && d.startDate > now) return { key: "scheduled", tone: "info", label: `Starts ${shopDayLabel(d.startDate)}` };
  return d.isActive ? { key: "active", tone: "success", label: "Active" } : { key: "paused", tone: "neutral", label: "Paused" };
}
