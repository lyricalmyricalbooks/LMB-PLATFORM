import { describe, expect, it } from "vitest";
import { bookStructuredData, returnPolicyData, shippingDetailsData } from "./bookSeo";

describe("returnPolicyData", () => {
  it("leaves the policy out when blank or the country is unknown", () => {
    expect(returnPolicyData("", "CA")).toBeNull();
    expect(returnPolicyData("0", undefined)).toBeNull();
    expect(returnPolicyData("lots", "CA")).toBeNull();
  });
  it("says no returns for 0 and a mail window for a number", () => {
    expect(returnPolicyData("0", "ca")).toEqual({ "@type": "MerchantReturnPolicy", applicableCountry: "CA", returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" });
    expect(returnPolicyData("30", "CA")).toMatchObject({ returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: 30, returnMethod: "https://schema.org/ReturnByMail" });
  });
});

describe("shippingDetailsData", () => {
  it("states the rate, the shop's country and parsed delivery days", () => {
    expect(shippingDetailsData({ price: 12.5, deliveryDays: "3–7 business days", type: "flat" }, "CA")).toEqual({
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: 12.5, currency: "CAD" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "CA" },
      deliveryTime: { "@type": "ShippingDeliveryTime", transitTime: { "@type": "QuantitativeValue", minValue: 3, maxValue: 7, unitCode: "DAY" } },
    });
    expect(shippingDetailsData({ price: 0, deliveryDays: "5 days" }, "CA")?.deliveryTime.transitTime).toMatchObject({ minValue: 5, maxValue: 5 });
  });
  it("adds the shop's handling time next to transit time", () => {
    expect(shippingDetailsData({ price: 15, deliveryDays: "3-7" }, "CA", "CAD", "1-3")?.deliveryTime).toEqual({
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: 3, maxValue: 7, unitCode: "DAY" },
    });
    expect(shippingDetailsData({ price: 15 }, "CA", "CAD", "2")?.deliveryTime).toEqual({
      "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 2, unitCode: "DAY" },
    });
  });
  it("leaves delivery time out when the estimate isn't days, and the whole thing out for pickup or no quote", () => {
    expect(shippingDetailsData({ price: 9, deliveryDays: "Next week" }, "CA")).not.toHaveProperty("deliveryTime");
    expect(shippingDetailsData({ price: 0, type: "pickup" }, "CA")).toBeNull();
    expect(shippingDetailsData(null, "CA")).toBeNull();
    expect(shippingDetailsData({ price: 9 }, "Canada")).toBeNull();
  });
  it("lands on the offer next to the return policy", () => {
    const data: any = bookStructuredData({ id: "b", title: "B", slug: "b", price: 20, stockLevel: 3 } as any, {
      currency: "CAD", price: 20, url: "https://x.test/books/b",
      returnPolicy: returnPolicyData("0", "CA"), shipping: shippingDetailsData({ price: 15 }, "CA"),
    });
    expect(data.offers.hasMerchantReturnPolicy.returnPolicyCategory).toBe("https://schema.org/MerchantReturnNotPermitted");
    expect(data.offers.shippingDetails.shippingRate.value).toBe(15);
  });
});

describe("search data for products beyond books (plan 10.21)", () => {
  const url = "https://x.test/books/shirt";
  const shirt: any = {
    id: "s", title: "Linen Shirt", slug: "shirt", kind: "clothing", material: "Linen", photos: [{ url: "/a.jpg" }],
    variants: [
      { id: "m", name: "M / Black", price: 60, stock: 3, sku: "LS-M" },
      { id: "l", name: "L / Black", price: 70, stock: 0 },
    ],
  };

  it("a shirt is a Product, not a Book, with the price range and each size's own stock", () => {
    const data: any = bookStructuredData(shirt, { currency: "CAD", price: 60, url, seller: "Moth Press" });
    expect(data["@type"]).toBe("Product");
    expect(data).not.toHaveProperty("isbn");
    expect(data.material).toBe("Linen");
    expect(data.brand.name).toBe("Moth Press");
    expect(data.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: "60.00", highPrice: "70.00", offerCount: 2, priceCurrency: "CAD", availability: "https://schema.org/InStock" });
    expect(data.offers.offers.map((o: any) => [o.name, o.price, o.availability.split("/").pop()])).toEqual([
      ["M / Black", "60.00", "InStock"], ["L / Black", "70.00", "OutOfStock"],
    ]);
    expect(data.offers.offers[0].sku).toBe("LS-M");
  });

  it("all sizes sold out is out of stock; a product with no versions is a single offer", () => {
    const out: any = bookStructuredData({ ...shirt, variants: shirt.variants.map((v: any) => ({ ...v, stock: 0 })) }, { currency: "CAD", price: 60, url });
    expect(out.offers.availability).toBe("https://schema.org/OutOfStock");
    const ring: any = bookStructuredData({ id: "r", title: "Ring", slug: "ring", kind: "jewelry", stockLevel: 2 }, { currency: "CAD", price: 90, url });
    expect(ring.offers).toMatchObject({ "@type": "Offer", price: "90.00", availability: "https://schema.org/InStock" });
  });

  it("a book is still a Product and a Book, with its ISBN and one offer", () => {
    const book: any = bookStructuredData({ id: "b", title: "B", slug: "b", isbn: "9780306406157", stockLevel: 3 } as any, { currency: "CAD", price: 20, url });
    expect(book["@type"]).toEqual(["Product", "Book"]);
    expect(book.isbn).toBe("9780306406157");
    expect(book.offers["@type"]).toBe("Offer");
  });
});
