import { describe, expect, it } from "vitest";
import { previewSampleCart } from "./previewSampleCart";

describe("previewSampleCart (Studio checkout preview with an empty bag)", () => {
  it("borrows the first ordinary book with a price, as one display-only line", () => {
    const books = [
      { id: "g", title: "Gift card", productType: "giftCard", retailPrice: 25 },
      { id: "box", title: "Box set", retailPrice: 80, bundleItems: [{ bookId: "a", quantity: 1 }] },
      { id: "free", title: "No price", retailPrice: 0 },
      { id: "b1", title: "Night Pages", retailPrice: 32, photos: [{ url: "https://x/a.jpg" }] },
    ];
    expect(previewSampleCart(books)).toEqual([{ id: "b1", title: "Night Pages", price: 32, quantity: 1, photoUrl: "https://x/a.jpg", shippingProfileId: "" }]);
  });

  it("uses a priced edition for a book sold in editions, and nothing when no book can be shown", () => {
    const line = previewSampleCart([{ id: "e", title: "Edition book", variants: [{ id: "v0", name: "Signed", price: "" }, { id: "v1", name: "Paperback", price: 20 }] }])[0];
    expect(line).toMatchObject({ id: "e", variantId: "v1", variantName: "Paperback", price: 20 });
    expect(previewSampleCart([])).toEqual([]);
    expect(previewSampleCart(undefined as any)).toEqual([]);
  });
});
