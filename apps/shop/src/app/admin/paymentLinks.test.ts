import { describe, expect, it } from "vitest";
import { emptyLinkForm, linkableBooks, linkFormProblems, linkRequest, linkState, linkSubtotal, newRow, paymentLinkMailto, shopPriceOf, type LinkForm } from "./paymentLinks";

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

  it("writes the email for the owner's own mail app", () => {
    const mailto = paymentLinkMailto(order(), "https://shop.example/track?orderId=AB12&key=k", "Field Notes");
    expect(mailto.startsWith("mailto:robin@example.com?subject=")).toBe(true);
    const body = decodeURIComponent(mailto.split("&body=")[1]);
    expect(body).toContain("Hi Robin,");
    expect(body).toContain("https://shop.example/track?orderId=AB12&key=k");
    expect(body).toContain("Ten tees.");
    expect(body).toContain("open until 2026-12-01");
    expect(paymentLinkMailto(order({ customer: { email: "bad address" } }), "https://x", "")).toBe("");
  });
});
