import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Rule: every aspect of the public website must be editable in the designer (Studio).
// Companion guards: studioCoverage.test.ts (design keys the storefront reads),
// storeCopy.coverage.test.ts (shopper-facing words), studioTargets.test.ts (click-to-edit),
// admin/studio/themeLibrary.test.ts (theme presets).


const APP = join(__dirname, "..", "..");
// Files whose job is to *define* default token values (every one is a Studio › Style control).
const TOKEN_SOURCES = new Set(["features/site/risoNoir.ts", "features/site/colorSchemes.ts"]);
// Neutral shadow-depth scales (not palette colours) and the admin-only rich-text editor chrome.
const SHADOW_SOURCES = new Set(["components/sectionStyleHelpers.ts", "features/site/themeTokens.ts", "components/RichTextEditor.tsx"]);

function publicSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "admin" && name !== "ui") publicSources(full, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe("the public website is fully editable in Studio", () => {
  it("has no hard-coded colours: each is a design key or theme variable, with the hex only as a fallback", () => {
    const offenders: string[] = [];
    for (const file of publicSources(APP)) {
      const rel = relative(APP, file).split("\\").join("/");
      if (TOKEN_SOURCES.has(rel)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
          const before = line.slice(0, m.index);
          // Allowed: `design.x || "#hex"`, `settings.x ?? "#hex"`, `var(--token, #hex)`.
          if (/(\|\||\?\?)\s*[`"']?$/.test(before) || /var\(--[\w-]+,\s*$/.test(before)) continue;
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
    expect(offenders, "use a design key (`design.x || \"#hex\"`) or `var(--token, #hex)` and add a Studio control").toEqual([]);
  });

  it("has no hard-coded rgb()/rgba()/hsl() colours either (fallbacks after || ?? var(--x, …) are fine)", () => {
    const offenders: string[] = [];
    for (const file of publicSources(APP)) {
      const rel = relative(APP, file).split("\\").join("/");
      if (TOKEN_SOURCES.has(rel) || SHADOW_SOURCES.has(rel)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        // `(?<![A-Za-z])`, not `\b`: in Tailwind arbitrary shadow values the colour follows an underscore (0_0_60px_rgba…).
        for (const m of line.matchAll(/(?<![A-Za-z])(?:rgba?|hsla?)\(\s*[0-9]/g)) {
          const before = line.slice(0, m.index);
          if (/(\|\||\?\?)\s*(\(?[^()]*\?\s*)?[`"']?$/.test(before) || /var\(--[\w-]+,\s*$/.test(before)) continue;
          // Pure black shadows/scrims are depth cues, not palette colours.
          if (/[Ss]hadow/.test(line) && /(?:rgba?)\(\s*0[ ,_]+0[ ,_]+0/.test(line.slice(m.index))) continue;
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
    expect(offenders, "use a design key (`design.x || \"rgba(...)\"`) or `var(--token, rgba(...))` and add a Studio control").toEqual([]);
  });

  it("has no fixed Tailwind colour classes: each one the storefront uses is re-pointed at a Studio token", async () => {
    const { scanStorefrontColorClasses } = await import("./storefrontColorScan");
    const { STOREFRONT_COLOR_CLASSES } = await import("./storefrontColorClasses");
    const { colorUtilityCss } = await import("./themeTokens");
    const listed = new Set(STOREFRONT_COLOR_CLASSES);
    const unlisted = scanStorefrontColorClasses(APP).filter((c) => !listed.has(c));
    expect(unlisted, "add these to storefrontColorClasses.ts so themeTokens.ts maps them to Studio colours").toEqual([]);
    const unmapped = STOREFRONT_COLOR_CLASSES.filter((c) => !colorUtilityCss(c));
    expect(unmapped, "teach colorUtilityCss (themeTokens.ts) a token for these, or use a token class (fm-muted, fm-accent-text …)").toEqual([]);
  });

  it("gives every section default a Content field (lists are edited as blocks)", async () => {
    const { SECTION_REGISTRY, getSectionFields } = await import("../../admin/ThemeEditorExtensions");
    const missing: string[] = [];
    for (const meta of SECTION_REGISTRY as any[]) {
      const fields = new Set(getSectionFields(meta.type).map((f: any) => f.key));
      for (const key of Object.keys(meta.defaults || {})) {
        const isBlockList = Array.isArray(meta.defaults[key]) && !!meta.blockType;
        if (!fields.has(key) && !isBlockList) missing.push(`${meta.type}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
