// The front door's first guess at a press's country comes from the computer's time zone, never from its language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, countryFromTimeZone } from "./form.js";

test("a Canadian time zone guesses Canada, whatever the browser's language", () => {
  for (const zone of ["America/Toronto", "America/Montreal", "America/Vancouver", "America/Halifax", "America/St_Johns", "America/Winnipeg", "America/Regina", "America/Edmonton", "America/Whitehorse"]) {
    assert.equal(countryFromTimeZone(zone), "CA", zone);
  }
});

test("each country served has a zone it is guessed from", () => {
  const guessed = ["America/New_York", "America/Los_Angeles", "America/Indiana/Indianapolis", "Pacific/Honolulu", "Europe/London",
    "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Amsterdam", "Australia/Sydney", "Pacific/Auckland"].map(countryFromTimeZone);
  assert.deepEqual(new Set(guessed), new Set(Object.keys(COUNTRIES).filter((c) => c !== "CA")));
});

test("an unknown or unserved zone guesses nothing, so the question starts empty", () => {
  for (const zone of ["Europe/Madrid", "Asia/Tokyo", "America/Mexico_City", "UTC", "", undefined, 3, "America/Toronto2"]) {
    assert.equal(countryFromTimeZone(zone), "", String(zone));
  }
});
