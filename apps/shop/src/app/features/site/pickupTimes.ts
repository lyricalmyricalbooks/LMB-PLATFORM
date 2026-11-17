// Pickup times at checkout (Bookings › Hours & rules › Pickup times). The shop's server answers which times are open
// (functions/bookings.js action `pickupTimes`); checkout shows them under the pickup choice and sends the chosen one as
// `fulfillmentSelection.pickupAt`, which the server checks again before it prices the order. Display only.
import { functionFetch } from "../../lib/functionsBase";
import { inEditorPreview } from "../../lib/trackingGuard";

/** `on: false` when the shop doesn't ask for a time; otherwise the open times by shop day, as ISO strings. */
export type PickupTimes = { on: false } | { on: true; zone: string; slotMinutes: number; days: Record<string, string[]> };

/** The server's refusal codes for a pickup time that was free when shown but isn't any more. */
export const PICKUP_TIME_CODES = ["pickup_time", "pickup_closed", "pickup_too_soon", "pickup_full", "pickup_too_far"];
export const isPickupTimeCode = (code: unknown) => PICKUP_TIME_CODES.includes(String(code || ""));

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** What Studio's preview shows: the next five weekdays, ten to four, every hour, in the browser's own time. */
export function samplePickupTimes(now = new Date()): PickupTimes {
  const days: Record<string, string[]> = {};
  for (let i = 1; Object.keys(days).length < 5 && i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days[localDay(d)] = [10, 11, 12, 13, 14, 15, 16].map((h) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString());
  }
  return { on: true, zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", slotMinutes: 60, days };
}

/** Asks the shop for its open pickup times. Any failure reads as "no times asked", so checkout never blocks on it. */
export async function loadPickupTimes(): Promise<PickupTimes> {
  if (inEditorPreview()) return samplePickupTimes();
  try {
    const response = await functionFetch("validateDiscountCode", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pickupTimes" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.on !== true || !data.days || typeof data.days !== "object") return { on: false };
    return { on: true, zone: String(data.zone || "UTC"), slotMinutes: Number(data.slotMinutes) || 30, days: data.days };
  } catch {
    return { on: false };
  }
}

/** "Tue 17 Nov" for a shop day (YYYY-MM-DD), the calendar's own date whatever the browser's zone. */
export function pickupDayLabel(day: string, locale?: string): { weekday: string; date: string } {
  const at = new Date(`${day}T12:00:00Z`);
  return {
    weekday: at.toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }),
    date: at.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }),
  };
}

/** "2:30 p.m." in the shop's time zone. */
export const pickupTimeLabel = (iso: string, zone: string, locale?: string) =>
  new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: zone });

/** "Tuesday 17 November, 2:30 p.m." in the shop's time zone, for the confirmation line, the order page and emails. */
export const pickupWhen = (iso: string, zone: string, locale?: string) => {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  return `${at.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: zone })}, ${pickupTimeLabel(iso, zone, locale)}`;
};

/** Keeps a chosen time only while it is still offered; otherwise nothing is chosen. */
export function stillOffered(times: PickupTimes, iso: string | undefined): string {
  if (!iso || !times.on) return "";
  return Object.values(times.days).some((list) => list.includes(iso)) ? iso : "";
}
