import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TARGET_LABELS } from "./targetLabels";
import { REGION_GROUPS, regionProps } from "../../features/site/storefrontRegions";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? (name === "admin" ? [] : files(p)) : /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe("preview pop-up labels", () => {
  it("name every click-to-edit target the storefront uses", () => {
    const used = new Set<string>();
    for (const f of files("src/app")) for (const m of readFileSync(f, "utf8").matchAll(/data-studio-target="([^"]+)"/g)) m[1].split("|").forEach(t => used.add(t));
    for (const g of REGION_GROUPS) for (const r of g.regions) regionProps(r.id)["data-studio-target"].split("|").forEach(t => used.add(t));
    const unnamed = [...used].filter(t => !TARGET_LABELS[t]);
    expect(unnamed).toEqual([]);
  });

  it("are distinct, so a pop-up never offers two identical choices", () => {
    const values = Object.values(TARGET_LABELS);
    expect(new Set(values).size).toBe(values.length);
  });
});
