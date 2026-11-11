import { describe, expect, test } from "vitest";
import { attachCardLinkChange, cardLinkOf, cardLinkRefusal, recordCardPayments, waitingCardLinks } from "./invoiceCardPay";

const tok = "a".repeat(32);
const records = (invoices: any[]) => ({ books: [{ id: "b1" }], states: { b1: { invoices } } }) as any;

describe("card pay links on invoices", () => {
  test("only links this admin made count", () => {
    expect(cardLinkOf({ stripe: { url: "https://x", token: tok } })).toEqual({ url: "https://x", token: tok });
    expect(cardLinkOf({ stripe: { url: "https://buy.stripe.com/old" } })).toBeNull();
  });
  test("refuses paid, cancelled and tiny invoices", () => {
    expect(cardLinkRefusal({ status: "paid", total: 10 })).toMatch(/paid/);
    expect(cardLinkRefusal({ status: "sent", total: 0.2 })).toMatch(/0.50/);
    expect(cardLinkRefusal({ status: "sent", total: 10 })).toBeNull();
  });
  test("attaching saves the link as the payment link", () => {
    const state = { invoices: [{ id: "i1", status: "sent", total: 12, currencyCode: "CAD" }] };
    const out: any = attachCardLinkChange("i1", { url: "https://u", token: tok }, 5)(state);
    expect(out.invoices[0].paymentLink).toBe("https://u");
    expect(out.invoices[0].stripe).toMatchObject({ token: tok, amount: 12, currency: "CAD" });
  });
  test("marks only paid links, and never throws when the server is away", async () => {
    const recs = records([{ id: "i1", status: "sent", total: 12, stripe: { url: "u", token: tok } }, { id: "i2", status: "paid", stripe: { url: "u", token: "b".repeat(32) } }]);
    expect([...waitingCardLinks(recs).keys()]).toEqual([tok]);
    const saved: string[] = [];
    const ids = await recordCardPayments(recs, {
      status: async () => ({ [tok]: { ref: "b1:i1", paid: true, paidAt: "2026-11-11T12:00:00Z", amountMinor: 1200, currency: "CAD", open: true } }),
      save: async (bookId) => { saved.push(bookId); return { ok: true, state: {} }; },
    });
    expect(ids).toEqual(["i1"]);
    expect(saved).toEqual(["b1"]);
    expect(await recordCardPayments(recs, { status: async () => { throw new Error("down"); }, save: async () => ({ ok: true }) })).toEqual([]);
  });
});
