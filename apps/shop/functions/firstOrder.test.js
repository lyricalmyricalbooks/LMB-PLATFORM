// The paid-order email celebrates the shop's first real sale (sign-up to open shop plan, move 5).
import { expect, it as test } from "vitest";
const { isFirstRealSale, firstSaleWords } = require("./firstOrder");

const fakeDb = (orders) => ({
  collection: () => ({
    where: (field, op, value) => ({
      limit: (n) => ({
        get: async () => {
          const docs = Object.entries(orders).filter(([, o]) => o[field] === value).slice(0, n).map(([id, o]) => ({ id, data: () => o }));
          return { docs, size: docs.length };
        },
      }),
    }),
  }),
});
const paid = (extra = {}) => ({ paymentStatus: "paid", ...extra });

test("the first real paid order is the first sale; tests, practice orders and past orders don't count", async () => {
  expect(await isFirstRealSale(fakeDb({ a: paid() }), "a", paid())).toBe(true);
  expect(await isFirstRealSale(fakeDb({ t: paid({ isTest: true }), p: paid({ sandboxPayment: true }), i: paid({ source: "import" }), a: paid() }), "a", paid())).toBe(true);
  expect(await isFirstRealSale(fakeDb({ b: paid(), a: paid() }), "a", paid())).toBe(false);
  expect(await isFirstRealSale(fakeDb({ a: paid({ isTest: true }) }), "a", paid({ isTest: true }))).toBe(false);
});

test("when the few paid orders read are all tests, it can't tell, so the email stays the plain one", async () => {
  const many = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`t${i}`, paid({ isTest: true })]));
  expect(await isFirstRealSale(fakeDb({ ...many, a: paid() }), "a", paid())).toBe(false);
});

test("the words name the customer safely and say what to do next", () => {
  const words = firstSaleWords({ orderRef: "LMB-1", total: "$20.00", customer: "Ada <b>", escapeHtml: (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;") });
  expect(words.subject).toMatch(/^\[NEW ORDER\] Your first order! LMB-1/);
  expect(words.html).toMatch(/Ada &lt;b&gt; just bought from you/);
  expect(words.html).toMatch(/What to do next/);
});
