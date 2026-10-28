// The platform settings: Julian's answers as defaults, every value changeable, and a wrong value refused in plain words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { platformSettings, priceText } from "./settings.js";

test("defaults: Colophon, $29 / $19 / $39 CAD a month, 14-day trial, notifications@ and support@ the placeholder domain", () => {
  assert.deepEqual(platformSettings({}), {
    platformName: "Colophon",
    domain: "platform.example",
    senderEmail: "notifications@platform.example",
    supportEmail: "support@platform.example",
    currency: "CAD",
    prices: { shop: 2900, stockroom: 1900, both: 3900 },
    trialDays: 14,
    platformUrl: "https://platform.example",
  });
});

test("the domain moves both addresses and the platform address; each can still be set alone", () => {
  const settings = platformSettings({ PLATFORM_DOMAIN: "Colophon.Example", PLATFORM_SUPPORT_EMAIL: "help@colophon.example", PLAN_PRICE_BOTH: "4500", TRIAL_DAYS: "30" });
  assert.equal(settings.senderEmail, "notifications@colophon.example");
  assert.equal(settings.supportEmail, "help@colophon.example");
  assert.equal(settings.platformUrl, "https://colophon.example");
  assert.equal(settings.prices.both, 4500);
  assert.equal(settings.trialDays, 30);
});

test("a wrong value is refused rather than guessed", () => {
  assert.throws(() => platformSettings({ PLAN_PRICE_SHOP: "29.00" }), /PLAN_PRICE_SHOP must be a whole number/);
  assert.throws(() => platformSettings({ TRIAL_DAYS: "-1" }), /TRIAL_DAYS/);
  assert.throws(() => platformSettings({ PLATFORM_SENDER_EMAIL: "nope" }), /PLATFORM_SENDER_EMAIL is not an email address/);
  assert.throws(() => platformSettings({ PLATFORM_DOMAIN: "not a domain" }), /PLATFORM_DOMAIN/);
  assert.throws(() => platformSettings({ PLATFORM_URL: "http://x.example/path" }), /PLATFORM_URL/);
});

test("prices read as money", () => {
  assert.equal(priceText(2900), "$29.00");
});
