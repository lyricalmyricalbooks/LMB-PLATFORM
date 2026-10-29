// Runs the nightly keep-times job for real (plan 13.8). Needs the platform project (docs/test-shop.md steps 1–2) and a
// schedule to call it once a night; nothing in the platform's tests runs it.
//
//   node services/retention/run.js
import { pathToFileURL } from "node:url";
import { firestoreClient } from "../../clients/firestore.js";
import { firestoreRegistry } from "../../clients/registry.js";
import { gcloudToken } from "../../release-check/run.js";
import { PLATFORM_PROJECT } from "../../setup/real.js";
import { runRetention } from "./retention.js";

export async function realRetention({ fetch = globalThis.fetch, token = gcloudToken, print = console.log } = {}) {
  const firestore = firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT });
  return runRetention({ firestore, registry: firestoreRegistry(firestore), print });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await realRetention();
  console.log(JSON.stringify(result.removed));
  process.exitCode = result.ok ? 0 : 1;
}
