// Example products (plan 12.12). A shop with nothing in it is hard to judge, so Products offers three examples to fill
// the storefront. They carry `isExample: true` and clear themselves: the first real product the owner creates deletes
// them (adminApi.createBook), so no sample is left on a live shop. Pure data, in neutral words (any kind of goods).

import { startingKind } from "./sells";

export const EXAMPLE_PRODUCT_FLAG = "isExample";

export const isExampleProduct = (book: { isExample?: unknown } | null | undefined): boolean => book?.isExample === true;

const NOTE = "An example product so your shop isn't empty. It disappears when you add your first real product.";

// Examples that fit what the shop sells (3 November 2026): a clothing shop is shown a tee, not a tote bag. A books shop
// and a shop with no answer keep the three neutral examples as they were.
const BY_KIND: Record<string, [string, number][]> = {
  clothing: [["Example t-shirt", 32], ["Example hoodie", 68], ["Example cap", 28]],
  shoes: [["Example sneakers", 120], ["Example sandals", 70], ["Example boots", 150]],
  jewelry: [["Example ring", 85], ["Example necklace", 110], ["Example earrings", 60]],
  art: [["Example art print", 35], ["Example poster", 28], ["Example postcard set", 14]],
  music: [["Example vinyl record", 30], ["Example CD", 15], ["Example cassette", 12]],
  other: [["Example tote bag", 24], ["Example mug", 18], ["Example sticker pack", 8]],
};

/** The three example products for what the shop sells, ready to save. */
export function exampleProducts(sells?: string | null): Record<string, unknown>[] {
  const base = { status: "published", isExample: true, trackInventory: false, shippingProfileId: "general-profile", format: "Merchandise", author: "" };
  const kind = sells ? startingKind(sells) : "book";
  const rows = kind !== "book" && kind !== "ebook" ? BY_KIND[kind] : undefined;
  if (!rows) {
    return [
      { ...base, title: "Example tote bag", retailPrice: 24, description: NOTE },
      { ...base, title: "Example enamel pin", retailPrice: 12, description: NOTE },
      { ...base, title: "Example art print", retailPrice: 35, description: NOTE },
    ];
  }
  return rows.map(([title, retailPrice]) => ({ ...base, kind, title, retailPrice, description: NOTE }));
}
