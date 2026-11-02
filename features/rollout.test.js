import { test } from "node:test";
import assert from "node:assert/strict";
import { featureOn, featuresFor, moveFeature, stageOf, describeStage } from "./rollout.js";

const press = { shopId: "a" };
const tester = { shopId: "t", testShop: true };
const early = { shopId: "e", earlyAccess: true };

test("a feature nobody has listed is off everywhere", () => {
  for (const shop of [press, tester, early]) assert.equal(featureOn({}, "newCheckout", shop), false);
  assert.equal(stageOf({ x: "banana" }, "x"), "off");
});

test("each stage reaches the right shops", () => {
  assert.deepEqual([press, tester, early].map((s) => featureOn({ f: "test" }, "f", s)), [false, true, false]);
  assert.deepEqual([press, tester, early].map((s) => featureOn({ f: "early" }, "f", s)), [false, true, true]);
  assert.deepEqual([press, tester, early].map((s) => featureOn({ f: "everyone" }, "f", s)), [true, true, true]);
});

test("one press can be switched off without touching anyone else or making a release", () => {
  const stages = { f: "everyone" };
  assert.equal(featureOn(stages, "f", { ...press, featuresOff: ["f"] }), false);
  assert.equal(featureOn(stages, "f", { ...press, featuresOff: ["other"] }), true);
  assert.equal(featureOn({ f: "test" }, "f", { ...tester, featuresOff: ["f"] }), false);
});

test("a feature moves one step at a time, so the test shop sees it first, and can drop back at once", () => {
  let stages = moveFeature({}, "newCheckout", "test");
  assert.throws(() => moveFeature({}, "newCheckout", "everyone"), /one step at a time/);
  assert.throws(() => moveFeature(stages, "newCheckout", "everyone"), /one step at a time/);
  stages = moveFeature(moveFeature(stages, "newCheckout", "early"), "newCheckout", "everyone");
  assert.equal(stageOf(stages, "newCheckout"), "everyone");
  assert.equal(stageOf(moveFeature(stages, "newCheckout", "off"), "newCheckout"), "off");
  assert.throws(() => moveFeature({}, "x y", "test"), /letters and numbers/);
  assert.throws(() => moveFeature({}, "newCheckout", "soon"), /no stage called soon/);
});

test("a shop's list holds every listed feature in order, and the words are plain", () => {
  assert.deepEqual(featuresFor({ b: "everyone", a: "test" }, press), { a: false, b: true });
  assert.equal(describeStage({ a: "test" }, "a"), "a is on for the test shop only.");
});
