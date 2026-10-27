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
