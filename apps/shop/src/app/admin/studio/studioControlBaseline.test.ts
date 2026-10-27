// Every Studio control is listed in scripts/studio-control-baseline/ (one file per control) with what it does to the preview, so the
// browser check (scripts/studio-control-audit.mjs, CI job "studio-controls") can fail when one stops working.
// A new control needs an entry: run `AUDIT_UPDATE=1 node scripts/studio-control-audit.mjs`, and if it shows
// nothing on the fixture page, replace its TODO with the reason (which state or setting it needs).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STYLE_GROUPS } from "./styleSchema";
import { sectionStyleFields } from "./sectionStyleSchema";

// @ts-expect-error plain .mjs helper shared with the audit script
import { readBaseline } from "../../../../scripts/studioControlBaseline.mjs";

const baseline: Record<string, string> = readBaseline();
const audit = readFileSync(new URL("../../../../scripts/studio-control-audit.mjs", import.meta.url), "utf8");
const SECTION_TYPES = (audit.match(/AUDIT_SECTION_TYPES \|\| "([^"]+)"/) || [])[1]!.split(",");

const themeKeys = STYLE_GROUPS.flatMap(g => g.fields.map(f => f.key)).filter(k => !k.startsWith("regions."));
// Same device rule as the audit: phone fields on the phone preview, tablet ones on the tablet preview.
const deviceOf = (key: string) => /^mobile/.test(key) || key === "hideOnMobile" ? "mobile" : key === "hideOnTablet" ? "tablet" : "desktop";
const sectionKeys = SECTION_TYPES.flatMap(type => sectionStyleFields([]).filter(f => f.kind !== "date" && f.key !== "customClass")
  .map(f => `section:${type}:${f.key}@${deviceOf(f.key)}`));

describe("Studio control baseline", () => {
  it("lists every Theme settings control", () => {
    expect(themeKeys.filter(k => !(k in baseline))).toEqual([]);
  });

  it("lists every section Style / Layout / Visibility field", () => {
    expect(sectionKeys.filter(k => !(k in baseline))).toEqual([]);
  });

  it("has no entries for controls that no longer exist", () => {
    const known = new Set([...themeKeys, ...sectionKeys]);
    expect(Object.keys(baseline).filter(k => !known.has(k))).toEqual([]);
  });

  it("says why each control that shows nothing can't show on the fixture page", () => {
    const bad = Object.entries(baseline).filter(([, v]) => !/^(visible|css-only|dom-only)$/.test(v)
      && !(/^none: .{12,}/.test(v) && !/TODO/.test(v)));
    expect(bad).toEqual([]);
  });
});
