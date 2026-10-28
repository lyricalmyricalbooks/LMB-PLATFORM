// Saves the public status (summary.js) to publicStatus/current in the platform project, the one document the status
// page reads and the platform's rules let anyone read (waitlist/firestore.rules). Run after each health run:
//   node status/publish.js
// The registry is read and the document written with the platform's token; no key is read from a file.
import { pathToFileURL } from "node:url";
import { statusSummary } from "./summary.js";

export const STATUS_DOC = "publicStatus/current";

/**
 * `publishStatus({ registry, platform, now, note })`: `platform` is the platform project's Firestore client. `note` is
 * the team's note about a known problem (the run book's status note, control-room/runbook.js), `{ text, at }` or none;
 * it is shown above the checks' own words.
 */
export async function publishStatus({ registry, platform, now = () => new Date(), note = null }) {
  const summary = statusSummary(await registry.listShops(), { now });
  const out = note?.text ? { ...summary, note: { text: String(note.text).slice(0, 500), at: note.at ?? summary.updatedAt } } : summary;
  await platform.set(STATUS_DOC, out);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { firestoreClient } = await import("../clients/firestore.js");
  const { firestoreRegistry } = await import("../clients/registry.js");
  const { gcloudToken } = await import("../release-check/run.js");
  const { PLATFORM_PROJECT } = await import("../setup/real.js");
  const platform = firestoreClient({ fetch: globalThis.fetch, token: gcloudToken, projectId: PLATFORM_PROJECT });
  const { firestorePlatformState } = await import("../clients/stores.js");
  const note = await firestorePlatformState(platform).get("statusNote");
  const summary = await publishStatus({ registry: firestoreRegistry(platform), platform, note });
  console.log(`Status: ${summary.overall} (${summary.parts.map((p) => `${p.id} ${p.affected}/${p.total}`).join(", ")})`);
}
