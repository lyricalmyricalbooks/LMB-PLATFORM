// The theme check (plan 1.24): a theme may only set what a press can change afterwards in Studio. Every setting a
// theme definition carries must have a Studio control, or a press would see its effect with no way to adjust it.
//
// A theme here is a theme-library entry (themeLibrary.ts) and anything shaped like one, so each new theme file
// (theme wave 1: Riso, Broadsheet, Imprint) passes the same check by being listed in THEME_LIBRARY. It checks:
//   - top-level keys: theme metadata, or a key Apply copies (THEME_APPLIED_KEYS) that has a Theme settings control;
//   - `global`: every key has a Theme settings control. Inside `copy`, every word is a Text & labels key; inside
//     `elementSchemes`, every part has its "Parts of the shop that follow a scheme" control;
//   - `palettePreset`: a palette Studio lists;
//   - section lists (presetContent.ts): every section is one Studio can add, and every setting is one of its own
//     fields, its block list, or a field on its Style, Layout or Visibility tabs;
//   - starter pages: ids Studio › Pages offers.
import { COPY_SCHEMA } from "../../features/site/storeCopy";
import { getBlocksKey, getSectionFields, getSectionMeta } from "../ThemeEditorExtensions";
import { PAGE_STARTERS } from "./pageStarters";
import { PRESET_SECTION_TEMPLATES, presetSections } from "./presetContent";
import { sectionStyleFields } from "./sectionStyleSchema";
import { STYLE_GROUPS } from "./styleSchema";
import { PALETTES, THEME_APPLIED_KEYS } from "./themeLibrary";

/** Keys that describe the theme rather than set the shop. */
export const THEME_META_KEYS = ["id", "name", "mood", "global", "homeLayoutTemplate", "palettePreset", "content"];
/** Older keys some themes still carry; the shop never reads them and Apply doesn't copy them. */
export const THEME_LEGACY_KEYS = ["fontSize", "cornerStyle", "animationLevel"];

let cache: { style: Set<string>; copy: Set<string>; sectionStyle: Set<string> } | null = null;
function controls() {
  if (!cache) {
    cache = {
      style: new Set(STYLE_GROUPS.flatMap(g => g.fields.map(f => f.key))),
      copy: new Set(COPY_SCHEMA.flatMap(g => g.fields.map(f => f.key))),
      sectionStyle: new Set(sectionStyleFields().map(f => f.key)),
    };
  }
  return cache;
}

/** Everything in the theme that Studio can't edit, in plain words. An empty list means the theme passes. */
export function themeProblems(theme: any): string[] {
  const problems: string[] = [];
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) return ["the theme is not an object"];
  const { style, copy, sectionStyle } = controls();
  const name = theme.name || theme.id || "the theme";

  for (const key of Object.keys(theme)) {
    if (THEME_META_KEYS.includes(key) || THEME_LEGACY_KEYS.includes(key)) continue;
    if (!THEME_APPLIED_KEYS.includes(key)) problems.push(`${name}: "${key}" isn't something Apply copies (add it to THEME_APPLIED_KEYS with a Theme settings control, or move it into global)`);
    else if (!style.has(key)) problems.push(`${name}: "${key}" has no Theme settings control`);
  }

  for (const [key, value] of Object.entries(theme.global || {})) {
    if (key === "copy") {
      for (const word of Object.keys((value as any) || {})) if (!copy.has(word)) problems.push(`${name}: the words "${word}" aren't in Text & labels`);
    } else if (key === "elementSchemes") {
      for (const part of Object.keys((value as any) || {})) if (!style.has(`elementSchemes.${part}`)) problems.push(`${name}: "${part}" can't follow a colour scheme in Theme settings`);
    } else if (!style.has(key)) {
      problems.push(`${name}: "${key}" has no Theme settings control`);
    }
  }

  if (theme.palettePreset !== undefined && !PALETTES.some((p: any) => p.id === theme.palettePreset)) {
    problems.push(`${name}: the palette "${theme.palettePreset}" isn't one Studio lists`);
  }
  if (theme.homeLayoutTemplate !== undefined && !presetSections({ homeLayoutTemplate: theme.homeLayoutTemplate }).heroPage) {
    problems.push(`${name}: the home layout "${theme.homeLayoutTemplate}" doesn't exist`);
  }

  for (const id of Object.keys(theme.content?.sections || {})) {
    if (!(id in PRESET_SECTION_TEMPLATES)) problems.push(`${name}: sections for "${id}", which isn't a Studio page`);
  }
  for (const [id, specs] of Object.entries(presetSections(theme))) {
    specs.forEach((spec, index) => {
      const where = `${name}: ${PRESET_SECTION_TEMPLATES[id]} section ${index + 1} (${spec.type})`;
      if (!getSectionMeta(spec.type)) {
        problems.push(`${where} isn't a section Studio can add`);
        return;
      }
      const own = new Set([...getSectionFields(spec.type).map(f => f.key), getBlocksKey(spec.type)]);
      for (const key of Object.keys(spec.settings || {})) {
        if (!own.has(key) && !sectionStyle.has(key)) problems.push(`${where}: "${key}" has no control in the section's settings`);
      }
    });
  }

  for (const id of theme.content?.starterPages || []) {
    if (id === "blank" || !PAGE_STARTERS.some(s => s.id === id)) problems.push(`${name}: "${id}" isn't a Studio › Pages starter`);
  }
  return problems;
}

// ── Imported theme files (My themes › Import) ───────────────────────────────────────────────────────────────────
// A theme file is a whole design (savedThemes.ts), not a library entry, so it is checked against what a design may
// hold: Theme settings keys, Text & labels words, pages with their section lists, and the structured data Studio's
// other workspaces edit (sections, menus, categories, colour schemes…). Anything else would show in the shop with no
// way to change it, so Import warns about it in plain words before adding the theme.

/** Design keys edited by Studio's other workspaces, or bookkeeping Studio writes itself. */
const DESIGN_STRUCTURE_KEYS = new Set([
  "copy", "menus", "sections", "globalSections", "homepageSections", "altSections", "social", "categories", "navOrder",
  "secondaryNavKeys", "colorSchemes", "hero", "headerLinks", "sectionPresets", "typeScale", "mobileOverrides",
  "themeLibraryPreset", "palettePreset", "footerBadges", "sharedBlocks", "headerSections", "overlaySections",
  "announcements", "alternateTemplates", "productInfoBlocks", "regions", "elementSchemes", "showHero", "themeStyle",
  "letterSpacing", "wordmarkStyle", "fontSize", "cornerStyle", "animationLevel",
  // The look a press started from, kept apart from their own edits (themeSwitch.ts, plan 3.5).
  "themeBase",
]);

const quoted = (items: string[]) => {
  const shown = items.slice(0, 6).map(i => `“${i}”`).join(", ");
  return items.length > 6 ? `${shown} and ${items.length - 6} more` : shown;
};

/**
 * Plain-words problems with an imported design: settings, words and sections Studio couldn't change afterwards.
 * `known` adds keys the shop's own starting design holds (they are Studio's own, even without a Theme settings row).
 */
export function importedThemeProblems(design: any, known: Iterable<string> = []): string[] {
  if (!design || typeof design !== "object" || Array.isArray(design)) return ["The file has no design in it."];
  const { style, copy } = controls();
  const styleTop = new Set([...style].map(k => k.split(".")[0]));
  const allowed = new Set(known);
  const settings: string[] = [];
  const words: string[] = [];
  const sections = new Set<string>();
  const checkSections = (list: any[]) => {
    for (const s of list) if (s && typeof s === "object" && typeof s.type === "string" && !getSectionMeta(s.type)) sections.add(s.type);
  };

  for (const [key, value] of Object.entries(design)) {
    if (key === "copy") {
      for (const word of Object.keys((value as any) || {})) if (!copy.has(word)) words.push(word);
    } else if (Array.isArray(value) && value.some(v => v && typeof v === "object" && /Section$/.test(String((v as any).type)))) {
      checkSections(value); // a section group (header, footer, pop-up…)
    } else if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as any).sections)) {
      checkSections((value as any).sections); // a page: Home, a book page, page:about…
    } else if (!styleTop.has(key) && !DESIGN_STRUCTURE_KEYS.has(key) && !allowed.has(key) && !key.startsWith("page")) {
      settings.push(key);
    }
  }
  if (design.palettePreset !== undefined && !PALETTES.some((p: any) => p.id === design.palettePreset)) settings.push(`palette ${design.palettePreset}`);

  const problems: string[] = [];
  if (settings.length) problems.push(settings.length === 1
    ? `1 setting has no control in Studio, so you couldn't change it afterwards: ${quoted(settings)}.`
    : `${settings.length} settings have no control in Studio, so you couldn't change them afterwards: ${quoted(settings)}.`);
  if (words.length) problems.push(words.length === 1
    ? `1 piece of text isn't in Text & labels, so it would never show: ${quoted(words)}.`
    : `${words.length} pieces of text aren't in Text & labels, so they would never show: ${quoted(words)}.`);
  if (sections.size) problems.push(sections.size === 1
    ? `1 kind of section isn't one Studio has, so it wouldn't show or be editable: ${quoted([...sections])}.`
    : `${sections.size} kinds of section aren't ones Studio has, so they wouldn't show or be editable: ${quoted([...sections])}.`);
  return problems;
}
