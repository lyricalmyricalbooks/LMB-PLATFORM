// Take a payment at the desk (Services plan, phase 3): the page's plain rules, kept apart from the screen so they are
// tested on their own. The money questions go through the shared booking helpers (never `paid` alone).
import { balanceDue, dayOf, restPayable, restTaken, tipTaken } from "../../shared/bookingTimes";
import type { Booking } from "./bookingsApi";

/** Today's bookings that still have something to pay by card, earliest first (walk-ins and booked visits alike). */
export function dueToday(rows: readonly Booking[], today: string, zone: string): Booking[] {
  return rows
    .filter((b) => dayOf(Date.parse(b.start), zone) === today && restPayable(b) && !b.paid)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * An amount the owner typed ("45", "$45.50", "1,200") in cents, null when empty, NaN when it isn't a sum of money.
 * At most two decimals.
 */
export function amountMinor(typed: string): number | null {
  const t = typed.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

/** What the payment dialog says: still waiting, or paid (by the card page, or marked paid another way), with any tip. */
export type DeskState = { state: "waiting"; dueMinor: number } | { state: "paid"; byCard: number; tipMinor: number; otherWay: boolean };
export function deskState(b: Booking): DeskState {
  const byCard = restTaken(b);
  if (byCard > 0 || b.paid || balanceDue(b) === 0) return { state: "paid", byCard, tipMinor: tipTaken(b), otherWay: byCard === 0 };
  return { state: "waiting", dueMinor: balanceDue(b) };
}
