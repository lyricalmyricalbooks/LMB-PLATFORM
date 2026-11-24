// Example products (plan 12.12). A shop with nothing in it is hard to judge, so Products offers examples to fill
// the storefront. They carry `isExample: true` and clear themselves: the first real product the owner creates deletes
// them (adminApi.createBook), so no sample is left on a live shop. Pure data, in neutral words (any kind of goods).

import { startingKind } from "./sells";
import { SAMPLE_SETS, sampleSetFor, samplePhotoUrl } from "./starterSamples";

export const EXAMPLE_PRODUCT_FLAG = "isExample";

export const isExampleProduct = (book: { isExample?: unknown } | null | undefined): boolean => book?.isExample === true;

const NOTE = "An example product so your shop isn't empty. It disappears when you add your first real product.";

// Examples come from the shop's sample set (starterSamples.ts, 24 November 2026): the same example products and licensed
// photos the website previews show, so the shop looks like the starter it picked. A service shop's set has services, not
// products, so it gets the home goods examples. Four examples, never sold (features/site/comingSoon.ts `notForSale`).
const EXAMPLE_COUNT = 4;

/** The example products for what the shop sells, ready to save. */
export function exampleProducts(sells?: string | null): Record<string, unknown>[] {
  const base = { status: "published", isExample: true, trackInventory: false, shippingProfileId: "general-profile", format: "Merchandise", author: "" };
  const kind = sells ? startingKind(sells) : "book";
  const own = SAMPLE_SETS[sampleSetFor(sells)];
  const set = own.products.length ? own : SAMPLE_SETS.home;
  return set.products.slice(0, EXAMPLE_COUNT).map((p) => ({
    ...base,
    ...(kind !== "book" && kind !== "ebook" ? { kind } : {}),
    title: p.title,
    retailPrice: p.price,
    description: NOTE,
    photos: [{ url: samplePhotoUrl(set.id, p.photo), alt: p.alt }],
  }));
}
