// `npm run demo`: the platform's test shop on this computer (docs/demo-shop.md). Starts the Firebase emulators for the
// made-up project demo-colophon-test, fills them with the test shop's starter catalogue, starts the shop and the
// stockroom against them, and prints what to open. Ctrl+C stops everything; what you changed is kept for next time
// (`npm run demo -- --fresh` starts again from the starter catalogue).
//
// Options: --fresh (forget the saved demo data first), --no-functions (leave the shop's server code out),
// --new-press (start the shop as a press that has just signed up: the admin opens on Choose your look, then Set up your
// shop; each time it is added it starts that story again), --sample-press <public host> (the sample press on a server:
// read-only, no server code, fresh every night; hosted.js).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addresses, DEMO_OWNER, DEMO_PROJECT, demoRules, emulatorConfig, FIREBASE_TOOLS, firebaseRc, javaMajor, PORTS,
  profileScript, shopProfile, stockroomProfile, STOCKROOM_DATABASE, url, viteEnv,
} from "./config.js";
import { seedDemo } from "./seed.js";
import { INTERNAL_PORTS, msUntilReset, RESET_HOUR, sampleEmulatorConfig, sampleProfileScript, sampleRules, sampleViteEnv } from "./hosted.js";
import { startGate } from "./gate.js";
import { keepDatabase } from "./keepDatabase.js";
import { resetSamplePress } from "./reset.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, ".demo");
const DATA = join(WORK, "data");
// The emulators' own export (DATA) keeps only the default Firestore database; the stockroom's is saved here instead
// (keepDatabase.js). Outside DATA, which the export replaces whole.
const STOCKROOM_SAVE = join(WORK, "stockroom-data.json");
const SAVE_EVERY_MS = 10_000;
const WINDOWS = process.platform === "win32";
const MIN_JAVA = 21; // firebase-tools 15's Firestore emulator needs Java 21 or newer.

const say = (line = "") => console.log(line);
const stopWith = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

function checkTools() {
  const node = Number(process.versions.node.split(".")[0]);
  if (node < 22) stopWith(`The demo needs Node.js 22 or newer; this computer has ${process.versions.node}. Install the current Node.js from nodejs.org.`);
  const java = spawnSync("java", ["-version"], { encoding: "utf8", shell: WINDOWS });
  const major = java.error ? 0 : javaMajor(`${java.stderr}${java.stdout}`);
  if (major < MIN_JAVA) {
    stopWith([
      major ? `The demo needs Java ${MIN_JAVA} or newer; this computer has Java ${major}.` : "The demo needs Java, and this computer doesn't seem to have it.",
      "The Firebase emulators that hold the demo shop's data run on Java.",
      `Install a free one (for example "Temurin ${MIN_JAVA}" from adoptium.net), close this window, open a new one and run the command again.`,
    ].join("\n"));
  }
}

// Each app keeps its own packages; the first run installs what's missing.
function ensurePackages(withFunctions) {
  const installs = [
    ["apps/shop", ["npx", "-y", "pnpm@10.28.0", "install", "--frozen-lockfile"]],
    ["apps/stockroom", ["npm", "ci", "--no-audit", "--no-fund"]],
    ...(withFunctions ? [["apps/shop/functions", ["npm", "ci", "--no-audit", "--no-fund"]]] : []),
  ];
  for (const [folder, [command, ...args]] of installs) {
    if (existsSync(join(ROOT, folder, "node_modules"))) continue;
    say(`Installing what ${folder} needs (first run only, a few minutes)…`);
    const result = spawnSync(command, args, { cwd: join(ROOT, folder), stdio: "inherit", shell: WINDOWS });
    if (result.status !== 0) stopWith(`Installing ${folder}'s packages failed. Check the internet connection and run the command again.`);
  }
}

function writeWorkFiles(withFunctions, sample = false) {
  mkdirSync(WORK, { recursive: true });
  const read = (path) => readFileSync(join(ROOT, path), "utf8");
  for (const { file, text } of (sample ? sampleRules : demoRules)(read)) writeFileSync(join(WORK, file), text);
  const config = sample ? sampleEmulatorConfig() : emulatorConfig({ functionsSource: withFunctions ? "../apps/shop/functions" : null });
  writeFileSync(join(WORK, "firebase.json"), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(WORK, ".firebaserc"), `${JSON.stringify(firebaseRc(), null, 2)}\n`);
  const script = sample ? sampleProfileScript : profileScript;
  writeFileSync(join(WORK, "shop-profile.js"), script(shopProfile()));
  writeFileSync(join(WORK, "stockroom-profile.js"), script(stockroomProfile()));
}

// On Windows, Ctrl+C reaches every program in the window, so each one stops itself. Elsewhere each piece runs in its
// own process group, which stopAll sends Ctrl+C to.
const children = new Set();
function start(name, command, args, options) {
  const child = spawn(command, args, { ...options, detached: !WINDOWS, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

async function hubSays(port = PORTS.hub) {
  try {
    const response = await fetch(url(port, "/emulators"));
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Starts the emulators and waits until every one answers. Resolves false when they stop first. */
function startEmulators(withFunctions, sample = false) {
  const args = ["-y", FIREBASE_TOOLS, "emulators:start", "--project", DEMO_PROJECT, "--config", "firebase.json"];
  // The sample press keeps nothing: it starts from the seed and is reset every night.
  if (!sample) {
    if (existsSync(DATA)) args.push("--import", "data");
    args.push("--export-on-exit", "data");
  }
  const log = [];
  // No Google sign-in is needed or looked for: the emulators never call Google for a demo- project.
  const child = start("emulators", "npx", args, { cwd: WORK, shell: WINDOWS, env: { ...process.env, METADATA_SERVER_DETECTION: "none" } });
  const keep = (chunk) => {
    const text = chunk.toString();
    log.push(text);
    writeFileSync(join(WORK, "emulators.log"), log.join(""));
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  const needed = ["auth", "firestore", "database", "storage", ...(withFunctions ? ["functions"] : [])];
  return new Promise((resolve) => {
    let done = false;
    child.on("exit", () => {
      if (!done) {
        done = true;
        resolve({ ok: false, child, log: log.join("") });
      }
    });
    const deadline = Date.now() + 4 * 60_000;
    const poll = async () => {
      if (done) return;
      const running = await hubSays(sample ? INTERNAL_PORTS.hub : PORTS.hub);
      const ready = running && needed.every((name) => running[name]) && log.join("").includes("All emulators ready");
      if (ready) {
        done = true;
        resolve({ ok: true, child });
      } else if (Date.now() > deadline) {
        done = true;
        resolve({ ok: false, child, log: log.join(""), timedOut: true });
      } else setTimeout(poll, 1000);
    };
    poll();
  });
}

function startApp(name, folder, port, profileFile) {
  const child = start(name, process.execPath, [join(ROOT, "demo", "serve.js")], {
    cwd: join(ROOT, folder),
    env: { ...process.env, ...viteEnv(), DEMO_PORT: String(port), DEMO_PROFILE_FILE: join(WORK, profileFile) },
  });
  return new Promise((resolve, reject) => {
    let output = "";
    const watch = (chunk) => {
      output += chunk.toString();
      if (output.includes("ready on")) resolve(child);
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
      process.stderr.write(`[${name}] ${chunk}`);
    });
    child.on("exit", (code) => reject(new Error(`The ${name} stopped (${code}). ${output.slice(-500)}`)));
  });
}

let stopping = false;
// Set once the emulators are up (main): saves the stockroom's database.
let stockroomKeeper = null;

function stopAll(code = 0, { byCtrlC = false } = {}) {
  if (stopping) return;
  stopping = true;
  say("\nStopping the demo and saving its data…");
  // The stockroom's database first, while the emulators still answer (on Windows they got the same Ctrl+C, but stop
  // only after their own export). A save that can't finish keeps the copy from the last few seconds.
  // Before they start, stop at once: the callers that then exit (stopWith) must not leave the emulators running.
  if (!stockroomKeeper) return stopChildren(code, { byCtrlC });
  const giveUp = new Promise((resolve) => setTimeout(() => resolve(false), 10_000).unref());
  Promise.race([stockroomKeeper.save(), giveUp]).then(() => stopChildren(code, { byCtrlC }));
}

function stopChildren(code, { byCtrlC }) {
  for (const child of children) {
    if (!WINDOWS) {
      try {
        process.kill(-child.pid, "SIGINT");
      } catch {
        /* already gone */
      }
    } else if (!byCtrlC) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
  const wait = setInterval(() => {
    if (children.size === 0) {
      clearInterval(wait);
      process.exit(code);
    }
  }, 300);
  // The emulators save on the way out; give them time, then stop anyway.
  setTimeout(() => {
    for (const child of children) {
      if (WINDOWS) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
    process.exit(code);
  }, 30_000).unref();
}

function printWelcome(withFunctions) {
  const width = Math.max(...addresses().map(([label]) => label.length));
  say("");
  say("The demo shop is running on this computer. Open these in your browser:");
  say("");
  for (const [label, address] of addresses()) say(`  ${label.padEnd(width)}  ${address}`);
  say("");
  say(`Sign in to the admin and the stockroom with "Sign in with Google". A practice sign-in window opens:`);
  say(`pick ${DEMO_OWNER.email} (${DEMO_OWNER.name}). No password, and no real Google account is used.`);
  say("");
  say("What doesn't work here:");
  say("  - Paying. The checkout opens and works out shipping, but its Pay step says no payment method is available:");
  say("    card payments need Stripe, which can't run on this computer. No order is paid and no money moves.");
  say("  - Emails are not sent, and shipping labels and live carrier rates can't be bought.");
  say("  - Keep the computer online: the practice sign-in window and the stockroom load a few files from the internet.");
  say("    No shop data leaves this computer, and no real Google account is used.");
  if (!withFunctions) say("  - The shop's server code is off, so shipping prices, order tools and the Team list don't work either.");
  say("");
  say("Press Ctrl+C here to stop. Changes to the shop and the stockroom are kept for next time;");
  say("`npm run demo -- --fresh` starts both over from the starter books.");
}

// The sample press's apps, built once for its public host with each app's own Vite.
function buildSampleApps(publicHost) {
  const env = { ...process.env, ...sampleViteEnv(publicHost) };
  const apps = {};
  for (const [name, folder] of [["shop", "apps/shop"], ["stockroom", "apps/stockroom"]]) {
    const outDir = join(WORK, "sample", name);
    say(`Building the ${name} for ${publicHost}…`);
    const vite = join(ROOT, folder, "node_modules", "vite", "bin", "vite.js");
    const result = spawnSync(process.execPath, [vite, "build", "--outDir", outDir, "--emptyOutDir"], { cwd: join(ROOT, folder), env, stdio: "inherit" });
    if (result.status !== 0) stopWith(`Building the ${name} failed.`);
    apps[name] = { root: outDir, profile: readFileSync(join(WORK, `${name}-profile.js`), "utf8") };
  }
  return apps;
}

function resetEveryNight() {
  setTimeout(async () => {
    try {
      const seeded = await resetSamplePress({ fetch });
      say(`${new Date().toISOString()} The sample press starts fresh (${seeded.created.length} shop documents seeded).`);
    } catch (error) {
      console.error(`${new Date().toISOString()} The nightly reset failed: ${error?.message ?? error}`);
    }
    resetEveryNight();
  }, msUntilReset()).unref?.();
}

async function sampleMain(publicHost) {
  say(`Starting the sample press for ${publicHost} (read-only, no server code, fresh every night)…`);
  sampleViteEnv(publicHost);
  checkTools();
  ensurePackages(false);
  if (await hubSays(INTERNAL_PORTS.hub)) stopWith("The sample press's emulators are already running. Stop that one first.");
  process.on("SIGINT", () => stopAll(0, { byCtrlC: true }));
  process.on("SIGTERM", () => stopAll(0));
  writeWorkFiles(false, true);
  const emulators = await startEmulators(false, true);
  if (!emulators.ok) {
    stopAll(1);
    stopWith(`The Firebase emulators didn't start. The end of their log (.demo/emulators.log):\n${(emulators.log ?? "").slice(-1500)}`);
  }
  emulators.child.on("exit", () => {
    if (!stopping) {
      console.error("The Firebase emulators stopped; stopping the sample press.");
      stopAll(1);
    }
  });
  await resetSamplePress({ fetch });
  const apps = buildSampleApps(publicHost);
  startGate({ apps, log: (line) => say(line) });
  resetEveryNight();
  say("");
  say(`The sample press is open at http://${publicHost}:${PORTS.shop}/ (stockroom: http://${publicHost}:${PORTS.stockroom}/).`);
  say(`Visitors can look at everything and save nothing. It starts fresh every night at ${RESET_HOUR}:00 server time.`);
  say("No email can be sent and no payment taken: the shop's server code is not running.");
}

async function main() {
  const argv = process.argv.slice(2);
  const sampleAt = argv.indexOf("--sample-press");
  if (sampleAt >= 0) return sampleMain(argv[sampleAt + 1]);
  let withFunctions = !argv.includes("--no-functions");
  say("Starting the demo shop (project demo-colophon-test, local only)…");
  checkTools();
  ensurePackages(withFunctions);
  if (argv.includes("--fresh")) {
    rmSync(DATA, { recursive: true, force: true });
    rmSync(STOCKROOM_SAVE, { force: true });
  }
  if (await hubSays()) stopWith("The Firebase emulators are already running (another demo window?). Stop that one first with Ctrl+C.");

  process.on("SIGINT", () => stopAll(0, { byCtrlC: true }));
  process.on("SIGTERM", () => stopAll(0));

  writeWorkFiles(withFunctions);
  say("Starting the Firebase emulators (the first run downloads them, about a minute)…");
  let emulators = await startEmulators(withFunctions);
  if (!emulators.ok && withFunctions && !emulators.timedOut) {
    say("The shop's server code didn't start, so the demo runs without it (see .demo/emulators.log).");
    withFunctions = false;
    writeWorkFiles(false);
    emulators = await startEmulators(false);
  }
  if (!emulators.ok) {
    stopAll(1);
    stopWith(`The Firebase emulators didn't start. The end of their log (.demo/emulators.log):\n${(emulators.log ?? "").slice(-1500)}`);
  }
  emulators.child.on("exit", () => {
    if (!stopping) {
      console.error("The Firebase emulators stopped; stopping the demo.");
      stopAll(1);
    }
  });

  const keeper = keepDatabase({ fetch, base: url(PORTS.firestore), projectId: DEMO_PROJECT, database: STOCKROOM_DATABASE, file: STOCKROOM_SAVE });
  try {
    const restored = await keeper.restore();
    if (restored) say(`Brought back the stockroom as you left it (${restored} documents).`);
  } catch (error) {
    // Kept aside, so the saves that follow don't write over it.
    renameSync(STOCKROOM_SAVE, `${STOCKROOM_SAVE}.not-restored`);
    say(`The stockroom's saved copy couldn't be brought back, so it starts from its starter books (${error?.message ?? error}).`);
    say(`The copy is kept in .demo/stockroom-data.json.not-restored.`);
  }
  stockroomKeeper = keeper;

  say("Filling the demo shop with its books…");
  const seeded = await seedDemo({ fetch, newPress: argv.includes("--new-press") });
  say(`  ${seeded.created.length ? `Added ${seeded.created.length} shop documents` : "The shop's books were already there"}; ${seeded.stockroomAdded.length ? `added ${seeded.stockroomAdded.length} stockroom books` : "the stockroom's books were already there"}.`);

  if (seeded.newPress) say("  Set up as a brand-new press: the admin opens on Choose your look, then Set up your shop.");

  say("Starting the shop and the stockroom…");
  await Promise.all([
    startApp("shop", "apps/shop", PORTS.shop, "shop-profile.js"),
    startApp("stockroom", "apps/stockroom", PORTS.stockroom, "stockroom-profile.js"),
  ]);
  printWelcome(withFunctions);
  // Saved every few seconds too: on Windows, Ctrl+C stops the emulators at the same moment as this window.
  setInterval(() => {
    if (!stopping) keeper.save();
  }, SAVE_EVERY_MS).unref();
}

main().catch((error) => {
  console.error(`\nThe demo stopped: ${error?.message ?? error}`);
  stopAll(1);
});
