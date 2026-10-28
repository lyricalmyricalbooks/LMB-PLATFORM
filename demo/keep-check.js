// Plan 5.0e, against the real emulators (CI job `demo-keeps-stockroom`; needs Java 21): starts `npm run demo`, writes to
// the stockroom's own database, stops the demo with Ctrl+C, starts it again and checks the change is still there.
// `node demo/keep-check.js`. It runs with --fresh first, so it forgets any demo data on this computer.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_PROJECT, PORTS, STOCKROOM_DATABASE, url } from "./config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = `${url(PORTS.firestore)}/v1/projects/${DEMO_PROJECT}/databases/${STOCKROOM_DATABASE}/documents/keepCheck/marker`;
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

function startDemo(args) {
  const child = spawn(process.execPath, [join(ROOT, "demo", "run.js"), "--no-functions", ...args], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The demo didn't start in 10 minutes:\n${output.slice(-3000)}`)), 10 * 60_000);
    const watch = (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
      if (output.includes("The demo shop is running")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`The demo stopped (${code}) before it was ready:\n${output.slice(-3000)}`));
    });
  });
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  // Ctrl+C in a terminal: the signal reaches run.js, which stops and saves everything it started.
  const ctrlC = async () => {
    child.kill("SIGINT");
    const code = await exited;
    if (code !== 0) throw new Error(`The demo stopped with code ${code} after Ctrl+C:\n${output.slice(-3000)}`);
  };
  return { ready, ctrlC, output: () => output };
}

async function main() {
  const value = `kept ${new Date().toISOString()}`;
  const first = startDemo(["--fresh"]);
  await first.ready;
  const wrote = await fetch(DOC, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: { value: { stringValue: value } } }) });
  if (!wrote.ok) throw new Error(`Writing to the stockroom's database failed: ${wrote.status} ${await wrote.text()}`);
  console.log(`\n[keep-check] Wrote "${value}" to the stockroom's database. Stopping with Ctrl+C…`);
  await first.ctrlC();

  console.log("\n[keep-check] Starting the demo again…");
  const second = startDemo([]);
  await second.ready;
  const read = await fetch(DOC, { headers: OWNER });
  const found = read.ok ? (await read.json()).fields?.value?.stringValue : null;
  await second.ctrlC();
  if (found !== value) throw new Error(`The stockroom's change was lost: found ${JSON.stringify(found)}, expected ${JSON.stringify(value)}.`);
  console.log(`\n[keep-check] The stockroom kept "${found}" across Ctrl+C and a fresh start.`);
}

main().catch((error) => {
  console.error(`\n[keep-check] ${error?.message ?? error}`);
  process.exit(1);
});
