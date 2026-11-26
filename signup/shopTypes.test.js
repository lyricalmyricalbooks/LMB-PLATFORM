// Product shop, Services or Both (shop types plan, part 1, 26 November 2026): the sign-up's three kinds, and how Both
// travels with the shop: the sign-up check, the press's setup record, the shop the maker builds and the shop's own
// first-week record (as its "Sell products too").
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOP_TYPES, checkSignup, shopTypeOf } from "./form.js";
import { newPressRecord, setupChange } from "./pressRecord.js";
import { shopFromSignup } from "./shopMaker.js";
import { sellsProductsToo } from "../setup/later-steps.js";

const GOOD = { pressName: "Moth Press", country: "CA", termsAccepted: true, termsVersion: "v1" };
const record = () => newPressRecord({ pressId: "press-12345678", ownerUid: "uid-1", email: "owner@example.com", now: new Date("2026-11-26T12:00:00Z") });

test("sign-up offers Product shop, Services and Both, each with a line saying who it's for", () => {
  assert.deepEqual(SHOP_TYPES.map((t) => [t.id, t.label]), [["products", "Product shop"], ["services", "Services"], ["both", "Both"]]);
  for (const t of SHOP_TYPES) assert.ok(t.line.length > 20 && t.line.length < 90, `${t.id} has one short line`);
});

test("a saved answer reads back as its kind; a bookshop is a product shop", () => {
  assert.equal(shopTypeOf("books"), "products");
  assert.equal(shopTypeOf("other", true), "products");
  assert.equal(shopTypeOf("hair"), "services");
  assert.equal(shopTypeOf("hair", true), "both");
  assert.equal(shopTypeOf(""), "");
});

test("Both is a services answer that sells products too; nothing else can carry it", () => {
  assert.equal(checkSignup({ ...GOOD, publishes: "hair", sellsProducts: true }).details.sellsProducts, true);
  assert.equal("sellsProducts" in checkSignup({ ...GOOD, publishes: "hair" }).details, false);
  assert.equal("sellsProducts" in checkSignup({ ...GOOD, publishes: "clothing", sellsProducts: true }).details, false);
  assert.equal("sellsProducts" in checkSignup({ ...GOOD, publishes: "hair", sellsProducts: "yes" }).details, false);
});

test("the press's setup record keeps a yes or no and refuses anything else", () => {
  assert.deepEqual(setupChange(record(), { sellsProducts: true }).fields, { sellsProducts: true });
  assert.deepEqual(setupChange(record(), { sellsProducts: false }).fields, { sellsProducts: false });
  assert.equal(setupChange(record(), { sellsProducts: "true" }).ok, false);
});

test("Both travels to the shop and becomes its Sell products too", () => {
  const row = { shopId: "moth-press", pressName: "Moth Press", ownerEmail: "owner@example.com", plan: "both", country: "CA", currency: "CAD", publishes: "hair" };
  assert.equal(shopFromSignup({ ...row, sellsProducts: true }, { testMode: false }).sellsProducts, true);
  assert.equal("sellsProducts" in shopFromSignup(row, { testMode: false }), false);
  assert.equal(sellsProductsToo({ publishes: "hair", sellsProducts: true }), true);
  assert.equal(sellsProductsToo({ publishes: "clothing", sellsProducts: true }), false);
  assert.equal(sellsProductsToo({ publishes: "hair" }), false);
});
