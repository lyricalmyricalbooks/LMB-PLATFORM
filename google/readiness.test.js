// "Is Google ready?" (code plan 15.4): each thing only Julian can do is listed in plain words, the version check ages,
// switching on is refused until all of it is done, and practice runs can turn the check off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readGoogleConfig } from "./config.js";
import { googleReadiness, VERSION_CHECK_DAYS } from "./readiness.js";
import { VERSION_CHECKS } from "./endpoints.js";
import { fakeGoogle } from "./fakes.js";

const BASE = { GOOGLE_CLIENT_ID: "id.example", GOOGLE_CLIENT_SECRET: "secret-not-real", GOOGLE_REDIRECT_URL: "https://platform.example/google/oauth", GOOGLE_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64") };
const DONE = { GOOGLE_SIGNIN_APPROVED: "yes", GOOGLE_MERCHANT_REGISTERED: "yes", GOOGLE_MERCHANT_PROVIDER_ID: "123456", GOOGLE_TEST_CLIENT_ID: "test-id.example" };
const DAY = 86_400_000;
const checked = Date.parse(`${VERSION_CHECKS.merchant.checked}T00:00:00Z`);

test("each missing item is listed in plain words, and ready needs all of them", () => {
  const none = googleReadiness(readGoogleConfig(BASE), checked);
  assert.equal(none.ready, false);
  assert.deepEqual(none.items.filter((i) => !i.done).map((i) => i.id), ["signInApproved", "merchantRegistered", "testProject"]);
  const words = none.items.map((i) => `${i.title} ${i.words}`).join(" ");
  for (const banned of [/OAuth/i, /\bAPI\b/, /registerGcp/, /invalid_grant/]) assert.doesNotMatch(words, banned);
  assert.equal(googleReadiness(readGoogleConfig({ ...BASE, ...DONE }), checked).ready, true);
  // A registration with no account number isn't done.
  const noNumber = { ...BASE, ...DONE, GOOGLE_MERCHANT_PROVIDER_ID: "" };
  assert.equal(googleReadiness(readGoogleConfig(noNumber), checked).items.find((i) => i.id === "merchantRegistered").done, false);
});

test("the version check goes stale after 90 days", () => {
  const config = readGoogleConfig({ ...BASE, ...DONE });
  assert.equal(googleReadiness(config, checked + VERSION_CHECK_DAYS * DAY).items.find((i) => i.id === "versionsChecked").done, true);
  const late = googleReadiness(config, checked + (VERSION_CHECK_DAYS + 1) * DAY);
  assert.equal(late.ready, false);
  assert.match(late.items.find((i) => i.id === "versionsChecked").words, /91 days ago/);
});

test("switching on is refused with the list until everything is done; off and practice runs are not blocked", () => {
  const on = { ...BASE, GOOGLE_CONNECT_ENABLED: "true" };
  assert.throws(() => readGoogleConfig(on, { now: checked }), /can't be switched on yet[\s\S]*sign-in screen[\s\S]*Google Shopping[\s\S]*test project/);
  assert.equal(readGoogleConfig({ ...on, ...DONE }, { now: checked }).enabled, true);
  assert.equal(readGoogleConfig({ ...on, GOOGLE_READY_CHECKS: "off" }, { now: checked }).enabled, true);
  assert.equal(readGoogleConfig({ ...BASE }, { now: checked }).enabled, false);
  assert.throws(() => readGoogleConfig({ ...on, GOOGLE_READY_CHECKS: "maybe" }), /on or off/);
});

test("the one-time Merchant developer registration sends the account and email, and the pretend one checks them", async () => {
  const fake = fakeGoogle();
  const code = fake.allow({});
  const token = (await fake.exchangeCode(code)).accessToken;
  await assert.rejects(fake.registerMerchantDeveloper(token, { account: "nope", developerEmail: "dev@example.com" }), /needs the account/);
  const done = await fake.registerMerchantDeveloper(token, { account: "accounts/7001", developerEmail: "dev@example.com" });
  assert.match(done.name, /developerRegistration/);
});
