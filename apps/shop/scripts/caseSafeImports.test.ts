import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Windows and macOS disks ignore letter case, so `./BackToTop` finds `backToTop.ts` before `BackToTop.tsx` there and the
// page breaks (the demo shop on Windows, 28 October 2026), while Linux and CI pick the component. An import of a file
// that has a sibling differing only in case must name its extension.
const SRC = path.resolve(__dirname, "../src");
const CODE = /\.(tsx?|jsx?|mjs)$/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
    return CODE.test(entry.name) ? [full] : [];
  });
}

const files = walk(SRC);
const byFolded = new Map<string, string[]>();
for (const file of files) {
  const key = file.replace(CODE, "").toLowerCase();
  byFolded.set(key, [...(byFolded.get(key) ?? []), file]);
}
// Vite tries extensions in this order; on a case-blind disk the first one any sibling has wins.
const ORDER = [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx"];
const firstTried = (siblings: string[]) =>
  [...siblings].sort((a, b) => ORDER.indexOf(path.extname(a)) - ORDER.indexOf(path.extname(b)))[0];
const IMPORT = /(?:from\s+|import\s*\(\s*|vi\.mock\(\s*|import\s+)(["'])(\.{1,2}\/[^"']+|@\/[^"']+)\1/g;

describe("imports that letter case could send to the wrong file", () => {
  it("name their extension when a case-blind disk would pick another file", () => {
    const ambiguous: string[] = [];
    for (const file of files) {
      for (const [, , spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
        if (/\.[a-z]+$/i.test(spec)) continue;
        const target = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : path.resolve(path.dirname(file), spec);
        const siblings = byFolded.get(target.toLowerCase()) ?? [];
        const picked = siblings.length > 1 ? firstTried(siblings) : undefined;
        if (picked && picked.replace(CODE, "") !== target) ambiguous.push(`${path.relative(SRC, file)}: "${spec}"`);
      }
    }
    expect(ambiguous).toEqual([]);
  });
});
