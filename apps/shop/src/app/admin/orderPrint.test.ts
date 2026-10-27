import { expect, test } from "vitest";
import { packingSlipHtml, shopAddressLines } from "./orderPrint";

const order = { orderId: "LM-9", customer: { name: "Sam", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "CA" } }, items: [{ title: "Book", quantity: 1, format: "Paperback" }], orderNote: "Happy birthday <3" };

test("packing slip carries the shop, its return address, a thank-you and the gift message (escaped)", () => {
  const html = packingSlipHtml(order, { name: "Lyricalmyrical Books", location: { street: "9 Press Rd", city: "Toronto", state: "ON", zip: "M2M2M2", country: "Canada" } });
  expect(html).toContain("Lyricalmyrical Books");
  expect(html).toContain("9 Press Rd");
  expect(html).toContain("Return address");
  expect(html).toContain("Thank you for your order from Lyricalmyrical Books!");
  expect(html).toContain("Happy birthday &lt;3");
  expect(html).not.toContain("<3");
});

test("no settings: still a plain slip", () => {
  expect(packingSlipHtml({ ...order, orderNote: "" })).not.toContain("Return address");
  expect(shopAddressLines({})).toEqual([]);
});
