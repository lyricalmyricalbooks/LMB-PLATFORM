// Example products (plan 12.12). A shop with nothing in it is hard to judge, so Products offers three examples to fill
// the storefront. They carry `isExample: true` and clear themselves: the first real product the owner creates deletes
// them (adminApi.createBook), so no sample is left on a live shop. Pure data, in neutral words (any kind of goods).

export const EXAMPLE_PRODUCT_FLAG = "isExample";

export const isExampleProduct = (book: { isExample?: unknown } | null | undefined): boolean => book?.isExample === true;

/** The three example products, ready to save. */
export function exampleProducts(): Record<string, unknown>[] {
  const base = { status: "published", isExample: true, trackInventory: false, shippingProfileId: "general-profile", format: "Merchandise", author: "" };
  return [
    { ...base, title: "Example tote bag", retailPrice: 24, description: "An example product so your shop isn't empty. It disappears when you add your first real product." },
    { ...base, title: "Example enamel pin", retailPrice: 12, description: "An example product so your shop isn't empty. It disappears when you add your first real product." },
    { ...base, title: "Example art print", retailPrice: 35, description: "An example product so your shop isn't empty. It disappears when you add your first real product." },
  ];
}
