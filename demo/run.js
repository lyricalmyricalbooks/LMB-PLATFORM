// `npm run demo`: the platform's test shop on this computer (docs/demo-shop.md). Starts the Firebase emulators for the
// made-up project demo-colophon-test, fills them with the test shop's starter catalogue, starts the shop and the
// stockroom against them, and prints what to open. Ctrl+C stops everything; what you changed is kept for next time
// (`npm run demo -- --fresh` starts again from the starter catalogue).
//
// Options: --fresh (forget the saved demo data first), --no-functions (leave the shop's server code out).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addresses, DEMO_OWNER, DEMO_PROJECT, demoRules, emulatorConfig, FIREBASE_TOOLS, firebaseRc, javaMajor, PORTS,
  profileScript, shopProfile, stockroomProfile, url, viteEnv,
} from "./config.js";
import { seedDemo } from "./seed.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, ".demo");
const DATA = join(WORK, "data");
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

function writeWorkFiles(withFunctions) {
  mkdirSync(WORK, { recursive: true });
  const read = (path) => readFileSync(join(ROOT, path), "utf8");
  for (const { file, text } of demoRules(read)) writeFileSync(join(WORK, file), text);
  writeFileSync(join(WORK, "firebase.json"), `${JSON.stringify(emulatorConfig({ functionsSource: withFunctions ? "../apps/shop/functions" : null }), null, 2)}\n`);
  writeFileSync(join(WORK, ".firebaserc"), `${JSON.stringify(firebaseRc(), null, 2)}\n`);
  writeFileSync(join(WORK, "shop-profile.js"), profileScript(shopProfile()));
  writeFileSync(join(WORK, "stockroom-profile.js"), profileScript(stockroomProfile()));
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

async function hubSays() {
  try {
    const response = await fetch(url(PORTS.hub, "/emulators"));
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Starts the emulators and waits until every one answers. Resolves false when they stop first. */
function startEmulators(withFunctions) {
  const args = ["-y", FIREBASE_TOOLS, "emulators:start", "--project", DEMO_PROJECT, "--config", "firebase.json"];
  if (existsSync(DATA)) args.push("--import", "data");
  args.push("--export-on-exit", "data");
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
      const running = await hubSays();
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
function stopAll(code = 0, { byCtrlC = false } = {}) {
  if (stopping) return;
  stopping = true;
  say("\nStopping the demo and saving its data…");
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
  say("Press Ctrl+C here to stop. Changes to the shop are kept for next time (the stockroom starts again from its");
  say("starter books each time); `npm run demo -- --fresh` starts the shop over too.");
}

async function main() {
  const argv = process.argv.slice(2);
  let withFunctions = !argv.includes("--no-functions");
  say("Starting the demo shop (project demo-colophon-test, local only)…");
  checkTools();
  ensurePackages(withFunctions);
  if (argv.includes("--fresh")) rmSync(DATA, { recursive: true, force: true });
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

  say("Filling the demo shop with its books…");
  const seeded = await seedDemo({ fetch });
  say(`  ${seeded.created.length ? `Added ${seeded.created.length} shop documents` : "The shop's books were already there"}; ${seeded.stockroomAdded.length ? `added ${seeded.stockroomAdded.length} stockroom books` : "the stockroom's books were already there"}.`);

  say("Starting the shop and the stockroom…");
  await Promise.all([
    startApp("shop", "apps/shop", PORTS.shop, "shop-profile.js"),
    startApp("stockroom", "apps/stockroom", PORTS.stockroom, "stockroom-profile.js"),
  ]);
  printWelcome(withFunctions);
}

main().catch((error) => {
  console.error(`\nThe demo stopped: ${error?.message ?? error}`);
  stopAll(1);
});
