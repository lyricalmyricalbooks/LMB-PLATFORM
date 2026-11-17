// Events and tickets (beta): what the admin asks the server for (functions/events.js). Events, places and ticket
// orders are server-only records, so every read and change goes through the `eventsAdmin` action.
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { OrderLine, ShopEvent } from "../../shared/eventTickets";

/** An event as the admin lists it: what was made, plus tickets sold, places left and money taken. */
export type AdminEvent = ShopEvent & {
  sold: Record<string, number>; soldTotal: number; placesTotal: number; left: Record<string, number>; paidMinor: number; orders: number;
};
/** One paid order of tickets: who bought, what, and each ticket's code for the door. */
export type TicketOrder = {
  id: string; status: "paid"; eventId: string; name: string; email: string; lines: OrderLine[]; ticketCount: number;
  totalMinor: number; taxMinor: number; chargedMinor: number; currency: string; tickets: { code: string; ticketId: string; name: string }[];
  createdAt: string; paidAt: string; test: boolean;
};
export type EventsAdminOp = "list" | "saveEvent" | "deleteEvent" | "orders" | "resendTickets";

/** One object so the admin fixture (src/adminFixture/main.ts) can swap in sample events. */
export const eventsData = {
  admin: adminFromServer as (op: EventsAdminOp, body: Record<string, unknown>) => Promise<unknown>,
};

export const eventsAdmin = <T = { ok?: boolean }>(op: EventsAdminOp, body: Record<string, unknown> = {}) => eventsData.admin(op, body) as Promise<T>;

async function adminFromServer(op: EventsAdminOp, body: Record<string, unknown> = {}): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ action: "eventsAdmin", op, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || "That didn't save just now. Please try again."), { code: result.code });
  return result;
}
