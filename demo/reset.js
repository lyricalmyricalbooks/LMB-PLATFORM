// The sample press's nightly fresh start (plan 7.7, docs/demo-shop.md): clears everything a visitor could have left
// behind (the shop's and the stockroom's databases, the stockroom's live data and every sign-in account), then seeds
// the starter shop again with seed.js. demo/run.js runs it every night at RESET_HOUR while the sample press is up;
// `node demo/reset.js` runs it once by hand on the server.
//
// It talks to the emulators on this computer only (INTERNAL_PORTS), with their "owner" pass, which the gate never lets
// a visitor use. The photos are left alone: the storage rules are read-only, so a visitor can't add or change one.
import { pathToFileURL } from "node:url";
import { DEMO_PROJECT, HOST, RTDB_NAMESPACE, STOCKROOM_DATABASE } from "./config.js";
import { INTERNAL_PORTS, internalFetch } from "./hosted.js";
import { seedDemo } from "./seed.js";

const ADMIN = { Authorization: "Bearer owner" };
const at = (port, path) => `http://${HOST}:${port}${path}`;

async function check(response, what) {
  if (!response.ok) throw new Error(`${what} answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

/** Clears the sample press and seeds it again. Returns what the seed made, for the log. */
export async function resetSamplePress({ fetch, now = () => new Date() }) {
  const firestore = (database) => at(INTERNAL_PORTS.firestore, `/emulator/v1/projects/${DEMO_PROJECT}/databases/${database}/documents`);
  await check(await fetch(firestore("(default)"), { method: "DELETE" }), "Clearing the shop's database");
  await check(await fetch(firestore(STOCKROOM_DATABASE), { method: "DELETE" }), "Clearing the stockroom's database");
  await check(await fetch(at(INTERNAL_PORTS.database, `/.json?ns=${RTDB_NAMESPACE}`), { method: "PUT", headers: { ...ADMIN, "Content-Type": "application/json" }, body: "null" }), "Clearing the stockroom's live data");
  await check(await fetch(at(INTERNAL_PORTS.auth, `/emulator/v1/projects/${DEMO_PROJECT}/accounts`), { method: "DELETE" }), "Clearing the sign-in accounts");
  return seedDemo({ fetch: internalFetch(fetch), now });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  resetSamplePress({ fetch })
    .then((seeded) => console.log(`The sample press starts fresh: ${seeded.created.length} shop documents and ${seeded.stockroomAdded.length} stockroom books seeded.`))
    .catch((error) => {
      console.error(`The sample press reset failed: ${error?.message ?? error}`);
      process.exit(1);
    });
}
