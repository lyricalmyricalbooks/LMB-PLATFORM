import { describe, expect, it } from "vitest";
import { addItemsProblem, linkFormForAddOn, emptyLinkForm, linkableBooks, linkFormFromQuote, linkFormProblems, linkRequest, linkState, linkSubtotal, MAX_LINE_QUANTITY, newRow, quoteRequestOf, shopPriceOf, type LinkForm } from "./paymentLinks";
import { quoteMessage, quoteSubject } from "../features/site/extras/pdp-bulk-quote/bulkQuote";
import { createRequire } from "module";

const serverLinks = createRequire(import.meta.url)("../../../functions/paymentLinks.js");

const books = [
  { id: "tee", title: "Tee", retailPrice: 40, status: "published" },
  { id: "hoodie", title: "Hoodie", retailPrice: 60, variants: [{ id: "xl", name: "XL", price: 66 }] },
  { id: "card", title: "Gift card", productType: "giftCard", retailPrice: 25 },
];
const filled = (patch: Partial<LinkForm> = {}): LinkForm => ({
  ...emptyLinkForm(),
  name: "Robin", email: "robin@example.com", street: "1 King St", city: "Toronto", state: "ON", zip: "M5H1A1", shipping: "12",
  rows: [{ ...newRow(), bookId: "tee", quantity: "10", price: "25" }, { ...newRow(), bookId: "hoodie", variantId: "xl", quantity: "1", price: "" }],
  ...patch,
});

describe("payment link form", () => {
  it("is ready when the customer, address, shipping and products are filled in", () => {
    expect(linkFormProblems(filled(), books)).toEqual({});
  });

  it("names each problem in plain words", () => {
    const form = filled({ name: "", email: "x", state: "", shipping: "", street: "", rows: [{ ...newRow(), bookId: "hoodie", quantity: "1", price: "" }] });
    const problems = linkFormProblems(form, books);
    expect(problems.name).toMatch(/name/);
    expect(problems.email).toMatch(/email/);
    expect(problems.state).toMatch(/province/);
    expect(problems.shipping).toMatch(/shipping/);
    expect(problems.street).toMatch(/street/);
    expect(Object.values(problems).join(" ")).toMatch(/Choose an edition/);
  });

  it("needs no street address or shipping charge when nothing is shipped, but still the province for tax", () => {
    const problems = linkFormProblems(filled({ ship: false, street: "", city: "", zip: "", shipping: "" }), books);
    expect(problems).toEqual({});
    expect(linkFormProblems(filled({ ship: false, state: "" }), books).state).toBeTruthy();
  });

  it("refuses an empty order, a bad quantity or price, and the same product twice", () => {
    expect(linkFormProblems(filled({ rows: [newRow()] }), books).rows).toBeTruthy();
    const row = (patch: any) => ({ ...newRow(), bookId: "tee", quantity: "1", price: "", ...patch });
    expect(Object.values(linkFormProblems(filled({ rows: [row({ quantity: "0" })] }), books))).toHaveLength(1);
    expect(Object.values(linkFormProblems(filled({ rows: [row({ price: "abc" })] }), books))).toHaveLength(1);
    expect(Object.values(linkFormProblems(filled({ rows: [row({}), row({})] }), books))[0]).toMatch(/another line/);
  });

  it("sends the cleaned request, with blank prices left for the shop's price", () => {
    expect(linkRequest(filled({ note: "  For the fair ", days: "14" }))).toEqual({
      customer: { name: "Robin", email: "robin@example.com", phone: "", address: { street: "1 King St", unit: "", city: "Toronto", state: "ON", zip: "M5H1A1", country: "CA" } },
      lines: [{ id: "tee", variantId: null, quantity: 10, price: 25 }, { id: "hoodie", variantId: "xl", quantity: 1, price: null }],
      shipping: 12, note: "For the fair", days: 14,
    });
    expect(linkRequest(filled({ ship: false })).shipping).toBeNull();
    expect(linkRequest(filled({ rows: [{ ...newRow(), bookId: "tee", quantity: "1", price: "$1,250.5" }] })).lines[0].price).toBe(1250.5);
  });

  it("previews the total before tax, at the shop's price where none is given", () => {
    expect(linkSubtotal(filled(), books)).toBe(250 + 66 + 12);
    expect(shopPriceOf(books[1], "")).toBeNull();
    expect(linkableBooks(books).map(b => b.id)).toEqual(["tee", "hoodie"]);
  });
});

describe("payment link on the order page", () => {
  const order = (patch: any = {}) => ({ id: "AB12", orderId: "AB12", paymentStatus: "unpaid", status: "pending_payment", customer: { name: "Robin Reader", email: "robin@example.com" }, paymentLink: { expiresAt: "2026-12-01T00:00:00.000Z", note: "Ten tees." }, ...patch });
  const now = Date.parse("2026-11-03T00:00:00Z");

  it("says where the link stands", () => {
    expect(linkState(order(), now)).toBe("open");
    expect(linkState(order(), Date.parse("2026-12-02T00:00:00Z"))).toBe("expired");
    expect(linkState(order({ paymentStatus: "paid", status: "open" }), now)).toBe("paid");
    expect(linkState(order({ status: "cancelled" }), now)).toBe("cancelled");
    expect(linkState({ paymentStatus: "unpaid" }, now)).toBeNull();
  });
});

describe("payment link from a bulk-price request (plan 21.4)", () => {
  // The exact words the product page's form sends (extras/pdp-bulk-quote), so a change there breaks this test.
  const request = (patch: { quantity?: string; note?: string; edition?: string; page?: string } = {}) => ({
    name: "Robin Reed", email: "robin@example.com",
    subject: quoteSubject("Bulk quote: {title}", "Hoodie", patch.edition),
    message: quoteMessage({ name: "Robin Reed", email: "robin@example.com", quantity: patch.quantity ?? "40", note: patch.note ?? "For our team." }, "Hoodie"),
    page: patch.page ?? "/books/hoodie",
  });
  const shelf = [...books.map(b => ({ ...b, slug: b.id })), { id: "other", slug: "other", title: "Hoodie (old)" }];

  it("reads the customer, copies, product page and edition from the request", () => {
    expect(quoteRequestOf(request({ edition: "XL" }))).toEqual({
      name: "Robin Reed", email: "robin@example.com", phone: "", quantity: 40, slug: "hoodie", title: "Hoodie", edition: "XL",
    });
  });

  it("ignores ordinary messages", () => {
    expect(quoteRequestOf({ name: "A", email: "a@example.com", message: "Do you ship to Spain?", page: "/contact" })).toBeNull();
    expect(quoteRequestOf({ name: "A", email: "a@example.com", message: "Quantity: 0\nBook: Tee" })).toBeNull();
  });

  it("starts the form with the product, its edition and the copies asked for", () => {
    const form = linkFormFromQuote(quoteRequestOf(request({ edition: "xl" }))!, shelf);
    expect(form).toMatchObject({ name: "Robin Reed", email: "robin@example.com" });
    expect(form.rows).toHaveLength(1);
    expect(form.rows[0]).toMatchObject({ bookId: "hoodie", variantId: "xl", quantity: "40", price: "" });
  });

  it("finds the product by its exact title when the page address is missing, and caps a line at its limit", () => {
    const form = linkFormFromQuote(quoteRequestOf(request({ page: "", quantity: "500" }))!, shelf);
    expect(form.rows[0]).toMatchObject({ bookId: "hoodie", variantId: "", quantity: String(MAX_LINE_QUANTITY) });
  });

  it("leaves the line to choose when the product is gone, and never offers a gift card", () => {
    expect(linkFormFromQuote(quoteRequestOf(request({ page: "/books/nope" }))!, shelf.filter(b => b.id !== "hoodie")).rows[0].bookId).toBe("");
    const card = { ...request({ page: "/books/card" }), message: "Quantity: 3\nBook: Gift card" };
    expect(linkFormFromQuote(quoteRequestOf(card)!, shelf).rows[0].bookId).toBe("");
  });
});

describe("add items to a paid order (plan 24.6)", () => {
  const paid = { id: "o1", orderId: "AB-1", paymentStatus: "paid", status: "processing", customer: { name: "Robin", email: "robin@example.com", address: { street: "1 King St", city: "Toronto", state: "ON", zip: "M5H1A1", country: "CA" } }, items: [{ id: "tee", quantity: 1 }] };
  it("is offered only on an active paid order that hasn't left, like the server", () => {
    expect(addItemsProblem(paid)).toBe("");
    const cases = [{ paymentStatus: "unpaid" }, { status: "cancelled" }, { isTest: true }, { fulfillmentStatus: "shipped" }, { fulfillmentStatus: "delivered" }];
    for (const patch of cases) {
      const o = { ...paid, ...patch };
      expect(addItemsProblem(o)).toBeTruthy();
      expect(serverLinks.addOnParentProblem(o)).toBeTruthy();
    }
    expect(serverLinks.addOnParentProblem(paid)).toBeNull();
  });
  it("starts with the order's customer, address, free shipping and a note, and sends shipsWith", () => {
    const form = { ...linkFormForAddOn(paid), rows: [{ ...newRow(), bookId: "tee", quantity: "2", price: "" }] };
    expect(form).toMatchObject({ name: "Robin", email: "robin@example.com", city: "Toronto", ship: true, shipping: "0", days: "14" });
    expect(form.note).toBe("These items are added to your order AB-1 and ship with it.");
    expect(linkFormProblems(form, books)).toEqual({});
    expect(linkRequest(form, "o1")).toMatchObject({ shipsWith: "o1", shipping: 0 });
    expect(linkRequest(form)).not.toHaveProperty("shipsWith");
    expect(serverLinks.cleanLinkInput(linkRequest(form, "o1")).shipsWith).toBe("o1");
  });
  it("adds nothing to ship for a pickup order", () => {
    expect(linkFormForAddOn({ ...paid, fulfillmentSelection: { method: "pickup" } })).toMatchObject({ ship: false, shipping: "" });
  });
});
