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

test("switches are optional true/false values, and only the three known ones", () => {
  const all = { legacyStockroomSignIn: false, githubPagesForwarding: true, gmailReceiptFinder: false };
  assert.deepEqual(profileProblems({ ...example, switches: all }), []);
  assert.deepEqual(profileProblems({ ...example, switches: {} }), []);
  assert.deepEqual(profileProblems({ ...example, switches: { gmailReceiptFinder: true } }), []);
  assert.ok(profileProblems({ ...example, switches: { gmailReceiptFinder: "yes" } }).includes("profile.switches.gmailReceiptFinder must be true or false"));
  assert.ok(profileProblems({ ...example, switches: { somethingElse: true } }).includes("profile.switches.somethingElse is not part of the profile"));
  assert.ok(profileProblems({ ...example, switches: true }).includes("profile.switches must be an object"));
  assert.ok(profileProblems({ ...example, switches: [] }).includes("profile.switches must be an object"));
  assert.deepEqual(Object.keys(schema.properties.switches.properties), Object.keys(all));
  assert.equal(schema.required.includes("switches"), false);
});

test("the shop and the stockroom know the same switches as the format", async () => {
  const names = Object.keys(schema.properties.switches.properties);
  const { SHOP_SWITCHES: stockroom } = await import("../apps/stockroom/src/lib/shop-profile.js");
  assert.deepEqual([...stockroom], names);
  const shopSource = readFileSync(new URL("../apps/shop/src/lib/shopProfile.ts", import.meta.url), "utf8");
  const shop = shopSource.match(/SHOP_SWITCHES = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((name) => name.slice(1, -1));
  assert.deepEqual(shop, names);
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
