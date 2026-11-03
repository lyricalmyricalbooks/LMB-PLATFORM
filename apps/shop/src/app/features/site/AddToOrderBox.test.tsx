import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { addableBooks, AddToOrderBox, canAddToOrder } from "./AddToOrderBox";

const server = createRequire(import.meta.url)("../../../../functions/paymentLinks.js");
const paid = { id: "o1", paymentStatus: "paid", status: "processing", fulfillmentStatus: "processing" };

describe("add something to this order (plan 24.6)", () => {
  it("is offered on the same orders the server accepts", () => {
    const cases = [paid, { ...paid, paymentStatus: "partially_refunded" }, { ...paid, paymentStatus: "unpaid" }, { ...paid, status: "cancelled" },
      { ...paid, fulfillmentStatus: "shipped" }, { ...paid, fulfillmentStatus: "delivered" }, { ...paid, paymentStatus: "refunded" }];
    for (const o of cases) expect(canAddToOrder(o), JSON.stringify(o)).toBe(server.addOnParentProblem(o) === null);
    expect(canAddToOrder({ ...paid, shipsWith: "o0" })).toBe(false);
  });
  it("lists products a shopper can buy, never gift cards or coming-soon books", () => {
    const list = addableBooks([{ id: "b", title: "B" }, { id: "a", title: "A" }, { id: "g", title: "Card", productType: "giftCard" }, { id: "c", title: "Soon", comingSoon: true }]);
    expect(list.map(b => b.id)).toEqual(["a", "b"]);
  });
  it("shows its region on an eligible order and nothing otherwise", () => {
    const html = renderToStaticMarkup(<AddToOrderBox design={{}} order={paid} access={{}} books={[{ id: "a", title: "A" }]} />);
    expect(html).toContain("Add something to this order");
    expect(html).toContain('data-store-region="trackingAddItems"');
    expect(renderToStaticMarkup(<AddToOrderBox design={{}} order={{ ...paid, fulfillmentStatus: "shipped" }} access={{}} books={[{ id: "a" }]} />)).toBe("");
  });
});
