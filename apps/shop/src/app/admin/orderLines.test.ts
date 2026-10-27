import { describe, expect, it } from "vitest";
import { addOnLines, bundlePartsText, discountLabel, giftCardConflictOpen, giftCardLineText, lineDetails, lineDetailsSummary } from "./orderLines";
import { buildPickList, isDigitalItem, physicalItems, queueOf } from "./fulfillment";

const boxSet = {
  id: "box", title: "Trilogy", quantity: 2, bundle: true,
  components: [{ id: "a", quantity: 2, title: "Title A" }, { id: "b", variantId: "hc", quantity: 1, title: "Title B", variantName: "Hardcover" }],
};
const signed = { id: "a", title: "Title A", quantity: 1, addOns: [{ id: "sig", label: "Signed copy", price: 5 }, { id: "ins", label: "Personal inscription", price: 10, text: "For Sam" }] };
const giftLine = { id: "gc", title: "Gift card", quantity: 1, giftCard: true, giftCardDetails: { recipientEmail: "sam@x.com" } };

describe("order line details", () => {
  it("spells out add-ons with the inscription wording", () => {
    expect(addOnLines(signed)).toEqual(["Signed copy", "Personal inscription: “For Sam”"]);
  });
  it("lists the books inside a box set", () => {
    expect(bundlePartsText(boxSet)).toBe("2 × Title A, 1 × Title B (Hardcover)");
    expect(lineDetails(boxSet)[0]).toBe("Includes: 2 × Title A, 1 × Title B (Hardcover) (per set)");
  });
  it("names gift card recipients and the free gift", () => {
    expect(giftCardLineText(giftLine)).toMatch(/^Gift card for sam@x.com/);
    expect(giftCardLineText({ giftCard: true }, { customer: { email: "buyer@x.com" } })).toMatch(/buyer@x.com/);
    expect(lineDetails({ promoGift: true })).toEqual(["Free gift"]);
    expect(lineDetailsSummary({ items: [signed, { id: "plain", title: "Plain" }] })).toBe("Title A: Add-on: Signed copy; Add-on: Personal inscription: “For Sam”");
  });
  it("labels automatic discounts by their title", () => {
    expect(discountLabel({ appliedDiscount: { code: "SPRING" } })).toBe("SPRING");
    expect(discountLabel({ appliedDiscount: { code: null, automatic: true, title: "Fall sale" } })).toBe("Fall sale (automatic)");
    expect(discountLabel({})).toBe("");
  });
});

describe("fulfillment with gift cards and box sets", () => {
  it("never ships gift cards", () => {
    expect(isDigitalItem(giftLine)).toBe(true);
    expect(physicalItems({ items: [giftLine, signed] })).toEqual([signed]);
    expect(queueOf({ paymentStatus: "paid", items: [giftLine] })).toBe("Completed");
  });
  it("counts the books inside box sets on the pick list and tallies add-ons", () => {
    const list = buildPickList([{ items: [boxSet, signed] }, { items: [{ ...signed, addOns: [signed.addOns[0]] }] }]);
    const a = list.find((i) => i.id === "a")!;
    expect(a.quantity).toBe(2 * 2 + 1 + 1);
    expect(a.addOnCounts).toEqual({ "Signed copy": 2, "Personal inscription": 1 });
    expect(list.find((i) => i.id === "b")).toMatchObject({ quantity: 2, variantName: "Hardcover" });
    expect(list.some((i) => i.id === "box")).toBe(false);
  });
  it("puts an open gift card conflict in Needs attention", () => {
    const order = { paymentStatus: "unpaid", items: [signed], giftCardConflict: { reason: "balance", at: "x" } };
    expect(queueOf(order)).toBe("Needs attention");
    expect(giftCardConflictOpen(order)).toBe(true);
    expect(queueOf({ ...order, giftCardConflict: { resolvedAt: "y" } })).toBe("Unpaid");
  });
});

describe("returnStepsDone", () => {
  it("counts finished return steps and hides the tracker once a return is over without a refund", async () => {
    const { returnStepsDone } = await import("./orderLines");
    expect(["requested", "approved", "received", "inspected", "refund_pending", "completed"].map(returnStepsDone)).toEqual([0, 1, 2, 3, 4, 4]);
    expect(returnStepsDone("closed")).toBe(-1);
    expect(returnStepsDone("rejected")).toBe(-1);
  });
});
