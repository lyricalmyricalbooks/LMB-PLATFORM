import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { profileProblems, profileScript, schema } from "./profile.js";

const example = JSON.parse(readFileSync(new URL("./examples/test-shop.json", import.meta.url), "utf8"));

test("the test shop profile passes", () => {
  assert.deepEqual(profileProblems(example), []);
});

test("every required field is checked", () => {
  for (const key of schema.required) {
    const copy = structuredClone(example);
    delete copy[key];
    assert.ok(profileProblems(copy).includes(`profile.${key} is missing`), key);
  }
  for (const key of schema.properties.firebase.required) {
    const copy = structuredClone(example);
    delete copy.firebase[key];
    assert.ok(profileProblems(copy).includes(`profile.firebase.${key} is missing`), key);
  }
});

test("server-only values are refused", () => {
  for (const key of ["plan", "testMode", "stripeAccountId", "ownerEmail"]) {
    const problems = profileProblems({ ...example, [key]: "x" });
    assert.ok(problems.includes(`profile.${key} is not part of the profile`), key);
  }
});

test("bad shapes are refused", () => {
  assert.ok(profileProblems({ ...example, siteUrl: "http://shop.example" }).length);
  assert.ok(profileProblems({ ...example, siteUrl: "https://shop.example/" }).length);
  assert.ok(profileProblems({ ...example, shopId: "Moth Press" }).length);
  assert.ok(profileProblems({ ...example, version: 2 }).length);
  assert.ok(profileProblems({ ...example, apps: { shop: "yes", stockroom: true } }).length);
  assert.deepEqual(profileProblems(null), ["the profile is not an object"]);
});

test("switches are optional true/false values, and only the five known ones", () => {
  const all = { legacyStockroomSignIn: false, githubPagesForwarding: true, gmailReceiptFinder: false, gmailOrderScan: false, oldShopSync: false };
  assert.deepEqual(profileProblems({ ...example, switches: all }), []);
  assert.deepEqual(profileProblems({ ...example, switches: {} }), []);
  assert.deepEqual(profileProblems({ ...example, switches: { gmailReceiptFinder: true } }), []);
  assert.deepEqual(profileProblems({ ...example, switches: { gmailOrderScan: true } }), []);
  assert.deepEqual(profileProblems({ ...example, switches: { oldShopSync: true } }), []);
  assert.ok(profileProblems({ ...example, switches: { oldShopSync: "on" } }).includes("profile.switches.oldShopSync must be true or false"));
  assert.ok(profileProblems({ ...example, switches: { gmailOrderScan: 1 } }).includes("profile.switches.gmailOrderScan must be true or false"));
  assert.ok(profileProblems({ ...example, switches: { gmailReceiptFinder: "yes" } }).includes("profile.switches.gmailReceiptFinder must be true or false"));
  assert.ok(profileProblems({ ...example, switches: { somethingElse: true } }).includes("profile.switches.somethingElse is not part of the profile"));
  assert.ok(profileProblems({ ...example, switches: true }).includes("profile.switches must be an object"));
  assert.ok(profileProblems({ ...example, switches: [] }).includes("profile.switches must be an object"));
  assert.deepEqual(Object.keys(schema.properties.switches.properties), Object.keys(all));
  assert.equal(schema.required.includes("switches"), false);
});

test("the press's name is optional text of up to 80 characters", () => {
  assert.deepEqual(profileProblems({ ...example, name: "Moth Press" }), []);
  assert.equal(schema.required.includes("name"), false);
  assert.ok(profileProblems({ ...example, name: "" }).includes("profile.name is empty"));
  assert.ok(profileProblems({ ...example, name: 7 }).includes("profile.name must be text"));
  assert.ok(profileProblems({ ...example, name: "x".repeat(81) }).includes("profile.name is longer than 80 characters"));
});

test("the stockroom's own database and bucket are optional, and both are needed when given", () => {
  const { stockroom, ...withoutIt } = example;
  assert.deepEqual(profileProblems(withoutIt), []);
  assert.equal(schema.required.includes("stockroom"), false);
  assert.ok(profileProblems({ ...example, stockroom: { firestoreDatabase: "stockroom" } }).includes("profile.stockroom.storageBucket is missing"));
  assert.ok(profileProblems({ ...example, stockroom: { ...stockroom, storageBucket: undefined } }).length);
  for (const bad of ["(default)", "Stockroom", "st", "-stockroom", "stockroom-"]) {
    assert.ok(profileProblems({ ...example, stockroom: { ...stockroom, firestoreDatabase: bad } }).includes("profile.stockroom.firestoreDatabase has the wrong shape"), bad);
  }
  assert.ok(profileProblems({ ...example, stockroom: { ...stockroom, storageBucket: "gs://x" } }).length);
  assert.ok(profileProblems({ ...example, stockroom: { ...stockroom, extra: "x" } }).includes("profile.stockroom.extra is not part of the profile"));
});

test("the shop and the stockroom know the same switches as the format", async () => {
  const names = Object.keys(schema.properties.switches.properties);
  const { SHOP_SWITCHES: stockroom } = await import("../apps/stockroom/src/lib/shop-profile.js");
  assert.deepEqual([...stockroom], names);
  const shopSource = readFileSync(new URL("../apps/shop/src/lib/shopProfile.ts", import.meta.url), "utf8");
  const shop = shopSource.match(/SHOP_SWITCHES = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((name) => name.slice(1, -1));
  assert.deepEqual(shop, names);
});

test("payments name the provider, the mode and only public payment-form ids", () => {
  const platform = { provider: "stripe", mode: "platform", stripe: { accountId: "acct_1Moth", publishableKey: "pk_live_abc", testPublishableKey: "pk_test_abc" } };
  assert.deepEqual(profileProblems({ ...example, payments: platform }), []);
  assert.deepEqual(profileProblems({ ...example, payments: { provider: "stripe", mode: "own" } }), []);
  assert.equal(schema.required.includes("payments"), false, "a shop on its own keys has none");
  const problems = (payments) => profileProblems({ ...example, payments });
  assert.ok(problems({ provider: "paypal", mode: "own" }).includes("profile.payments.provider has the wrong shape"));
  assert.ok(problems({ provider: "stripe", mode: "shared" }).includes("profile.payments.mode has the wrong shape"));
  assert.ok(problems({ provider: "stripe" }).includes("profile.payments.mode is missing"));
  // A secret key in the publishable slot, or any secret at all, never reaches the page.
  assert.ok(problems({ ...platform, stripe: { ...platform.stripe, publishableKey: "sk_live_abc" } }).includes("profile.payments.stripe.publishableKey has the wrong shape"));
  assert.ok(problems({ ...platform, stripe: { ...platform.stripe, secretKey: "sk_live_abc" } }).includes("profile.payments.stripe.secretKey is not part of the profile"));
  assert.ok(problems({ ...platform, feeBasisPoints: 250 }).includes("profile.payments.feeBasisPoints is not part of the profile"));
  assert.ok(problems({ ...platform, stripe: { accountId: "acct_x y" } }).includes("profile.payments.stripe.accountId has the wrong shape"));
});

test("the served file sets the profile before the app starts", () => {
  const window = {};
  vm.runInNewContext(profileScript(example), { window });
  assert.deepEqual(JSON.parse(JSON.stringify(window.__SHOP_PROFILE__)), example);
});

test("the served file can't break out of a script tag", () => {
  const text = profileScript({ ...example, appCheckSiteKey: "</script><script>alert(1)" });
  assert.ok(!text.includes("</script>"));
});

test("a bad profile is never written", () => {
  assert.throws(() => profileScript({ ...example, shopId: "" }), /problems/);
});
