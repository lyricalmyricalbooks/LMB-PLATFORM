// Prints what the shop maker would do for the made-up test shop, against a pretend Google, deploys, payment service,
// email service, registry and audit log. Changes nothing anywhere and calls nothing over the network.
// Run: node setup/dry-run.js
import { pathToFileURL } from "node:url";
import { runSteps } from "./runner.js";
import { shopSteps } from "./later-steps.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry, fakeServices } from "./fakes.js";
import { TEST_CONFIG, TEST_SHOP } from "./test-shop.js";

export async function dryRun({ print = console.log, google = fakeGoogle(), services = fakeServices(), registry = fakeRegistry(), profileFiles = fakeProfileFiles() } = {}) {
  const steps = shopSteps({ ...services, google, registry, profileFiles, config: TEST_CONFIG });
  return runSteps({ shop: TEST_SHOP, steps, registry, auditLog: fakeAuditLog(), dryRun: true, print });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await dryRun();
  process.exitCode = result.ok ? 0 : 1;
}
