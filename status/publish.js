// Saves the public status (summary.js) to publicStatus/current in the platform project, the one document the status
// page reads and the platform's rules let anyone read (waitlist/firestore.rules). Run after each health run:
//   node status/publish.js
// The registry is read and the document written with the platform's token; no key is read from a file.
import { pathToFileURL } from "node:url";
import { statusSummary } from "./summary.js";

export const STATUS_DOC = "publicStatus/current";

/** `publishStatus({ registry, platform, now })`: `platform` is the platform project's Firestore client. */
export async function publishStatus({ registry, platform, now = () => new Date() }) {
  const summary = statusSummary(await registry.listShops(), { now });
  await platform.set(STATUS_DOC, summary);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { firestoreClient } = await import("../clients/firestore.js");
  const { firestoreRegistry } = await import("../clients/registry.js");
  const { gcloudToken } = await import("../release-check/run.js");
  const { PLATFORM_PROJECT } = await import("../setup/real.js");
  const platform = firestoreClient({ fetch: globalThis.fetch, token: gcloudToken, projectId: PLATFORM_PROJECT });
  const summary = await publishStatus({ registry: firestoreRegistry(platform), platform });
  console.log(`Status: ${summary.overall} (${summary.parts.map((p) => `${p.id} ${p.affected}/${p.total}`).join(", ")})`);
}
