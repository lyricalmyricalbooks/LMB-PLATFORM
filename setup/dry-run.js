// Prints what the shop maker would do for the made-up test shop, against a pretend Google, registry and audit log.
// Changes nothing anywhere and never calls Google.  Run: node setup/dry-run.js
import { pathToFileURL } from "node:url";
import { runSteps } from "./runner.js";
import { firstSteps } from "./steps.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry } from "./fakes.js";
import { TEST_CONFIG, TEST_SHOP } from "./test-shop.js";

export async function dryRun({ print = console.log, google = fakeGoogle(), registry = fakeRegistry(), profileFiles = fakeProfileFiles() } = {}) {
  const steps = firstSteps({ google, registry, profileFiles, config: TEST_CONFIG });
  return runSteps({ shop: TEST_SHOP, steps, registry, auditLog: fakeAuditLog(), dryRun: true, print });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await dryRun();
  process.exitCode = result.ok ? 0 : 1;
}
