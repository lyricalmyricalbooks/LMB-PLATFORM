// Every source file under src/ must be reachable from a page the build serves (the *.html entry scripts), following
// static imports, `import()` and `import.meta.glob`. A file only tests reach is unused code and fails here, so leftovers
// can't pile up again (admin clean-up, 11 November 2026). Delete the file, or wire it in; a file kept on purpose goes in
// KEPT with its reason.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src");
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/** Kept although no page reaches them. */
const KEPT: Record<string, string> = {
  "src/app/admin/bulkKind.ts": "tested rule for bulk kind changes, not wired yet",
  "src/app/admin/lineSheet.ts": "tested line sheet builder, not wired yet",
  "src/app/admin/orderTabs.ts": "tested order tab rules, not wired yet",
  "src/shared/documentKit.ts": "tested shared document rules, not wired yet",
  "src/app/admin/studio/themeReadability.ts": "test helper: the theme readability sweep",
  "src/app/features/site/storefrontColorScan.ts": "test helper: the storefront colour scan",
  "src/app/admin/studio/studioPerf.bench.ts": "benchmark, run by hand",
};

const isTest = (f: string) => /\.test\.|\.bench\.|\/fixtures?\/|\/testdata\//.test(f) || f.endsWith(".d.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") out.push(...walk(p)); }
    else if (/\.(tsx?|jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else if (spec.startsWith("/src/")) base = path.join(root, spec);
  else return null;
  for (const c of [base, ...EXTS.map(e => base + e), ...EXTS.map(e => path.join(base, "index" + e))]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function globFiles(from: string, pattern: string, files: string[]): string[] {
  const abs = path.resolve(path.dirname(from), pattern);
  const re = new RegExp("^" + abs.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*/g, "[^/]*") + "$");
  return files.filter(f => re.test(f));
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|import\.meta\.glob[^(]*\(\s*['"]([^'"]+)['"]/g;

function unusedFiles(): string[] {
  const files = walk(src);
  const edges = new Map<string, string[]>();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const next: string[] = [];
    for (const m of text.matchAll(IMPORT)) {
      if (m[4]) { next.push(...globFiles(f, m[4], files)); continue; }
      const r = resolve(f, m[1] || m[2] || m[3]);
      if (r) next.push(r);
    }
    edges.set(f, next);
  }
  const entries = readdirSync(root).filter(n => n.endsWith(".html"))
    .flatMap(n => [...readFileSync(path.join(root, n), "utf8").matchAll(/src="(\/src\/[^"]+)"/g)].map(m => path.join(root, m[1])));
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...(edges.get(f) || []));
  }
  return files.map(f => path.relative(root, f).split(path.sep).join("/"))
    .filter(f => !seen.has(path.join(root, f)) && !isTest(f) && !KEPT[f]);
}

describe("unused files", () => {
  it("every source file is reached from a page the build serves", () => {
    expect(unusedFiles()).toEqual([]);
  });
  it("every kept file still exists", () => {
    for (const f of Object.keys(KEPT)) expect(existsSync(path.join(root, f)), f).toBe(true);
  });
});
