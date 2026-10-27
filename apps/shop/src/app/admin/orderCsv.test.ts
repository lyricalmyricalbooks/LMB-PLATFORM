import { describe, expect, it } from "vitest";
import { csvRecords, exportOrdersCsv } from "./orderCsv";

const base = { paymentStatus: "paid", createdAt: "2026-10-01", subtotal: 40, total: 30, customer: { name: "R", email: "r@x.com", address: { street: "1 Main\nUnit 2" } } };

describe("orders CSV extras", () => {
  it("adds discount titles, gift card payments, cards sold and line extras on the right rows", () => {
    const csv = exportOrdersCsv([
      { ...base, orderId: "LM-1", appliedDiscount: { code: null, automatic: true, title: "Fall sale" }, giftCardAmount: 10, giftCardRedemptions: [{ id: "g", last4: "ABCD", minor: 1000 }],
        items: [{ id: "a", title: "Book", quantity: 1, addOns: [{ id: "s", label: "Signed copy", price: 5 }] }] },
      { ...base, orderId: "LM-2", items: [{ id: "gc", title: "Gift card", quantity: 1, giftCard: true }], giftCardsIssued: [{ id: "x", last4: "WXYZ", minor: 2500, recipientEmail: "sam@x.com" }] },
      { ...base, orderId: "LM-UNPAID", paymentStatus: "unpaid" },
    ]);
    const rows = csvRecords(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/"DiscountLabel","GiftCardPaid","GiftCardsUsed","GiftCardsSold","LineExtras"$/);
    expect(rows[1]).toContain('"LM-1"');
    expect(rows[1]).toContain('"Fall sale (automatic)","10.00","••••ABCD","","Book: Add-on: Signed copy"');
    expect(rows[2]).toContain('"LM-2"');
    expect(rows[2]).toContain('"••••WXYZ 25.00 to sam@x.com"');
  });
  it("keeps quoted newlines inside one record", () => {
    expect(csvRecords('"a","b\nc"\n"d","e"')).toEqual(['"a","b\nc"', '"d","e"']);
  });
});
