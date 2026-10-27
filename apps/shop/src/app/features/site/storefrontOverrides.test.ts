import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { storefrontOverridesCss, storefrontOverridesFontNames } from "./StorefrontOverrides";
import { STYLE_GROUPS } from "../../admin/studio/styleSchema";

// A Studio › Style control must change what the shopper (and the Studio preview iframe) sees on EVERY
// storefront surface. These tests fail when a surface forgets the shared override layer, or when a
// control exists that nothing on the storefront reads.

function publicSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "admin") publicSources(full, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}
const ROOT = join(__dirname, "..", "..");
const sources = publicSources(ROOT).map((file) => ({ file, text: readFileSync(file, "utf8") }));

describe("shared storefront override layer", () => {
  it("emits every card-title, card-price and small-print rule from one function", () => {
    const css = storefrontOverridesCss({
      productTitleColor: "#ffffff", cardTitleSize: 32, cardTitleWeight: "900", cardTitleFont: "Anton", cardTitleTracking: 0.1,
      cardPriceSize: 24, smallPrintMinSize: 14, smallPrintCase: "uppercase",
    });
    expect(css).toContain(".fm-card-title{color:#ffffff !important;font-weight:900 !important;font-family:'Anton', sans-serif !important;letter-spacing:0.1em !important;}");
    expect(css).toContain(".fm-card-title{font-size:32px !important;}");
    expect(css).toContain(".fm-card-price{font-size:24px !important;}");
    expect(css).toContain('[class~="text-[11px]"]{font-size:14px !important;}');
    expect(css).toContain("text-transform:uppercase !important;");
  });

  it("emits readable phone defaults without loading fonts", () => {
    const css = storefrontOverridesCss({});
    expect(css).toContain(".fm-card-title{font-size:16px !important;}");
    expect(css).toContain(".fm-card-price{font-size:16px !important;}");
    expect(storefrontOverridesFontNames({})).toEqual([]);
  });

  it("asks for the Google fonts the controls choose", () => {
    expect(storefrontOverridesFontNames({ cardTitleFont: "Anton", smallPrintFont: "DM Mono" }).sort()).toEqual(["Anton", "DM Mono"]);
  });

  it("is rendered by every storefront file that injects its own token layer", () => {
    // Any surface that writes STOREFRONT_TOKEN_CSS itself (instead of rendering <StorefrontThemeStyle>)
    // would otherwise silently ignore the card-title / price / small-print controls.
    const own = sources.filter(({ file, text }) => !/themeTokens\.ts$/.test(file) && text.includes("STOREFRONT_TOKEN_CSS"));
    expect(own.length).toBeGreaterThan(0);
    const missing = own
      .filter(({ text }) => !/<StorefrontOverrides\b/.test(text) && !/storefrontOverridesCss\(/.test(text))
      .map(({ file }) => file.slice(ROOT.length + 1));
    expect(missing).toEqual([]);
  });
});

describe("Studio Style controls are not dead", () => {
  // Controls whose effect lives outside the public storefront sources (admin-only chrome or read from
  // a differently named key). Keep this list tiny — wire the control rather than adding to it.
  const READ_ELSEWHERE = new Set<string>([]);

  it("has a storefront reader for every Style control key", () => {
    const corpus = sources.map((s) => s.text).join("\n");
    const dead: string[] = [];
    for (const group of STYLE_GROUPS) {
      for (const field of group.fields) {
        const top = field.key.split(".")[0];
        if (READ_ELSEWHERE.has(top)) continue;
        if (!new RegExp(`\\b${top}\\b`).test(corpus)) dead.push(`${group.id}.${field.key}`);
      }
    }
    expect(dead).toEqual([]);
  });
});
