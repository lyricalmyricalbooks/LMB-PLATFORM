// The bag's "CA$X away from free shipping" bar must only promise what checkout charges,
// whatever the shopper's destination or chosen rate. So it only uses rules that apply
// everywhere a profile ships: the profile's own free-shipping-over amount (or the older
// `freeThreshold`), or a "free over" amount on every rate of every zone (the highest one).
// The bag mixes profiles, so the shop's threshold is the highest profile threshold, and a
// profile with no such rule means no bar. E-book-only bags never pay shipping → no bar.
function profileThreshold(profile: any): number | null {
  const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };
  const own = num(profile?.freeShippingOver) || num(profile?.freeThreshold);
  if (own) return own;
  const rates = (profile?.zones || []).map((zone: any) => zone?.rates || []);
  if (!rates.length || rates.some((list: any[]) => !list.length)) return null;
  const amounts = rates.flat().map((rate: any) => num(rate?.freeOver));
  return amounts.every(Boolean) ? Math.max(...amounts) : null;
}

/** The order total above which every shipping option is free, or null if there isn't one. */
export function shopFreeShipThreshold(profiles: any[]): number | null {
  if (!profiles?.length) return null;
  const each = profiles.map(profileThreshold);
  return each.every((t) => t != null) ? Math.max(...(each as number[])) : null;
}

/** null = don't show the bar (rules not loaded yet, no free-shipping rule, or nothing to ship). */
export function bagFreeShipThreshold(profiles: any[] | null, hasPhysicalItems: boolean): number | null {
  if (!profiles || !hasPhysicalItems) return null;
  return shopFreeShipThreshold(profiles);
}

/**
 * What counts toward free shipping: checkout quotes shipping on the printed (physical) lines only, so
 * e-books and gift cards in the bag must not fill the bar. `null` items (catalog not loaded) fall back
 * to the whole bag total.
 */
export function shippableBagTotal(items: Array<{ price: number; quantity: number; physical: boolean }> | null, bagTotal: number): number {
  if (!items) return bagTotal;
  const cents = items.filter((item) => item.physical).reduce((sum, item) => sum + Math.round(Number(item.price || 0) * 100) * (Number(item.quantity) || 0), 0);
  return cents / 100;
}
