// Plan 1.26: every admin colour lives in adminThemes.css, and both admin looks (Riso Press, Paper) read well by day
// and by night. A colour written anywhere else in the admin's stylesheets fails here, so a new colour becomes a token
// with a value for every look.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../features/site/colorSchemes";
import { ADMIN_LOOKS } from "./adminLook";

const SRC = join(__dirname, "../../..");
const THEMES = join(__dirname, "adminThemes.css");
const COLOUR = /(?<![\\\w-])(#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|(?:rgba?|hsla?)\()/g;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Each rule of adminThemes.css: its selector (whitespace squeezed) and its custom properties. */
function themeRules(): { selector: string; tokens: Record<string, string> }[] {
  const css = stripComments(readFileSync(THEMES, "utf8"));
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].replace(/\s+/g, " ").trim(),
    tokens: Object.fromEntries([...m[2].matchAll(/(--rp-[\w-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()])),
  }));
}

/** The tokens an admin page sees under one look and appearance, applying the rules the way the cascade does. */
function resolved(look: "riso" | "paper", appearance: "day" | "night"): Record<string, string> {
  const rules = themeRules();
  const pick = (selector: string) => {
    const rule = rules.find((r) => r.selector === selector);
    expect(rule, `adminThemes.css has a rule for ${selector}`).toBeTruthy();
    return rule!.tokens;
  };
  const night = appearance === "night";
  const paper = look === "paper";
  return {
    ...pick(".rp, .admin-reso"),
    ...pick(".rp:not(.studio-editor)"),
    ...(night ? pick('.rp[data-rp-appearance="dark"], .admin-reso[data-admin-theme="dark"]') : {}),
    ...(night ? pick('.rp:not(.studio-editor)[data-rp-appearance="dark"]') : {}),
    ...(paper && !night ? pick(':root[data-admin-look="paper"] .rp:not([data-rp-appearance="dark"]), :root[data-admin-look="paper"] .admin-reso:not([data-admin-theme="dark"])') : {}),
    ...(paper && !night ? pick(':root[data-admin-look="paper"] .rp:not(.studio-editor):not([data-rp-appearance="dark"])') : {}),
    ...(paper && night ? pick(':root[data-admin-look="paper"] .rp[data-rp-appearance="dark"], :root[data-admin-look="paper"] .admin-reso[data-admin-theme="dark"]') : {}),
    ...(paper && night ? pick(':root[data-admin-look="paper"] .rp:not(.studio-editor)[data-rp-appearance="dark"]') : {}),
  };
}

// Words and the backgrounds they sit on. 4.5:1 is the body-text level; every pair here is small text somewhere.
const PAIRS: [string, string[]][] = [
  ["--rp-text", ["--rp-canvas", "--rp-surface", "--rp-surface-2", "--rp-input-bg"]],
  ["--rp-text-muted", ["--rp-canvas", "--rp-surface", "--rp-surface-2"]],
  ["--rp-text-subtle", ["--rp-canvas", "--rp-surface", "--rp-surface-2"]],
  ["--rp-primary-text", ["--rp-canvas", "--rp-surface"]],
  ["--rp-on-primary", ["--rp-primary"]],
  ["--rp-on-danger", ["--rp-danger"]],
  ["--rp-on-info", ["--rp-info"]],
  ["--rp-danger", ["--rp-surface", "--rp-canvas"]],
  ["--rp-success", ["--rp-surface", "--rp-canvas"]],
  ["--rp-warning", ["--rp-surface", "--rp-canvas"]],
  ["--rp-info", ["--rp-surface", "--rp-canvas"]],
  ["--rp-on-inverse", ["--rp-inverse", "--rp-inverse-2"]],
  ["--rp-rail-text", ["--rp-rail"]],
];

describe("admin themes (plan 1.26)", () => {
  it("names every admin colour in adminThemes.css and nowhere else", () => {
    const files = [...cssFiles(join(SRC, "app/admin")), join(SRC, "styles/adminCompat.css")].filter((f) => f !== THEMES);
    const found: string[] = [];
    for (const file of files) {
      stripComments(readFileSync(file, "utf8")).split("\n").forEach((line, i) => {
        // Selectors may name a class like .bg-\[\#050506\] or [class~="bg-[#1E1E1F]"]; only declarations count.
        const bare = line.replace(/"[^"]*"/g, '""');
        const decl = bare.includes(":") && !bare.trim().endsWith("{") && !bare.trim().endsWith(",") ? bare : "";
        if (COLOUR.test(decl)) found.push(`${relative(SRC, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        COLOUR.lastIndex = 0;
      });
    }
    expect(found).toEqual([]);
  });

  it("offers Riso Press and Paper", () => {
    expect(ADMIN_LOOKS.map((l) => l.id)).toEqual(["riso", "paper"]);
  });

  describe.each(["riso", "paper"] as const)("%s", (look) => {
    it.each(["day", "night"] as const)("keeps words readable by %s", (appearance) => {
      const t = resolved(look, appearance);
      const problems: string[] = [];
      for (const [fg, bgs] of PAIRS) {
        for (const bg of bgs) {
          const ratio = contrastRatio(t[fg], t[bg]);
          if (ratio === null) problems.push(`${fg} or ${bg} is missing`);
          else if (ratio < 4.5) problems.push(`${fg} ${t[fg]} on ${bg} ${t[bg]}: ${ratio.toFixed(2)}:1`);
        }
      }
      expect(problems).toEqual([]);
    });
  });
});
