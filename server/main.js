// The hosted server's start. The same code runs as two Cloud Run services, told apart by PLATFORM_ROLE:
//
//   PLATFORM_ROLE=api    platform-api: the web door and the other public addresses (server/world.js handle). Firebase
//                        Hosting sends /api/**, /tips/off and /checkup/off here (waitlist/firebase.json).
//   PLATFORM_ROLE=jobs   platform-jobs: POST /jobs/<name> runs one scheduled job (server/jobs.js). Private: Cloud Run
//                        lets only the scheduler's account call it.
//
// It listens on PORT (Cloud Run sets it; 8080 otherwise). The Google token is the service's own, from the metadata
// server; keys come from the environment, which Cloud Run fills from Secret Manager. Nothing here reads a key file.
//
//   PLATFORM_ROLE=api node server/main.js
import { pathToFileURL } from "node:url";
import { createHttpServer } from "./http.js";
import { jobsHandler } from "./jobs.js";
import { metadataToken } from "./metadata.js";
import { hostedWorld } from "./world.js";

export const ROLES = Object.freeze(["api", "jobs"]);

/** Builds the server for one role. `token` defaults to the metadata server's. Doesn't listen. */
export function buildServer({ env = process.env, fetch = globalThis.fetch, token = metadataToken({ fetch }), log = console.error } = {}) {
  const role = String(env.PLATFORM_ROLE ?? "").trim();
  if (!ROLES.includes(role)) throw new Error(`PLATFORM_ROLE must be "api" or "jobs", not "${role}"`);
  const world = hostedWorld({ env, fetch, token, log });
  const handle = role === "api" ? world.handle : jobsHandler(world, { log });
  return { role, world, server: createHttpServer(handle, { log }) };
}

/** Starts listening; stops taking calls on SIGTERM (Cloud Run's notice) and lets the ones under way finish. */
export async function start({ env = process.env, ...options } = {}) {
  const { role, server } = buildServer({ env, ...options });
  const port = Number(env.PORT || 8080);
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`The platform's ${role} server is listening on port ${port}.`);
  process.once("SIGTERM", () => server.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error) => {
    console.error(`The server didn't start: ${error.message}`);
    process.exitCode = 1;
  });
}
