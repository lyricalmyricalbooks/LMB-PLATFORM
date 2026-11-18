// One request to the rentals server (functions/rentals.js `handlePublic`). Studio's preview gets sample answers
// (rentalsPreview.ts) and never opens a card page.
import { functionFetch } from "../../lib/functionsBase";
import { shopCurrency } from "../../../lib/shopProfile";
import { isBookingPreview } from "./bookTimePreview";
import { previewRentalAnswer } from "./rentalsPreview";

export type RentalAction = "rentalsInfo" | "rentalTimes" | "rentalStart" | "rentalView";
/** An item as the page sees it: never how many units the shop has. */
export type PublicRentalItem = {
  id: string; name: string; description: string; photo: string; basis: "hour" | "day"; hourMinor: number; dayMinor: number; weekMinor: number;
  minLength: number; maxLength: number; opens: string; closes: string; daysAhead: number; plusTax: boolean;
  /** The card is kept for up to this much (R2); the late fee per hour or day. */
  depositMinor?: number; lateFeeMinor?: number;
};
export type RentalsInfo = { on: boolean; zone?: string; currency?: string; items?: PublicRentalItem[] };
export type RentalQuote = { totalMinor: number; taxMinor: number; chargedMinor: number; free: boolean; length: number } | { problem: string };
export type RentalTimes = { day: string; times?: { start: string; free: boolean }[]; days?: { day: string; free: boolean }[]; quote?: RentalQuote | null };
export type RentalView = { status: "held" | "paid" | "out" | "returned" | "cancelled"; itemName: string; basis: "hour" | "day"; startMs: number; endMs: number; length: number; name: string; chargedMinor: number; taxMinor: number; currency: string; refundedMinor: number;
  depositMinor?: number; lateFeeMinor?: number; cardLast4?: string;
  fees?: { amountMinor: number; reason: "late" | "damage" | "other"; note: string; at: string }[];
  extrasPaid?: { amountMinor: number; note: string; at: string }[];
  payLinks?: { amountMinor: number; note: string; url: string }[];
};

export async function askRentals(action: RentalAction, body: Record<string, unknown> = {}): Promise<Record<string, any>> {
  if (isBookingPreview()) return previewRentalAnswer(action, body, shopCurrency());
  const locale = typeof document !== "undefined" ? document.documentElement.lang || "" : "";
  const response = await functionFetch("validateDiscountCode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, locale, ...body }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || response.status)), { code: data.code, status: response.status });
  return data;
}
