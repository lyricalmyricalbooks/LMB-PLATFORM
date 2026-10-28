// `npm run walkthrough`: the platform's pages on pretend data, on this computer, with a start page of links as the
// platform owner and as a press (walkthrough/README.md). Options: --port <number> (default 5180), --with-demo (`npm run walkthrough:all`; also start
// `npm run demo`, the shop and the stockroom the start page links to; its own options can follow, like --new-press).
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, SEED_PRESSES, startWalkthrough } from "./server.js";

const argv = process.argv.slice(2);
const at = argv.indexOf("--port");
const port = at >= 0 ? Number(argv[at + 1]) : Number(process.env.WALKTHROUGH_PORT ?? 5180);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("The port must be a number from 0 to 65535, like: npm run walkthrough -- --port 5180");
  process.exit(1);
}

const withDemo = argv.includes("--with-demo");
const DEMO_OPTIONS = ["--fresh", "--no-functions", "--new-press"];

let running;
try {
  running = await startWalkthrough({ port });
} catch (error) {
  console.error(error?.code === "EADDRINUSE" ? `Something else is already using port ${port}. Stop it, or pick another: npm run walkthrough -- --port 5190` : `The walkthrough didn't start: ${error?.message ?? error}`);
  process.exit(1);
}

const width = Math.max(...PAGES.map((page) => page.name.length), "Plan & billing".length);
console.log("");
console.log("The walkthrough is running on this computer, on made-up data. Nothing is saved, sent or charged.");
console.log("");
for (const page of PAGES) console.log(`  ${page.name.padEnd(width)}  ${running.url}${page.path}   ${page.note}`);
for (const press of SEED_PRESSES) console.log(`  ${"Plan & billing".padEnd(width)}  ${running.url}/account/billing?shop=${press.address}   ${press.pressName}, ${press.note}`);
console.log("");
console.log('"Continue with Google" signs in as a made-up person (add ?as=name@example.com to the address to be someone else).');
console.log("Add a card with the test card on the page that opens. A press made on the sign-up page appears on the account page.");
console.log(`Start here: ${running.url}/`);
console.log("Press Ctrl+C to stop; everything made here is forgotten.");

// The shop and the stockroom, from the demo, in the same terminal. Its own lines follow.
let demo = null;
if (withDemo) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  console.log("");
  console.log("Starting the demo shop and stockroom too (npm run demo). Its addresses print below when it's ready.");
  demo = spawn(process.execPath, [join(root, "demo", "run.js"), ...argv.filter((option) => DEMO_OPTIONS.includes(option))], { cwd: root, stdio: "inherit" });
  demo.on("exit", (code) => {
    demo = null;
    if (code) console.log(`The demo stopped (code ${code}). The walkthrough pages keep running; the shop and stockroom links won't open.`);
  });
}

// Ctrl+C reaches the demo too (same terminal), and it saves its data on the way out: wait for it.
const stop = async (signal) => {
  if (demo) await new Promise((resolve) => { demo.once("exit", resolve); if (signal !== "SIGINT") demo.kill(signal); });
  await running.close();
  process.exit(0);
};
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
