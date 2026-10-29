// Returns a shopper may ask for (plan: "Take returns", 29 October 2026). Off unless the press turns it on in
// Settings › Shipping › Returns; then a paid order that has shipped may ask for a return for `windowDays` days after it
// was delivered (or shipped, or collected). Asking never moves money or stock: the request opens the returns desk on the
// order, and the press decides. One copy for the order page (OrderRequests.tsx) and the server
// (functions/customerRequests.js), which is the one that decides.

import { isPhysicalItem } from "./localFulfillment";

export interface ReturnSettings { enabled: boolean; windowDays: number }

export const RETURN_WINDOW_DEFAULT = 30;
export const RETURN_WINDOW_MAX = 365;
const DAY = 86_400_000;
const SHIPPED = ["shipped", "out_for_delivery", "delivered", "completed", "picked_up", "collected"];

/** The saved setting (settings/website `returns`), with anything missing or broken read as "off" or the default. */
export function returnSettings(raw: any): ReturnSettings {
  const days = Number(raw?.windowDays);
  return {
    enabled: raw?.enabled === true,
    windowDays: Number.isInteger(days) && days >= 1 && days <= RETURN_WINDOW_MAX ? days : RETURN_WINDOW_DEFAULT,
  };
}

/** Why the setting can't be saved, in the press's words, or "" when it can. */
export function returnSettingsProblem(raw: any): string {
  if (typeof raw?.enabled !== "boolean") return "Choose whether you take returns.";
  const days = Number(raw?.windowDays);
  if (!Number.isInteger(days) || days < 1 || days > RETURN_WINDOW_MAX) return `Enter how many days shoppers have to ask, from 1 to ${RETURN_WINDOW_MAX}.`;
  return "";
}

/** When the return window starts: delivery, else collection, else shipping, else the order itself. */
function windowStart(order: any): number {
  for (const at of [order?.deliveredAt, order?.collectedAt, order?.shippedAt, order?.createdAt]) {
    const ms = Date.parse(String(at ?? ""));
    if (Number.isFinite(ms)) return ms;
  }
  return NaN;
}

/** The last moment a return can be asked for, as an ISO time, or null when there is no window. */
export function returnDeadline(order: any, settings: ReturnSettings): string | null {
  const start = windowStart(order);
  return Number.isFinite(start) ? new Date(start + settings.windowDays * DAY).toISOString() : null;
}

export type ReturnProblem = "returns_off" | "closed" | "not_paid" | "not_shipped" | "nothing_to_return" | "already_returned" | "window_closed";

/** Why this order can't ask for a return now, or null when it can. */
export function returnRequestProblem(order: any, settings: ReturnSettings, now: number = Date.now()): ReturnProblem | null {
  if (!settings.enabled) return "returns_off";
  const status = String(order?.status || "").toLowerCase();
  const payment = String(order?.paymentStatus || "").toLowerCase();
  if (status === "cancelled" || status === "refunded" || payment.startsWith("refund")) return "closed";
  if (payment !== "paid") return "not_paid";
  const fulfillment = String(order?.fulfillmentStatus || "").toLowerCase();
  if (!SHIPPED.includes(fulfillment) && !SHIPPED.includes(status)) return "not_shipped";
  if (!(order?.items || []).some((item: any) => isPhysicalItem({ ...item, format: item?.format || item?.variantName || "" }))) return "nothing_to_return";
  if (order?.returnProgress) return "already_returned";
  const deadline = returnDeadline(order, settings);
  if (!deadline || now > Date.parse(deadline)) return "window_closed";
  return null;
}
