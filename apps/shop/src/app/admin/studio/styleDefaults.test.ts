import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STYLE_GROUPS } from "./styleSchema";
import { defaultSettings } from "../defaultSettings";

// A Theme settings control with no value shows `defaultValue` (else the first option / Off / the lowest
// number). When that differs from what the storefront draws for the same unset key, Studio shows the
// wrong state: a switch reads Off while the part is drawn, and the first click "does nothing". These
// checks compare each control with the storefront's own fallback (`d.key ?? true`, `!== false`,
// `|| "value"`, `?? 12`), unless Studio's default design already sets the key.

function publicSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "admin") publicSources(full, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const source = publicSources(join(__dirname, "../..")).map((file) => readFileSync(file, "utf8")).join("\n");
const studioDefaults = defaultSettings().design || {};
const fields = STYLE_GROUPS.flatMap((g) => g.fields.map((f) => ({ group: g.id, ...f } as any)))
  .filter((f) => !f.key.includes(".") && studioDefaults[f.key] === undefined);
const esc = (k: string) => k.replace(/[$]/g, "\\$");
const found = (re: RegExp) => [...source.matchAll(re)].map((m) => m[1]);

describe("Theme settings controls show what the storefront draws when nothing is set", () => {
  it("switches that default to on in the storefront start on", () => {
    const wrong = fields.filter((f) => f.kind === "toggle"
      && found(new RegExp(`\\.${esc(f.key)}\\s*(\\?\\? true|!== false)`, "g")).length
      && !found(new RegExp(`\\.${esc(f.key)}\\s*(=== true|\\?\\? false)`, "g")).length
      && f.defaultValue !== true).map((f) => `${f.group}.${f.key}`);
    expect(wrong).toEqual([]);
  });

  it("drop-downs start on the storefront's fallback option", () => {
    const wrong: string[] = [];
    for (const f of fields.filter((f) => f.kind === "select" && f.options?.length)) {
      const shown = f.defaultValue ?? f.options[0].value;
      for (const v of new Set(found(new RegExp(`\\.${esc(f.key)}\\s*(?:\\?\\?|\\|\\|)\\s*"([^"]*)"`, "g"))))
        if (v !== shown && f.options.some((o: any) => o.value === v)) wrong.push(`${f.group}.${f.key}: storefront "${v}", control "${shown}"`);
    }
    expect(wrong).toEqual([]);
  });

  it("sliders start on the storefront's fallback number", () => {
    const wrong: string[] = [];
    for (const f of fields.filter((f) => f.kind === "range")) {
      const values = new Set(found(new RegExp(`\\.${esc(f.key)}\\s*\\?\\?\\s*(-?[0-9.]+)`, "g")).map(Number));
      if (values.size === 1 && f.defaultValue !== [...values][0]) wrong.push(`${f.group}.${f.key}: storefront ${[...values][0]}, control ${f.defaultValue}`);
    }
    expect(wrong).toEqual([]);
  });

  it("the shop header layout control starts on Reference, the layout every design without one uses", () => {
    const layout = fields.find((f) => f.key === "catalogLayoutStyle");
    expect(layout?.defaultValue).toBe("reference");
  });
});
