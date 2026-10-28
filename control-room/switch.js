// Turns one shop switch on or off from the command line, the same way as the control room's button: the shop's saved
// profile changes, the change is logged in the registry and the shop's audit log, and the shop's pages are deployed
// again at their current release so the new /shop-profile.js is live.
//
//   CONTROL_ROOM_BY=you@yourpress.example RELEASE_BUILD_ROOT=/var/lmb/builds \
//   node control-room/switch.js <shop id> <switch> on|off "<why, at least 10 characters>"
//
// It works on a real shop, so it needs the platform's real clients and a person running it: the token comes from
// `gcloud auth print-access-token`, and the Firebase command line uses the same signed-in account. It never runs by
// itself and nothing in the tests runs it for real.
import { pathToFileURL } from "node:url";
import { SWITCHES } from "../setup/steps.js";
import { createControlRoom, profilePublisher } from "./controlRoom.js";

export const USAGE = `Usage: node control-room/switch.js <shop id> <switch> on|off "<why>"\nSwitches: ${SWITCHES.join(", ")}`;

/** Reads the command line: { shopId, name, on, reason } or a refusal in plain words. */
export function parseSwitchArgs(argv) {
  const [shopId, name, state, ...why] = argv;
  if (!shopId || !name || !["on", "off"].includes(state) || !why.length) throw new Error(USAGE);
  return { shopId, name, on: state === "on", reason: why.join(" ") };
}

/**
 * Runs the command with the clients given: { registry, auditLog, profileFiles, deploy, build }. Refuses with no
 * clients, so nothing pretends to have changed a shop.
 */
export async function switchCommand({ argv, env = process.env, clients, now, print = console.log }) {
  const args = parseSwitchArgs(argv);
  const by = String(env.CONTROL_ROOM_BY ?? "").trim().toLowerCase();
  if (!by.includes("@")) throw new Error("Set CONTROL_ROOM_BY to your email address: it goes in the shop's log.");
  if (!clients?.registry || !clients.deploy || !clients.profileFiles || !clients.auditLog) {
    throw new Error("This command changes a real shop and needs the platform's real clients. Nothing was changed.");
  }
  const room = createControlRoom({
    registry: clients.registry, auditLog: clients.auditLog, profileFiles: clients.profileFiles,
    publish: profilePublisher({ deploy: clients.deploy, registry: clients.registry, build: clients.build }), admins: [], now,
  });
  const result = await room.setSwitch({ by, ...args });
  print(`${result.shopId}: ${result.switch} is ${result.to ? "on" : "off"}${result.changed ? ` (was ${result.from ? "on" : "off"})` : " (no change)"}.`);
  print(result.published.length ? `Pages deployed again with the new profile: ${result.published.join(", ")}.` : "No pages are live yet; setup will publish the profile.");
  return result;
}

/** The real clients, made only when the command is run by a person. */
async function realClients(env) {
  if (!env.RELEASE_BUILD_ROOT) throw new Error("RELEASE_BUILD_ROOT is not set (the folder releases are built in).");
  const [{ realSetupClients }, { gcloudToken }, { releaseBuilder }, { commandRunner }] = await Promise.all([
    import("../setup/real.js"), import("../release-check/run.js"), import("../services/release-runner/builder.js"), import("../services/release-runner/run.js"),
  ]);
  const run = commandRunner();
  const builder = releaseBuilder({ run, root: env.RELEASE_BUILD_ROOT, source: new URL("..", import.meta.url).pathname });
  const clients = realSetupClients({ fetch: globalThis.fetch, token: gcloudToken, run, buildDir: builder.dir });
  return { ...clients, build: (version) => builder.build(version) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argv = process.argv.slice(2);
    parseSwitchArgs(argv);
    await switchCommand({ argv, clients: await realClients(process.env) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
