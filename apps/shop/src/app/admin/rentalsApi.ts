// Rentals (beta): what the admin asks the server for (functions/rentals.js). Items, the calendar and rentals are
// server-only records, so every read and change goes through the `rentalsAdmin` action.
import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { RentalItem } from "../../shared/rentalRules";

export type RentalStatus = "held" | "paid" | "out" | "returned" | "cancelled";
/** One rental as the owner sees it. */
export type AdminRental = {
  id: string; status: RentalStatus; itemId: string; itemName: string; unit: number; startMs: number; endMs: number; length: number; basis: "hour" | "day";
  name: string; email: string; totalMinor: number; taxMinor: number; chargedMinor: number; currency: string; refundedMinor: number; test: boolean;
  createdAt: string; paidAt: string; pickedUpAt: string; returnedAt: string; holdUntil: string;
  /** R2: the deposit the kept card covers (0 = no card kept), what is left of it, and the late fee the server suggests. */
  depositMinor?: number; lateFeeMinor?: number; card?: string; feeRoomMinor?: number; lateBy?: number; suggestedLateMinor?: number;
  fees?: { amountMinor: number; reason: "late" | "damage" | "other"; note: string; at: string; by: string }[];
  extrasPaid?: { amountMinor: number; note: string; at: string }[];
  payLinks?: { amountMinor: number; note: string; url: string; closesAt: string }[];
};
export type RentalsList = { zone: string; currency: string; items: RentalItem[]; rentals: AdminRental[] };
export type RentalsAdminOp = "list" | "saveItem" | "deleteItem" | "pickedUp" | "returned" | "cancel" | "hint" | "chargeFee" | "payLink" | "unitState";

/** One object so the admin fixture (src/adminFixture/main.ts) can swap in sample rentals. */
export const rentalsData = {
  admin: adminFromServer as (op: RentalsAdminOp, body: Record<string, unknown>) => Promise<unknown>,
};

export const rentalsAdmin = <T = { ok?: boolean }>(op: RentalsAdminOp, body: Record<string, unknown> = {}) => rentalsData.admin(op, body) as Promise<T>;

async function adminFromServer(op: RentalsAdminOp, body: Record<string, unknown> = {}): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ action: "rentalsAdmin", op, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || "That didn't save just now. Please try again."), { code: result.code, stuck: result.stuck });
  return result;
}
