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
