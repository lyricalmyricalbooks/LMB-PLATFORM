// After a theme switch (Themes › Use this look): which of the press's own edits carried over and which the new look
// replaced, so nothing changes silently (plan 2.12). Shown in Studio › Themes with Bring back for each replaced edit.
//
// "Own edits" are style settings that differ both from the starting design and from the previous ready-made look as it
// comes out of the box (the starting design names Riso Noir without matching it exactly, so neither counts as theirs). Words, sections, menus and pages are never
// touched by a look, so they always carry over; the report counts the words so the press can see that.
import { isSurfaceKey, writeDesignValue } from "../../features/site/designModel";
import { readStyle, STYLE_GROUPS, type StyleField } from "./styleSchema";
import { THEME_LIBRARY } from "./themeLibrary";
import { themedDesign } from "./themeLook";

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

/** The previous ready-made look as it comes out of the box, or null. */
export function startingLook(before: any, defaults: any): any {
  const prev: any = THEME_LIBRARY.find((t: any) => t.id === before?.themeLibraryPreset);
  return prev ? themedDesign(prev, defaults || {}) : null;
}

/** True when `value` is the press's own edit (blank never counts: it means "use the default"). */
function edited(value: any, field: StyleField, defaults: any, look: any) {
  if (blank(value)) return false;
  if (same(value, readStyle(defaults, field.key) ?? field.defaultValue)) return false;
  return !(look && same(value, readStyle(look, field.key)));
}

/** What carried over from `before` to `after` when `theme` was applied. */
export function themeSwitchReport(before: any, after: any, defaults: any, theme: { id: string; name: string }): ThemeSwitchReport {
  const look = startingLook(before, defaults);
  const kept: SwitchItem[] = [];
  const replaced: SwitchItem[] = [];
  for (const { field, group } of styleFields()) {
    const label = `${group} › ${field.label}`;
    const was = readStyle(before, field.key);
    if (edited(was, field, defaults, look)) {
      const now = readStyle(after, field.key);
      (same(now, was) ? kept : replaced).push({ key: field.key, label, before: was, after: now });
    }
    // "This page only" settings: a look clears the page copies of every setting it sets.
    if (field.key.includes(".")) continue;
    for (const surface of Object.keys(before || {})) {
      if (!isSurfaceKey(surface)) continue;
      const pageValue = before[surface]?.[field.key];
      if (blank(pageValue)) continue;
      const nowPage = after?.[surface]?.[field.key];
      const item = { key: field.key, label: `${label} (${pageName(surface)} only)`, surface, before: pageValue, after: nowPage };
      (same(nowPage, pageValue) ? kept : replaced).push(item);
    }
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

/** "3 of your changes carried over; 2 were replaced by Broadsheet." */
export function switchSummary(r: ThemeSwitchReport): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  if (!r.kept.length && !r.replaced.length) return `You hadn't changed any style settings, so “${r.themeName}” replaced nothing of yours.`;
  const kept = `${n(r.kept.length, "of your style changes", "of your style changes")} carried over`;
  if (!r.replaced.length) return `${kept}; “${r.themeName}” replaced none of them.`;
  return `${kept}; ${n(r.replaced.length, "was", "were")} replaced by “${r.themeName}”.`;
}
