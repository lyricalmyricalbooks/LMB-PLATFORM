import { describe, expect, test } from "vitest";
import { attachCardLinkChange, cardLinkOf, cardLinkRefusal, closeStaleCardLinks, recordCardPayments, strayPaymentLine, waitingCardLinks } from "./invoiceCardPay";
import { deleteInvoiceChange } from "./invoiceMake";
import { markInvoicePaid } from "./stockists";

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

describe("card links that must stop taking money", () => {
  const link = { url: "https://u", token: tok };
  const inv = (more: object = {}) => ({ id: "i1", num: "A-1", status: "sent", total: 12, items: [], stripe: link, ...more });

  test("deleting an invoice, or marking it paid by hand, notes its link to close", () => {
    const gone: any = deleteInvoiceChange("i1", 7)({ invoices: [inv()] });
    expect(gone.invoices).toEqual([]);
    expect(gone.cardLinksToClose).toEqual([{ token: tok, num: "A-1", why: "deleted", at: 7 }]);
    const paid: any = markInvoicePaid("i1", 9)({ invoices: [inv()], hist: [], ledger: [], stores: [] });
    expect(paid.invoices[0].status).toBe("paid");
    expect(paid.cardLinksToClose).toMatchObject([{ token: tok, why: "paid" }]);
    // An invoice with no card link notes nothing.
    expect((deleteInvoiceChange("i1", 7)({ invoices: [inv({ stripe: undefined })] }) as any).cardLinksToClose).toBeUndefined();
  });

  test("a newer link notes the one it replaced", () => {
    const out: any = attachCardLinkChange("i1", { url: "https://n", token: "c".repeat(32) }, 5)({ invoices: [inv()] });
    expect(out.cardLinksToClose).toMatchObject([{ token: tok, why: "replaced" }]);
    expect(out.invoices[0].stripe.token).toBe("c".repeat(32));
  });

  test("closes a noted link, keeps watching it for a day, then forgets it", async () => {
    const recs = records([]);
    recs.states.b1.cardLinksToClose = [{ token: tok, num: "A-1", why: "deleted", at: 1 }];
    const asked: string[] = [];
    const deps = (now: number) => ({
      close: async (t: string) => { asked.push(t); return { paid: false, paidAt: null, amountMinor: 0, currency: "" }; },
      save: async (id: string, change: (s: any) => any) => { recs.states[id] = change(recs.states[id]); return { ok: true, state: recs.states[id] }; },
      now: () => now,
    });
    expect(await closeStaleCardLinks(recs, deps(1000))).toEqual([]);
    expect(recs.states.b1.cardLinksToClose).toMatchObject([{ token: tok, closedAt: 1000 }]);
    await closeStaleCardLinks(recs, deps(1000 + 25 * 3600 * 1000));
    expect(recs.states.b1.cardLinksToClose).toBeUndefined();
    expect(asked).toEqual([tok, tok]);
  });

  test("a payment that came in on an old link is reported, and a server that is away loses nothing", async () => {
    const recs = records([]);
    recs.states.b1.cardLinksToClose = [{ token: tok, num: "A-1", why: "changed", at: 1 }];
    const save = async (id: string, change: (s: any) => any) => { recs.states[id] = change(recs.states[id]); return { ok: true, state: recs.states[id] }; };
    expect(await closeStaleCardLinks(recs, { close: async () => { throw new Error("down"); }, save })).toEqual([]);
    expect(recs.states.b1.cardLinksToClose).toHaveLength(1);
    const strays = await closeStaleCardLinks(recs, { close: async () => ({ paid: true, paidAt: "2026-11-11T12:00:00Z", amountMinor: 1200, currency: "CAD" }), save });
    expect(strays).toMatchObject([{ num: "A-1", why: "changed", amountMinor: 1200 }]);
    expect(strayPaymentLine(strays[0])).toBe("12.00 CAD was paid by card on invoice A-1 after its amount was changed. Check it and refund what isn't owed.");
    expect(recs.states.b1.cardLinksToClose).toBeUndefined();
  });

  test("asks about every waiting link, fifty at a time", async () => {
    const hex = (n: number) => n.toString(16).padStart(32, "0");
    const recs = records(Array.from({ length: 120 }, (_, n) => ({ id: `i${n}`, status: "sent", total: 5, stripe: { url: "u", token: hex(n) } })));
    const sizes: number[] = [];
    const ids = await recordCardPayments(recs, {
      status: async (tokens) => { sizes.push(tokens.length); return Object.fromEntries(tokens.filter((t) => t === hex(110)).map((t) => [t, { ref: "", paid: true, paidAt: null, amountMinor: 500, currency: "CAD", open: true }])); },
      save: async () => ({ ok: true, state: {} }),
    });
    expect(sizes).toEqual([50, 50, 20]);
    expect(ids).toEqual(["i110"]);
  });
});
