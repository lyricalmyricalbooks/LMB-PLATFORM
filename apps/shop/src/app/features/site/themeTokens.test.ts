import { describe, it, expect } from "vitest";
import {
  hexToRgbTriplet,
  buildStorefrontTokenVars,
  RISO_STOREFRONT_CSS,
  risoGrainCss,
  STOREFRONT_TOKEN_CSS,
  colorUtilityCss,
} from "./themeTokens";

describe("hexToRgbTriplet", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgbTriplet("#A855F7")).toBe("168, 85, 247");
  });

  it("parses 3-digit shorthand hex", () => {
    expect(hexToRgbTriplet("#fff")).toBe("255, 255, 255");
  });

  it("parses rgb()/rgba()", () => {
    expect(hexToRgbTriplet("rgba(255, 255, 255, 0.05)")).toBe("255, 255, 255");
    expect(hexToRgbTriplet("rgb(10 20 30)")).toBe("10, 20, 30");
  });

  it("falls back on invalid input", () => {
    expect(hexToRgbTriplet(undefined)).toBe("255, 255, 255");
    expect(hexToRgbTriplet("not-a-color", "0, 0, 0")).toBe("0, 0, 0");
  });
});

describe("STOREFRONT_TOKEN_CSS", () => {
  it("themes roots that carry data-fm-store and the class on the same element", () => {
    expect(STOREFRONT_TOKEN_CSS).toContain("[data-fm-store].fm-page{background-color:var(--bg-color);}");
    expect(STOREFRONT_TOKEN_CSS).toContain("[data-fm-store].text-white{color:rgb(var(--fg-rgb));}");
  });
});

describe("RISO_STOREFRONT_CSS", () => {
  it("keeps the print treatment scoped to storefront surfaces", () => {
    expect(RISO_STOREFRONT_CSS).toContain("[data-fm-store]");
    // Flat ink on newsprint: 2px ink outlines, flare focus ring, reduced motion honoured, no halftone texture.
    expect(RISO_STOREFRONT_CSS).toContain("solid var(--rp-outline)");
    // Everything is a token: no literal ink/flare colours, so it works on black or paper.
    expect(RISO_STOREFRONT_CSS).not.toMatch(/#[0-9a-f]{6}/i);
    expect(RISO_STOREFRONT_CSS).toContain(":focus-visible");
    expect(RISO_STOREFRONT_CSS).toContain("prefers-reduced-motion");
    expect(RISO_STOREFRONT_CSS).not.toContain("radial-gradient");
    expect(RISO_STOREFRONT_CSS).not.toContain("body{");
  });
});

describe("buildStorefrontTokenVars", () => {
  it("emits defaults when design is empty (preserves current dark look)", () => {
    const css = buildStorefrontTokenVars({});
    expect(css).toContain("--fg-rgb: 255, 255, 255;");
    expect(css).toContain("--surface: #0a0a0a;");
    expect(css).toContain("--success: #34d399;");
    expect(css).toContain("--favorite: #fb7185;");
  });

  it("derives the foreground triplet from textColor", () => {
    const css = buildStorefrontTokenVars({ textColor: "#111111" });
    expect(css).toContain("--fg-rgb: 17, 17, 17;");
  });

  it("defaults active-control colors to text/background when unset", () => {
    const css = buildStorefrontTokenVars({ textColor: "#eeeeee", backgroundColor: "#101010" });
    expect(css).toContain("--active-bg: #eeeeee;");
    expect(css).toContain("--active-fg: #101010;");
  });

  it("border tint defaults to the foreground, follows borderColor when set", () => {
    expect(buildStorefrontTokenVars({ textColor: "#111111" })).toContain("--border-rgb: 17, 17, 17;");
    expect(buildStorefrontTokenVars({ surfaceColor: "#123456", surfaceRaisedColor: "#abcdef" })).toContain("--surface-rgb: 18, 52, 86;");
    expect(buildStorefrontTokenVars({ surfaceColor: "#123456", surfaceRaisedColor: "#abcdef" })).toContain("--surface-2-rgb: 171, 205, 239;");
    expect(buildStorefrontTokenVars({ borderColor: "#B1B1AA" })).toContain("--border-rgb: 177, 177, 170;");
  });

  it("honors explicit overrides", () => {
    const css = buildStorefrontTokenVars({ successColor: "#00ff00", surfaceColor: "#123456" });
    expect(css).toContain("--success: #00ff00;");
    expect(css).toContain("--surface: #123456;");
  });
});

describe("STOREFRONT_TOKEN_CSS", () => {
  it("remaps the Tailwind alpha utilities onto the token layer", () => {
    expect(STOREFRONT_TOKEN_CSS).toContain(".text-white\\/40{color:rgba(var(--fg-rgb), 0.4);}");
    expect(STOREFRONT_TOKEN_CSS).toContain(".bg-white\\/\\[0\\.03\\]{background-color:rgba(var(--surface-rgb), 0.03);}");
    expect(STOREFRONT_TOKEN_CSS).toContain(".bg-black\\/70{background-color:rgba(var(--overlay-rgb), 0.7);}");
    expect(STOREFRONT_TOKEN_CSS).toContain(".border-white\\/\\[0\\.08\\]{border-color:rgba(var(--border-rgb), 0.08);}");
  });

  it("scopes every rule under [data-fm-store]", () => {
    const rules = STOREFRONT_TOKEN_CSS.split("\n").filter((l) => l.trim().length > 0);
    expect(rules.every((r) => r.includes("[data-fm-store]"))).toBe(true);
  });

  it("maps the brand semantic hues (violet/emerald/cyan/amber/rose) onto tokens", () => {
    expect(colorUtilityCss("bg-violet-500")).toContain(".bg-violet-500{background-color:var(--accent);}");
    expect(colorUtilityCss("border-violet-500/30")).toContain(".border-violet-500\\/30{border-color:rgba(var(--accent-rgb), 0.3);}");
    expect(colorUtilityCss("text-emerald-400")).toContain(".text-emerald-400{color:var(--success);}");
    expect(colorUtilityCss("bg-emerald-500/10")).toContain(".bg-emerald-500\\/10{background-color:rgba(var(--success-rgb), 0.1);}");
    expect(colorUtilityCss("text-cyan-400")).toContain(".text-cyan-400{color:var(--accent-2);}");
    expect(colorUtilityCss("text-amber-400")).toContain(".text-amber-400{color:var(--warning);}");
    expect(colorUtilityCss("text-rose-400")).toContain(".text-rose-400{color:var(--danger);}");
    expect(colorUtilityCss("bg-purple-600")).toContain(".bg-purple-600{background-color:var(--accent);}");
  });

  it("maps greys, black and interaction variants onto tokens too", () => {
    expect(colorUtilityCss("text-neutral-900")).toBe("[data-fm-store] .text-neutral-900{color:rgb(var(--fg-rgb));}");
    expect(colorUtilityCss("text-neutral-400")).toContain("color:var(--muted);");
    expect(colorUtilityCss("bg-neutral-100")).toContain("background-color:var(--surface-2);");
    expect(colorUtilityCss("text-black")).toContain("color:var(--bg-color);");
    expect(colorUtilityCss("hover:bg-neutral-800")).toBe("[data-fm-store] .hover\\:bg-neutral-800:hover{background-color:var(--surface);}");
    expect(colorUtilityCss("group-hover:text-white")).toBe("[data-fm-store] .group:hover .group-hover\\:text-white{color:rgb(var(--fg-rgb));}");
    expect(colorUtilityCss("placeholder:text-slate-400")).toContain("::placeholder{color:var(--muted);}");
    expect(colorUtilityCss("md:from-black/80")).toBe("@media (width >= 48rem){[data-fm-store] .md\\:from-black\\/80{--tw-gradient-from:rgba(var(--overlay-rgb), 0.8);}}");
    expect(colorUtilityCss("dark:bg-white")).toBeNull();
  });

  it("stays small: only classes the storefront uses are emitted", () => {
    expect(STOREFRONT_TOKEN_CSS.length).toBeLessThan(40_000);
  });

  it("emits the new status tokens with defaults", () => {
    const css = buildStorefrontTokenVars({});
    expect(css).toContain("--accent-2: #22d3ee;");
    expect(css).toContain("--warning: #f59e0b;");
    expect(css).toContain("--danger: #f43f5e;");
    expect(css).toContain("--muted: #94a3b8;");
  });

  it("provides solid semantic helper classes", () => {
    expect(STOREFRONT_TOKEN_CSS).toContain(".fm-surface{background-color:var(--surface);}");
    expect(STOREFRONT_TOKEN_CSS).toContain(".fm-success-solid{");
    expect(STOREFRONT_TOKEN_CSS).toContain(".fm-favorite-active{");
  });
});

describe("Riso tokens", () => {
  it("defaults outline to the foreground and is fully overridable", () => {
    const d = buildStorefrontTokenVars({ textColor: "#ffffff" });
    expect(d).toContain("--rp-outline: #ffffff;");
    expect(d).toContain("--rp-outline-w: 2px;");
    expect(d).toContain("--rp-shadow-x: 3px;");
    expect(d).toContain("--rp-heading-transform: uppercase;");
    const o = buildStorefrontTokenVars({
      risoOutlineColor: "#e8402a", risoOutlineWidth: 4, risoShadowOffset: 0, risoShadowColor: "#fff",
      focusRingColor: "#0f0", risoUppercaseHeadings: false, buttonTextColor: "#111",
    });
    expect(o).toContain("--rp-outline: #e8402a;");
    expect(o).toContain("--rp-outline-w: 4px;");
    expect(o).toContain("--rp-shadow-x: 0px;");
    expect(o).toContain("--rp-shadow-color: #fff;");
    expect(o).toContain("--rp-focus: #0f0;");
    expect(o).toContain("--rp-heading-transform: none;");
    expect(o).toContain("--on-accent: #111;");
  });
  it("halftone grain is opt-in", () => {
    expect(risoGrainCss({})).toBe("");
    expect(risoGrainCss({ risoGrain: 0.5 })).toContain("radial-gradient");
  });
});
