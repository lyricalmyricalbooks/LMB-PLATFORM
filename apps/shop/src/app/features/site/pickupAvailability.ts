// "Pickup available at …" on the book page (Shopify's pickup availability), Studio › Style ›
// Book page · photos & layout › showPdpPickup (off by default). Display only: checkout still
// decides which pickup choices an order gets (quoteLocalFulfillment) and the server prices them.
import { catalogFulfillmentItems } from "./checkoutFulfillment";
import { validateLocalFulfillment } from "./localFulfillment";
import type { LocalFulfillmentConfig, PickupLocation } from "./types";

/** Checkout's own physical-copy rule (catalogFulfillmentItems): e-books and gift cards are never picked up. */
export function isPickupItem(book: any, variant?: any): boolean {
  if (!book?.id) return false;
  const items = catalogFulfillmentItems([{ id: book.id, variantId: variant?.id, price: 0, quantity: 1 }], new Map([[book.id, book]]));
  return !!items?.[0]?.physical;
}

export type PickupSpot = { id: string; name: string; place: string; hours: string; estimate: string; price: number; localOnly: boolean };

/** The enabled pickup locations shoppers would see, or [] when pickup is off, misconfigured or the item can't be picked up. */
export function pickupSpots(config: LocalFulfillmentConfig | undefined | null, book: any, variant?: any): PickupSpot[] {
  if (!config?.enabled || !Array.isArray(config.pickupLocations) || !isPickupItem(book, variant)) return [];
  if (validateLocalFulfillment(config).length) return [];
  return config.pickupLocations
    .filter((location: PickupLocation) => location && location.enabled)
    .map((location) => ({
      id: location.id,
      name: String(location.name || "").trim(),
      place: [location.address?.city, location.address?.state].map((part) => String(part || "").trim()).filter(Boolean).join(", "),
      hours: String(location.hours || "").trim(),
      estimate: String(location.estimate || "").trim(),
      price: Math.round(Number(location.price) * 100) / 100,
      localOnly: Array.isArray(location.postalPrefixes) && location.postalPrefixes.length > 0,
    }));
}
