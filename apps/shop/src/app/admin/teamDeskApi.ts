// The team desk's one door to the server (plan 4, 4.1): createStripeCheckoutSession action "bookingsDesk"
// (functions/bookings.js handleDesk). A front desk or service provider reads nothing from the database itself.
// One object, so the admin fixture (src/adminFixture/main.ts) can swap in sample days.
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { Booking } from "./bookingsApi";

export type DeskAnswer = {
  role: "admin" | "frontDesk" | "provider";
  day: string; days: number; zone: string;
  me: { id: string; name: string } | null;
  staff: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string; minutes: number; places: number }>;
  bookings: Booking[];
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
