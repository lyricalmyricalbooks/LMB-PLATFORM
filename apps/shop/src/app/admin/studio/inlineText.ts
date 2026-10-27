import { sanitizeRichText } from "./richText";
import { mapBlock, patchSectionSettings, MAX_BLOCK_DEPTH, type Section } from "./studioModel";
import { findSectionOwner, writeSections } from "./studioWorkflow";

export const INLINE_STYLE_KEYS = ["announcementText", "catalogMastheadText", "logoText", "wordmarkPrimary", "wordmarkSecondary"];

export type InlineTextAction = { kind: "section" | "copy" | "style"; key: string; value: string; format?: "html"; sectionId?: string; blockId?: string };
type Field = { key: string; kind: string };
export type InlineTextSchema = {
  sectionFields: (type: string) => Field[]; blockFields: (type: string) => Field[];
  blocksKey: (type: string) => string; copyKeys: string[]; styleKeys: string[];
  applyStyle: (design: any, key: string, value: string) => any;
};

/** Validate and commit one preview edit against the latest draft, never a captured whole-design copy. */
export function applyInlineText(design: any, action: InlineTextAction, schema: InlineTextSchema): any {
  if (!action || typeof action.value !== "string" || typeof action.key !== "string") return design;
  if (action.kind === "copy") return schema.copyKeys.includes(action.key)
    ? schema.applyStyle(design, "copy." + action.key, action.value) : design;
  if (action.kind === "style") return schema.styleKeys.includes(action.key)
    ? schema.applyStyle(design, action.key, action.value) : design;
  if (action.kind !== "section" || !action.sectionId) return design;
  const owner = findSectionOwner(design, action.sectionId);
  if (!owner) return design;
  const fields = action.blockId ? schema.blockFields(owner.section.type) : schema.sectionFields(owner.section.type);
  if (!fields.some(f => f.key === action.key && (action.format === "html" ? f.kind === "html" || f.kind === "richtext" : f.kind === "text" || f.kind === "textarea"))) return design;
  const value = action.format === "html" ? sanitizeRichText(action.value) : action.value;
  let sections: Section[];
  if (action.blockId) {
    const key = schema.blocksKey(owner.section.type);
    const blocks = owner.section.settings[key] || owner.section.settings.blocks || [];
    // Walk the rendered inheritance tree, carrying the source that actually owns each child.
    const library = design.sharedBlocks || [];
    type Target = { sourceId?: string; root: boolean; blockId: string };
    const locate = (list: any[], sourceId?: string, depth = 0): Target | undefined => {
      if (depth >= MAX_BLOCK_DEPTH) return;
      for (const block of list) {
        const source = block.sharedBlockId ? library.find((s: any) => s.id === block.sharedBlockId) : undefined;
        if (block.id === action.blockId) return source
          ? { sourceId: source.id, root: true, blockId: source.block.id }
          : { sourceId, root: false, blockId: block.id };
        const inherited = block.children == null && source;
        const found = locate(block.children ?? source?.block.children ?? [], inherited ? source.id : sourceId, depth + 1);
        if (found) return found;
      }
    };
    const target = locate(blocks);
    if (!target) return design;
    if (target.sourceId) return { ...design, sharedBlocks: library.map((s: any) => s.id === target.sourceId
      ? { ...s, block: target.root ? { ...s.block, [action.key]: value }
        : { ...s.block, children: mapBlock(s.block.children || [], target.blockId, b => ({ ...b, [action.key]: value })) } } : s) };
    sections = patchSectionSettings(owner.sections, action.sectionId, { [key]: mapBlock(blocks, action.blockId, b => ({ ...b, [action.key]: value })) });
  } else sections = patchSectionSettings(owner.sections, action.sectionId, { [action.key]: value });
  return writeSections(design, owner.surface, sections);
}
