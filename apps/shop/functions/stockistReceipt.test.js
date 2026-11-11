import { test, expect } from "vitest";
import { createRequire } from "node:module";
const { buildStockistReceipt, handleStockistReceipt } = createRequire(import.meta.url)("./stockistReceipt");

const input = { to: "shop@example.com", stockistName: "Harbour <b>", invoiceNum: "INV-7", amount: "CA$40.00", paidOn: "Nov 11, 2026" };

test("builds an escaped receipt with a clean subject", () => {
  const r = buildStockistReceipt(input, { shopName: "Moth Press" });
  expect(r.to).toBe("shop@example.com");
  expect(r.subject).toBe("Payment received for INV-7 — Moth Press");
  expect(r.html).toContain("CA$40.00");
  expect(r.html).toContain("Harbour &lt;b&gt;");
  expect(r.html).not.toContain("<b>,");
});

test("refuses a missing or header-injecting address and a missing amount", () => {
  expect(() => buildStockistReceipt({ ...input, to: "" })).toThrow(/valid email/);
  expect(() => buildStockistReceipt({ ...input, to: "a@x.com\r\nBcc: b@y.com" })).toThrow(/valid email/);
  expect(() => buildStockistReceipt({ ...input, amount: " " })).toThrow(/amount/);
  expect(buildStockistReceipt({ ...input, invoiceNum: "x\r\nBcc: z" }).subject).not.toMatch(/[\r\n]/);
});

const db = { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ communications: { fromName: "Moth Press" } }) }) }) }) };

test("sends once through the shop's sender", async () => {
  const sent = [];
  const out = await handleStockistReceipt(input, { db, sendEmail: async (m) => { sent.push(m); }, secret: "test" });
  expect(out.status).toBe(200);
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe("shop@example.com");
});

test("says so when the address is bad or the send fails, sending nothing twice", async () => {
  const sent = [];
  const bad = await handleStockistReceipt({ ...input, to: "nope" }, { db, sendEmail: async (m) => { sent.push(m); }, secret: "t" });
  expect(bad.status).toBe(400);
  expect(sent).toHaveLength(0);
  const failed = await handleStockistReceipt(input, { db, sendEmail: async () => { throw new Error("quota"); }, secret: "t" });
  expect(failed.status).toBe(502);
  expect(failed.json.error).toMatch(/quota/);
});
