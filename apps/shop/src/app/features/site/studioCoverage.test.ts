import { describe, it, expect } from "vitest";
import { RISO_NOIR_TOKENS } from "./risoNoir";
import { STYLE_GROUPS } from "../../admin/studio/styleSchema";

// Every design key the default look sets must be adjustable in the Studio editor's Style tab,
// otherwise a merchant can see the effect but has no control to change it.
const EDITED_ELSEWHERE = new Set([
  // Studio › Menus / Sections / Text & labels, or fixed by the preset itself
  "themeStyle", "letterSpacing", "wordmarkStyle",
]);

describe("Studio covers the default look", () => {
  it("has a Style control for every Riso Noir token", () => {
    const controlled = new Set(STYLE_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
    const missing = Object.keys(RISO_NOIR_TOKENS).filter((k) => !controlled.has(k) && !EDITED_ELSEWHERE.has(k));
    expect(missing).toEqual([]);
  });
});

// ── Scan: every design key the public storefront reads must be editable in Studio ─────────────
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Structured data edited through dedicated Studio tabs (Sections / Menus / Text), internal
// bookkeeping, or non-design objects that happen to share a variable name.
const NOT_STYLE_CONTROLS = new Set([
  "copy", "menus", "sections", "globalSections", "homepageSections", "altSections", "social", "categories", "navOrder",
  "secondaryNavKeys", // Studio Navigation > Header order manages page row placement.
  "colorSchemes", "hero", "headerLinks", "sectionPresets", "heroPage", "storefront", "productPage",
  "collectionPage", "cartPage", "page", "page404", "typeScale", "mobileOverrides", "themeLibraryPreset",
  "fontSize", "data", "id", "trim", "logoUrl", "footerBadges", "sharedBlocks",
  // Section groups (Page layout › shared sections) and Announcement messages (their own Studio editor).
  "headerSections", "overlaySections", "announcements",
  // Alternate book/collection templates (Page layout › template card: create / rename / delete).
  "alternateTemplates",
  // Product page buy box order (Page layout › Buy box blocks).
  "productInfoBlocks",
]);

function publicSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "admin") publicSources(full, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe("Studio covers every design key the storefront reads", () => {
  it("has no storefront design key without a Style control", () => {
    const controlled = new Set(STYLE_GROUPS.flatMap((g) => g.fields.map((f) => f.key.split(".")[0])));
    const re = /\b(?:design|Design|tokenSource|activeDesign|storefrontDesign|heroDesign|rawDesign|logoDesign)\??\.([a-z][A-Za-z0-9]+)/g;
    const missing = new Set<string>();
    for (const file of publicSources(join(__dirname, "..", ".."))) {
      for (const m of readFileSync(file, "utf8").matchAll(re)) {
        if (!controlled.has(m[1]) && !NOT_STYLE_CONTROLS.has(m[1]) && !m[1].startsWith("page")) missing.add(m[1]);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
