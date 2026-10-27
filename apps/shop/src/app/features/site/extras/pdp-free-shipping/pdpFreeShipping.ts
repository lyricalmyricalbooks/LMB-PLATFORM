// "Free shipping on orders over …" on the book page (Shopify themes' free-shipping message), Studio ›
// Style › Book page · photos & layout › showPdpFreeShipping (off by default). It promises only what the
// bag's free-shipping bar promises (bagFreeShipThreshold: a rule that makes every option free everywhere),
// counts printed books only (shippableBagTotal) and is display only: checkout still prices shipping.
import { shopFreeShipThreshold, shippableBagTotal } from "../../freeShipThreshold";
import { isPickupItem } from "../../pickupAvailability";

export type PdpFreeShip =
  | { kind: "over"; threshold: number }
  | { kind: "away"; threshold: number; remaining: number }
  | { kind: "free"; threshold: number };

/**
 * What the line says, or null when it shouldn't show: rules not loaded, no shop-wide free-shipping rule, or
 * this book/edition is never shipped (e-book, gift card). `bagItems` = the bag's lines with their physical
 * flag (catalogFulfillmentItems), null when the catalog isn't in yet (then the bag isn't counted).
 */
export function pdpFreeShipping(
  profiles: any[] | null | undefined,
  book: any,
  variant: any,
  bagItems: Array<{ price: number; quantity: number; physical: boolean }> | null,
): PdpFreeShip | null {
  if (!profiles || !isPickupItem(book, variant)) return null;
  const threshold = shopFreeShipThreshold(profiles);
  if (!threshold) return null;
  const inBag = bagItems ? shippableBagTotal(bagItems, 0) : 0;
  if (inBag <= 0) return { kind: "over", threshold };
  const remaining = Math.round((threshold - inBag) * 100) / 100;
  return remaining > 0 ? { kind: "away", threshold, remaining } : { kind: "free", threshold };
}
