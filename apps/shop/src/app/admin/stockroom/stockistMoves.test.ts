import { describe, expect, it } from "vitest";
import { deriveOnHand } from "@stockroom/inventory.js";
import { recomputeAfters } from "@stockroom/recompute-afters.js";
import { recordStoreSale, sendCopies, takeReturn } from "./stockistMoves";

const book = { id: "b1", maxPrint: 100, currency: "CAD" };
const fresh = () => ({ hist: [], ledger: [], stores: [{ id: 1, name: "Corner Books", rate: 40, sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 }] } as Record<string, any>);
const settle = (s: Record<string, any>) => { recomputeAfters(s, book); return s; };

describe("stockist moves (old confirmSend / confirmSale / confirmReturn)", () => {
  it("send, sell and return move the shelf, stock and money as the old app", () => {
    const s = settle(sendCopies(book, "corner books", { qty: 10, date: "2026-03-01" })(fresh()));
    expect(deriveOnHand(s, book)).toBe(90);
    expect(s.stores[0]).toMatchObject({ sent: 10, outstanding: 10 });
    settle(recordStoreSale(book, "Corner Books", { qty: 4, unitPrice: 25, date: "2026-03-10", paid: "pending" })(s));
    expect(s.stores[0]).toMatchObject({ sold: 4, outstanding: 6, amountOwed: 60 });
    expect(s.ledger[1]).toMatchObject({ type: "Sale", amountDue: 60, status: "pending" });
    expect(s.hist[0]).toMatchObject({ chan: "Consignment", qty: 4, price: 15, consignmentLink: true });
    settle(takeReturn("Corner Books", { qty: 2, date: "2026-04-01", good: true })(s));
    expect(s.stores[0]).toMatchObject({ returned: 2, outstanding: 4 });
    expect(deriveOnHand(s, book)).toBe(92);
  });
  it("a sale in another currency keeps the shop's figures and asks for a rate", () => {
    const s = sendCopies(book, "Corner Books", { qty: 5, date: "2026-03-01" })(fresh());
    expect(() => recordStoreSale(book, "Corner Books", { qty: 1, unitPrice: 20, date: "2026-03-02", paid: "pending", saleCur: "USD" })(s)).toThrow("one USD");
    recordStoreSale(book, "Corner Books", { qty: 1, unitPrice: 20, date: "2026-03-02", paid: "pending", saleCur: "USD", fxRate: 1.4 })(s);
    expect(s.ledger[1]).toMatchObject({ amountDue: 16.8, sale: { currency: "USD", due: 12 } });
  });
  it("refuses more than the shelf or stock holds", () => {
    expect(() => sendCopies(book, "Corner Books", { qty: 101, date: "2026-03-01" })(fresh())).toThrow("Only 100");
    expect(() => takeReturn("Corner Books", { qty: 1, date: "2026-03-01", good: true })(fresh())).toThrow("Only 0");
  });
});
