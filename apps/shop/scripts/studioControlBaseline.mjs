// The Studio control baseline: one small file per control in scripts/studio-control-baseline/ (file name = the
// control id with ":" written as "~", content = visible | css-only | dom-only | "none: <reason>"). One file per
// control, not one shared list, so PRs that add different controls never conflict with each other.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

export const BASELINE_DIR = new URL("./studio-control-baseline/", import.meta.url);
const fileOf = (id) => id.replace(/:/g, "~");
const idOf = (file) => file.replace(/~/g, ":");

/** { controlId: expectation } for every control in the baseline. */
export function readBaseline(dir = BASELINE_DIR) {
  return Object.fromEntries(readdirSync(dir).filter(f => !f.startsWith("."))
    .map(f => [idOf(f), readFileSync(new URL(f, dir), "utf8").trim()]));
}

/** Writes the baseline, touching only the files whose expectation changed (and removing dropped controls). */
export function writeBaseline(controls, dir = BASELINE_DIR) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const old = readBaseline(dir);
  for (const [id, value] of Object.entries(controls)) {
    if (/[~/\\]/.test(id)) throw new Error(`Control id can't be a file name: ${id}`);
    if (old[id] !== value) writeFileSync(new URL(fileOf(id), dir), `${value}\n`);
  }
  for (const id of Object.keys(old)) if (!(id in controls)) unlinkSync(new URL(fileOf(id), dir));
}

// A branch started before the split that still edits scripts/studio-control-baseline.json: after merging main,
// `node scripts/studioControlBaseline.mjs scripts/studio-control-baseline.json` copies its entries into the
// per-control files (adding and changing, never removing), then delete the .json.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href && process.argv[2]) {
  const { controls } = JSON.parse(readFileSync(process.argv[2], "utf8"));
  writeBaseline({ ...readBaseline(), ...controls });
  console.log(`Copied ${Object.keys(controls).length} controls into scripts/studio-control-baseline/`);
}
