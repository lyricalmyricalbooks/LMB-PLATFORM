import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry, fakeAuditLog } from "../../setup/fakes.js";
import { closedBecause, montrealClock, releaseWindowAt } from "./releaseWindow.js";
import { runRelease } from "./runner.js";

// Montréal is UTC-4 until 1 November 2026 and UTC-5 after it.
const at = (iso) => new Date(iso);

test("the Montréal clock follows daylight saving", () => {
  assert.deepEqual(montrealClock(at("2026-10-30T19:00:00Z")), { weekday: 5, month: 10, day: 30, hour: 15, minute: 0 });
  assert.deepEqual(montrealClock(at("2026-11-06T19:00:00Z")), { weekday: 5, month: 11, day: 6, hour: 14, minute: 0 });
});

test("Friday 15:00 to Sunday night is closed, the rest of the week is open", () => {
  assert.equal(closedBecause(at("2026-11-06T19:59:00Z")), null); // Friday 14:59
  assert.match(closedBecause(at("2026-11-06T20:00:00Z")), /weekend/); // Friday 15:00
  assert.match(closedBecause(at("2026-11-07T15:00:00Z")), /weekend/); // Saturday
  assert.match(closedBecause(at("2026-11-09T03:59:00Z")), /weekend/); // Sunday 22:59
  assert.equal(closedBecause(at("2026-11-09T05:00:00Z")), null); // Monday 00:00
  assert.equal(closedBecause(at("2026-11-03T15:00:00Z")), null); // Tuesday
});

test("11 to 25 December is closed, including weekdays", () => {
  assert.equal(closedBecause(at("2026-12-10T15:00:00Z")), null);
  assert.match(closedBecause(at("2026-12-11T05:30:00Z")), /Christmas/); // 11 Dec 00:30, a Friday morning
  assert.match(closedBecause(at("2026-12-16T15:00:00Z")), /Christmas/);
  assert.match(closedBecause(at("2026-12-25T15:00:00Z")), /Christmas/);
  assert.equal(closedBecause(at("2026-12-28T15:00:00Z")), null); // a Monday
});

test("a security fix is allowed in a closed window, and the answer says when the window changes", () => {
  const closed = releaseWindowAt(at("2026-11-07T15:00:00Z"));
  assert.equal(closed.open, false);
  assert.equal(closed.closedNow, true);
  assert.equal(closed.next, "2026-11-09T05:00:00.000Z");
  const fix = releaseWindowAt(at("2026-11-07T15:00:00Z"), { securityFix: true });
  assert.equal(fix.open, true);
  const open = releaseWindowAt(at("2026-11-03T15:00:00Z"));
  assert.deepEqual([open.open, open.closedNow, open.next], [true, false, "2026-11-06T20:00:00.000Z"]);
});

async function releaseOn(date, extra = {}) {
  const registry = fakeRegistry();
  const lines = [];
  const result = await runRelease({
    version: "1.0.0", registry, auditLog: fakeAuditLog(), config: { folder: "folders/0" }, print: (l) => lines.push(l),
    now: () => date, builder: {}, deploy: {}, envFiles: {}, profileFiles: {}, siteCheck: {}, projects: {}, releaseCheck: {}, ...extra,
  });
  return { result, lines, registry };
}

test("the runner doesn't start in a closed window, and says why", async () => {
  const { result, lines } = await releaseOn(at("2026-11-07T15:00:00Z"));
  assert.equal(result.ok, false);
  assert.ok(result.closedWindow);
  assert.match(lines.join("\n"), /doesn't start: it is the weekend.*security fix.*2026-11-09T05:00:00.000Z/);
});

test("a dry run is not stopped by the window; a security fix goes through it", async () => {
  const dry = await releaseOn(at("2026-11-07T15:00:00Z"), { dryRun: true });
  assert.equal(dry.result.closedWindow, undefined);
  const fix = await releaseOn(at("2026-11-07T15:00:00Z"), { securityFix: true });
  assert.equal(fix.result.closedWindow, undefined);
  assert.match(fix.lines.join("\n"), /closed window|no live test shop|can't start/);
});
