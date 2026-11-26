// A services shop's setup (services plan, phase 1): what "ready to take bookings" reads. A salon or a tutor has no
// products to add and nothing to ship, so Get started, the setup guide and Ready to sell ask for its services, its
// opening hours and its booking page instead. Pure; `readBookingsFacts` in launchCheck.ts does the reading.
import { sellsServices } from "../../shared/shopSells";
import type { BookingService, BookingSettings } from "../../shared/bookingTimes";

/** What Bookings holds for the shop: its services and its hours and rules. */
export type BookingsFacts = { services: BookingService[]; settings: BookingSettings };

type SellsDoc = { sells?: string | null; publishes?: string | null; sellsProducts?: boolean; leadSide?: string | null } | null | undefined;

/** A services shop that sells no products: the one kind of shop that sets up without a catalogue or shipping. */
export function servicesOnly(doc: SellsDoc): boolean {
  return !!doc && sellsServices(doc.sells || doc.publishes || null) && doc.sellsProducts !== true;
}

/**
 * The shop's kind (shop types plan, 26 November 2026): a product shop, a services shop, or Both (a services answer that
 * sells products too, the sign-up's Both card or What you offer's "Sell products too"). A shop with no answer yet is a
 * product shop. The starters' three versions follow it (starterForShop).
 */
export type ShopType = "products" | "services" | "both";
export function shopKindOf(doc: SellsDoc): ShopType {
  if (!doc || !sellsServices(doc.sells || doc.publishes || null)) return "products";
  return doc.sellsProducts === true ? "both" : "services";
}

/** Which side a Both shop leads with ("What do most customers come for?"): bookings unless it said products. */
export type LeadSide = "products" | "services";
export const leadSideOf = (doc: SellsDoc): LeadSide => (doc?.leadSide === "products" ? "products" : "services");

/** The services a client can book now. */
export const bookable = (facts?: BookingsFacts | null): BookingService[] => (facts?.services || []).filter(s => s.active);

/** At least one day of the week has opening hours. */
export const hasHours = (facts?: BookingsFacts | null): boolean => !!facts?.settings?.hours?.some(day => day.length > 0);
