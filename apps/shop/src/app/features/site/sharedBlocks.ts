// Linked shared blocks ("Save as linked shared block" in Studio): a section stores a small
// stub `{ id, sharedBlockId, grid?, responsive? }` and the content comes from
// `design.sharedBlocks`. Storefront-safe (no admin imports) so every renderer can use it.

export type StudioBlock = {
  id: string;
  type?: "group" | "text" | "image" | "button";
  children?: StudioBlock[];
  sharedBlockId?: string;
  responsive?: Record<"desktop" | "tablet" | "mobile", Record<string, any>>;
  grid?: Record<"desktop" | "tablet" | "mobile", Record<string, number>>;
  [key: string]: any;
};
export type SharedBlock = { id: string; name: string; sectionType?: string; block: StudioBlock; updatedAt: string };

export const MAX_BLOCK_DEPTH = 3;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

/** Normalizes legacy flat blocks and recursive composition blocks without mutating. */
export function normalizeBlocks(blocks: any[], parent = "block", depth = 0): StudioBlock[] {
  if (!Array.isArray(blocks) || depth >= MAX_BLOCK_DEPTH) return [];
  const kept = blocks.filter(b => b && typeof b === "object");
  let same = kept.length === blocks.length;
  const out = kept.map((block, index) => {
    const id = block.id || `${parent}-${index}`;
    const children = normalizeBlocks(block.children, id, depth + 1);
    // Already normal: keep the very same object, so unchanged blocks keep their identity between edits (Phase 4).
    if (block.id && (children.length ? children === block.children : block.children === undefined)) return block;
    same = false;
    return { ...block, id, ...(children.length ? { children } : { children: undefined }) };
  });
  return same && out.every((b, i) => b === kept[i]) ? blocks : out;
}

/** Linked shared blocks inherit source content while keeping placement/layout overrides. */
export function resolveSharedBlocks(blocks: StudioBlock[], library: SharedBlock[] = [], depth = 0): StudioBlock[] {
  if (depth >= MAX_BLOCK_DEPTH) return [];
  return normalizeBlocks(blocks, "block", depth).map(block => {
    const source = block.sharedBlockId ? library.find(item => item.id === block.sharedBlockId)?.block : undefined;
    const merged = source ? { ...clone(source), ...block, id: block.id, sharedBlockId: block.sharedBlockId,
      children: block.children ?? source.children } : block;
    return { ...merged, children: resolveSharedBlocks(merged.children || [], library, depth + 1) };
  });
}

const hasLinkedBlock = (list: any[]): boolean =>
  list.some(item => item && typeof item === "object" && (item.sharedBlockId || (Array.isArray(item.children) && hasLinkedBlock(item.children))));

/**
 * Resolves linked blocks in every block list of a section's settings (items, slides, blocks…),
 * so any block-based section shows the shared content. Lists without links are returned as-is.
 */
export function resolveSectionSharedBlocks(settings: any, library: SharedBlock[] = []): any {
  if (!library.length || !settings) return settings;
  let next = settings;
  for (const [key, value] of Object.entries(settings)) {
    if (!Array.isArray(value) || key.startsWith("__") || !hasLinkedBlock(value)) continue;
    if (next === settings) next = { ...settings };
    next[key] = resolveSharedBlocks(value, library);
  }
  return next;
}
