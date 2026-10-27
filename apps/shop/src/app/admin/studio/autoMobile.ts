import { PADDING_KEYS, GAP_KEYS, spacingKey } from "./canvasTools";
import { REGION_GROUPS, regionValue } from "../../features/site/storefrontRegions";
// Desktop → phone/tablet auto-layout for the Studio. Pure and immutable: given what the owner built
// for desktop, it works out sensible phone (and, for Flexible composition, tablet) settings so they
// don't have to redo every section by hand. It only ever fills in values the owner hasn't set unless
// `overwrite` is on, and it reports what it changed in plain words for the confirmation toast.

import type { Section, StudioBlock } from "./studioModel";

export type AutoFitResult<T> = { value: T; changes: string[] };

const px = (n: number) => `${Math.round(n)}px`;
const isNum = (v: any): v is number => typeof v === "number" && Number.isFinite(v);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

/** Phone padding: about 55% of desktop, snapped to 4px, never below 24 and never above the desktop value. */
export function phonePadding(desktop: number): number {
  const scaled = Math.max(24, Math.round((desktop * 0.55) / 4) * 4);
  return Math.min(scaled, desktop);
}

/** Phone heading size: ~60% of a big desktop heading, never below 28px, never larger than desktop. */
export function phoneHeadingSize(desktop: number): number {
  return Math.min(desktop, Math.max(28, Math.round(desktop * 0.6)));
}

/** Phone-only patch for built-in public regions; explicit merchant overrides are kept. */
export function autoFitRegions(values: Record<string, any> = {}, overwrite = false): AutoFitResult<Record<string, any>> {
  const patch: Record<string, any> = {}, changes: string[] = [];
  for (const group of REGION_GROUPS) for (const region of group.regions) {
    const fill = (suffix: string, desktop: any, fit: (v: number) => number) => {
      const key = region.id + "Mobile" + suffix;
      if (!overwrite && /^Padding(Top|Right|Bottom|Left)$/.test(suffix)
        && values[region.id + "MobilePadding"] != null && values[region.id + "MobilePadding"] !== "") return;
      if (!isNum(desktop) || (!overwrite && values[key] != null)) return;
      const next = fit(desktop);
      if (next === values[key]) return;
      patch[key] = next;
      changes.push(`${region.label}: phone ${suffix.toLowerCase()} ${next}`);
    };
    for (const suffix of ["Padding", "PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft", "MarginTop", "MarginRight", "MarginBottom", "MarginLeft", "Gap"]) {
      fill(suffix, regionValue(values, region.id, suffix, "tablet"), phonePadding);
    }
    fill("Size", regionValue(values, region.id, "Size", "tablet"), v => v > 28 ? phoneHeadingSize(v) : v);
    if (region.grid) fill("Columns", regionValue(values, region.id, "Columns", "tablet"), v => Math.min(2, v));
  }
  return { value: patch, changes };
}

/** Sections whose items are small cards/photos that read fine two-up on a phone. */
const TWO_UP = /(Product|Book|Gallery|Logo|Collection|Staff|Ephemera|Cover|Showcase|Stats)/;

export function phoneColumns(type: string, desktopColumns: number): number | undefined {
  if (!isNum(desktopColumns) || desktopColumns < 3) return undefined;
  if (desktopColumns >= 4) return 2;
  return TWO_UP.test(type) ? 2 : 1;
}

type Grid = { column?: number; span?: number; row?: number; rowSpan?: number; z?: number };

/** Blocks that take part in the grid flow, in the order a person would read them (top→bottom, left→right). */
function readingOrder(blocks: StudioBlock[], device: "tablet" | "mobile"): StudioBlock[] {
  let lastRow = 0, lastColumn = 0;
  const keyed = blocks
    .filter(b => !b.hidden && !b.responsive?.[device]?.hidden)
    .map((block, index) => {
      const d: Grid = block.grid?.desktop || {};
      const row = isNum(d.row) ? d.row : lastRow;
      // A block with no desktop placement flows right after the one before it.
      const column = isNum(d.column) ? d.column : lastColumn + 0.5;
      lastRow = row; lastColumn = column;
      return { block, row, column, index };
    });
  keyed.sort((a, b) => a.row - b.row || a.column - b.column || a.index - b.index);
  return keyed.map(k => k.block);
}

/**
 * Grid placement for `device`, keyed by block id. Phone: every block full width, one per row.
 * Tablet: two-up (half width) for narrow blocks, full width for blocks that were wide on desktop.
 */
export function flowGrids(blocks: StudioBlock[], columns: number, device: "tablet" | "mobile"): Record<string, Grid> {
  const cols = Math.max(1, Math.min(24, Math.round(columns) || 12));
  const half = Math.max(1, Math.floor(cols / 2));
  const out: Record<string, Grid> = {};
  let row = 1, cursor = 1;
  for (const block of readingOrder(blocks, device)) {
    const desktopSpan = isNum(block.grid?.desktop?.span) ? block.grid!.desktop!.span! : 4;
    const span = device === "mobile" || cols < 2 || desktopSpan > half ? cols : half;
    if (cursor !== 1 && cursor + span - 1 > cols) { row += 1; cursor = 1; }
    out[block.id] = { column: cursor, span, row, rowSpan: 1 };
    cursor += span;
    if (cursor > cols) { row += 1; cursor = 1; }
  }
  return out;
}

/** Fills tablet + phone grid placement for the top-level blocks of a Flexible composition. */
export function autoFitBlocks(blocks: StudioBlock[], columns: number, overwrite = false): AutoFitResult<StudioBlock[]> {
  const changes: string[] = [];
  let next = blocks;
  for (const device of ["tablet", "mobile"] as const) {
    const hasManual = blocks.some(b => b.grid?.[device] && Object.keys(b.grid[device]).length);
    if (hasManual && !overwrite) { changes.push(`Kept your own ${device} layout`); continue; }
    const grids = flowGrids(blocks, columns, device);
    if (!Object.keys(grids).length) continue;
    next = next.map(b => {
      if (!grids[b.id]) return b;
      const grid = { ...(b.grid || {}), [device]: { ...grids[b.id], ...(b.grid?.[device]?.z != null ? { z: b.grid[device].z } : {}) } } as StudioBlock["grid"];
      return { ...b, grid };
    });
    changes.push(device === "mobile" ? "Stacked blocks one per row on phones" : "Placed blocks two-up on tablets");
  }
  return { value: next, changes };
}

const COMPOSITION = "CompositionSection";
const compositionKey = (s: Section) => (Array.isArray(s.settings.items) ? "items" : "blocks");

/**
 * Settings patch that makes one section comfortable on a phone. Fills blanks only (unless `overwrite`):
 * smaller top/bottom padding, a smaller huge heading, fewer grid columns, and — for Flexible
 * composition — stacked block placement on phone and tablet.
 */
export function autoFitSection(section: Section, overwrite = false): AutoFitResult<Record<string, any>> {
  const s = section.settings || {};
  const patch: Record<string, any> = {};
  const changes: string[] = [];
  const blank = (key: string) => overwrite || s[key] == null || s[key] === "";

  for (const [desktopKey, phoneKey, label] of PADDING_KEYS.map(key => [key, spacingKey(key,"mobile"), key.slice(7).toLowerCase()])) {
    if (isNum(s[desktopKey]) && s[desktopKey] > 32 && blank(phoneKey)) {
      const v = phonePadding(s[desktopKey]);
      if (v !== s[phoneKey]) { patch[phoneKey] = v; changes.push(`Phone ${label} spacing ${px(s[desktopKey])} → ${px(v)}`); }
    }
  }
  if (isNum(s.headingSize) && s.headingSize > 36 && blank("mobileHeadingSize")) {
    const v = phoneHeadingSize(s.headingSize);
    if (v !== s.mobileHeadingSize) { patch.mobileHeadingSize = v; changes.push(`Phone heading ${px(s.headingSize)} → ${px(v)}`); }
  }
  const cols = phoneColumns(section.type, s.columns);
  if (cols !== undefined && blank("mobileColumns") && cols !== s.mobileColumns) {
    patch.mobileColumns = cols; changes.push(`Phone columns ${s.columns} → ${cols}`);
  }
  if (section.type === COMPOSITION) {
    const key = compositionKey(section);
    const list: StudioBlock[] = Array.isArray(s[key]) ? s[key] : [];
    if (list.length) {
      const r = autoFitBlocks(list, Number(s.gridColumns) || 12, overwrite);
      if (JSON.stringify(r.value) !== JSON.stringify(list)) patch[key] = r.value;
      changes.push(...r.changes);
    }
  }
  return { value: patch, changes };
}

/** Auto-fits every section in a stack. Returns the new list and how many sections actually changed. */
export function autoFitSections(list: Section[], overwrite = false): AutoFitResult<Section[]> & { touched: number } {
  const changes: string[] = [];
  let touched = 0;
  const value = list.map(section => {
    const r = autoFitSection(section, overwrite);
    if (!Object.keys(r.value).length) return section;
    touched += 1;
    changes.push(...r.changes);
    return { ...section, settings: { ...section.settings, ...clone(r.value) } };
  });
  return { value: touched ? value : list, changes, touched };
}

const PHONE_KEYS = ["mobileColumns", "mobileHeadingSize", ...["mobile", "tablet"].flatMap(device => [...PADDING_KEYS,...GAP_KEYS].map(key => spacingKey(key,device as "mobile" | "tablet")))];

/** Patch that removes every phone/tablet override from a section (undefined = delete in patchSectionSettings). */
export function resetPhoneLayout(section: Section): Record<string, any> {
  const s = section.settings || {};
  const patch: Record<string, any> = {};
  for (const k of PHONE_KEYS) if (s[k] !== undefined) patch[k] = undefined;
  if (section.type === COMPOSITION) {
    const key = compositionKey(section);
    const list: StudioBlock[] = Array.isArray(s[key]) ? s[key] : [];
    const strip = (b: StudioBlock): StudioBlock => {
      const { tablet, mobile, ...grid } = (b.grid || {}) as any;
      const next: StudioBlock = { ...b };
      if (b.grid) next.grid = grid;
      if (b.children?.length) next.children = b.children.map(strip);
      return next;
    };
    if (list.some(b => b.grid?.tablet || b.grid?.mobile || b.children?.length)) patch[key] = list.map(strip);
  }
  return patch;
}
