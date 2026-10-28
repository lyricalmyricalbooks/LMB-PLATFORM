import { describe, expect, test } from "vitest";
import { bookkeepingOrderLines, bookkeepingPayouts, dailyBookkeeping, dayOf, type BookkeepingOrder } from "./bookkeeping";
import { bookkeepingDaysCsv, bookkeepingMonths, bookkeepingOrdersCsv, bookkeepingPayoutsCsv } from "../app/admin/bookkeepingCsv";

const month = "2026-09";
const opts = { month, currency: "CAD", timeZone: "UTC" };
const day = (d: number, hour = 15) => `2026-09-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;

// A month of fake paid orders: books with HST ON or GST, shipping, some discounts, gift cards sold and used,
// Stripe-style fees, and two payouts (orders of the 1st–14th, then the 15th–28th).
function fakeMonth(): BookkeepingOrder[] {
  const orders: BookkeepingOrder[] = [];
  for (let d = 1; d <= 30; d++) {
    for (let n = 0; n < (d % 3) + 1; n++) {
      const price = 12 + ((d * 7 + n * 3) % 20) + 0.99;
      const quantity = 1 + ((d + n) % 2);
      const subtotalBooks = price * quantity;
      const discount = d % 5 === 0 ? Math.round(subtotalBooks * 0.1 * 100) / 100 : 0;
      const shipping = n % 2 ? 0 : 9.5;
      const ontario = (d + n) % 2 === 0;
      const tax = (subtotalBooks - discount) * (ontario ? 0.13 : 0.05);
      const cardSold = d === 12 && n === 0 ? 25 : 0;
      const items = [{ id: `b${d}`, price, quantity }, ...(cardSold ? [{ id: "gc", price: 25, quantity: 1, giftCard: true }] : [])];
      const subtotal = subtotalBooks + cardSold;
      const beforeCards = subtotal - discount + shipping + tax;
      const giftCardAmount = d === 20 && n === 0 ? 10 : 0;
      const total = Math.round((beforeCards - giftCardAmount) * 100) / 100;
      const fee = Math.round(total * 100 * 0.029) + 30;
      const payout = d <= 14 ? { payoutId: "po_first", payoutDate: "2026-09-16" } : d <= 28 ? { payoutId: "po_second", payoutDate: Date.UTC(2026, 8, 30, 12) / 1000 } : {};
      orders.push({
        id: `o-${d}-${n}`, paymentStatus: "paid", paidAt: day(d, 10 + n), createdAt: day(d, 9 + n), items, subtotal, discount, shipping, tax,
        taxLines: [{ name: ontario ? "HST ON" : "GST", cents: Math.round(tax * 100) }], total, giftCardAmount, fee, net: Math.round(total * 100) - fee, ...payout,
      });
    }
  }
  // Refunds: a full one (card), a partial one on another day, and a refund in US dollars.
  orders[3] = { ...orders[3], paymentStatus: "refunded", refund: { amount: Number(orders[3].total), currency: "CAD", createdAt: day(9) }, refundedAt: day(9), refundedAmountMinor: Math.round(Number(orders[3].total) * 100) };
  orders[10] = { ...orders[10], partiallyRefunded: true, refundedAmountMinor: 500, partialRefunds: [{ amountMinor: 500, currency: "CAD", status: "succeeded", createdAt: day(22) }] };
  orders[12] = { ...orders[12], checkoutCurrency: "USD", exchangeRate: 0.8, partialRefunds: [{ amountMinor: 800, currency: "USD", status: "succeeded", createdAt: day(25) }], refundedAmountMinor: 800 };
  // Left out: unpaid, test, sandbox, practice, and an order paid last month (its refund this month still counts).
  // The payment service's net has refunds taken off (plan 7.10).
  for (const i of [3, 10, 12]) {
    const o = orders[i];
    const refunded = i === 3 ? Math.round(Number(o.total) * 100) : i === 10 ? 500 : 1000;
    orders[i] = { ...o, net: Number(o.net) - refunded };
  }
  // The US-dollar order's fee and net are in US dollars, as the payment service keeps them.
  orders[12] = { ...orders[12], fee: Math.round(Number(orders[12].fee) * 0.8), net: Math.round(Number(orders[12].net) * 0.8) };
  orders.push({ id: "unpaid", paymentStatus: "unpaid", createdAt: day(5), total: 50, subtotal: 50 });
  orders.push({ id: "test", paymentStatus: "paid", isTest: true, paidAt: day(5), total: 50, subtotal: 50 });
  orders.push({ id: "sandbox", paymentStatus: "paid", sandboxPayment: true, paidAt: day(5), total: 50, subtotal: 50 });
  orders.push({ id: "practice-order", paymentStatus: "paid", practiceOrder: true, paidAt: day(6), total: 30, subtotal: 30, payoutId: "po_first", payoutDate: "2026-09-16" });
  orders.push({ id: "practice", paymentStatus: "paid", practice: true, paidAt: day(5), total: 50, subtotal: 50, payoutId: "po_first", payoutDate: "2026-09-16" });
  orders.push({ id: "august", paymentStatus: "refunded", paidAt: "2026-08-30T10:00:00.000Z", total: 40, subtotal: 40, refund: { amount: 40, currency: "CAD", createdAt: day(2) } });
  return orders;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("bookkeeping file (plan 7.12)", () => {
  const orders = fakeMonth();
  const days = dailyBookkeeping(orders, opts);
  const lines = bookkeepingOrderLines(orders, opts);

  test("daily totals equal the order sheet, column by column", () => {
    expect(days.length).toBe(30);
    for (const d of days) {
      const mine = lines.filter((l) => l.date === d.date);
      expect(d.salesCents).toBe(sum(mine.map((l) => l.salesCents)));
      expect(d.shippingCents).toBe(sum(mine.map((l) => l.shippingCents)));
      expect(d.discountsCents).toBe(sum(mine.map((l) => l.discountsCents)));
      expect(d.giftCardsSoldCents).toBe(sum(mine.map((l) => l.giftCardsSoldCents)));
      expect(d.giftCardsUsedCents).toBe(sum(mine.map((l) => l.giftCardsUsedCents)));
      expect(d.refundsCents).toBe(sum(mine.map((l) => l.refundsCents)));
      expect(d.feesCents).toBe(sum(mine.map((l) => l.feeCents || 0)));
      expect(d.netCents).toBe(sum(mine.map((l) => l.netCents)));
      for (const [name, cents] of Object.entries(d.taxes)) expect(cents).toBe(sum(mine.map((l) => l.taxes[name] || 0)));
      expect(d.currency).toBe("CAD");
    }
    // And the month adds up to the orders themselves.
    const sales = lines.filter((l) => l.kind === "Sale");
    expect(sum(days.map((d) => d.netCents))).toBe(sum(sales.map((l) => l.totalCents - (l.feeCents || 0))) - sum(days.map((d) => d.refundsCents)));
  });

  test("each day's net = sales − discounts + shipping + taxes + gift cards sold − gift cards used − fees − refunds", () => {
    for (const d of days) {
      const taxes = sum(Object.values(d.taxes));
      expect(d.netCents, d.date).toBe(d.salesCents - d.discountsCents + d.shippingCents + taxes + d.giftCardsSoldCents - d.giftCardsUsedCents - d.feesCents - d.refundsCents);
    }
  });

  test("refunds land on the day the money went back, in the shop's currency", () => {
    expect(days.find((d) => d.date === "2026-09-02")?.refundsCents).toBe(4000); // paid in August, refunded in September
    expect(days.find((d) => d.date === "2026-09-09")?.refundsCents).toBe(Math.round(Number(orders[3].total) * 100));
    expect(days.find((d) => d.date === "2026-09-22")?.refundsCents).toBe(500);
    expect(days.find((d) => d.date === "2026-09-25")?.refundsCents).toBe(1000); // US$8 at 0.8 = CA$10
    expect(lines.some((l) => l.orderId === "august" && l.kind === "Sale")).toBe(false);
  });

  test("test, sandbox, practice and unpaid orders are left out", () => {
    for (const id of ["unpaid", "test", "sandbox", "practice", "practice-order"]) expect(lines.some((l) => l.orderId === id), id).toBe(false);
  });

  test("taxes keep their names in the books", () => {
    expect(Object.keys(days.reduce((all, d) => ({ ...all, ...d.taxes }), {})).sort()).toEqual(["GST", "HST ON"]);
    const older = dailyBookkeeping([{ id: "old", paymentStatus: "paid", paidAt: day(3), subtotal: 10, tax: 1.3, total: 11.3 }], opts);
    expect(older[0].taxes).toEqual({ "Sales tax": 130 });
  });

  test("two payouts, each equal to the net of its orders", () => {
    const payouts = bookkeepingPayouts(orders, opts);
    expect(payouts.map((p) => [p.payoutId, p.date])).toEqual([["po_first", "2026-09-16"], ["po_second", "2026-09-30"]]);
    for (const p of payouts) {
      const mine = orders.filter((o) => o.payoutId === p.payoutId && !String(o.id).startsWith("practice"));
      expect(p.orders).toBe(mine.length);
      const inCad = (o: BookkeepingOrder, v: unknown) => (o.checkoutCurrency === "USD" ? Math.round(Number(v) / 0.8) : Number(v));
      expect(p.netCents).toBe(sum(mine.map((o) => inCad(o, o.net))));
      expect(p.feesCents).toBe(sum(mine.map((o) => inCad(o, o.fee))));
      expect(p.netCents).toBe(p.totalCents - p.feesCents - p.refundsCents);
    }
    // Refunds in the first payout: the card refund, CA$5 and US$8 (CA$10).
    const usdFee = Math.round(Number(orders[12].fee) / 0.8), usdNet = Math.round(Number(orders[12].net) / 0.8);
    const usdRefund = Math.round(Number(orders[12].total) * 100) - usdFee - usdNet; // ≈ CA$10, give or take a rounding cent
    expect(Math.abs(usdRefund - 1000)).toBeLessThanOrEqual(1);
    expect(payouts[0].refundsCents).toBe(Math.round(Number(orders[3].total) * 100) + 500 + usdRefund);
    expect(payouts[1].refundsCents).toBe(0);
    // October's sheet has neither payout.
    expect(bookkeepingPayouts(orders, { ...opts, month: "2026-10" })).toEqual([]);
  });

  test("missing fee and payout fields stay blank", () => {
    const [line] = bookkeepingOrderLines([{ id: "nofee", paymentStatus: "paid", paidAt: day(4), subtotal: 20, total: 20 }], opts);
    expect([line.feeCents, line.payoutId, line.payoutDate, line.netCents]).toEqual([null, null, null, 2000]);
    const csv = bookkeepingOrdersCsv([{ id: "nofee", paymentStatus: "paid", paidAt: day(4), subtotal: 20, total: 20 }], opts);
    expect(csv.split("\n")[1]).toBe('"2026-09-04","nofee","Sale","20.00","0.00","0.00","0.00","0.00","0.00","20.00","","20.00","","","CAD"');
  });

  test("a fee in the shopper's currency is converted back with the order's rate", () => {
    const usd = { id: "usd", paymentStatus: "paid", paidAt: day(7), subtotal: 25, total: 25, checkoutCurrency: "USD", exchangeRate: 0.8, fee: 88, net: 1912, payoutId: "po_x", payoutDate: "2026-09-20" };
    const [line] = bookkeepingOrderLines([usd], opts);
    expect([line.feeCents, line.netCents]).toEqual([110, 2390]);
    expect(bookkeepingPayouts([usd], opts)[0]).toMatchObject({ totalCents: 2500, feesCents: 110, refundsCents: 0, netCents: 2390 });
  });

  test("days follow the press's time zone", () => {
    expect(dayOf("2026-09-01T02:00:00.000Z", "America/Toronto")).toBe("2026-08-31");
    expect(dayOf("2026-09-01T02:00:00.000Z", "UTC")).toBe("2026-09-01");
    expect(dayOf(Date.UTC(2026, 8, 30, 12) / 1000)).toBe("2026-09-30");
    expect(dayOf("not a date")).toBe("");
  });

  test("the sheets are plain CSV to the cent, with one column per tax name", () => {
    const daysCsv = bookkeepingDaysCsv(orders, opts).trim().split("\n");
    expect(daysCsv[0]).toBe('"Date","Sales before tax","Shipping","Discounts","Gift cards sold","Gift cards used","Refunds","GST","HST ON","Card fees","Net","Currency"');
    expect(daysCsv).toHaveLength(31);
    for (const row of daysCsv.slice(1)) expect(row).toMatch(/^"2026-09-\d\d"(,"-?\d+\.\d\d"){10},"CAD"$/);
    const payoutsCsv = bookkeepingPayoutsCsv(orders, opts).trim().split("\n");
    expect(payoutsCsv[0]).toBe('"Payout","Date","Orders","Orders total","Card fees","Refunds","Net","Currency"');
    expect(payoutsCsv).toHaveLength(3);
    expect(bookkeepingOrdersCsv([{ id: "=cmd()", paymentStatus: "paid", paidAt: day(1), total: 1, subtotal: 1 }], opts)).toContain(`"'=cmd()"`);
  });

  test("month choices: this month first, then the year before", () => {
    const months = bookkeepingMonths(new Date(2026, 0, 15));
    expect(months.slice(0, 2).map((m) => m.value)).toEqual(["2026-01", "2025-12"]);
    expect(months).toHaveLength(13);
  });
});
