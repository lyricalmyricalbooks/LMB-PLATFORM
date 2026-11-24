// Bookings › List › Past › Spreadsheet (plan 4, 3.8, Beta): every past visit in a date range as a spreadsheet, with
// what happened (came, checked in, no-show, cancelled), the money and the team member, so the owner can follow up
// no-shows or hand the figures to a bookkeeper.
import { dayOf, moneyKept, tipTaken, visitName } from "../../shared/bookingTimes";
import type { Booking } from "./bookingsApi";
import { paymentText } from "./bookingsView";

/** The longest range one spreadsheet covers. */
export const MAX_PAST_DAYS = 366;

export type VisitOutcome = "Checked in" | "Visited" | "No-show" | "Cancelled by client" | "Cancelled by you" | "Request declined";

/**
 * What happened to a booking whose time has passed, or null when it was never a visit: a held time whose payment never
 * finished, a request still waiting, or a booking still to come.
 */
export function visitOutcome(b: Pick<Booking, "status" | "noShow" | "checkedInAt" | "cancelledBy" | "declined" | "end">, nowMs: number): VisitOutcome | null {
  if (b.status === "cancelled") {
    if (b.declined) return "Request declined";
    if (b.cancelledBy === "hold ran out") return null;
    return b.cancelledBy === "customer" ? "Cancelled by client" : "Cancelled by you";
  }
  if (b.status !== "confirmed" || Date.parse(b.end) > nowMs) return null;
  if (b.noShow) return "No-show";
  return b.checkedInAt ? "Checked in" : "Visited";
}

/** "45.00": money a spreadsheet adds up (no sign, two decimals). */
const amount = (minor: number) => (Math.max(0, minor || 0) / 100).toFixed(2);

export type PastVisitOptions = { zone: string; nowMs: number; cancelled: boolean; onlyNoShows?: boolean };

/** The visits a spreadsheet holds, oldest first: past ones, cancelled ones only when asked. */
export function pastVisits(rows: readonly Booking[], opts: PastVisitOptions): Array<{ booking: Booking; outcome: VisitOutcome }> {
  const out: Array<{ booking: Booking; outcome: VisitOutcome }> = [];
  for (const booking of rows) {
    const outcome = visitOutcome(booking, opts.nowMs);
    if (!outcome) continue;
    if (!opts.cancelled && (outcome.startsWith("Cancelled") || outcome === "Request declined")) continue;
    if (opts.onlyNoShows && outcome !== "No-show") continue;
    out.push({ booking, outcome });
  }
  return out.sort((a, b) => a.booking.start.localeCompare(b.booking.start) || a.booking.customer.name.localeCompare(b.booking.customer.name));
}

/** Counts for the dialog: visits that happened, no-shows and cancellations. */
export function pastVisitCounts(list: ReadonlyArray<{ outcome: VisitOutcome }>): { visits: number; noShows: number; cancelled: number } {
  let visits = 0, noShows = 0, cancelled = 0;
  for (const { outcome } of list) {
    if (outcome === "No-show") noShows++;
    else if (outcome === "Checked in" || outcome === "Visited") visits++;
    else cancelled++;
  }
  return { visits, noShows, cancelled };
}

/** The spreadsheet: a heading row, then one row a visit. */
export function pastVisitRows(list: ReadonlyArray<{ booking: Booking; outcome: VisitOutcome }>, zone: string): string[][] {
  const rows = [["Date", "Time", "Service", "Minutes", "Team member", "Client", "Email", "Phone", "What happened", "Price", "Kept", "Refunded", "Tip", "Missed-visit fee", "Currency", "Payment", "Note"]];
  for (const { booking: b, outcome } of list) {
    const start = Date.parse(b.start);
    rows.push([
      dayOf(start, zone),
      new Date(start).toLocaleTimeString("en-CA", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }),
      visitName(b), String(b.minutes || ""), b.staffName || "",
      b.customer.name, b.customer.email, b.customer.phone || "",
      outcome, amount(b.priceMinor), amount(moneyKept(b)), amount(b.refund?.amountMinor || 0), amount(tipTaken(b)), amount(b.fee?.amountMinor || 0),
      b.currency || "", paymentText(b), (b.note || "").replace(/\s+/g, " ").trim(),
    ]);
  }
  return rows;
}

/** The start times to read for a range of shop days (both included), as ISO times. */
export function pastRange(from: string, to: string, zoneStart: (day: string) => number): { fromIso: string; toIso: string } {
  const next = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)) + 1)).toISOString().slice(0, 10);
  return { fromIso: new Date(zoneStart(from)).toISOString(), toIso: new Date(zoneStart(next)).toISOString() };
}
