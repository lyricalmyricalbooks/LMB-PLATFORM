// admin/api.ts is imported by most admin screens; nothing it imports may import it back (a loop makes a module run
// half-initialised, so one screen can break after an unrelated change). themeStore used to, for the audit log, which
// now has its own file (auditLog.ts). Follows static, non-type imports only.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = join(__dirname, "..", "..");
const api = resolve(__dirname, "api.ts");
const resolveSpec = (from: string, spec: string) => {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const ext of [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", ""]) {
    const file = base + ext;
    if (existsSync(file) && /\.(ts|tsx|js|mjs)$/.test(file)) return file;
  }
  return null;
};
const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+["']([^"']+)["']/gm)]
  .map(m => resolveSpec(file, m[1])).filter((f): f is string => !!f);

describe("admin/api.ts", () => {
  it("is not imported back by anything it imports", () => {
    const loops: string[] = [];
    const seen = new Set<string>();
    const walk = (file: string, path: string[]) => {
      for (const dep of importsOf(file)) {
        if (dep === api) { loops.push([...path, dep].map(f => f.replace(root + "/", "")).join(" → ")); continue; }
        if (seen.has(dep)) continue;
        seen.add(dep);
        walk(dep, [...path, dep]);
      }
    };
    walk(api, [api]);
    expect(seen.size).toBeGreaterThan(20);
    expect(loops).toEqual([]);
  });
});
