// Readies a shared project for shops (setup/sharedProject.js), by hand or from the "Shared system" workflow: the live
// shared project that real presses' shops go in, once a person has made it in the Google Cloud console (in the shops
// folder, with billing linked), as was done for lmb-test-shop.
//
//   node setup/ready-shared-project.js <project id>            # the plan: prints each step, changes nothing
//   node setup/ready-shared-project.js <project id> --apply    # does it (safe to run again)
//
// It refuses the platform's own project. The token comes from `gcloud auth print-access-token`.
import { pathToFileURL } from "node:url";
import { googleClients } from "../clients/google.js";
import { gcloudToken } from "../release-check/run.js";
import { PLATFORM_PROJECT } from "./real.js";
import { runProjectSteps, sharedProjectSteps } from "./sharedProject.js";
import { REGION } from "./steps.js";

const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

export async function readySharedProject({ projectId, apply = false, google, region = REGION, print = console.log }) {
  if (!PROJECT.test(projectId ?? "")) throw new Error(`"${projectId ?? ""}" isn't a Firebase project id`);
  if (projectId === PLATFORM_PROJECT) throw new Error("the platform's own project never holds shops");
  const project = await google.projects.get(projectId);
  if (!project || project.state !== "ACTIVE") throw new Error(`${projectId} doesn't exist yet: make it once in the Google Cloud console, in the shops folder, then run this again`);
  const billing = await google.billing.get(projectId);
  if (!billing?.billingEnabled) throw new Error(`${projectId} has no billing account. Link one: https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`);
  const result = await runProjectSteps({ projectId, steps: sharedProjectSteps({ google, region }), apply, print });
  if (result.ok && result.ready) print(`${projectId} is ready for shops.`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const region = String(process.env.SHOP_FUNCTIONS_REGION ?? "").trim() || REGION;
    const result = await readySharedProject({ projectId: process.argv[2], apply: process.argv.includes("--apply"), google: googleClients({ fetch, token: gcloudToken }), region });
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
