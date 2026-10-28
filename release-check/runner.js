// Runs the release check (docs/test-shop.md) on the platform's test shop: the eight checks in checks.js, in order,
// stopping at the first failure. Every run is recorded in the shop registry (`recordReleaseCheck`) and in the test
// shop's audit log, pass or fail, so the release runner (services/release-runner) and a person can see why it stopped.
//
// It only ever runs on the test shop: a shop whose registry row isn't marked `testShop: true` (and in test mode) is
// refused before anything is opened, bought or refunded.
import { randomUUID } from "node:crypto";
import { CHECKS } from "./checks.js";

const message = (error) => (error instanceof Error ? error.message : String(error));

/** Waits for `test()` to give a truthy answer, asking every `everyMs`; throws in plain words after `timeoutMs`. */
export function waiter({ now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), everyMs = 3000 } = {}) {
  return async function wait(what, test, { timeoutMs }) {
    const until = now().getTime() + timeoutMs;
    for (;;) {
      const answer = await test();
      if (answer) return answer;
      if (now().getTime() >= until) throw new Error(`${what} didn't happen within ${Math.round(timeoutMs / 1000)} seconds`);
      await sleep(everyMs);
    }
  };
}

/** Problems that stop the check before it starts, in plain words. */
export function refusal(row) {
  if (!row) return "the registry has no such shop";
  if (row.testShop !== true) return `${row.shopId} is not the platform's test shop; the release check never runs on a press's shop`;
  if (row.testMode !== true) return `${row.shopId} is not in test mode; the release check never takes real money`;
  if (row.status !== "live") return `${row.shopId} is not live yet; finish its setup first`;
  return null;
}

/**
 * `runReleaseCheck({ shopId, version, registry, auditLog, clients, inbox, print, now, wait, checks })`.
 * `clients` = { browser, shopData, stockroomData, shopAdmin, session, profile, urls } (see checks.js). Resolves to
 * `{ ok, results: [{ check, name, status, ms, detail?, error? }], failedCheck?, error? }`; status is "passed",
 * "failed" or "not-run".
 */
export async function runReleaseCheck({ shopId, version, registry, auditLog, clients, inbox, print = () => {}, now = () => new Date(), wait = waiter({ now }), checks = CHECKS, runId = randomUUID() }) {
  const row = await registry.getShop(shopId);
  const refused = refusal(row);
  const startedAt = now().toISOString();
  if (refused) {
    print(`Release check refused: ${refused}.`);
    return { ok: false, refused: true, results: [], error: refused };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inbox ?? "")) throw new Error("the release check needs the test inbox's address");

  const ctx = { ...clients, shop: row, inbox, wait, now, state: {} };
  const results = [];
  let failed = null;
  print(`Release check for ${shopId}${version ? ` on release ${version}` : ""}`);
  try {
    for (const check of checks) {
      if (failed) {
        results.push({ check: check.number, name: check.name, status: "not-run" });
        continue;
      }
      const began = now().getTime();
      try {
        const detail = await check.run(ctx);
        results.push({ check: check.number, name: check.name, status: "passed", ms: now().getTime() - began, ...(detail ? { detail } : {}) });
        print(`${check.number}. ${check.name}: passed`);
      } catch (error) {
        failed = { check: check.number, error: message(error) };
        results.push({ check: check.number, name: check.name, status: "failed", ms: now().getTime() - began, error: failed.error });
        print(`${check.number}. ${check.name}: failed: ${failed.error}`);
      }
    }
  } finally {
    try {
      await ctx.state.stockroom?.close();
    } catch { /* the browser closes it anyway */ }
    await clients.browser?.close?.();
  }

  const entry = {
    kind: "release-check", runId, version: version ?? null, ok: !failed, startedAt, finishedAt: now().toISOString(),
    ...(ctx.state.orderId ? { orderId: ctx.state.orderId } : {}),
    results, ...(failed ? { failedCheck: failed.check, error: failed.error } : {}),
  };
  await registry.recordReleaseCheck(shopId, entry);
  await auditLog.write(shopId, `${startedAt}-release-check-${runId}`, entry);
  return { ok: !failed, results, ...(failed ? { failedCheck: failed.check, error: failed.error } : {}) };
}
