// Version history 2.0 (Studio 3.1): what differs between two designs, in the owner's words, and how to take one
// difference back. `diffDesigns(a, b)` lists how `b` differs from `a` — every item is labelled from Studio's own
// schemas (Theme settings controls, Text & labels, the section registry, page templates) — and `restoreItem` copies
// one item from a version into the draft (one undoable change in Studio). Pure: no React, no Firestore.
import { isSurfaceKey } from "../../features/site/designModel";
import { COPY_SCHEMA } from "../../features/site/storeCopy";
import { displayValue } from "../../features/site/dynamicSources";
import { groupLabel, isGroupSurface, SECTION_GROUP_KEYS } from "../../features/site/sectionGroups";
import { STYLE_GROUPS } from "./styleSchema";
import { getPath, setPath, type Section } from "./studioModel";
import { sectionEntries, writeSections } from "./studioWorkflow";

export type DiffChange = "changed" | "added" | "removed" | "moved";
export type DiffRestore = { kind: "path"; path: string } | { kind: "section"; sectionId: string };
export type DiffItem = {
  id: string;
  /** Where it lives: "Theme settings · Colors", "Text & labels · Checkout", "Home page", "Navigation"… */
  area: string;
  label: string;
  change: DiffChange;
  /** Short display values (absent for sections and lists). */
  before?: string;
  after?: string;
  /** Both values are colours: show swatches. */
  color?: boolean;
  restore: DiffRestore;
};
export type DiffContext = {
  /** Page templates (id → label), e.g. buildPageTemplates() plus alternates. */
  templates?: { id: string; label: string }[];
  /** Section registry name for a type ("Newsletter"). */
  sectionName?: (type: string) => string | undefined;
  /** Content fields of a section type, for "Heading, Button text changed". */
  sectionFields?: (type: string) => { key: string; label: string }[];
};

type StyleInfo = { label: string; group: string; color: boolean };
const STYLE_INFO = new Map<string, StyleInfo>();
for (const g of STYLE_GROUPS) for (const f of g.fields) if (!STYLE_INFO.has(f.key)) STYLE_INFO.set(f.key, { label: f.label, group: g.title, color: f.kind === "color" });
const COPY_INFO = new Map<string, { label: string; group: string }>();
for (const g of COPY_SCHEMA) for (const f of g.fields) if (!COPY_INFO.has(f.key)) COPY_INFO.set(f.key, { label: f.label, group: g.group });
/** Prefixes of nested style keys ("elementSchemes" for "elementSchemes.cards"), compared one key deeper. */
const NESTED_STYLE = new Set([...STYLE_INFO.keys()].filter(k => k.includes(".") && !k.startsWith("regions.")).map(k => k.split(".")[0]));

/** Structured data with its own Studio editor: one item each. */
const STRUCTURAL: Record<string, { area: string; label: string }> = {
  menus: { area: "Navigation", label: "Menus" },
  categories: { area: "Navigation", label: "Shop categories" },
  navOrder: { area: "Navigation", label: "Header bar order" },
  secondaryNavKeys: { area: "Navigation", label: "Publisher navigation row" },
  footerBadges: { area: "Navigation", label: "Footer badges" },
  sectionPresets: { area: "Page layout", label: "Saved sections" },
  sharedBlocks: { area: "Page layout", label: "Shared blocks" },
  alternateTemplates: { area: "Page layout", label: "Book & collection templates" },
  productInfoBlocks: { area: "Page layout", label: "Buy box blocks" },
  colorSchemes: { area: "Theme settings · Colour schemes", label: "Colour schemes" },
  announcements: { area: "Theme settings · Header & announcement bar", label: "Announcement messages" },
};
/** Bookkeeping, not design. */
const IGNORED = new Set(["publishedAt", "updatedAt", "savedAt", "rev"]);

const humanise = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._-]+/g, " ").replace(/^./, c => c.toUpperCase());
const stable = (v: any): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o: any, k) => { if (x[k] !== undefined) o[k] = x[k]; return o; }, {}) : x));
export const sameValue = (a: any, b: any) => stable(a ?? null) === stable(b ?? null);
const isColor = (v: any) => typeof v === "string" && /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(v.trim());

/** A short readable value for the before/after columns. */
export function showValue(v: any): string {
  if (v === undefined || v === null) return "Default";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const text = String(displayValue(v)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return "(blank)";
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  }
  if (v && typeof v === "object" && "$dyn" in v) return String(displayValue(v));
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  return "Custom settings";
}

function surfaceLabel(surface: string, ctx: DiffContext) {
  if (isGroupSurface(surface)) return `Shared sections · ${groupLabel(surface)}`;
  const t = ctx.templates?.find(x => x.id === surface);
  if (t) return t.label;
  if (surface.startsWith("page:")) return `Page “${surface.slice(5)}”`;
  return humanise(surface);
}

/** Label + area for one setting path ("accentColor", "copy.cartTitle", "regions.x", "elementSchemes.cards"). */
function settingInfo(path: string): { area: string; label: string; color: boolean } {
  if (path.startsWith("copy.")) {
    const c = COPY_INFO.get(path.slice(5));
    return { area: `Text & labels · ${c?.group || "Other words"}`, label: c ? `“${c.label}”` : humanise(path.slice(5)), color: false };
  }
  const s = STYLE_INFO.get(path);
  if (s) return { area: `Theme settings · ${s.group}`, label: s.label, color: s.color };
  if (path.startsWith("regions.")) return { area: "Theme settings · Fine-tune single elements", label: humanise(path.slice(8)), color: false };
  return { area: "Theme settings · Other settings", label: humanise(path), color: false };
}

/** Every setting path that differs inside one settings object (the root, or a page surface). */
function settingPaths(a: any, b: any, skip: (key: string) => boolean): string[] {
  const out: string[] = [];
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (skip(key) || IGNORED.has(key)) continue;
    const va = a?.[key], vb = b?.[key];
    if (sameValue(va, vb)) continue;
    const mapLike = key === "copy" || key === "regions" || NESTED_STYLE.has(key);
    const plainObject = (v: any) => v == null || (typeof v === "object" && !Array.isArray(v));
    if (mapLike && plainObject(va) && plainObject(vb)) {
      for (const sub of new Set([...Object.keys(va || {}), ...Object.keys(vb || {})])) {
        if (!sameValue(va?.[sub], vb?.[sub])) out.push(`${key}.${sub}`);
      }
    } else out.push(key);
  }
  return out;
}

function sectionName(s: Section, ctx: DiffContext) {
  const st = s?.settings || {};
  const snippet = [st.title, st.heading, st.headline, st.text].find(v => typeof v === "string" && v.replace(/<[^>]+>/g, "").trim());
  const name = ctx.sectionName?.(s.type) || humanise(s.type || "section");
  return snippet ? `${name} “${showValue(snippet)}”` : name;
}

/** "Heading, Button text" — the fields of a section that differ (top-level keys, labelled from the registry). */
function changedFields(a: Section, b: Section, ctx: DiffContext): string {
  const fields = ctx.sectionFields?.(b.type) || [];
  const keys = [...new Set([...Object.keys(a.settings || {}), ...Object.keys(b.settings || {})])]
    .filter(k => !sameValue(a.settings?.[k], b.settings?.[k]));
  const other = Object.keys({ ...a, ...b }).filter(k => k !== "settings" && k !== "id" && !sameValue((a as any)[k], (b as any)[k]));
  const names = [...keys.map(k => fields.find(f => f.key === k)?.label || humanise(k)), ...other.map(humanise)];
  if (!names.length) return "Settings";
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3} more` : names.join(", ");
}

type Placed = { surface: string; index: number; order: number; section: Section };
function placements(design: any): Map<string, Placed> {
  const out = new Map<string, Placed>();
  for (const entry of sectionEntries(design)) {
    entry.sections.forEach((section, index) => { if (section?.id && !out.has(section.id)) out.set(section.id, { surface: entry.surface, index, order: index, section }); });
  }
  return out;
}

/** How `b` differs from `a`, labelled for people. Items are grouped by `area` by the caller. */
export function diffDesigns(a: any, b: any, ctx: DiffContext = {}): DiffItem[] {
  const items: DiffItem[] = [];
  const isSurface = (key: string) => isSurfaceKey(key) || (key in STRUCTURAL ? false : !!(a?.[key]?.sections || b?.[key]?.sections));
  const skipRoot = (key: string) => isSurface(key) || SECTION_GROUP_KEYS.includes(key as any) || key in STRUCTURAL;

  // Theme settings and Text & labels (all pages).
  for (const path of settingPaths(a, b, skipRoot)) {
    const info = settingInfo(path);
    const va = getPath(a, path), vb = getPath(b, path);
    items.push({ id: `path:${path}`, area: info.area, label: info.label, change: "changed", before: showValue(va), after: showValue(vb),
      color: info.color || (isColor(va) && isColor(vb)), restore: { kind: "path", path } });
  }
  // Structured data with its own editor (menus, categories…).
  for (const [key, meta] of Object.entries(STRUCTURAL)) {
    if (sameValue(a?.[key], b?.[key])) continue;
    items.push({ id: `path:${key}`, area: meta.area, label: meta.label, change: "changed", restore: { kind: "path", path: key } });
  }
  // Page-only settings on each page surface (sections are compared below).
  const surfaces = new Set([...Object.keys(a || {}), ...Object.keys(b || {})].filter(isSurface));
  for (const surface of surfaces) {
    const where = surfaceLabel(surface, ctx);
    for (const sub of settingPaths(a?.[surface], b?.[surface], key => key === "sections" || key === "homepageSections")) {
      const path = `${surface}.${sub}`;
      const info = sub in STRUCTURAL ? { label: STRUCTURAL[sub].label, color: false } : settingInfo(sub);
      const va = getPath(a, path), vb = getPath(b, path);
      items.push({ id: `path:${path}`, area: where, label: `${info.label} (this page only)`, change: "changed",
        before: Array.isArray(va) || Array.isArray(vb) ? undefined : showValue(va), after: Array.isArray(va) || Array.isArray(vb) ? undefined : showValue(vb),
        color: info.color || (isColor(va) && isColor(vb)), restore: { kind: "path", path } });
    }
  }
  // Sections, matched by id across every page and shared group.
  const pa = placements(a), pb = placements(b);
  // Relative order among the sections both designs keep in the same list ("moved" only when that order changes).
  const relativeOrder = (map: Map<string, Placed>, other: Map<string, Placed>) => {
    const lists = new Map<string, string[]>();
    for (const [id, p] of map) if (other.get(id)?.surface === p.surface) lists.set(p.surface, [...(lists.get(p.surface) || []), id]);
    const pos = new Map<string, number>();
    for (const ids of lists.values()) ids.sort((x, y) => map.get(x)!.index - map.get(y)!.index).forEach((id, i) => pos.set(id, i));
    return pos;
  };
  const ra = relativeOrder(pa, pb), rb = relativeOrder(pb, pa);
  for (const id of new Set([...pa.keys(), ...pb.keys()])) {
    const x = pa.get(id), y = pb.get(id);
    const restore: DiffRestore = { kind: "section", sectionId: id };
    if (!x && y) { items.push({ id: `section:${id}`, area: surfaceLabel(y.surface, ctx), label: sectionName(y.section, ctx), change: "added", restore }); continue; }
    if (x && !y) { items.push({ id: `section:${id}`, area: surfaceLabel(x.surface, ctx), label: sectionName(x.section, ctx), change: "removed", restore }); continue; }
    if (!x || !y) continue;
    const label = sectionName(y.section, ctx);
    if (x.surface !== y.surface) {
      items.push({ id: `section:${id}`, area: surfaceLabel(y.surface, ctx), label, change: "moved", before: surfaceLabel(x.surface, ctx), after: surfaceLabel(y.surface, ctx), restore });
    } else if (!sameValue(x.section, y.section)) {
      items.push({ id: `section:${id}`, area: surfaceLabel(y.surface, ctx), label, change: "changed", before: changedFields(x.section, y.section, ctx), restore });
    } else if (ra.get(id) !== rb.get(id)) {
      items.push({ id: `section:${id}`, area: surfaceLabel(y.surface, ctx), label, change: "moved", before: `Position ${x.index + 1}`, after: `Position ${y.index + 1}`, restore });
    }
  }
  return items;
}

/**
 * The draft with one item taken from `version`: a setting gets the version's value (or goes back to the default
 * when the version had none); a section becomes exactly the version's copy, in the version's place — or is removed
 * when the version didn't have it.
 */
export function restoreItem(draft: any, version: any, item: DiffItem): any {
  const clone = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  if (item.restore.kind === "path") return setPath(draft, item.restore.path, clone(getPath(version, item.restore.path)));
  const id = item.restore.sectionId;
  let next = draft;
  for (const entry of sectionEntries(draft)) {
    if (entry.sections.some(s => s.id === id)) next = writeSections(next, entry.surface, entry.sections.filter(s => s.id !== id));
  }
  const placed = placements(version).get(id);
  if (!placed) return next;
  const list = sectionEntries(next).find(e => e.surface === placed.surface)?.sections || [];
  const at = Math.min(placed.index, list.length);
  return writeSections(next, placed.surface, [...list.slice(0, at), clone(placed.section), ...list.slice(at)]);
}

/** One line per difference for the Publish / Discard dialogs ("Home page · Newsletter added"). */
export function summariseDiff(items: DiffItem[], max = 8): string[] {
  const word: Record<DiffChange, string> = { changed: "changed", added: "added", removed: "removed", moved: "moved" };
  const lines = items.map(i => `${i.area} · ${i.label} ${word[i.change]}`);
  return lines.length > max ? [...lines.slice(0, max), `…and ${lines.length - max} more`] : lines;
}

/** Items grouped by area, in first-seen order. */
export function groupByArea(items: DiffItem[]): { area: string; items: DiffItem[] }[] {
  const groups: { area: string; items: DiffItem[] }[] = [];
  for (const item of items) {
    const g = groups.find(x => x.area === item.area);
    if (g) g.items.push(item); else groups.push({ area: item.area, items: [item] });
  }
  return groups;
}
