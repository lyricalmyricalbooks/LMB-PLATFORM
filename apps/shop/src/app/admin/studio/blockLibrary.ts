// Block library 3.0 (Studio 3.0 phase 5): a clipboard for blocks, the choices the block picker offers, and the
// preview-only candidate block shown while the owner points at a choice. Pure helpers; StudioEditor owns the state.
import { freshBlockIds, insertBlockAfter, MAX_BLOCK_DEPTH, newId, type SharedBlock, type StudioBlock } from "./studioModel";
import { updateSectionsById } from "./studioWorkflow";

/** A copied block and the section type it came from (blocks only paste into sections of the same type, whose
 *  block fields are the same). */
export type BlockClip = { sectionType: string; block: StudioBlock };
/** Id of the block shown in the preview while the owner points at a picker choice. Never saved. */
export const BLOCK_CANDIDATE_ID = "__studio-block-candidate";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const copyBlock = (sectionType: string, block: StudioBlock): BlockClip => ({ sectionType, block: clone(block) });

export const canPasteBlock = (clip: BlockClip | null | undefined, sectionType: string | undefined): boolean =>
  Boolean(clip && sectionType && clip.sectionType === sectionType);

/** The blocks with a fresh copy of the clipboard block after `afterId` (or at the end), and the new block's id. A linked
 *  shared block stays linked; its placement (grid, responsive) comes along. */
export function pasteBlock(blocks: StudioBlock[], clip: BlockClip, afterId?: string | null): { list: StudioBlock[]; id: string } {
  const copy = freshBlockIds(clip.block);
  if (!clip.block.children) delete copy.children;
  return { list: afterId ? insertBlockAfter(blocks, afterId, copy) : [...blocks, copy], id: copy.id! };
}

const depthOf = (blocks: StudioBlock[], id: string, depth = 0): number => {
  for (const b of blocks || []) {
    if (b.id === id) return depth;
    const inner = depthOf(b.children || [], id, depth + 1);
    if (inner >= 0) return inner;
  }
  return -1;
};
const levels = (b: StudioBlock): number => 1 + Math.max(0, ...(b.children || []).map(levels));

/** Whether `block` can sit beside `afterId` without its inner blocks going deeper than blocks may nest (they would be
 *  dropped). A missing `afterId` means the top level. */
export function fitsAfter(blocks: StudioBlock[], afterId: string | null | undefined, block: StudioBlock): boolean {
  const at = afterId ? depthOf(blocks, afterId) : 0;
  return at >= 0 && at + levels(block) <= MAX_BLOCK_DEPTH;
}

/** Thumbnail drawing used for a choice (StudioBlockPicker). */
export type BlockThumb = "text" | "image" | "button" | "group" | "block" | "copy" | "shared" | "clipboard";
export type BlockChoice = {
  id: string;
  group: "New" | "Copy one already here" | "Shared blocks" | "Clipboard";
  label: string;
  hint: string;
  thumb: BlockThumb;
  /** The block to add (fresh ids every call). */
  make: () => StudioBlock;
};

/** The block kinds a Flexible composition can hold, with the fields its renderer reads (CompositionBlock). */
export const COMPOSITION_KINDS: { type: string; label: string; hint: string; defaults: Record<string, any> }[] = [
  { type: "text", label: "Text", hint: "A heading and a paragraph.", defaults: { type: "text", title: "New heading", body: "Add your words here." } },
  { type: "image", label: "Picture", hint: "A picture with an optional caption.", defaults: { type: "image", imageUrl: "", alt: "", title: "Picture caption" } },
  { type: "button", label: "Button", hint: "A button that links somewhere.", defaults: { type: "button", text: "Find out more", url: "" } },
  { type: "group", label: "Group", hint: "A box that holds other blocks.", defaults: { type: "group", title: "Group", children: [] } },
];

type Meta = { type: string; blockType?: string; blockDefaults?: Record<string, any>; blockLabel?: string } | undefined;

/** What the block picker offers for one section: new blocks, a copy of a block already here, compatible shared blocks
 *  (as linked placements) and the clipboard block. */
export function blockChoices(meta: Meta, opts: {
  existing?: StudioBlock[]; sharedBlocks?: SharedBlock[]; clip?: BlockClip | null;
  labelOf?: (block: StudioBlock, index: number) => string;
}): BlockChoice[] {
  if (!meta?.blockType) return [];
  const label = meta.blockLabel || "Block";
  const out: BlockChoice[] = [];
  if (meta.type === "CompositionSection") {
    for (const k of COMPOSITION_KINDS) out.push({ id: `new:${k.type}`, group: "New", label: k.label, hint: k.hint, thumb: k.type as BlockThumb, make: () => ({ ...clone(k.defaults), id: newId() }) });
  } else {
    out.push({ id: "new", group: "New", label: `New ${label.toLowerCase()}`, hint: "Starts with this section's sample words.", thumb: "block", make: () => ({ ...clone(meta.blockDefaults || {}), id: newId() }) });
  }
  (opts.existing || []).forEach((block, i) => {
    const name = opts.labelOf?.(block, i) || `${label} ${i + 1}`;
    out.push({ id: `copy:${block.id}`, group: "Copy one already here", label: `Copy of ${name}`, hint: block.sharedBlockId ? "Stays linked to its shared block." : "Same words and settings, ready to change.", thumb: "copy", make: () => freshBlockIds(block) });
  });
  for (const shared of opts.sharedBlocks || []) {
    if (shared.sectionType && shared.sectionType !== meta.type) continue;
    out.push({ id: `shared:${shared.id}`, group: "Shared blocks", label: shared.name, hint: "Linked: editing it changes every place it's used.", thumb: "shared", make: () => ({ id: newId(), sharedBlockId: shared.id }) });
  }
  if (canPasteBlock(opts.clip, meta.type)) {
    const clip = opts.clip!;
    out.push({ id: "clipboard", group: "Clipboard", label: "Paste copied block", hint: "The block you copied with Copy block.", thumb: "clipboard", make: () => pasteBlock([], clip).list[0] });
  }
  return out;
}

/** The design with a preview-only candidate block appended to one section (never saved; mirrors sectionLibrary's
 *  withCandidate for sections). Same design when the section isn't found. */
export function withBlockCandidate(design: any, sectionId: string, key: string, block: StudioBlock): any {
  return updateSectionsById(design, [sectionId], s => {
    const list = s.settings?.[key] || s.settings?.blocks || [];
    return { ...s, settings: { ...s.settings, [key]: [...list, { ...block, id: BLOCK_CANDIDATE_ID }] } };
  });
}
