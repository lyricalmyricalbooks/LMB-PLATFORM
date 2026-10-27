import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const gc = require("./giftCards");

describe("gift card codes", () => {
  it("are 16 unambiguous characters in groups of four", () => {
    for (let i = 0; i < 50; i++) expect(gc.newGiftCardCode()).toMatch(/^([A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/);
  });
  it("normalise what shoppers type and hash to a stable id", () => {
    expect(gc.normalizeGiftCardCode(" abcd efgh-jkmn pqrs ")).toBe("ABCD-EFGH-JKMN-PQRS");
    expect(gc.giftCardId("abcdefghjkmnpqrs")).toBe(gc.giftCardId("ABCD-EFGH-JKMN-PQRS"));
    expect(gc.giftCardId("short")).toBe("");
    expect(gc.giftCardId("ABCD-EFGH-JKMN-PQRS")).not.toContain("ABCD");
  });
});

describe("balances and holds", () => {
  const now = 1_000_000;
  const card = { enabled: true, balanceMinor: 5000, holds: { other: { minor: 2000, expiresAt: now + 1 }, old: { minor: 3000, expiresAt: now - 1 }, mine: { minor: 1000, expiresAt: now + 1 } } };
  it("ignore expired holds and the order's own hold", () => {
    expect(gc.availableMinor(card, "mine", now)).toBe(3000);
    expect(gc.availableMinor(card, "", now)).toBe(2000);
  });
  it("spread the amount due over cards in order", () => {
    expect(gc.allocateGiftCards([{ id: "a", availableMinor: 1500 }, { id: "b", availableMinor: 9000 }, { id: "c", availableMinor: 100 }], 4000)).toEqual([{ id: "a", minor: 1500 }, { id: "b", minor: 2500 }]);
    expect(gc.allocateGiftCards([{ id: "a", availableMinor: 0 }], 10)).toEqual([]);
  });
  it("explain why a card can't be used", () => {
    const now2 = new Date("2026-10-09T16:00:00Z");
    expect(gc.giftCardProblem(null)).toBe("not_found");
    expect(gc.giftCardProblem({ enabled: false, balanceMinor: 1 })).toBe("disabled");
    expect(gc.giftCardProblem({ balanceMinor: 1, expiresOn: "2026-10-08" }, { now: now2 })).toBe("expired");
    expect(gc.giftCardProblem({ balanceMinor: 1, expiresOn: "2026-10-09" }, { now: now2 })).toBeNull();
    expect(gc.giftCardProblem({ balanceMinor: 0 })).toBe("empty");
    expect(gc.giftCardProblem({ balanceMinor: 1, isTest: true })).toBe("not_found");
    expect(gc.giftCardProblem({ balanceMinor: 1, isTest: true }, { testMode: true })).toBeNull();
  });
  it("debit only when every card still has the money", () => {
    const cards = new Map([["a", { balanceMinor: 1000 }], ["b", { balanceMinor: 50 }]]);
    expect(gc.debitShortfall([{ id: "a", minor: 1000 }], cards)).toBeNull();
    expect(gc.debitShortfall([{ id: "a", minor: 1000 }, { id: "b", minor: 60 }], cards)).toBe("b");
    expect(gc.debitShortfall([{ id: "zz", minor: 1 }], cards)).toBe("zz");
  });
  it("write the debit, drop the order's hold and keep a history line", () => {
    const writes = [];
    const tx = { update: (ref, data) => writes.push([ref.id, data]) };
    const db = { collection: () => ({ doc: id => ({ id }) }) };
    const cards = new Map([["a", { balanceMinor: 1000, holds: { o1: { minor: 400 }, o2: { minor: 5 } }, history: [] }]]);
    gc.writeGiftCardChange(tx, db, "o1", [{ id: "a", minor: 400 }], cards, -1, "t");
    expect(writes[0][1]).toMatchObject({ balanceMinor: 600, holds: { o2: { minor: 5 } }, history: [{ type: "redeemed", minor: 400, orderId: "o1" }] });
  });
});

describe("issuing cards for a paid order", () => {
  it("makes one card per copy at the line's price, addressed to the recipient", () => {
    let n = 0;
    const makeCode = () => `AAAA-BBBB-CCCC-${String(1000 + n++).replace(/0/g, "2").replace(/1/g, "3")}`;
    const order = { customer: { email: "Buyer@x.com", name: "Bea" }, items: [
      { id: "book", price: 20, quantity: 1 },
      { id: "gc", giftCard: true, price: 25, quantity: 2, giftCardDetails: { recipientEmail: "sam@x.com", message: "Happy birthday" } },
    ] };
    const cards = gc.cardsForOrder("o1", order, { makeCode });
    expect(cards).toHaveLength(2);
    expect(cards[0].data).toMatchObject({ initialMinor: 2500, balanceMinor: 2500, recipientEmail: "sam@x.com", senderName: "Bea", purchaserEmail: "buyer@x.com", orderId: "o1", lineIndex: 1 });
    expect(cards[0].id).toBe(gc.giftCardId(cards[0].data.code));
    expect(new Set(cards.map(c => c.id)).size).toBe(2);
    expect(gc.cardsForOrder("o2", { ...order, sandboxPayment: true }, { makeCode })[0].data.isTest).toBe(true);
  });
});
