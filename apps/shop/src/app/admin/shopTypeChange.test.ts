import { describe, expect, it } from "vitest";
import { answersProblem, leavesServices, needsBookings, switchBackOf, switchBackWrite, typeChangeWrite, whatChanges } from "./shopTypeChange";
import { shopKindOf } from "./servicesSetup";

const AT = "2026-11-26T12:00:00.000Z";
const NOW = Date.parse(AT);

describe("changing the shop's type", () => {
  it("asks what the new type needs before going on", () => {
    expect(answersProblem("products", "products", {})).toMatch(/different type/);
    expect(answersProblem("products", "services", {})).toMatch(/what people book/);
    expect(answersProblem("products", "services", { service: "services" })).toMatch(/Tell us/);
    expect(answersProblem("products", "both", { service: "hair" })).toBe("");
    expect(answersProblem("services", "products", {})).toMatch(/kind of thing/);
    expect(answersProblem("services", "products", { otherWords: "Surfboards" })).toBe("");
    expect(answersProblem("both", "products", {})).toBe("");
  });

  it("a product shop becoming services takes the booking answer and keeps what it was", () => {
    const doc = { sells: "clothing", productGroups: ["clothing"] };
    const w = typeChangeWrite(doc, "services", { service: "services", serviceWords: " Dog grooming " }, "follow", AT);
    expect(w).toMatchObject({ sells: "services", otherService: "Dog grooming", sellsProducts: false });
    expect(w.typeChange).toEqual({ at: AT, from: "products", to: "services", before: { sells: "clothing", sellsProducts: false, leadSide: "services" }, website: "follow" });
    expect(shopKindOf({ ...doc, ...w })).toBe("services");
  });

  it("an unknown sign-up answer is kept as its kinds' word, so Switch back saves", () => {
    const w = typeChangeWrite({ publishes: "food", productGroups: ["food"] }, "both", { service: "lessons", lead: "products" }, "later", AT);
    expect(w.typeChange.before.sells).toBe("other");
    expect(w).toMatchObject({ sells: "lessons", sellsProducts: true, leadSide: "products" });
  });

  it("a services shop becoming a product shop takes its kinds, books turning the book tools on", () => {
    const w = typeChangeWrite({ sells: "hair" }, "products", { groups: ["books", "art"], otherWords: "Candles" }, "pick", AT);
    expect(w).toMatchObject({ sells: "books", productGroups: ["art", "books"], otherSells: "Candles", sellsProducts: false });
    expect(shopKindOf(w)).toBe("products");
    expect(typeChangeWrite({ sells: "hair" }, "products", { groups: ["art"] }, "later", AT, true).typeChange.before.bookingPage).toBe(true);
    const both = typeChangeWrite({ sells: "hair", sellsProducts: true }, "services", {}, "follow", AT);
    expect(both.sells).toBeUndefined();
    expect(both.sellsProducts).toBe(false);
  });

  it("Switch back is offered for 30 days, once, and only while the type is still the new one", () => {
    const doc = { sells: "clothing" };
    const w = typeChangeWrite(doc, "services", { service: "hair" }, "follow", AT);
    const after = { ...doc, ...w };
    expect(switchBackOf(after, NOW + 29 * 86_400_000)).toBe(w.typeChange);
    expect(switchBackOf(after, NOW + 31 * 86_400_000)).toBeNull();
    const back = switchBackWrite(w.typeChange, AT);
    const undone = { ...after, ...back };
    expect(shopKindOf(undone)).toBe("products");
    expect(undone.sells).toBe("clothing");
    expect(switchBackOf(undone, NOW)).toBeNull();
    expect(switchBackOf({ ...after, sellsProducts: true }, NOW)).toBeNull();
  });

  it("says what stays, what's added and what the menu hides, with real counts", () => {
    const c = { products: 12, orders: 1, services: 3, upcoming: 4, clients: null };
    const toServices = whatChanges("products", "services", c);
    expect(toServices.hidden[0]).toBe("Your 12 products and 1 order: kept, out of your menu");
    expect(toServices.added[0]).toMatch(/Calendar/);
    const toProducts = whatChanges("both", "products", c);
    expect(toProducts.stays[0]).toBe("Your 12 products and 1 order");
    expect(toProducts.hidden[0]).toBe("Your 3 services, 4 upcoming bookings and clients: kept");
    expect(whatChanges("services", "both", c).added.join(" ")).toMatch(/Products, Orders/);
    expect(leavesServices("both", "products")).toBe(true);
    expect(needsBookings("products", "both")).toBe(true);
    expect(needsBookings("services", "both")).toBe(false);
  });
});
