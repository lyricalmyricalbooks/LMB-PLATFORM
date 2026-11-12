// The platform settings: Julian's answers as defaults, every value changeable, and a wrong value refused in plain words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EDITABLE, editableValues, liveSettings, platformSettings, priceText, savedSettingsProblems, withSaved } from "./settings.js";

test("defaults: Colophon, a $5 CAD platform fee a month on every plan, 14-day trial, notifications@ and support@ the placeholder domain", () => {
  assert.deepEqual(platformSettings({}), {
    platformName: "Colophon",
    domain: "platform.example",
    senderEmail: "notifications@platform.example",
    supportEmail: "support@platform.example",
    receiptsEmail: "receipts@platform.example",
    mailingAddress: "",
    currency: "CAD",
    prices: { shop: 500, stockroom: 500, both: 500 },
    usdPrices: { shop: 500, stockroom: 500, both: 500 },
    taxCode: "txcd_10103001",
    trialDays: 14,
    platformUrl: "https://platform.example",
    shopAddressDomain: "",
    signupOpen: false,
    startNudges: "hold",
    signupDailyCap: 10,
    openCountries: ["CA"],
    foundingOffer: { percentOff: 25, presses: 25, giveBackUnpaid: true },
    payAsYouSell: { basisPoints: 0 },
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

test("sign-up, cap, founding offer and pay as you sell come from the environment, checked like the rest", () => {
  const settings = platformSettings({ SIGNUP_OPEN: "TRUE", SIGNUP_DAILY_CAP: "3", FOUNDING_PERCENT_OFF: "30", FOUNDING_PRESSES: "20", PAY_AS_YOU_SELL_BASIS_POINTS: "0" });
  assert.equal(settings.signupOpen, true);
  assert.equal(settings.signupDailyCap, 3);
  assert.deepEqual(settings.foundingOffer, { percentOff: 30, presses: 20, giveBackUnpaid: true });
  assert.deepEqual(settings.payAsYouSell, { basisPoints: 0 });
  assert.throws(() => platformSettings({ SIGNUP_OPEN: "yes" }), /SIGNUP_OPEN must be true or false/);
  assert.throws(() => platformSettings({ FOUNDING_PERCENT_OFF: "101" }), /FOUNDING_PERCENT_OFF/);
  assert.throws(() => platformSettings({ PAY_AS_YOU_SELL_BASIS_POINTS: "2001" }), /PAY_AS_YOU_SELL_BASIS_POINTS/);
});

test("saved control-room changes sit on top of the environment; bad ones are refused", async () => {
  const saved = { "prices.shop": 3400, signupOpen: true, "foundingOffer.presses": 30 };
  const settings = withSaved(platformSettings({ PLAN_PRICE_SHOP: "3100" }), saved);
  assert.equal(settings.prices.shop, 3400);
  assert.equal(settings.prices.both, 500);
  assert.equal(settings.signupOpen, true);
  assert.deepEqual(settings.foundingOffer, { percentOff: 25, presses: 30, giveBackUnpaid: true });
  assert.deepEqual(savedSettingsProblems({ "prices.shop": 0, signupOpen: "yes", platformName: "X" }).length, 3);
  assert.throws(() => withSaved(platformSettings({}), { trialDays: 9999 }), /Free trial days/);
  const store = { get: async (name) => (name === "settings" ? { values: { signupDailyCap: 4 } } : null) };
  assert.equal((await liveSettings({ env: {}, store })).signupDailyCap, 4);
  assert.equal((await liveSettings({ env: {} })).signupDailyCap, 10);
  assert.deepEqual(Object.keys(editableValues(platformSettings({}))), Object.keys(EDITABLE));
});

test("the mailing address is read, tidied onto one line, and refused when it is too short or has markup (15.8)", () => {
  assert.equal(platformSettings({ PLATFORM_MAILING_ADDRESS: "PO Box 12\nExample City ON A1A 1A1" }).mailingAddress, "PO Box 12, Example City ON A1A 1A1");
  assert.throws(() => platformSettings({ PLATFORM_MAILING_ADDRESS: "Box 1" }), /PLATFORM_MAILING_ADDRESS/);
  assert.throws(() => platformSettings({ PLATFORM_MAILING_ADDRESS: "<b>PO Box 12</b>, Example City" }), /PLATFORM_MAILING_ADDRESS/);
});

test("the countries open for sign-up default to Canada and are read as two-letter codes (15.23)", () => {
  assert.deepEqual(platformSettings({}).openCountries, ["CA"]);
  assert.deepEqual(platformSettings({ SIGNUP_OPEN_COUNTRIES: "ca, us" }).openCountries, ["CA", "US"]);
  assert.throws(() => platformSettings({ SIGNUP_OPEN_COUNTRIES: "Canada" }), /SIGNUP_OPEN_COUNTRIES/);
});

test("the shop domain for free addresses is optional, and never the platform's own domain or one under it", () => {
  assert.equal(platformSettings({ PLATFORM_DOMAIN: "colophon.example", SHOP_ADDRESS_DOMAIN: "colophonshops.example" }).shopAddressDomain, "colophonshops.example");
  assert.throws(() => platformSettings({ PLATFORM_DOMAIN: "colophon.example", SHOP_ADDRESS_DOMAIN: "shops.colophon.example" }), /SHOP_ADDRESS_DOMAIN/);
  assert.throws(() => platformSettings({ PLATFORM_DOMAIN: "colophon.example", SHOP_ADDRESS_DOMAIN: "colophon.example" }), /SHOP_ADDRESS_DOMAIN/);
});

test("US presses' fee and the tax code: set from the environment, checked, and the US fee editable in the control room", () => {
  const settings = platformSettings({ PLAN_PRICE_BOTH_USD: "400", PLATFORM_TAX_CODE: "txcd_10103000" });
  assert.deepEqual(settings.usdPrices, { shop: 400, stockroom: 400, both: 400 });
  assert.equal(settings.taxCode, "txcd_10103000");
  assert.throws(() => platformSettings({ PLATFORM_TAX_CODE: "saas" }), /PLATFORM_TAX_CODE/);
  assert.match(EDITABLE["usdPrices.both"].label, /US presses/);
  assert.equal(withSaved(platformSettings({}), { "usdPrices.both": 700 }).usdPrices.both, 700);
});
