// Lint ratchet: oxlint (.oxlintrc.json) over src, functions and scripts. The code base predates the linter, so it
// carries known problems (mostly unused variables); CI fails when any file gains problems over
// scripts/lint-baseline.json. Run with --update after fixing some to lower the baseline (it never needs raising).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const BASELINE = new URL("./lint-baseline.json", import.meta.url);
const pkg = createRequire(import.meta.url).resolve("oxlint/package.json");
const bin = join(dirname(pkg), JSON.parse(readFileSync(pkg, "utf8")).bin.oxlint);

let output = "";
try {
  output = execFileSync(process.execPath, [bin, "-c", ".oxlintrc.json", "--format=unix", "src", "functions", "scripts"], { encoding: "utf8", stdio: "pipe" });
} catch (error) {
  output = `${error.stdout || ""}${error.stderr || ""}`;
  if (!/\[(Error|Warning)\//.test(output)) { console.error(output); process.exit(1); }
}

const problems = output.split("\n").filter(line => /^\S.*:\d+:\d+: .*\[(Error|Warning)\//.test(line));
const counts = {};
for (const line of problems) {
  const file = line.slice(0, line.search(/:\d+:\d+: /));
  counts[file] = (counts[file] || 0) + 1;
}
const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Lint baseline written: ${problems.length} known problems.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const worse = Object.entries(counts).filter(([file, n]) => n > (baseline[file] || 0));
if (worse.length) {
  console.error(problems.filter(line => worse.some(([file]) => line.startsWith(`${file}:`))).join("\n"));
  console.error(`\nNew lint problems in: ${worse.map(([file, n]) => `${file} (${baseline[file] || 0} → ${n})`).join(", ")}`);
  process.exit(1);
}
const better = Object.entries(baseline).filter(([file, n]) => (counts[file] || 0) < n);
console.log(`Lint OK: ${problems.length} known problems, none new.${better.length ? " Some files improved — run with --update to lower the baseline." : ""}`);
