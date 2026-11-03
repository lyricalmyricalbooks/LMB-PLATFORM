// Setup step 19 (code plan 22.6): the shop's own sign-in allows authenticator codes. A plain Firebase project is upgraded
// first; a second step already set there is kept; running it twice changes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeGoogle } from "./fakes.js";
import { ADJACENT_INTERVALS, totpOn, twoStepSignInStep, withTotp } from "./twoStep.js";

const SHOP = { shopId: "moth-press" };

test("a plain Firebase project is upgraded, then authenticator codes are turned on; a second run does nothing", async () => {
  const google = fakeGoogle();
  const step = twoStepSignInStep({ google });
  assert.equal(step.number, 19);
  assert.equal(await step.check({ shop: SHOP }), false);
  assert.deepEqual(await step.act({ shop: SHOP }), { detail: { totp: true } });
  assert.deepEqual(google.calls.map(([name]) => name), ["authConfig.upgrade", "authConfig.setMfa"]);
  const config = google.world.authConfigs.get("moth-press");
  assert.equal(config.subtype, "IDENTITY_PLATFORM");
  assert.deepEqual(config.mfa.providerConfigs, [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: ADJACENT_INTERVALS } }]);
  assert.equal(await step.check({ shop: SHOP }), true);
});

test("a second step already set on the project stays, and an upgraded project isn't upgraded again", async () => {
  const google = fakeGoogle();
  google.world.authConfigs.set("moth-press", { subtype: "IDENTITY_PLATFORM", mfa: { state: "ENABLED", enabledProviders: ["PHONE_SMS"], providerConfigs: [{ state: "ENABLED", phone: true }] } });
  await twoStepSignInStep({ google }).act({ shop: SHOP });
  assert.deepEqual(google.calls.map(([name]) => name), ["authConfig.setMfa"]);
  const { mfa } = google.world.authConfigs.get("moth-press");
  assert.deepEqual(mfa.enabledProviders, ["PHONE_SMS"]);
  assert.equal(mfa.providerConfigs.length, 2);
  assert.equal(totpOn({ mfa }), true);
});

test("TOTP turned off, or the second step off as a whole, counts as not on", () => {
  assert.equal(totpOn({ mfa: { state: "DISABLED", providerConfigs: [{ state: "ENABLED", totpProviderConfig: {} }] } }), false);
  assert.equal(totpOn({ mfa: { state: "ENABLED", providerConfigs: [{ state: "DISABLED", totpProviderConfig: {} }] } }), false);
  assert.equal(totpOn(null), false);
  assert.deepEqual(withTotp(undefined).providerConfigs.length, 1);
});
