// A services shop's setup (services plan, phase 1): what "ready to take bookings" reads. A salon or a tutor has no
// products to add and nothing to ship, so Get started, the setup guide and Ready to sell ask for its services, its
// opening hours and its booking page instead. Pure; `readBookingsFacts` in launchCheck.ts does the reading.
import { sellsServices } from "../../shared/shopSells";
import type { BookingService, BookingSettings } from "../../shared/bookingTimes";

/** What Bookings holds for the shop: its services and its hours and rules. */
export type BookingsFacts = { services: BookingService[]; settings: BookingSettings };

type SellsDoc = { sells?: string | null; publishes?: string | null; sellsProducts?: boolean } | null | undefined;

/** A services shop that sells no products: the one kind of shop that sets up without a catalogue or shipping. */
export function servicesOnly(doc: SellsDoc): boolean {
  return !!doc && sellsServices(doc.sells || doc.publishes || null) && doc.sellsProducts !== true;
}

/** The services a client can book now. */
export const bookable = (facts?: BookingsFacts | null): BookingService[] => (facts?.services || []).filter(s => s.active);

/** At least one day of the week has opening hours. */
export const hasHours = (facts?: BookingsFacts | null): boolean => !!facts?.settings?.hours?.some(day => day.length > 0);
