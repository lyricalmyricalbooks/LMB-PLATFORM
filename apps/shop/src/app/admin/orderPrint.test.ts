import { describe, expect, it, test } from "vitest";
import { packingSlipHtml, shopAddressLines } from "./orderPrint";

const order = { orderId: "LM-9", customer: { name: "Sam", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "CA" } }, items: [{ title: "Book", quantity: 1, format: "Paperback" }], orderNote: "Happy birthday <3" };

test("packing slip carries the shop, its return address, a thank-you and the gift message (escaped)", () => {
  const html = packingSlipHtml(order, { name: "Your Press", location: { street: "9 Press Rd", city: "Toronto", state: "ON", zip: "M2M2M2", country: "Canada" } });
  expect(html).toContain("Your Press");
  expect(html).toContain("9 Press Rd");
  expect(html).toContain("Return address");
  expect(html).toContain("Thank you for your order from Your Press!");
  expect(html).toContain("Happy birthday &lt;3");
  expect(html).not.toContain("<3");
});

test("no settings: still a plain slip", () => {
  expect(packingSlipHtml({ ...order, orderNote: "" })).not.toContain("Return address");
  expect(shopAddressLines({})).toEqual([]);
});

describe("items added later on the packing slip (plan 24.6)", () => {
  const first = { id: "o1", orderId: "AB-1", customer: { name: "Robin", address: {} }, items: [{ id: "a", title: "Salt Hours", quantity: 1 }] };
  it("prints paid added items to pack in the same parcel, and warns about unpaid ones", () => {
    const paid = { id: "o2", orderId: "ADD-1", paymentStatus: "paid", items: [{ id: "b", title: "Night Songs", quantity: 2 }] };
    const open = { id: "o3", orderId: "ADD-2", paymentStatus: "unpaid", status: "pending_payment", items: [{ id: "c", title: "Paper Weather", quantity: 1 }] };
    const closed = { ...open, id: "o4", status: "cancelled" };
    const html = packingSlipHtml(first, {}, [paid, open, closed]);
    expect(html).toContain("Added later (ADD-1), pack in this parcel");
    expect(html).toContain("Night Songs");
    expect(html).not.toContain("Paper Weather");
    expect(html).toContain("One more order of added items is waiting for payment");
    expect(packingSlipHtml(first)).not.toContain("Added later");
  });
});

test("a shop that sells no books gets its own column heading; a books shop's slip is unchanged", () => {
  const added = [{ id: "o2", orderId: "ADD-1", paymentStatus: "paid", items: [{ id: "b", title: "Tee", quantity: 1 }] }];
  const books = packingSlipHtml(order, {}, added);
  expect(books).toContain("<th>Book / edition</th>");
  const goods = packingSlipHtml(order, { goods: true }, added);
  expect(goods).not.toContain("Book / edition");
  expect(goods.match(/<th>Item \/ option<\/th>/g)?.length).toBe(2);
});
