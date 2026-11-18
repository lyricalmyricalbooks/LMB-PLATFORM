// "What do you sell? Pick all that fit." (product types plan, change 12): the sign-up question, and how the picks travel
// with the shop: the sign-up check, the press's setup record, the shop the maker builds and its first-week record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PRODUCT_GROUPS, checkSignup, cleanProductGroups, sellsForGroups } from "./form.js";
import { newPressRecord, setupChange } from "./pressRecord.js";
import { shopFromSignup } from "./shopMaker.js";
import { productGroups } from "../setup/later-steps.js";

const { TYPE_GROUPS } = createRequire(import.meta.url)("../apps/shop/functions/shared/productTypes.js");
const GOOD = { pressName: "Moth Press", country: "CA", termsAccepted: true, termsVersion: "v1" };
const record = () => newPressRecord({ pressId: "press-12345678", ownerUid: "uid-1", email: "owner@example.com", now: new Date("2026-11-17T12:00:00Z") });

test("the question offers the shop's product groups, by the same ids and in the same order", () => {
  assert.deepEqual(PRODUCT_GROUPS.options.map((o) => o.id), TYPE_GROUPS.map((g) => g.id));
  for (const o of PRODUCT_GROUPS.options) assert.ok(o.label && o.sells, o.id);
});

test("only known picks are kept, once each, in the list's order; nothing picked leaves it out", () => {
  const [a, b] = PRODUCT_GROUPS.options.map((o) => o.id);
  assert.deepEqual(cleanProductGroups([b, "junk", a, a]), [a, b]);
  assert.deepEqual(cleanProductGroups("x"), []);
  assert.equal("productGroups" in checkSignup(GOOD).details, false);
  assert.deepEqual(checkSignup({ ...GOOD, productGroups: [b, a] }).details.productGroups, [a, b]);
});

test("the first pick names what the shop sells, for the older one-answer question", () => {
  const first = PRODUCT_GROUPS.options[0];
  assert.equal(sellsForGroups([first.id]), first.sells);
  assert.equal(sellsForGroups([]), "");
});

test("the press's setup record keeps the picks and refuses anything else", () => {
  const [a, b] = PRODUCT_GROUPS.options.map((o) => o.id);
  assert.deepEqual(setupChange(record(), { productGroups: [b, a] }).fields, { productGroups: [a, b] });
  assert.equal(setupChange(record(), { productGroups: ["junk"] }).ok, false);
  assert.equal(setupChange(record(), { productGroups: a }).ok, false);
});

test("the picks travel to the shop, and a shop that picked nothing carries nothing", () => {
  const [a] = PRODUCT_GROUPS.options.map((o) => o.id);
  const row = { shopId: "moth-press", pressName: "Moth Press", ownerEmail: "owner@example.com", plan: "both", country: "CA", currency: "CAD" };
  assert.deepEqual(shopFromSignup({ ...row, productGroups: [a] }, { testMode: false }).productGroups, [a]);
  assert.equal("productGroups" in shopFromSignup(row, { testMode: false }), false);
  assert.deepEqual(productGroups({ productGroups: ["junk", a] }), [a]);
  assert.deepEqual(productGroups({}), []);
});
