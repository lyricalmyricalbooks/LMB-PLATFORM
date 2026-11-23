// The team desk's one door to the server (plan 4, 4.1): createStripeCheckoutSession action "bookingsDesk"
// (functions/bookings.js handleDesk). A front desk or service provider reads nothing from the database itself.
// One object, so the admin fixture (src/adminFixture/main.ts) can swap in sample days.
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { Booking } from "./bookingsApi";
import type { RotaShift, TimeOff } from "../../shared/teamRota";

/** Where the signed-in person stands on the time clock (plan 4, 4.2), with minutes worked on this shift. */
export type DeskClock = { state: "off" | "working" | "break"; since: string; shiftIn: string; minutes: number };

/**
 * A booking on the desk's list, with its visit notes (plan 4, 4.6 My day): this visit's own note, and the client's latest
 * note from an earlier day, so the person taking them sees it before they start.
 */
export type DeskBooking = Booking & { visitNote?: string; lastVisit?: { day: string; note: string } };

export type DeskAnswer = {
  role: "admin" | "frontDesk" | "provider";
  day: string; days: number; zone: string;
  me: { id: string; name: string } | null;
  staff: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string; minutes: number; places: number }>;
  bookings: DeskBooking[];
  /** Null for the owner and staff, who keep hours under Bookings › Team pay. */
  clock?: DeskClock | null;
  /** Shifts and time off (plan 4, 4.3): their planned shifts for two weeks and their asks. Left out for the owner. */
  rota?: (RotaShift & { id: string })[];
  timeOff?: (TimeOff & { id: string })[];
};

async function callDesk(op: string, body: Record<string, unknown> = {}): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again to see your day.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ action: "bookingsDesk", op, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || "That didn't go through just now. Please try again."), { code: result.code });
  return result;
}

export const teamDeskData = {
  /** One shop day (YYYY-MM-DD) as the signed-in person may see it. */
  day: (day: string): Promise<DeskAnswer> => callDesk("desk", { day }),
  /** An action the server allows this role (DESK_OPS): checkIn, noShow, and for a front desk times, create, cancel… */
  act: (op: string, body: Record<string, unknown>): Promise<any> => callDesk(op, body),
};
