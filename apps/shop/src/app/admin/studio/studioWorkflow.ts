import { findBlock, moveBlockBefore, patchSectionSettings, removeBlock, sameDesign, setPath, type Section, type StudioBlock } from "./studioModel";
import { MAX_BLOCK_DEPTH } from "../../features/site/sharedBlocks";
import { REGION_GROUPS } from "../../features/site/storefrontRegions";
import { isGroupSurface, SECTION_GROUP_KEYS } from "../../features/site/sectionGroups";

/** Finds section ownership in the current design, including the section groups and page:<slug>. */
export function sectionEntries(design: any): { surface: string; sections: Section[] }[] {
  return [
    ...SECTION_GROUP_KEYS.flatMap(key => Array.isArray(design?.[key]) ? [{ surface: key as string, sections: design[key] as Section[] }] : []),
    ...Object.entries(design || {}).flatMap(([surface, value]: [string, any]) =>
      Array.isArray(value?.sections) ? [{ surface, sections: value.sections }] : []),
  ];
}

export function findSectionOwner(design: any, sectionId: string) {
  const owner = sectionEntries(design).find(entry => entry.sections.some(section => section.id === sectionId));
  return owner && { ...owner, section: owner.sections.find(section => section.id === sectionId)! };
}

/** Writes a section list back to its owner: a section group (a root list) or a page (`<page>.sections`). */
export const writeSections = (design: any, surface: string, sections: Section[]) =>
  isGroupSurface(surface) ? { ...design, [surface]: sections } : { ...design, [surface]: { ...(design[surface] || {}), sections } };

/**
 * Moves a section to `index` in `surface` (a section group such as "globalSections", a template id or "page:<slug>"),
 * on the same page or another one. Unknown sections, and moves that change nothing, return `design`.
 */
export function moveSectionTo(design: any, sectionId: string, surface: string, index?: number): any {
  const owner = findSectionOwner(design, sectionId);
  if (!owner || !surface) return design;
  const without = owner.sections.filter(s => s.id !== sectionId);
  let next = writeSections(design, owner.surface, without);
  const into = owner.surface === surface ? without
    : isGroupSurface(surface) ? (Array.isArray(next[surface]) ? next[surface] : []) : (next[surface]?.sections || []);
  const at = Math.max(0, Math.min(into.length, index ?? into.length));
  if (owner.surface === surface && owner.sections.findIndex(s => s.id === sectionId) === at) return design;
  next = writeSections(next, surface, [...into.slice(0, at), owner.section, ...into.slice(at)]);
  return next;
}

/** Applies `fn` to the sections with these ids, wherever they live. */
export function updateSectionsById(design: any, ids: string[], fn: (s: Section) => Section | null): any {
  const want = new Set(ids);
  let next = design;
  for (const entry of sectionEntries(design)) {
    if (!entry.sections.some(s => want.has(s.id))) continue;
    const list = entry.sections.flatMap(s => { if (!want.has(s.id)) return [s]; const r = fn(s); return r ? [r] : []; });
    next = writeSections(next, entry.surface, list);
  }
  return next;
}

const blockDepth = (blocks: StudioBlock[], id: string, depth = 0): number => {
  for (const b of blocks || []) {
    if (b.id === id) return depth;
    const inner = blockDepth(b.children || [], id, depth + 1);
    if (inner >= 0) return inner;
  }
  return -1;
};
const subtreeDepth = (b: StudioBlock): number => 1 + Math.max(0, ...(b.children || []).map(subtreeDepth));

/**
 * Moves a block (with its children) to another section — top level, before `beforeId` when given.
 * Only between sections of the same type, so the block's fields still mean something there.
 * Returns `{ design, error }`; `error` explains a refused move and leaves the design unchanged.
 */
export function moveBlockTo(design: any, move: { fromSectionId: string; blockId: string; toSectionId: string; beforeId?: string | null },
  blocksKey: (type: string) => string): { design: any; error?: string } {
  const from = findSectionOwner(design, move.fromSectionId), to = findSectionOwner(design, move.toSectionId);
  if (!from || !to) return { design, error: "That section is no longer on the page." };
  if (from.section.type !== to.section.type) return { design, error: "Blocks can only move between sections of the same kind." };
  const fromKey = blocksKey(from.section.type), toKey = blocksKey(to.section.type);
  const fromBlocks: StudioBlock[] = from.section.settings[fromKey] || from.section.settings.blocks || [];
  const moving = findBlock(fromBlocks, move.blockId);
  if (!moving) return { design, error: "That block is no longer there." };
  if (move.beforeId && (move.beforeId === move.blockId || findBlock(moving.children || [], move.beforeId))) return { design, error: "A block can't move inside itself." };
  if (move.fromSectionId === move.toSectionId && move.beforeId) {
    const next = patchSectionSettings(from.sections, from.section.id, { [fromKey]: moveBlockBefore(fromBlocks, move.blockId, move.beforeId) });
    return { design: writeSections(design, from.surface, next) };
  }
  let next = updateSectionsById(design, [from.section.id], s => ({ ...s, settings: { ...s.settings, [fromKey]: removeBlock(fromBlocks, move.blockId) } }));
  const target = findSectionOwner(next, move.toSectionId)!;
  const toBlocks: StudioBlock[] = target.section.settings[toKey] || target.section.settings.blocks || [];
  const at = move.beforeId ? blockDepth(toBlocks, move.beforeId) : 0;
  if (at < 0) return { design, error: "That block is no longer there." };
  if (at + subtreeDepth(moving) > MAX_BLOCK_DEPTH) return { design, error: `Blocks can be nested ${MAX_BLOCK_DEPTH} levels deep at most.` };
  const insert = (list: StudioBlock[]): StudioBlock[] => {
    if (!move.beforeId) return [...list, moving];
    const i = list.findIndex(b => b.id === move.beforeId);
    if (i >= 0) return [...list.slice(0, i), moving, ...list.slice(i)];
    return list.map(b => b.children?.length ? { ...b, children: insert(b.children) } : b);
  };
  next = updateSectionsById(next, [target.section.id], s => ({ ...s, settings: { ...s.settings, [toKey]: insert(toBlocks) } }));
  return { design: next };
}

/** Applies preview drag actions against the latest immutable design snapshot. */
export function applyCanvasAction(design: any, action: {
  type: string; sectionId: string; blockId?: string; beforeId?: string;
}, blocksKey: (type: string) => string, newBlock?: any) {
  const owner = findSectionOwner(design, action.sectionId);
  if (!owner) return design;
  let sections = owner.sections;
  if (action.type === "SECTION_MOVE") {
    const from = sections.findIndex(section => section.id === action.sectionId);
    const to = sections.findIndex(section => section.id === action.beforeId);
    if (to < 0 || from === to) return design;
    return moveSectionTo(design, action.sectionId, owner.surface, from < to ? to - 1 : to);
  } else {
    const key = blocksKey(owner.section.type);
    const blocks = owner.section.settings[key] || owner.section.settings.blocks || [];
    if (action.type === "ADD_BLOCK" && newBlock) sections = patchSectionSettings(sections, action.sectionId, { [key]: [...blocks, newBlock] });
    else if (action.type === "BLOCK_MOVE" && action.blockId && action.beforeId) {
      sections = patchSectionSettings(sections, action.sectionId, { [key]: moveBlockBefore(blocks, action.blockId, action.beforeId) });
    } else return design;
  }
  return writeSections(design, owner.surface, sections);
}

/**
 * Advance server fields while retaining edits made since the request started. `captured` is what the
 * editor held when Save was pressed (before pasted pictures were uploaded); a field still equal to it was
 * not edited during the save, so the saved value (e.g. the body with uploaded picture links) wins.
 */
export function reconcileSavedPage<T extends Record<string, any>>(current: T | null, captured: T, saved: T): T | null {
  if (!current) return null;
  if (JSON.stringify(current) === JSON.stringify(captured)) return saved;
  const edited: Record<string, any> = {};
  for (const key of Object.keys(current)) {
    if (JSON.stringify(current[key]) !== JSON.stringify(captured[key])) edited[key] = current[key];
  }
  return { ...saved, ...edited, id: saved.id, createdAt: saved.createdAt, updatedAt: saved.updatedAt };
}

export function updateBlocks(section: Section, key: string, update: (blocks: any[]) => any[]) {
  const blocks = section.settings[key] || section.settings.blocks || [];
  return { [key]: update(blocks) };
}

export function applyPageStyle(design: any, surface: string, path: string, value: any) {
  return { ...design, [surface]: setPath(design[surface] || {}, path, value) };
}

/**
 * Plain, structured-clone-safe copy for postMessage/BroadcastChannel. Admin book/page lists carry
 * `_lastDoc` (a live Firestore snapshot with functions), which makes postMessage throw a
 * DataCloneError — silently stopping every preview update once books have loaded.
 */
export function toCloneable<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value, (key, v) => (key === "_lastDoc" ? undefined : v)));
}

/** Build the single authoritative snapshot sent to the storefront iframe. */
export function buildPreviewState(settings: any, design: any, pages: any[], books: any[]) {
  return toCloneable({
    type: "STUDIO_PREVIEW_STATE" as const,
    settings: { ...settings, design, draftDesign: design },
    design,
    // Draft pages ride along so Studio can preview them; storefront menus still list published pages only.
    pages: (pages || []).filter((page) => page.status === "published" || page.slug),
    books: books || [],
  });
}

/** Channel that carries the unsaved snapshot to a full-screen "Preview in new tab" window. */
export { PREVIEW_CHANNEL } from "../../features/site/previewTab";

/**
 * Overlay the page being edited in Studio › Pages (unsaved) onto the page list, for the preview
 * snapshot only — nothing is written. Matches by id, else by slug for a page not yet created.
 */
export function withDraftPage(pages: any[], draft: any | null | undefined) {
  if (!draft || !draft.slug) return pages;
  const match = (p: any) => (draft.id ? p.id === draft.id : p.slug === draft.slug);
  return pages.some(match) ? pages.map((p) => (match(p) ? { ...p, ...draft } : p)) : [...pages, { ...draft, id: draft.id || `draft-${draft.slug}` }];
}

/** Deliver through postMessage plus a same-origin fallback for iframe load races. */
export function deliverPreviewState(
  frame: Window | null | undefined,
  state: ReturnType<typeof buildPreviewState>,
  origin: string,
) {
  if (!frame) return;
  try {
    frame.postMessage(state, origin);
  } catch (err) {
    // Never let one undeliverable post stop the direct same-origin dispatch below.
    console.warn("[Studio] preview postMessage failed", err);
  }
  try {
    if (frame.location.origin !== origin) return;
    const source = typeof window === "undefined" ? null : window;
    frame.dispatchEvent(new MessageEvent("message", { data: state, origin, source }));
  } catch {
    // Cross-origin frames still receive the normal postMessage above.
  }
}

/** One in-flight write, with an immutable baseline even if editing continues. */
export function createSnapshotWriter() {
  let busy = false;
  return {
    async run<T>(design: T, persist: (snapshot: T) => Promise<unknown>): Promise<T | null> {
      if (busy) return null;
      busy = true;
      try {
        const snapshot = JSON.parse(JSON.stringify(design)) as T;
        await persist(snapshot);
        return snapshot;
      } finally { busy = false; }
    },
  };
}

export type Recovery = { version: 1; design: Record<string, any>; base: string; savedAt: number; key?: string };
/** localStorage key prefix for per-tab Studio recovery records: `<prefix><base>:<uid>:<tabId>`. */
export const RECOVERY_PREFIX = "studio-recovery-v2:";
const RECOVERY_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

/**
 * The newest unsaved-work record left by any Studio tab of this admin (a crashed or closed tab
 * included). Records older than two weeks are dropped.
 */
export function newestRecovery(storage: Storage, prefix: string, baseline: any, now = Date.now()) {
  let best: (Recovery & { conflict: boolean }) | null = null;
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    const parsed = parseRecovery(raw, baseline);
    let savedAt = 0; try { savedAt = Number(JSON.parse(raw || "{}").savedAt) || 0; } catch { /* unreadable */ }
    if (now - savedAt > RECOVERY_MAX_AGE) { storage.removeItem(key); continue; }
    if (parsed && (!best || parsed.savedAt > best.savedAt)) best = { ...parsed, key };
  }
  return best;
}
export function parseRecovery(raw: string | null, baseline: any): (Recovery & { conflict: boolean }) | null {
  try {
    const data = JSON.parse(raw || "null");
    if (data?.version !== 1 || !data.design || typeof data.design !== "object" || Array.isArray(data.design)
      || typeof data.base !== "string" || !Number.isFinite(data.savedAt) || sameDesign(data.design, baseline)) return null;
    return { ...data, conflict: data.base !== JSON.stringify(baseline) };
  } catch { return null; }
}

export function previewRoute(href: string, base: string, options: {
  /** false = the shop opens straight on the catalog (Show a Home page off), so "/" is the catalog. */
  showHero?: boolean;
  /** A book's own template surface (its alternate), for a book link that names no template. */
  bookTemplate?: (slug: string) => string;
} = {}) {
  const url = new URL(href, "https://preview.invalid");
  const prefix = base.endsWith("/") ? base : `${base}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  const path = url.pathname.slice(prefix.length).replace(/\/$/, "");
  if (!path) return { templateId: url.searchParams.get("catalog") === "true" || options.showHero === false ? "storefront" : "heroPage" };
  // `?template=<id>` is how Studio previews an alternate template (2.8); "default" (or none) is the default one.
  const alt = url.searchParams.get("template");
  const withAlt = (base: string) => (alt && alt !== "default" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(alt) ? `${base}~${alt}` : base);
  if (path.startsWith("books/")) {
    const product = decodeURIComponent(path.slice(6));
    // A shopper-style link carries no template: the book shows its own alternate, so Studio edits that one.
    const templateId = !alt && options.bookTemplate ? options.bookTemplate(product) : withAlt("productPage");
    return { templateId, product };
  }
  if (path.startsWith("collections/")) return { templateId: withAlt("collectionPage"), collection: decodeURIComponent(path.slice(12)) };
  if (path.startsWith("page/")) return { templateId: `page:${decodeURIComponent(path.slice(5))}` };
  if (path === "checkout") return { templateId: "cartPage" };
  if (path === "wishlist") return { templateId: "wishlistPage" };
  if (path === "account" || path.startsWith("account/")) return { templateId: "accountPage" };
  if (path === "track") return { templateId: "trackingPage" };
  return { templateId: "page404" };
}

/** The same preview page, ignoring `?preview=true`, parameter order and a trailing slash. */
export function samePreviewPage(a: string, b: string) {
  const key = (href: string) => {
    const url = new URL(href, "https://preview.invalid");
    url.searchParams.delete("preview");
    url.searchParams.sort();
    return `${url.pathname.replace(/\/$/, "")}?${url.searchParams.toString()}`;
  };
  return key(a) === key(b);
}

// These groups are consumed through per-page theme tokens. Other controls stay
// explicitly global until their storefront consumers support local overrides.
export const PAGE_STYLE_GROUPS = new Set(["colors", "buttons", "type", "layout", ...REGION_GROUPS.map(g => g.id)]);

const plainObject = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);
const sameValue = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Three-way merge of two Studio drafts that both started from `base` (e.g. two browser tabs).
 * Changes made on only one side are combined; a setting changed differently on both sides keeps
 * this tab's value and is reported in `conflicts` (paths like "heroPage.sections").
 */
export function mergeDesigns(base: any, local: any, server: any, depth = 0, path = "", prefer: "local" | "server" = "local"): { merged: any; conflicts: string[] } {
  const conflicts: string[] = [];
  const merged: Record<string, any> = {};
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(server || {})]);
  for (const key of keys) {
    const b = base?.[key], l = local?.[key], s = server?.[key];
    const at = path ? `${path}.${key}` : key;
    let value: any;
    if (sameValue(l, s) || sameValue(s, b)) value = l;
    else if (sameValue(l, b)) value = s;
    else if (depth < 1 && plainObject(l) && plainObject(s) && (b === undefined || plainObject(b))) {
      const inner = mergeDesigns(b || {}, l, s, depth + 1, at, prefer);
      value = inner.merged; conflicts.push(...inner.conflicts);
    } else { value = prefer === "server" ? s : l; conflicts.push(at); }
    if (value !== undefined) merged[key] = value;
  }
  return { merged, conflicts };
}

/**
 * The save-conflict dialog's two outcomes. Both keep every change only one side made: `mine` takes this tab's
 * value where both changed the same setting, `theirs` takes the other tab's value there.
 */
export function resolveSaveConflict(base: any, local: any, server: any): { mine: any; theirs: any; conflicts: string[] } {
  const mine = mergeDesigns(base, local, server);
  const theirs = mergeDesigns(base, local, server, 0, "", "server");
  return { mine: mine.merged, theirs: theirs.merged, conflicts: mine.conflicts };
}

/**
 * Studio 3.2 live sync: what to do when the working copy changes in another tab or device.
 * - ignore: not newer than what this tab already has (including this tab's own saves);
 * - rebase: same content, only the revision moved;
 * - adopt: nothing unsaved here, so their version simply comes in;
 * - merge: unsaved edits here touch different settings, so both can be combined;
 * - conflict: both changed the same settings (`merged` keeps this tab's value for those).
 */
export type RemoteChange =
  | { kind: "ignore" } | { kind: "rebase" } | { kind: "adopt" }
  | { kind: "merge"; merged: any } | { kind: "conflict"; merged: any; paths: string[] };
export function decideRemoteChange(input: { localRev: number; remote: { draft: any; rev: number }; design: any; savedDraft: any }): RemoteChange {
  const { localRev, remote, design, savedDraft } = input;
  if (!(remote.rev > localRev)) return { kind: "ignore" };
  if (sameDesign(remote.draft, savedDraft)) return { kind: "rebase" };
  if (sameDesign(design, savedDraft)) return { kind: "adopt" };
  const { merged, conflicts } = mergeDesigns(savedDraft, design, remote.draft);
  return conflicts.length ? { kind: "conflict", merged, paths: conflicts } : { kind: "merge", merged };
}
