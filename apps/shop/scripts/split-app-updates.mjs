#!/usr/bin/env node
// Moves release notes written inline in src/app/admin/appUpdates.ts (the old "prepend an entry"
// convention) into their own files in src/app/admin/updates/, the way they are kept now.
//
//   node scripts/split-app-updates.mjs            # convert notes in the working-tree appUpdates.ts
//   node scripts/split-app-updates.mjs <file>     # convert notes found in another copy (e.g. `git show main:…`)
//
// Notes whose id already has a file are skipped, so it is safe to run more than once. New notes keep
// their order: a note listed above another on the same day gets the higher day number (newer).
// Use it to resolve a merge conflict in appUpdates.ts: run it on the other side's copy, then keep the
// collector version of appUpdates.ts.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dir = join(root, "src/app/admin/updates");
const source = process.argv[2] || join(root, "src/app/admin/appUpdates.ts");

/** The inline entries of an APP_UPDATES array literal, as object-literal source, in listed order. */
export function inlineEntries(text) {
  const start = text.indexOf("export const APP_UPDATES: AppUpdate[] = [");
  if (start < 0) return [];
  const body = text.slice(text.indexOf("[", start) + 1, text.lastIndexOf("];"));
  return [...body.matchAll(/^ {2}\{\n([\s\S]*?)^ {2}\},?\n/gm)].map(m => m[1]);
}

export function noteFileName(date, number, id) {
  return `${date}-${String(number).padStart(2, "0")}-${id}.ts`;
}

function main() {
  const existing = readdirSync(dir).filter(n => n.endsWith(".ts"));
  const has = id => existing.some(n => n.endsWith(`-${id}.ts`));
  const next = new Map(); // date → next free day number
  for (const n of existing) {
    const [, date, num] = n.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})-/) || [];
    if (date) next.set(date, Math.max(next.get(date) || 1, Number(num) + 1));
  }
  const fresh = inlineEntries(readFileSync(source, "utf8"))
    .map(body => ({ body, id: body.match(/id: "([^"]+)"/)?.[1], date: body.match(/date: "([^"]+)"/)?.[1] }))
    .filter(e => e.id && e.date && !has(e.id));
  // Listed newest first: number the oldest of each day first so the newest gets the highest number.
  const written = [];
  for (const e of [...fresh].reverse()) {
    const number = next.get(e.date) || 1;
    next.set(e.date, number + 1);
    const lines = e.body.replace(/\n$/, "").split("\n").map(l => l.startsWith("  ") ? l.slice(2) : l);
    const name = noteFileName(e.date, number, e.id);
    writeFileSync(join(dir, name), `import type { AppUpdate } from "../appUpdates";\n\nexport default {\n${lines.join("\n")}\n} satisfies AppUpdate;\n`);
    written.push(name);
  }
  console.log(written.length ? `Wrote ${written.length} note file(s):\n  ${written.reverse().join("\n  ")}` : "No new inline notes to move.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
