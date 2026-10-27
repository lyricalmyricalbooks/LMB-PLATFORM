import { describe, expect, it } from "vitest";
import { FULFILLMENT_FLOW, FULFILLMENT_LABELS, orderApi } from "./commerce";

describe("order fulfillment states", () => {
  it("has a human label for every state, including terminal ones", () => {
    for (const key of Object.keys(FULFILLMENT_LABELS)) expect((FULFILLMENT_LABELS as any)[key]).toBeTruthy();
    expect(Object.keys(FULFILLMENT_LABELS)).toEqual(expect.arrayContaining(["pending_payment", "paid", "shipped", "delivered", "cancelled", "refunded"]));
  });

  it("orders the progress flow from unpaid to delivered", () => {
    expect(FULFILLMENT_FLOW[0]).toBe("pending_payment");
    expect(FULFILLMENT_FLOW.at(-1)).toBe("delivered");
    expect(FULFILLMENT_FLOW.indexOf("paid")).toBeLessThan(FULFILLMENT_FLOW.indexOf("shipped"));
    for (const step of FULFILLMENT_FLOW) expect((FULFILLMENT_LABELS as any)[step]).toBeTruthy();
  });
});

describe("orders CSV export", () => {
  const base = { createdAt: "2026-09-20", paymentStatus: "paid", customer: { name: 'Ada "The" Lovelace,\nJr', email: "a@x.com" }, status: "open", subtotal: 10, shipping: 5, total: 15, items: [{}, {}] };

  it("never exports marked test orders", () => {
    const csv = orderApi.exportToCsv([{ ...base, orderId: "LM-1" }, { ...base, orderId: "LM-TEST", isTest: true }]);
    expect(csv).toContain("LM-1");
    expect(csv).not.toContain("LM-TEST");
  });

  it("strips characters that would break CSV cells from customer names", () => {
    const csv = orderApi.exportToCsv([{ ...base, orderId: "LM-2" }]);
    const dataRow = csv.split("\n").slice(1).join("\n");
    expect(dataRow).not.toContain('"The"');
    expect(dataRow.split("\n")).toHaveLength(1);
  });

  it("exports paid and refunded orders with tax, payment and currency columns", () => {
    const csv = orderApi.exportToCsv([
      { ...base, orderId: "LM-USD", tax: 1.3, paymentMethod: "Stripe", checkoutCurrency: "USD", exchangeRate: 0.7, customer: { ...base.customer, address: { country: "Canada", state: "ON", zip: "M5V" } } },
      { ...base, orderId: "LM-ABANDONED", paymentStatus: "unpaid" },
      { ...base, orderId: "LM-REF", paymentStatus: "refunded", refundedAt: "2026-09-21", refund: { amount: 15, currency: "CAD" } },
    ]);
    const [header, ...rows] = csv.split("\n");
    expect(header).toContain('"Tax"');
    expect(header).toContain('"PaymentStatus"');
    expect(header).toContain('"Province"');
    expect(csv).not.toContain("LM-ABANDONED");
    expect(rows.find(r => r.includes("LM-USD"))).toContain('"10.50"');
    expect(rows.find(r => r.includes("LM-REF"))).toContain('"2026-09-21"');
  });

  it("exports the exact amount the payment was created for as ChargedAmount", () => {
    // 15 CAD × 0.7299 = 10.95, but the PaymentIntent (rounded per line) was 1096 cents.
    const csv = orderApi.exportToCsv([{ ...base, orderId: "LM-EXACT", checkoutCurrency: "USD", exchangeRate: 0.7299, expectedAmountMinor: 1096, expectedCurrency: "usd" }]);
    const [header, row] = csv.split("\n");
    const cells = (line: string) => line.split(",").map(c => c.replace(/^"|"$/g, ""));
    const at = cells(header).indexOf("ChargedAmount");
    expect(cells(row)[at]).toBe("10.96");
    expect(cells(row)[at + 1]).toBe("USD");
  });

  it("includes unpaid orders only when asked, and never runs cells as formulas", () => {
    const csv = orderApi.exportToCsv([{ ...base, orderId: "LM-U", paymentStatus: "unpaid", customer: { name: "=HYPERLINK(1)", email: "a@x.com" } }], { paidOnly: false });
    expect(csv).toContain("LM-U");
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });
});
