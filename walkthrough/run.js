// `npm run walkthrough`: the platform's waitlist, sign-up, account and Plan & billing pages on pretend data, on this
// computer (walkthrough/README.md). Options: --port <number> (default 5180).
import { PAGES, SEED_PRESSES, startWalkthrough } from "./server.js";

const argv = process.argv.slice(2);
const at = argv.indexOf("--port");
const port = at >= 0 ? Number(argv[at + 1]) : Number(process.env.WALKTHROUGH_PORT ?? 5180);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("The port must be a number from 0 to 65535, like: npm run walkthrough -- --port 5180");
  process.exit(1);
}

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
console.log("Press Ctrl+C to stop; everything made here is forgotten.");

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => running.close().then(() => process.exit(0)));
