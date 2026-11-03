// The fair day email (fairDayEmail.js): the same figures as the Fair till's own end of day, silent on a quiet day.
import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { fairDaySummary, buildFairDayEmail, fairDayEmailEnabled, fairNameOf, currencyCode, torontoDay } = require("./fairDayEmail");

const books = [
  { id: "a", title: "Harbour Lights", currency: "CA$", hist: [
    { chan: "Book Fair", date: "2026-11-03", num: "POS-1", qty: 2, price: 24, notes: "Cash · Harbour Fair" },
    { chan: "Book Fair", date: "2026-11-03", num: "POS-2", qty: 1, price: 20, cur: "USD", notes: "Card · Harbour Fair" },
    { chan: "Book Fair", date: "2026-11-03", num: "POS-3", qty: 1, price: 24, notes: "Cash · Harbour Fair", voided: true },
    { chan: "Book Fair", date: "2026-11-02", num: "POS-0", qty: 5, price: 24, notes: "Cash" },
    { chan: "Consignment", date: "2026-11-03", num: 7, qty: 3, price: 12, notes: "Corner Books" },
  ] },
  { id: "b", title: "Tide Tables <i>", hist: [
    { chan: "Book Fair", date: "2026-11-03", num: "POS-1", qty: 1, price: 18, notes: "Cash · Harbour Fair · Price CA$20.00→CA$18.00" },
  ] },
];

describe("the fair day email", () => {
  test("counts live till sales of the day, one per checkout, per currency", () => {
    const sum = fairDaySummary(books, "2026-11-03");
    expect(sum).toMatchObject({ day: "2026-11-03", fairs: ["Harbour Fair"], sales: 2, units: 4 });
    expect(sum.totals).toEqual([{ cur: "CAD", amount: 66 }, { cur: "USD", amount: 20 }]);
    expect(sum.methods).toEqual([
      { label: "Card reader", sales: 1, totals: [{ cur: "USD", amount: 20 }] },
      { label: "Cash", sales: 1, totals: [{ cur: "CAD", amount: 66 }] },
    ]);
    expect(sum.titles.map((t) => [t.title, t.units])).toEqual([["Harbour Lights", 3], ["Tide Tables <i>", 1]]);
  });

  test("says the takings and the fair, escapes titles, and links to All sales", () => {
    const email = buildFairDayEmail(fairDaySummary(books, "2026-11-03"), { link: (p) => `https://shop.example${p}`, words: (t) => t.replace(/books?/g, (m) => (m === "book" ? "product" : "products")) });
    expect(email.subject).toBe("[FAIR DAY] $66.00 + US$20.00 · 2 sales at Harbour Fair");
    expect(email.html).toContain("4 products in 2 sales");
    expect(email.html).toContain("Tide Tables &lt;i&gt;");
    expect(email.html).not.toContain("<i>");
    expect(email.html).toContain("https://shop.example/admin#sales");
  });

  test("sends nothing on a day the till sold nothing", () => {
    expect(buildFairDayEmail(fairDaySummary(books, "2026-11-04"))).toBeNull();
    expect(buildFairDayEmail(fairDaySummary([], "2026-11-03"))).toBeNull();
    expect(buildFairDayEmail(null)).toBeNull();
  });

  test("agrees with the stockroom on the fair's name and the book's currency", () => {
    expect(fairNameOf("Stripe QR (printed code, check it arrived in Stripe) · Night Market")).toBe("Night Market");
    expect(fairNameOf("Cash · Price CA$24.00→CA$20.00")).toBe("");
    expect(fairNameOf("Corner Books")).toBe("");
    expect([currencyCode("CA$"), currencyCode("usd"), currencyCode(""), currencyCode("weird")]).toEqual(["CAD", "USD", "CAD", "CAD"]);
  });

  test("is on unless switched off, and the day is Toronto's", () => {
    expect(fairDayEmailEnabled({})).toBe(true);
    expect(fairDayEmailEnabled({ shopAlerts: { fairDaySummary: false } })).toBe(false);
    expect(torontoDay(Date.parse("2026-11-04T02:00:00Z"))).toBe("2026-11-03");
  });
  test("matches the till's own end of day on the same records", async () => {
    const till = await import("../../stockroom/src/lib/fair-mode.js");
    const day = till.registerSalesForDay(books, "2026-11-03");
    const mine = fairDaySummary(books, "2026-11-03");
    expect(mine.sales).toBe(day.sales.length);
    expect(mine.units).toBe(day.units);
    const notes = ["Cash · Harbour Fair", "Card · A · B", "Stripe QR (printed code, check it arrived in Stripe) · Night", "Cash · Price $1→$2", "Other thing", ""];
    for (const n of notes) expect(fairNameOf(n), n).toBe(till.fairNameOf(n));
  });
});
