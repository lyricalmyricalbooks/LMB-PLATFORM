// Type-check ratchet: the codebase predates tsconfig.json, so it carries known errors.
// CI fails when any file gains errors over scripts/typecheck-baseline.json; run with
// --update after fixing errors to lower the baseline (it never needs raising).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const BASELINE = new URL("./typecheck-baseline.json", import.meta.url);
// TypeScript 7 no longer exports bin/tsc as a module path; find it next to its package.json.
const tsc = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin", "tsc");

let output = "";
try {
  execFileSync(process.execPath, [tsc, "-p", ".", "--pretty", "false"], { encoding: "utf8", stdio: "pipe" });
} catch (error) {
  output = `${error.stdout || ""}${error.stderr || ""}`;
}

const counts = {};
for (const line of output.split("\n")) {
  const match = line.match(/^(.+?)\(\d+,\d+\): error TS\d+/);
  if (match) counts[match[1]] = (counts[match[1]] || 0) + 1;
}
const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes("--update") && !/error TS1\d{3}:/.test(output)) {
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Baseline written: ${total} known errors.`);
  process.exit(0);
}

// Syntax errors (TS1xxx) stop the checker early and hide every other error, so they always fail.
const syntax = output.split("\n").filter(line => /error TS1\d{3}:/.test(line));
if (syntax.length) {
  console.error(syntax.join("\n"));
  console.error("\nSyntax errors stop the type-check; fix these first.");
  process.exit(1);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const worse = Object.entries(counts).filter(([file, n]) => n > (baseline[file] || 0));
if (worse.length) {
  console.error(output.split("\n").filter(line => worse.some(([file]) => line.startsWith(file))).join("\n"));
  console.error(`\nNew type errors in: ${worse.map(([file, n]) => `${file} (${baseline[file] || 0} → ${n})`).join(", ")}`);
  process.exit(1);
}
const better = Object.entries(baseline).filter(([file, n]) => (counts[file] || 0) < n);
console.log(`Type-check OK: ${total} known errors, none new.${better.length ? " Some files improved — run with --update to lower the baseline." : ""}`);
