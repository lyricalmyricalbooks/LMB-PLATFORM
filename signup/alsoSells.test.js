// "Anything else you'll sell?" (Ways to sell, beta): the optional sign-up question, and how its answer travels with the
// shop: the sign-up check, the press's setup record, the shop the maker builds and the shop's own first-week record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALSO_SELLS, checkSignup, cleanAlsoSells } from "./form.js";
import { newPressRecord, setupChange } from "./pressRecord.js";
import { shopFromSignup } from "./shopMaker.js";
import { alsoSells } from "../setup/later-steps.js";
import { WAYS } from "../shared/ways/ways.js";

const GOOD = { pressName: "Moth Press", country: "CA", termsAccepted: true, termsVersion: "v1" };
const record = () => newPressRecord({ pressId: "press-12345678", ownerUid: "uid-1", email: "owner@example.com", now: new Date("2026-11-17T12:00:00Z") });

test("the question offers the six ways to sell, by their own ids", () => {
  assert.deepEqual(ALSO_SELLS.options.map((o) => o.id), WAYS.map((way) => way.id));
  assert.match(ALSO_SELLS.label, /Anything else you'll sell\?/);
});

test("it is optional: nothing picked leaves it out, and only known picks are kept, in order", () => {
  assert.equal("alsoSells" in checkSignup(GOOD).details, false);
  assert.equal(checkSignup(GOOD).ok, true);
  assert.deepEqual(checkSignup({ ...GOOD, alsoSells: ["rentals", "lottery", "events", "events"] }).details.alsoSells, ["events", "rentals"]);
  assert.equal("alsoSells" in checkSignup({ ...GOOD, alsoSells: "events" }).details, false);
  assert.deepEqual(cleanAlsoSells(null), []);
});

test("the press's setup record keeps the picks, lets them be cleared and refuses anything else", () => {
  assert.deepEqual(setupChange(record(), { alsoSells: ["giving", "events"] }).fields, { alsoSells: ["events", "giving"] });
  assert.deepEqual(setupChange(record(), { alsoSells: [] }).fields, { alsoSells: [] });
  assert.equal(setupChange(record(), { alsoSells: ["lottery"] }).ok, false);
  assert.equal(setupChange(record(), { alsoSells: "events" }).ok, false);
  assert.equal(setupChange(record(), { alsoSells: ["events", "events"] }).ok, false);
});

test("the answer travels to the shop, and a shop that picked nothing carries nothing", () => {
  const row = { shopId: "moth-press", pressName: "Moth Press", ownerEmail: "owner@example.com", plan: "both", country: "CA", currency: "CAD" };
  assert.deepEqual(shopFromSignup({ ...row, alsoSells: ["events", "classes"] }, { testMode: false }).alsoSells, ["events", "classes"]);
  assert.equal("alsoSells" in shopFromSignup(row, { testMode: false }), false);
  assert.deepEqual(alsoSells({ alsoSells: ["rentals", "junk", "events"] }), ["events", "rentals"]);
  assert.deepEqual(alsoSells({}), []);
});
