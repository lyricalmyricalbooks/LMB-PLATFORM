// Every setting the control room can change (services/settings.js EDITABLE) must be read, while the platform runs, by
// the code it is meant to change. A setting that is saved but never read looks like it works and does nothing (the
// platform fee and the trial days did, until 12 November 2026). Each path below names the files that read it from the
// live settings and what that read looks like; a new EDITABLE path fails here until its reader is listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EDITABLE } from "./settings.js";

const ROOT = new URL("../", import.meta.url);
const source = (file) => readFileSync(new URL(file, ROOT), "utf8");

export const READERS = Object.freeze({
  signupOpen: [["signup/signup.js", /const \{[^}]*\bsignupOpen\b[^}]*\} = await live\(\)/]],
  signupDailyCap: [["signup/signup.js", /const \{[^}]*\bsignupDailyCap\b[^}]*\} = await live\(\)/]],
  "prices.both": [["services/billing/billing.js", /now\.prices/], ["signup/api.js", /now\.prices/]],
  "prices.shop": [["services/billing/billing.js", /now\.prices/], ["signup/api.js", /now\.prices/]],
  "prices.stockroom": [["services/billing/billing.js", /now\.prices/], ["signup/api.js", /now\.prices/]],
  "usdPrices.both": [["services/billing/billing.js", /now\.usdPrices/], ["signup/api.js", /now\.usdPrices/]],
  trialDays: [["services/billing/billing.js", /now\.trialDays/]],
  "foundingOffer.percentOff": [["services/billing/founding.js", /live\?\.foundingOffer\?\.percentOff/]],
  "foundingOffer.presses": [["services/billing/founding.js", /live\?\.foundingOffer\?\.presses/]],
  "foundingOffer.giveBackUnpaid": [["services/billing/billing.js", /\(await live\(\)\)\?\.foundingOffer\?\.giveBackUnpaid/]],
  "payAsYouSell.basisPoints": [["services/billing/paymentWay.js", /live\?\.payAsYouSell\?\.basisPoints/]],
});

test("every setting the control room can change has a reader listed here", () => {
  assert.deepEqual(Object.keys(READERS).sort(), Object.keys(EDITABLE).sort());
});

test("each listed reader really reads its setting from the live settings", () => {
  for (const [path, readers] of Object.entries(READERS)) {
    assert.ok(readers.length > 0, `${path} has no reader`);
    for (const [file, pattern] of readers) assert.match(source(file), pattern, `${file} no longer reads ${path}`);
  }
});
