import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { insertAfter, orderFeatures, withFeatureCopy, withFeatureRegions, withFeatureStyle, withFeatureSubsections, type StorefrontFeature } from "./featureKit";
import { STOREFRONT_FEATURES } from "./registry";
import { STYLE_GROUPS } from "../../../admin/studio/styleSchema";
import { STYLE_SUBSECTIONS } from "../../../admin/studio/settingsMap";
import { COPY_SCHEMA } from "../storeCopy";
import { REGION_GROUPS } from "../storefrontRegions";

const toggle = (key: string) => ({ key, label: key, kind: "toggle" as const, defaultValue: false });
const feature: StorefrontFeature = {
  id: "demo",
  style: { group: "g", after: "a", subsection: "Extras", subsectionAfter: "a", fields: [toggle("x")] },
  copy: { group: "Words", fields: [{ key: "xWord", label: "X", default: "X" }] },
  regions: { group: "r", after: "one", files: ["features/site/extras/demo/Demo.tsx"], fields: [{ id: "xRegion", label: "X" }] },
};

describe("featureKit", () => {
  it("places entries after their anchor, or at the end", () => {
    expect(insertAfter([1, 2, 3], [9], "1", String, "t")).toEqual([1, 9, 2, 3]);
    expect(insertAfter([1, 2], [9], undefined, String, "t")).toEqual([1, 2, 9]);
    expect(() => insertAfter([1], [9], "7", String, "t")).toThrow(/no entry "7"/);
  });
  it("adds a feature to each list without touching the others", () => {
    const style = [{ id: "g", fields: [toggle("a"), toggle("b")] }, { id: "h", fields: [] }];
    expect(withFeatureStyle(style, [feature])[0].fields.map(f => f.key)).toEqual(["a", "x", "b"]);
    expect(withFeatureStyle(style, [feature])[1]).toBe(style[1]);
    expect(withFeatureCopy([{ group: "Words", fields: [{ key: "w", label: "w", default: "" }] }], [feature])[0].fields.map(f => f.key)).toEqual(["w", "xWord"]);
    const regions = withFeatureRegions([{ id: "r", files: ["a.tsx"], regions: [{ id: "one", label: "1" }, { id: "two", label: "2" }] }], [feature]);
    expect(regions[0].regions.map(r => r.id)).toEqual(["one", "xRegion", "two"]);
    expect(regions[0].files).toEqual(["a.tsx", "features/site/extras/demo/Demo.tsx"]);
    expect(withFeatureSubsections({ g: [{ title: "Extras", keys: ["a", "b"] }] }, [feature]).g[0].keys).toEqual(["a", "x", "b"]);
  });
  it("applies a feature after the feature whose entry it is placed after, else in folder order", () => {
    const a: StorefrontFeature = { id: "a", style: { group: "g", after: "z1", fields: [toggle("a1")] } };
    const b: StorefrontFeature = { id: "b", copy: { group: "Words", fields: [{ key: "b1", label: "b", default: "" }] } };
    const z: StorefrontFeature = { id: "z", style: { group: "g", after: "a", fields: [toggle("z1"), toggle("z2")] } };
    expect(orderFeatures([a, b, z]).map(f => f.id)).toEqual(["b", "z", "a"]);
    expect(orderFeatures([b, z]).map(f => f.id)).toEqual(["b", "z"]);
    const loop: StorefrontFeature = { id: "y", style: { group: "g", after: "a1", fields: [toggle("y1")] } };
    expect(() => orderFeatures([a, { ...z, style: { ...z.style!, after: "y1" } }, loop])).toThrow(/placed after each other/);
  });
  it("refuses a group or sub-section that doesn't exist", () => {
    expect(() => withFeatureStyle([{ id: "other", fields: [] }], [feature])).toThrow(/no group "g"/);
    expect(() => withFeatureSubsections({ g: [] }, [feature])).toThrow(/no "Extras"/);
  });
});

describe("every extras folder", () => {
  const here = join(process.cwd(), "src/app/features/site/extras");
  const folders = readdirSync(here, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  it("has a feature.ts named after it, collected by the registry", () => {
    for (const name of folders) expect(existsSync(join(here, name, "feature.ts")), name).toBe(true);
    expect(STOREFRONT_FEATURES.map(f => f.id).sort()).toEqual(folders);
  });
  it("feature.ts holds data only (shopper code reads it), and its files sit in its folder", () => {
    for (const name of folders) {
      const imports = [...readFileSync(join(here, name, "feature.ts"), "utf8").matchAll(/^import\s+(type\s+)?[^;]*from\s+"([^"]+)"/gm)];
      for (const [, isType, from] of imports) expect(isType || from, `${name}: ${from}`).toBeTruthy();
      for (const f of STOREFRONT_FEATURES.find(x => x.id === name)?.regions?.files || []) expect(f.startsWith(`features/site/extras/${name}/`), f).toBe(true);
    }
  });
  it("its controls, words and regions reach the shared lists once", () => {
    const styleKeys = STYLE_GROUPS.flatMap(g => g.fields.map(f => f.key));
    const copyKeys = COPY_SCHEMA.flatMap(g => g.fields.map(f => f.key));
    const regionIds = REGION_GROUPS.flatMap(g => g.regions.map(r => r.id));
    const subKeys = Object.values(STYLE_SUBSECTIONS).flatMap(s => s.flatMap(x => x.keys));
    for (const f of STOREFRONT_FEATURES) {
      for (const { key } of f.style?.fields || []) {
        expect(styleKeys.filter(k => k === key), key).toHaveLength(1);
        if (f.style?.subsection) expect(subKeys.filter(k => k === key), key).toHaveLength(1);
      }
      for (const { key } of f.copy?.fields || []) expect(copyKeys.filter(k => k === key), key).toHaveLength(1);
      for (const { id } of f.regions?.fields || []) expect(regionIds.filter(r => r === id), id).toHaveLength(1);
    }
  });
});
