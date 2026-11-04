// Designer coverage for the storefront templates (4 November 2026). Rule: every template a press can pick must be fully
// editable in Studio. Each part of this file fails a template (one of ours, or one added later) that would show
// shoppers something the press cannot change:
//   1. it is listed everywhere the press meets it: Print style, a theme-library look, a home layout;
//   2. its home layout only uses sections and settings Studio can edit;
//   3. its stylesheet writes no colour, font or words of its own, and every shape a Studio control owns (button
//      corners, case and shadow, photo corners and frames, title and heading case, panels, cards, form fields, ruled
//      lines, the footer curve) reads that control's knob instead of a fixed value;
//   4. every knob is a Studio control, reaches every template, and changes the page when the press sets it, while an
//      untouched shop shows the template exactly as designed.
// To add a template: add it to TEMPLATE_STYLES and TEMPLATE_CSS (templateStyles.ts), a look in THEME_LIBRARY and a home
// layout, write its stylesheet with `var(--tpl-…, <its own look>)`, and run this file.
import { describe, expect, it } from "vitest";
import { TEMPLATE_CSS, TEMPLATE_KNOBS, TEMPLATE_STYLE_IDS, TEMPLATE_STYLES, templateKnobCss, themeStyleCss } from "./templateStyles";
import { buildStorefrontTokenVars } from "./themeTokens";
import { STYLE_GROUPS } from "../../admin/studio/styleSchema";
import { THEME_LIBRARY } from "../../admin/studio/themeLibrary";
import { themeLookKeys } from "../../admin/studio/themeLook";
import { HOME_LAYOUT_TEMPLATES } from "../../admin/studio/homeLayouts";
import { SECTION_REGISTRY, getSectionFields } from "../../admin/ThemeEditorExtensions";
import { sectionStyleFields } from "../../admin/studio/sectionStyleSchema";

const controls = new Set(STYLE_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
const printStyle: any = STYLE_GROUPS.flatMap((g) => g.fields).find((f) => f.key === "themeStyle");
const looksFor = (id: string) => THEME_LIBRARY.filter((t: any) => t.global?.themeStyle === id);

/** `{ selector, prop, value }` for every declaration (rules inside @media included). */
function declarations(css: string) {
  const out: { selector: string; prop: string; value: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    for (const decl of m[2].split(/;(?![^(]*\))/)) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      out.push({ selector, prop: decl.slice(0, i).trim(), value: decl.slice(i + 1).trim() });
    }
  }
  return out;
}
/** The selector list split into its parts (each part starts with the storefront scope). */
const parts = (selector: string) => selector.split(/,(?=\[data-fm-store\])/).map((s) => s.trim());

// Shapes Studio controls own. A declaration of `prop` on an element matched by `sel` must read one of the knobs.
const OWNED: { what: string; sel: RegExp; props: Record<string, string[]> }[] = [
  { what: "buttons", sel: /\.custom-btn|\.store-btn-primary/, props: { "border-radius": ["--tpl-btn-radius"], "text-transform": ["--tpl-btn-case"], "box-shadow": ["--tpl-btn-shadow"], border: ["--tpl-outline-w"] } },
  { what: "shop photos", sel: /\.fm-photo-frame$/, props: { "border-radius": ["--tpl-photo-radius"], border: ["--tpl-frame-w"] } },
  { what: "card titles", sel: /\.fm-card-title$/, props: { "text-transform": ["--tpl-title-case"] } },
  { what: "headings", sel: /(^|\s)h1$/, props: { "text-transform": ["--tpl-heading-case"] } },
  { what: "rounded parts", sel: /\[class\*="rounded-"\]|\.rounded-full:not/, props: { "border-radius": ["--tpl-corner", "--tpl-btn-radius"] } },
  { what: "panels", sel: /\.glass-card$/, props: { "border-radius": ["--tpl-corner"], border: ["--tpl-outline-w"], "box-shadow": ["--tpl-shadow-x"] } },
  { what: "cards", sel: /\.fm-card$/, props: { "border-radius": ["--tpl-corner"], "box-shadow": ["--tpl-shadow-x"], rotate: ["--tpl-tilt"] } },
  { what: "form fields", sel: /(input:not\(.*\)|select|textarea)$/, props: { "border-radius": ["--tpl-btn-radius"] } },
  { what: "ruled lines", sel: /(header\[data-section="navigation"\]|newsletterPanel"\]|footer\[data-fm-footer\]|"Product grid"\])$/, props: { "border-top": ["--tpl-rule-w"], "border-bottom": ["--tpl-rule-w"] } },
  { what: "footer", sel: /footer\[data-fm-footer\]$/, props: { "border-radius": ["--tpl-footer-curve"] } },
];

// A value for every knob key, so the test can set each control and see the page change.
const SAMPLE: Record<string, any> = {
  buttonRadius: 7, buttonUppercase: false, buttonShadow: true, templateHeadingCase: "uppercase", catalogTitleTransform: "capitalize",
  photoOutline: "circle", radiusScale: "soft", cardRadius: 9, templateOutlineColor: "#123456", templateOutlineWidth: 4,
  templateShadowColor: "#654321", templateShadowOffset: 7, templateRuleWidth: 5, templateFrameWidth: 3, templateCardTilt: 2,
  templateFooterCurve: 40, catalogPriceStyle: "boxed",
};

const tokenVars = new Set([
  ...[...buildStorefrontTokenVars({}).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
  // Written by the storefront's own token block (MainSite / StorefrontThemeStyle) beside buildStorefrontTokenVars.
  "--bg-color", "--heading-font", "--body-font",
]);
const knobVars = new Set(TEMPLATE_KNOBS.map((k) => k.cssVar));

describe.each(TEMPLATE_STYLE_IDS.map((id) => [id]))("template %s is fully editable in Studio", (id) => {
  const css = TEMPLATE_CSS[id];
  const full = themeStyleCss({ themeStyle: id });

  it("is listed in Print style, the theme library and the home layouts", () => {
    expect(css, "no stylesheet in TEMPLATE_CSS").toBeTruthy();
    expect(full).toContain(css);
    expect(printStyle.options.map((o: any) => o.value)).toContain(id);
    const looks = looksFor(id);
    expect(looks.length, "no theme-library look uses this template").toBeGreaterThan(0);
    for (const look of looks) {
      expect(HOME_LAYOUT_TEMPLATES.some((l) => l.id === look.homeLayoutTemplate), `${look.id} has no home layout`).toBe(true);
    }
  });

  it("its home layout uses only sections and settings Studio can edit", () => {
    const styleKeys = new Set(sectionStyleFields([]).map((f) => f.key));
    for (const look of looksFor(id)) {
      const layout = HOME_LAYOUT_TEMPLATES.find((l) => l.id === look.homeLayoutTemplate)!;
      for (const section of layout.sections) {
        const meta = SECTION_REGISTRY.find((m) => m.type === section.type);
        expect(meta, `${layout.id}: ${section.type} is not a Studio section`).toBeTruthy();
        const editable = new Set([...getSectionFields(section.type).map((f) => f.key), ...styleKeys]);
        const loose = Object.keys(section.settings || {}).filter((k) => !editable.has(k));
        expect(loose, `${layout.id} › ${section.type} sets settings with no Studio field`).toEqual([]);
      }
    }
  });

  it("writes no colour, font or words of its own", () => {
    expect(css, "a literal hex colour").not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css, "a literal rgb() colour").not.toMatch(/rgba?\(\s*\d/i);
    for (const d of declarations(css)) {
      if (d.prop === "font-family") expect(d.value, `${d.selector} sets its own font`).toMatch(/^var\(/);
      if (d.prop === "content") expect(d.value, `${d.selector} writes its own words`).not.toMatch(/["']/);
    }
  });

  it("reads a Studio knob for every shape a control owns", () => {
    const fixed: string[] = [];
    // Shoppers who ask for less motion get no tilt or movement whatever the press set: that block stays as it is.
    const settled = css.replace(/@media \(prefers-reduced-motion:reduce\)\{(?:[^{}]*\{[^{}]*\})*\}/g, "");
    for (const d of declarations(settled)) {
      for (const part of parts(d.selector)) {
        for (const g of OWNED) {
          const knobs = g.props[d.prop];
          if (!knobs || !g.sel.test(part)) continue;
          if (!knobs.some((k) => d.value.includes(`var(${k}`))) fixed.push(`${g.what}: ${part} { ${d.prop}: ${d.value} } should read ${knobs.join(" or ")}`);
        }
      }
    }
    expect(fixed).toEqual([]);
  });

  it("reads only knobs and theme tokens", () => {
    const local = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const unknown = [...css.matchAll(/var\((--[\w-]+)(\s*,)?/g)]
      .filter((m) => !m[2] && !tokenVars.has(m[1]) && !knobVars.has(m[1]) && !local.has(m[1]))
      .map((m) => m[1]);
    expect([...new Set(unknown)], "a variable with no fallback that nothing writes").toEqual([]);
    const strayKnobs = [...css.matchAll(/var\((--tpl-[\w-]+)/g)].map((m) => m[1]).filter((v) => !knobVars.has(v));
    expect([...new Set(strayKnobs)], "a --tpl- variable that is not in TEMPLATE_KNOBS").toEqual([]);
  });

  it("obeys every knob", () => {
    const deaf = TEMPLATE_KNOBS.filter((k) => !k.rule && !css.includes(`var(${k.cssVar}`)).map((k) => k.cssVar);
    expect(deaf, "this template ignores these Studio controls").toEqual([]);
  });

  it("shows exactly its own look until the press changes something", () => {
    expect(full).not.toMatch(/--tpl-[\w-]+\s*:/);
    expect(templateKnobCss({ themeStyle: id })).toBe("");
  });

  it.each(TEMPLATE_KNOBS.flatMap((k) => k.keys.map((key) => [key, k] as const)))("changes when the press sets %s", (key, knob) => {
    const out = themeStyleCss({ themeStyle: id, [key]: SAMPLE[key] });
    expect(out, `${knob.cssVar} is not written`).toMatch(new RegExp(`${knob.cssVar}:[^;}]+`));
    expect(out.length).toBeGreaterThan(full.length);
    if (knob.rule && (!knob.ruleFor || knob.ruleFor.includes(knob.value({ [key]: SAMPLE[key] })!))) expect(out).toContain(knob.rule);
  });
});

describe("template knobs", () => {
  it("are all Studio › Theme settings controls, each with a test value", () => {
    for (const k of TEMPLATE_KNOBS) for (const key of k.keys) {
      expect(controls.has(key), `${key} (${k.cssVar}) has no Studio control`).toBe(true);
      expect(SAMPLE[key], `give ${key} a test value in SAMPLE`).not.toBeUndefined();
    }
  });

  it("follow the press's values", () => {
    const css = templateKnobCss({ buttonRadius: 7, buttonUppercase: false, buttonShadow: true, templateOutlineWidth: 4, templateCardTilt: 9, templateOutlineColor: "red;}x{" });
    expect(css).toContain("--tpl-btn-radius:7px");
    expect(css).toContain("--tpl-btn-case:none");
    expect(css).toContain("--tpl-btn-shadow:1");
    expect(templateKnobCss({ buttonShadow: false })).toBe(""); // a template keeps its own hard shadow
    expect(templateKnobCss({ templateShadowOffset: 0 })).toContain("--tpl-shadow-x:0px"); // …until its distance is 0
    expect(css).toContain("--tpl-outline-w:4px");
    expect(css).toContain("--tpl-tilt:4deg"); // capped
    expect(css).not.toContain("--tpl-outline:"); // not a colour: ignored, never written into the stylesheet
  });

  it("put every heading in capitals only when asked, so As typed never undoes a section's own capitals", () => {
    expect(templateKnobCss({ templateHeadingCase: "uppercase" })).toContain("text-transform:var(--tpl-heading-case)");
    const typed = templateKnobCss({ templateHeadingCase: "none" });
    expect(typed).toContain("--tpl-heading-case:none");
    expect(typed).not.toContain("h1");
    // Stale Riso Press settings (every look's palette writes them) never reach a template.
    expect(templateKnobCss({ risoOutlineColor: "#ffffff", risoOutlineWidth: 2, risoShadowColor: "#e8402a", risoShadowOffset: 3, risoUppercaseHeadings: true })).toBe("");
  });

  it("give shop photos the Image outline first, then the corner set, then the card corners", () => {
    expect(templateKnobCss({ photoOutline: "arch", cardRadius: 4 })).toContain("--tpl-photo-radius:999px 999px 0 0");
    expect(templateKnobCss({ photoOutline: "hexagon", cardRadius: 4 })).toContain("--tpl-photo-radius:0px");
    expect(templateKnobCss({ radiusScale: "round", cardRadius: 4 })).toContain("--tpl-photo-radius:18px");
    expect(templateKnobCss({ cardRadius: 4 })).toContain("--tpl-photo-radius:4px");
  });

  it("come after the template, so a changed control wins", () => {
    const css = themeStyleCss({ themeStyle: "shelf", buttonRadius: 0 });
    expect(css.lastIndexOf("--tpl-btn-radius:0px")).toBeGreaterThan(css.indexOf("var(--tpl-btn-radius"));
  });
});

describe("the template list", () => {
  it("is the Print style list (besides Riso Press and Standard)", () => {
    const values = printStyle.options.map((o: any) => o.value).filter((v: string) => v !== "riso" && v !== "default");
    expect(values).toEqual(TEMPLATE_STYLES.map((t) => t.id));
    expect(Object.keys(TEMPLATE_CSS).sort()).toEqual([...TEMPLATE_STYLE_IDS].sort());
  });

  it("a template's photo shape goes away with it when the press switches looks", () => {
    const arch: any = THEME_LIBRARY.find((t: any) => t.id === "press-arch");
    const atlas: any = THEME_LIBRARY.find((t: any) => t.id === "press-atlas");
    const onArch = { ...themeLookKeys(arch, {}) };
    expect(onArch.photoOutline).toBe("tallArch");
    expect(themeLookKeys(atlas, onArch).photoOutline).toBe("default");
    // A shape the press picked themselves stays.
    expect(themeLookKeys(atlas, { ...onArch, photoOutline: "circle" }).photoOutline).toBeUndefined();
  });
});
