// Finds every Tailwind colour utility (with its variants) used by public storefront code.
// Used by designerCoverage.test.ts; Node-only (fs), never import it from storefront code.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const COLORS = "white|black|slate|gray|zinc|neutral|stone|violet|purple|indigo|sky|blue|pink|fuchsia|cyan|teal|emerald|green|lime|amber|yellow|orange|rose|red";
const PREFIXES = "bg|text|border|ring|from|via|to|placeholder|outline|divide|fill|stroke|decoration|caret|accent";
const CLASS_RE = new RegExp(
  `(?<![\\w/.-])((?:[a-z0-9-]+:)*(?:${PREFIXES})-(?:${COLORS})(?:-\\d{2,3})?(?:\\/(?:\\d+|\\[[\\d.]+\\]))?)(?![\\w/-])`,
  "g",
);

function publicSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "admin" && name !== "ui") publicSources(full, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name) && name !== "themeTokens.ts" && name !== "RichTextEditor.tsx") out.push(full);
  }
  return out;
}

/** Sorted, de-duplicated colour classes used under src/app (admin and ui/ excluded). */
export function scanStorefrontColorClasses(appDir: string): string[] {
  const found = new Set<string>();
  for (const file of publicSources(appDir)) {
    for (const m of readFileSync(file, "utf8").matchAll(CLASS_RE)) found.add(m[1]);
  }
  return [...found].sort();
}
