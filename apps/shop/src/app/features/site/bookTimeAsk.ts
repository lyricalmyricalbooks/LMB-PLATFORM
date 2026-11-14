// One request to the bookings server (functions/bookings.js `handlePublic`), shared by the Book a time page and the
// "Book a time" section. Studio's preview gets sample answers and never books anything (bookTimePreview.ts).
import { functionFetch } from "../../lib/functionsBase";
import { shopCurrency } from "../../../lib/shopProfile";
import { isBookingPreview, previewAnswer } from "./bookTimePreview";
import type { BookingInfo } from "./bookTimeRules";

export type BookingAnswer = Record<string, any> & { error?: string; code?: string };

export async function askBooking(action: string, body: Record<string, unknown> = {}): Promise<BookingAnswer> {
  if (isBookingPreview()) return previewAnswer(action, body, shopCurrency());
  const response = await functionFetch("validateDiscountCode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || response.status)), { code: data.code, status: response.status });
  return data;
}

/** The shop's services for a section, asked once per visit however many pages show the section. */
let services: Promise<BookingInfo> | null = null;
export function bookingInfoOnce(): Promise<BookingInfo> {
  services ||= (askBooking("bookingInfo") as Promise<BookingInfo>).catch((err) => { services = null; throw err; });
  return services;
}
