// Pure, UI-free helpers for the Studio theme editor. Everything the editor does
// to a `design` object goes through here so it can be unit-tested and so the
// editor never mutates state in place.

import { compactDesign } from "../../features/site/designModel";
import { MAX_BLOCK_DEPTH, normalizeBlocks, resolveSharedBlocks, type SharedBlock, type StudioBlock } from "../../features/site/sharedBlocks";
import { SECTION_GROUP_KEYS, type SectionGroupKey } from "../../features/site/sectionGroups";
import { designEqual } from "../../features/site/designEqual";
export { MAX_BLOCK_DEPTH, normalizeBlocks, resolveSharedBlocks, type SharedBlock, type StudioBlock };

/** `label` is the owner's own name for a section in Studio; shoppers never see it. */
export type Section = { id: string; type: string; label?: string; visible?: boolean; settings: Record<string, any> };

/** Where a list of sections lives inside `design`. */
/** A page's own sections, or a section group shown on every page (`group` defaults to the footer group). */
export type SectionTarget = { kind: "template"; id: string } | { kind: "global"; group?: SectionGroupKey };

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

export function findBlock(blocks: StudioBlock[], id: string): StudioBlock | undefined {
  for (const block of blocks || []) {
    if (block.id === id) return block;
    const child = findBlock(block.children || [], id);
    if (child) return child;
  }
}

export function mapBlock(blocks: StudioBlock[], id: string, fn: (block: StudioBlock) => StudioBlock): StudioBlock[] {
  return (blocks || []).map(block => block.id === id
    ? fn(block)
    : block.children?.length ? { ...block, children: mapBlock(block.children, id, fn) } : block);
}

export function removeBlock(blocks: StudioBlock[], id: string): StudioBlock[] {
  return (blocks || []).filter(block => block.id !== id).map(block => block.children?.length
    ? { ...block, children: removeBlock(block.children, id) } : block);
}

export function addChildBlock(blocks: StudioBlock[], parentId: string, child: StudioBlock): StudioBlock[] {
  return mapBlock(blocks, parentId, block => ({ ...block, children: [...(block.children || []), child] }));
}

/** Inserts `block` right after the block `afterId`, at that block's own nesting level (end of the top level if not found). */
export function insertBlockAfter(blocks: StudioBlock[], afterId: string, block: StudioBlock): StudioBlock[] {
  let placed = false;
  const rec = (list: StudioBlock[]): StudioBlock[] => {
    const i = list.findIndex(b => b.id === afterId);
    if (i >= 0) { placed = true; return [...list.slice(0, i + 1), block, ...list.slice(i + 1)]; }
    return list.map(b => !placed && b.children?.length ? { ...b, children: rec(b.children) } : b);
  };
  const next = rec(blocks || []);
  return placed ? next : [...(blocks || []), block];
}

/** Moves a block before a sibling at the same nesting level. */
export function moveBlockBefore(blocks: StudioBlock[], movingId: string, beforeId: string): StudioBlock[] {
  const from = blocks.findIndex(block => block.id === movingId), to = blocks.findIndex(block => block.id === beforeId);
  if (from >= 0 && to >= 0 && from !== to) {
    const next = [...blocks], [moving] = next.splice(from, 1);
    next.splice(from < to ? to - 1 : to, 0, moving); return next;
  }
  return blocks.map(block => block.children?.length
    ? { ...block, children: moveBlockBefore(block.children, movingId, beforeId) } : block);
}

export function freshBlockIds(block: StudioBlock): StudioBlock {
  return { ...clone(block), id: newId(), children: (block.children || []).map(freshBlockIds) };
}

/** Immutable deep set: setPath(obj, "a.b.c", 1). `undefined` deletes the key. */
export function setPath<T extends Record<string, any>>(obj: T, path: string, value: any): T {
  const keys = path.split(".");
  const rec = (node: any, i: number): any => {
    const base = node && typeof node === "object" ? node : {};
    const k = keys[i];
    const next = { ...base };
    if (i === keys.length - 1) {
      if (value === undefined) delete next[k];
      else next[k] = value;
    } else {
      next[k] = rec(base[k], i + 1);
    }
    return next;
  };
  return rec(obj, 0);
}

export function getPath(obj: any, path: string, fallback?: any) {
  const v = path.split(".").reduce((n, k) => (n == null ? undefined : n[k]), obj);
  return v === undefined ? fallback : v;
}

/**
 * Merge stored design over defaults, and make sure the two legacy surfaces
 * (heroPage / storefront) carry a `sections` array. Idempotent.
 */
export function normalizeDesign(incoming: any, defaults: any = {}) {
  const inc = incoming || {};
  const merged = { ...defaults, ...inc };
  // Already-normal parts are kept as the very same objects, so an edit only replaces what it touched and
  // sameDesign can skip everything else (Phase 4 structural sharing).
  const normalized: any = {
    ...merged,
    heroPage: Array.isArray(inc.heroPage?.sections) ? inc.heroPage : {
      sections: inc.heroPage?.sections || inc.heroPage?.homepageSections || inc.homepageSections || [],
      ...(inc.heroPage || {}),
    },
    storefront: Array.isArray(inc.storefront?.sections) ? inc.storefront : {
      sections: inc.storefront?.sections || inc.storefront?.homepageSections || [],
      ...(inc.storefront || {}),
    },
  };
  const identifySection = (section: any, index: number) => {
    const id = section.id || `legacy-section-${index}`;
    const original = section.settings || {};
    let settings = original;
    for (const key of ["items", "slides", "blocks"]) {
      if (!Array.isArray(original[key])) continue;
      const blocks = normalizeBlocks(original[key], `${id}-${key}`);
      if (blocks !== original[key]) { if (settings === original) settings = { ...original }; settings[key] = blocks; }
    }
    return section.id && section.settings && settings === original ? section : { ...section, id, settings: settings === original ? { ...original } : settings };
  };
  const identify = (sections: any[]) => {
    const out = sections.map(identifySection);
    return out.every((s, i) => s === sections[i]) ? sections : out;
  };
  for (const key of SECTION_GROUP_KEYS) if (Array.isArray(normalized[key])) normalized[key] = identify(normalized[key]);
  for (const key of Object.keys(normalized)) {
    const list = normalized[key]?.sections;
    if (!Array.isArray(list)) continue;
    const next = identify(list);
    if (next !== list) normalized[key] = { ...normalized[key], sections: next };
  }
  // Drop page values that can never show (shop structure, nested pages) or that equal what the
  // page inherits anyway — the shop looks identical, and Studio's values are the ones that go live.
  return compactDesign(normalized).design;
}

export function targetKey(t: SectionTarget) {
  return t.kind === "global" ? (t.group || "globalSections") : `${t.id}.sections`;
}

export function getSections(design: any, t: SectionTarget): Section[] {
  const list = getPath(design, targetKey(t));
  return Array.isArray(list) ? list : [];
}

export function setSections(design: any, t: SectionTarget, next: Section[]) {
  return setPath(design, targetKey(t), next);
}

export function makeSection(type: string, defaults: Record<string, any> = {}): Section {
  return { id: newId(), type, visible: true, settings: clone(defaults) };
}

export const isPageTemplateId = (id: string) => id === "page" || id.startsWith("page:");

/**
 * A custom page with no "Page content" section draws its title and text after every section, where
 * nothing can be moved below it. Adding a section there first turns that text into a real Page content
 * section at the same place (the end), so the page looks the same and the text can then be reordered.
 */
export function withPageText(list: Section[], templateId: string, defaults: Record<string, any> = {}): Section[] {
  if (!isPageTemplateId(templateId) || list.some(s => s.type === "PageContentSection")) return list;
  return [...list, makeSection("PageContentSection", defaults)];
}

export function insertSection(list: Section[], section: Section, index = list.length): Section[] {
  const i = Math.max(0, Math.min(list.length, index));
  return [...list.slice(0, i), section, ...list.slice(i)];
}

export function moveSection(list: Section[], from: number, to: number): Section[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

export function duplicateSection(list: Section[], id: string): { list: Section[]; newId?: string } {
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return { list };
  const copy: Section = clone(list[i]);
  copy.id = newId();
  // Nested blocks need fresh ids too, or drag/sort keys collide.
  for (const key of Object.keys(copy.settings || {})) {
    const v = copy.settings[key];
    if (Array.isArray(v) && v.every((b) => b && typeof b === "object" && "id" in b)) {
      copy.settings[key] = v.map((b: any) => freshBlockIds(b));
    }
  }
  return { list: insertSection(list, copy, i + 1), newId: copy.id };
}

export const removeSection = (list: Section[], id: string) => list.filter((s) => s.id !== id);

export const toggleSection = (list: Section[], id: string) =>
  list.map((s) => (s.id === id ? { ...s, visible: s.visible === false } : s));

export const patchSectionSettings = (list: Section[], id: string, patch: Record<string, any>) =>
  list.map((s) => {
    if (s.id !== id) return s;
    const settings = { ...(s.settings || {}), ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete settings[k];
    return { ...s, settings };
  });

/** Sets one field of one block inside a section (used by inline preview edits). */
export function patchBlockField(list: Section[], sectionId: string, blockId: string, key: string, value: any) {
  return list.map((s) => {
    if (s.id !== sectionId) return s;
    const settings = { ...(s.settings || {}) };
    for (const k of Object.keys(settings)) {
      const arr = settings[k];
      if (Array.isArray(arr) && findBlock(arr, blockId)) {
        settings[k] = mapBlock(arr, blockId, (b) => ({ ...b, [key]: value }));
      }
    }
    return { ...s, settings };
  });
}

// ── Undo / redo ────────────────────────────────────────────────────────────
export type History<T> = {
  past: T[]; present: T; future: T[];
  /** What each step did ("Move Newsletter up"), parallel to `past` / `future`, for Undo/Redo labels. */
  pastLabels?: string[]; futureLabels?: string[];
  /** Typing in one field within a moment is one undo step, not one per keystroke. */
  lastKey?: string; lastAt?: number;
};
export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 1000;

export const initHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [], pastLabels: [], futureLabels: [] });

export function commit<T>(h: History<T>, next: T, meta: { label?: string; coalesce?: string; now?: number } = {}): History<T> {
  if (next === h.present) return h;
  const now = meta.now ?? Date.now();
  if (meta.coalesce && h.lastKey === meta.coalesce && h.lastAt != null && now - h.lastAt < COALESCE_MS && h.past.length) {
    return { ...h, present: next, future: [], futureLabels: [], lastAt: now };
  }
  const labels = h.pastLabels ?? h.past.map(() => "Edit");
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [],
    pastLabels: [...labels, meta.label || "Edit"].slice(-HISTORY_LIMIT), futureLabels: [],
    lastKey: meta.coalesce, lastAt: now,
  };
}
export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const labels = h.pastLabels ?? h.past.map(() => "Edit");
  return {
    past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future],
    pastLabels: labels.slice(0, -1), futureLabels: [labels[labels.length - 1] || "Edit", ...(h.futureLabels ?? h.future.map(() => "Edit"))],
  };
}
export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const labels = h.futureLabels ?? h.future.map(() => "Edit");
  return {
    past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1),
    pastLabels: [...(h.pastLabels ?? h.past.map(() => "Edit")), labels[0] || "Edit"], futureLabels: labels.slice(1),
  };
}
/** Moves `steps` through history in one go (negative = back, positive = forward), e.g. from the Workbench's
 *  Changes list. Same labels as stepping one at a time; stops at either end. */
export function jumpBy<T>(h: History<T>, steps: number): History<T> {
  let cur = h;
  const n = Math.trunc(steps) || 0;
  for (let i = 0; i < Math.abs(n); i++) {
    const next = n < 0 ? undo(cur) : redo(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}
/** "Undo: Move Newsletter up" / "Redo: …" labels for the toolbar buttons. */
export const undoLabel = (h: History<any>) => h.past.length ? (h.pastLabels?.[h.pastLabels.length - 1] || "Edit") : "";
export const redoLabel = (h: History<any>) => h.future.length ? (h.futureLabels?.[0] || "Edit") : "";

/** Same saved design? Structural (no serialising), short-circuits on shared subtrees (features/site/designEqual.ts). */
export const sameDesign = (a: any, b: any) => designEqual(a, b);
