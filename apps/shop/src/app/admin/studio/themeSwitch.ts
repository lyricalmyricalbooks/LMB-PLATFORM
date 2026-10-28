// After a theme switch (Themes › Use this look): which of the press's own edits carried over and which the new look
// replaced, so nothing changes silently (plan 2.12). Shown in Studio › Themes with Bring back for each replaced edit.
//
// "Own edits" are style settings that differ both from the starting design and from the previous ready-made look as it
// comes out of the box (the starting design names Riso Noir without matching it exactly, so neither counts as theirs). Words, sections, menus and pages are never
// touched by a look, so they always carry over; the report counts the words so the press can see that.
import { isSurfaceKey, writeDesignValue } from "../../features/site/designModel";
import { readStyle, STYLE_GROUPS, type StyleField } from "./styleSchema";
import { THEME_LIBRARY } from "./themeLibrary";
import { themedDesign, themeLookKeys } from "./themeLook";
import { applyThemeKeysToSurfaces } from "../themeScope";

export type SwitchItem = {
  /** Style path, e.g. "headerBg" or "regions.footerLinksGap". */
  key: string;
  /** "Header › Background", in Studio's own words. */
  label: string;
  /** Page surface for a "this page only" setting, else undefined (all pages). */
  surface?: string;
  before: any;
  after: any;
};

export type ThemeSwitchReport = {
  themeId: string;
  themeName: string;
  kept: SwitchItem[];
  replaced: SwitchItem[];
  /** Labels the press rewrote in Text & labels (always kept). */
  wordsKept: number;
};

const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const blank = (v: any) => v === undefined || v === null || v === "";

let FIELDS: { field: StyleField; group: string }[] | null = null;
/** Every Style control once (a key that appears in two groups keeps its first). */
function styleFields() {
  if (FIELDS) return FIELDS;
  const seen = new Set<string>();
  FIELDS = [];
  for (const g of STYLE_GROUPS) for (const f of g.fields) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    FIELDS.push({ field: f, group: g.title });
  }
  return FIELDS;
}

const PAGE_NAMES: Record<string, string> = {
  heroPage: "Home", storefront: "Shop", productPage: "Book page", collectionPage: "Collection page", cartPage: "Bag",
  page: "Custom pages", page404: "Page not found", wishlistPage: "Wishlist", accountPage: "Account", trackingPage: "Order tracking",
};
const pageName = (surface: string) => PAGE_NAMES[surface] || (surface.startsWith("page:") ? `Page “${surface.slice(5)}”` : surface);

// ── The look a press started from, stored apart from their edits (plan 3.5) ────────────────────────────────
//
// Use this look stores `design.themeBase`: the theme's id and name, the exact keys it wrote (`look`) and a signature of
// the theme as it ships (`sig`). The press's own edits are then everything that differs from `look` (or from the starting
// design for a key the look doesn't set), so they can be listed, reset one by one, kept through a switch, and carried
// onto a newer version of the same theme when a release changes it. The storefront ignores `themeBase`.

export type ThemeBase = { id: string; name: string; look: Record<string, any>; sig: string };

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
/** A short fingerprint of a theme as it ships (independent of the design it is applied to). */
export const lookSignature = (theme: any) =>
  hash(JSON.stringify(Object.entries(themeLookKeys(theme, {})).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));

/** What Use this look stores beside the design: `look` is exactly what it wrote. */
export function themeBaseFor(theme: any, look: Record<string, any>): ThemeBase {
  const { themeLibraryPreset: _id, ...keys } = look;
  return { id: theme.id, name: theme.name, look: keys, sig: lookSignature(theme) };
}

/** The look the design's own edits are measured against: its stored base, else the ready-made look out of the box. */
export function startingLook(design: any, defaults: any): any {
  const base: ThemeBase | undefined = design?.themeBase;
  if (base && base.id === design?.themeLibraryPreset && base.look && typeof base.look === "object") return base.look;
  const prev: any = THEME_LIBRARY.find((t: any) => t.id === design?.themeLibraryPreset);
  return prev ? themedDesign(prev, defaults || {}) : null;
}

/** The value the look (or else the starting design) gives a setting. */
const lookValue = (key: string, look: any, defaults: any) => {
  const own = look ? readStyle(look, key) : undefined;
  return own !== undefined ? own : readStyle(defaults, key);
};

/** True when `value` is the press's own edit (blank never counts: it means "use the default"). */
function edited(value: any, field: StyleField, defaults: any, look: any) {
  if (blank(value)) return false;
  if (same(value, readStyle(defaults, field.key) ?? field.defaultValue)) return false;
  return !(look && same(value, readStyle(look, field.key)));
}

/**
 * The press's own style edits on top of the look they started from. `before` is their value; `after` is what the
 * look gives (what Use the theme's puts back). Page-only settings count too.
 */
export function ownEdits(design: any, defaults: any): SwitchItem[] {
  const look = startingLook(design, defaults);
  const out: SwitchItem[] = [];
  for (const { field, group } of styleFields()) {
    const label = `${group} › ${field.label}`;
    const was = readStyle(design, field.key);
    if (edited(was, field, defaults, look)) out.push({ key: field.key, label, before: was, after: lookValue(field.key, look, defaults) });
    if (field.key.includes(".")) continue;
    for (const surface of Object.keys(design || {})) {
      if (!isSurfaceKey(surface)) continue;
      const pageValue = design[surface]?.[field.key];
      if (blank(pageValue)) continue;
      out.push({ key: field.key, label: `${label} (${pageName(surface)} only)`, surface, before: pageValue, after: undefined });
    }
  }
  return out;
}

/** What carried over from `before` to `after` when `theme` was applied. */
export function themeSwitchReport(before: any, after: any, defaults: any, theme: { id: string; name: string }): ThemeSwitchReport {
  const kept: SwitchItem[] = [];
  const replaced: SwitchItem[] = [];
  for (const edit of ownEdits(before, defaults)) {
    const now = edit.surface ? after?.[edit.surface]?.[edit.key] : readStyle(after, edit.key);
    (same(now, edit.before) ? kept : replaced).push({ ...edit, after: now });
  }
  const copy = before?.copy && typeof before.copy === "object" ? before.copy : {};
  const wordsKept = Object.values(copy).filter((v) => typeof v === "string").length;
  return { themeId: theme.id, themeName: theme.name, kept, replaced, wordsKept };
}

/** `design` with the given replaced edits put back as they were before the switch. */
export function bringBack(design: any, items: SwitchItem[]): any {
  let next = design;
  for (const item of items) {
    next = writeDesignValue(next, item.key, item.before, item.surface ? { surface: item.surface } : "all");
  }
  return next;
}

/** `design` with the given own edits undone: the look's value again (a page-only setting goes back to all pages). */
export function resetToLook(design: any, items: SwitchItem[]): any {
  let next = design;
  for (const item of items) {
    next = item.surface ? writeDesignValue(next, item.key, undefined, { surface: item.surface }) : writeDesignValue(next, item.key, item.after, "all");
  }
  return next;
}

/** The ready-made theme the design started from, when a release has changed it since it was applied; else null. */
export function updatedTheme(design: any): any {
  const base: ThemeBase | undefined = design?.themeBase;
  if (!base || base.id !== design?.themeLibraryPreset) return null;
  const theme: any = THEME_LIBRARY.find((t: any) => t.id === base.id);
  return theme && lookSignature(theme) !== base.sig ? theme : null;
}

/** Apply `theme` and store it as the design's base (Use this look). */
export function applyLook(design: any, theme: any, surfaceIds?: string[]): any {
  const look = themeLookKeys(theme, design);
  return { ...applyThemeKeysToSurfaces(design, look, surfaceIds), themeBase: themeBaseFor(theme, look) };
}

/** The newer version of the design's own theme, with every one of the press's edits laid back on top. */
export function updateLookKeepingEdits(design: any, defaults: any, theme: any, surfaceIds?: string[]): any {
  const edits = ownEdits(design, defaults);
  return bringBack(applyLook(design, theme, surfaceIds), edits);
}

/** "3 of your changes carried over; 2 were replaced by Broadsheet." */
export function switchSummary(r: ThemeSwitchReport): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  if (!r.kept.length && !r.replaced.length) return `You hadn't changed any style settings, so “${r.themeName}” replaced nothing of yours.`;
  const kept = `${n(r.kept.length, "of your style changes", "of your style changes")} carried over`;
  if (!r.replaced.length) return `${kept}; “${r.themeName}” replaced none of them.`;
  return `${kept}; ${n(r.replaced.length, "was", "were")} replaced by “${r.themeName}”.`;
}
