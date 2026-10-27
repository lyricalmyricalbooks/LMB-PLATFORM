import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { COPY_SCHEMA, DEFAULT_COPY } from "./storeCopy";

const APP_DIR = join(__dirname, "..", "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "admin") continue; // admin UI is not shopper-facing
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("store copy coverage", () => {
  it("every getCopy(design, \"key\") call references a key in COPY_SCHEMA", () => {
    const used = new Map<string, string>();
    for (const file of sourceFiles(APP_DIR)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/getCopy\(\s*[^,()]+(?:\([^)]*\))?[^,()]*,\s*"([A-Za-z0-9_]+)"/g)) {
        used.set(m[1], file);
      }
      // c("key") helpers defined as (key) => getCopy(design, key)
      for (const m of src.matchAll(/\bc\("([A-Za-z0-9_]+)"/g)) used.set(m[1], file);
    }
    // keys ending in "_" are dynamic prefixes (e.g. "sort_" + option key), checked by their concrete members
    const missing = [...used.keys()].filter((k) => !k.endsWith("_") && !(k in DEFAULT_COPY));
    expect(missing, `keys used but not in COPY_SCHEMA: ${missing.join(", ")}`).toEqual([]);
  });

  it("copy keys are unique and every field has a label and default", () => {
    const seen = new Set<string>();
    for (const g of COPY_SCHEMA) {
      for (const f of g.fields) {
        expect(seen.has(f.key), `duplicate copy key ${f.key}`).toBe(false);
        seen.add(f.key);
        expect(f.label.length).toBeGreaterThan(0);
        expect(typeof f.default).toBe("string");
      }
    }
  });
});
