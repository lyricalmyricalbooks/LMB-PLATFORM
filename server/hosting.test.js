// The waitlist's Hosting file sends the platform's server addresses to the web door, and nothing else changed for the
// waitlist page: its own files still win, and the safety headers still cover every address (security/headers.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { API_SERVICE, REGION } from "./schedules.js";

const { hosting } = JSON.parse(readFileSync(new URL("../waitlist/firebase.json", import.meta.url), "utf8"));

test("Hosting sends /api/** and the emails' turn-off pages to the web door in Montréal", () => {
  assert.deepEqual(hosting.rewrites, ["/api/**", "/tips/off", "/checkup/off"].map((source) => ({ source, run: { serviceId: API_SERVICE, region: REGION } })));
  assert.equal(hosting.public, ".");
  // Headers set for "**" apply to the rewritten addresses too; the server sends its own as well (server/http.js).
  assert.ok(hosting.headers.some((rule) => rule.source === "**"));
});
