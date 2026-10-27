// Section library 2.0 (Studio 2.6): what Add section lists, the transient "try it on the page" candidate, and
// managing saved sections (`design.sectionPresets`) and linked shared blocks (`design.sharedBlocks`). Pure.
import type { SharedBlock } from "../../features/site/sharedBlocks";
import { sectionEntries, writeSections } from "./studioWorkflow";
import type { Section } from "./studioModel";

/** Id of the section shown while the owner points at a library card. Never saved: it only goes to the preview. */
export const CANDIDATE_ID = "__studio-candidate";

export type LibraryMeta = { type: string; label: string; description: string; category: string; bestIn?: { group?: string; template?: string; note: string } };

/** Library cards matching a search, grouped by category in registry order. */
export function libraryGroups(registry: LibraryMeta[], query: string): { category: string; items: LibraryMeta[] }[] {
  const q = query.trim().toLowerCase();
  const hits = registry.filter(m => !q || `${m.label} ${m.description} ${m.category} ${m.bestIn?.note || ""}`.toLowerCase().includes(q));
  const order = Array.from(new Set(hits.map(m => m.category)));
  return order.map(category => ({ category, items: hits.filter(m => m.category === category) }));
}

/** Where a section type fits, for the card's hint. `here` is the group or page being edited. */
export function placementHint(meta: LibraryMeta, here: string): { note: string; elsewhere: boolean } | null {
  if (!meta.bestIn) return null;
  const fits = meta.bestIn.group ? meta.bestIn.group === here : meta.bestIn.template ? meta.bestIn.template === here : true;
  return { note: meta.bestIn.note, elsewhere: !fits };
}

/** The design the preview shows while a card is pointed at: the candidate inserted at `at` on `surface`. */
export function withCandidate(design: any, surface: string, sections: Section[], at: number, candidate: Section): any {
  const list = sections.filter(s => s.id !== CANDIDATE_ID);
  const index = Math.max(0, Math.min(list.length, at));
  return writeSections(design, surface, [...list.slice(0, index), { ...candidate, id: CANDIDATE_ID }, ...list.slice(index)]);
}

// ── saved sections ─────────────────────────────────────────────────────────────────────────────
export function renamePreset(design: any, id: string, name: string): any {
  const clean = name.trim();
  if (!clean) return design;
  return { ...design, sectionPresets: (design.sectionPresets || []).map((p: any) => p.id === id ? { ...p, name: clean } : p) };
}
export function deletePreset(design: any, id: string): any {
  const next = (design.sectionPresets || []).filter((p: any) => p.id !== id);
  return { ...design, sectionPresets: next };
}

// ── shared blocks ──────────────────────────────────────────────────────────────────────────────
export type SharedUsage = { surface: string; sectionId: string; sectionType: string; blockId: string };

const walk = (blocks: any[], visit: (block: any) => void) => (blocks || []).forEach(b => {
  if (!b || typeof b !== "object") return;
  visit(b);
  if (Array.isArray(b.children)) walk(b.children, visit);
});
const blockLists = (settings: any): [string, any[]][] =>
  Object.entries(settings || {}).filter(([k, v]) => !k.startsWith("__") && Array.isArray(v)) as [string, any[]][];

/** Every placement of a shared block, on every page and section group. */
export function sharedBlockUsage(design: any, sharedId: string): SharedUsage[] {
  const out: SharedUsage[] = [];
  for (const entry of sectionEntries(design)) for (const section of entry.sections) {
    for (const [, list] of blockLists(section.settings)) walk(list, b => {
      if (b.sharedBlockId === sharedId) out.push({ surface: entry.surface, sectionId: section.id, sectionType: section.type, blockId: b.id });
    });
  }
  return out;
}

export function renameSharedBlock(design: any, id: string, name: string): any {
  const clean = name.trim();
  if (!clean) return design;
  return { ...design, sharedBlocks: (design.sharedBlocks || []).map((s: SharedBlock) => s.id === id ? { ...s, name: clean, updatedAt: new Date().toISOString() } : s) };
}

/**
 * Removes a shared block from the library. Each placement keeps what it showed: the source content is copied into it
 * (its local layout and placement stay) and it stops being linked.
 */
export function deleteSharedBlock(design: any, id: string): any {
  const source: SharedBlock | undefined = (design.sharedBlocks || []).find((s: SharedBlock) => s.id === id);
  const bake = (list: any[]): any[] => list.map(b => {
    if (!b || typeof b !== "object") return b;
    let next = b;
    if (b.sharedBlockId === id) {
      const { sharedBlockId: _drop, ...placement } = b;
      next = source ? { ...JSON.parse(JSON.stringify(source.block)), ...placement, id: b.id, children: b.children ?? source.block.children } : placement;
      if (next.children === undefined) delete next.children;
    }
    return Array.isArray(next.children) ? { ...next, children: bake(next.children) } : next;
  });
  let next = { ...design, sharedBlocks: (design.sharedBlocks || []).filter((s: SharedBlock) => s.id !== id) };
  for (const entry of sectionEntries(next)) {
    let changed = false;
    const sections = entry.sections.map(section => {
      const lists = blockLists(section.settings).filter(([, list]) => JSON.stringify(list).includes(`"sharedBlockId":"${id}"`));
      if (!lists.length) return section;
      changed = true;
      const settings = { ...section.settings };
      for (const [key, list] of lists) settings[key] = bake(list);
      return { ...section, settings };
    });
    if (changed) next = writeSections(next, entry.surface, sections);
  }
  return next;
}
