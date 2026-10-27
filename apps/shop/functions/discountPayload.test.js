import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

// Checkout mirrors the server's discount maths for display (Checkout.tsx discountAmount).
// Every rule field that maths reads must reach the browser, or the shopper sees a different
// discount (and a capped 100% code was routed to the $0 path the server then refused).
test("validateDiscountCode sends every field the checkout mirror reads", () => {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("exports.validateDiscountCode"), source.indexOf("exports.validateDiscountCode") + 3000);
  const checkout = readFileSync(new URL("../src/app/Checkout.tsx", import.meta.url), "utf8");
  const read = new Set([...checkout.matchAll(/appliedDiscount\.(\w+)/g)].map(m => m[1]));
  for (const field of read) expect(handler, `checkout reads appliedDiscount.${field}`).toMatch(new RegExp(`\\b${field}:`));
});
