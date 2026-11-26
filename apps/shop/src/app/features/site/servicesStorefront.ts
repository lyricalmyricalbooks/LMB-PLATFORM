// A services shop's website (bookings plan 4, fix 2): a salon or a tutor with nothing to sell online shows no bag,
// wishlist or currency picker, no "Shop" or "Track your order" footer links and no shipping or returns policy links.
// Pure; useSiteData applies it to the settings shoppers read. The stored settings are never changed.
import { sellsServices } from "../../../shared/shopSells";

/** The header switches a services website starts with; an owner who sets one in Studio is followed. */
const HIDDEN_UNTIL_SET = ["hideCartButton", "hideHeaderWishlist", "hideCurrencySelector"] as const;
/** Policies only a shop that ships things needs. */
const SHIPPING_POLICIES = ["shipping", "returns"] as const;

/**
 * A services shop's website is for booking, not buying: one whose type is Services (settings/website `shopKind`, copied
 * by the server when the owner changes type; products a product shop had stay out of sight), or, before that copy
 * existed, a services shop with no products on sale. A product shop keeps the bag, and Products and services shows it
 * once it has a product on sale.
 */
export function isServicesStorefront(sells: string | null | undefined, productCount: number, shopKind?: string | null): boolean {
  if (shopKind === "services") return true;
  if (shopKind === "products") return false;
  return sellsServices(sells) && productCount === 0;
}

/** The settings a services website shows; any other shop's settings come back unchanged. */
export function withServicesStorefront<T extends Record<string, any>>(settings: T, productCount: number): T {
  if (!settings || !isServicesStorefront(settings.sells, productCount, settings.shopKind)) return settings;
  const design: Record<string, any> = { ...(settings.design || {}) };
  for (const key of HIDDEN_UNTIL_SET) if (design[key] === undefined) design[key] = true;
  const out: Record<string, any> = { ...settings, design, servicesStorefront: true };
  if (settings.policies && typeof settings.policies === "object") {
    out.policies = { ...settings.policies };
    for (const key of SHIPPING_POLICIES) delete out.policies[key];
  }
  return out as T;
}
