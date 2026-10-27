import { displayValue } from "../../features/site/dynamicSources";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRightLeft, Check, ChevronDown, Copy, Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import { SortableList, SortableRow } from "../dndSortable";
import { getBlocksKey, getBlockFields, getSectionMeta } from "../ThemeEditorExtensions";
import { IconButton, SecondaryButton } from "../riso/components";
import { addChildBlock, mapBlock, newId, type Section, type StudioBlock } from "./studioModel";
import { outlineMatches } from "./studioNavigation";
import { updateBlocks } from "./studioWorkflow";
import { sectionPreviewNote } from "./sectionStatus";
import type { SharedBlock } from "../../features/site/sharedBlocks";

/** Extra list tools the editor provides (menus, copy/paste, moving, bulk actions). */
export type OutlineActions = {
  copy: (id: string) => void; paste: (afterId: string) => void; canPaste: boolean;
  copyStyle: (id: string) => void; pasteStyle: (ids: string[]) => void; canPasteStyle: boolean;
  moveToPage: (ids: string[]) => void; saveForReuse: (id: string) => void;
  setVisible: (ids: string[], visible: boolean) => void; remove: (ids: string[]) => void;
  moveBlock: (sectionId: string, blockId: string) => void;
};

/** What a block is, in plain words, for blocks that carry a kind (the Flexible composition ones). */
const BLOCK_KIND_NAMES: Record<string, string> = { text: "Text", image: "Picture", button: "Button", group: "Group" };

// The words the owner typed name the row: a plan's name, a stat's number + label, a testimonial's quote…
const blockWords = (block: any) => {
  const stat = block.value && block.label ? `${displayValue(block.value)} ${displayValue(block.label)}` : "";
  return displayValue(block.title || block.planName || block.question || block.heading || block.name || stat || block.label
    || block.quote || block.caption || block.author || block.alt || block.text || block.note);
};

export function blockLabel(block: any, index: number, fallback = "Block") {
  return String(blockWords(block) || `${fallback} ${index + 1}`);
}

/** A linked shared block's row reads its source's words (else the shared block's name), not "Column 2". */
export function outlineBlockLabel(block: any, index: number, fallback: string, library: SharedBlock[] = []) {
  const source = block?.sharedBlockId ? library.find(item => item.id === block.sharedBlockId) : undefined;
  if (!source) return blockLabel(block, index, fallback);
  return String(blockWords({ ...source.block, ...block }) || source.name || `${fallback} ${index + 1}`);
}

function NestedBlocks({ blocks, section, depth, selectedId, blockId, label, onSelect, onChange, onMoveBlock, library = [] }: {
  blocks: StudioBlock[]; section: Section; depth: number; selectedId: string | null; blockId: string | null;
  label: string; onSelect: (sectionId: string, blockId?: string) => void; onChange: (next: StudioBlock[]) => void;
  onMoveBlock?: (sectionId: string, blockId: string) => void;
  /** design.sharedBlocks, for naming linked placements. */
  library?: SharedBlock[];
}) {
  if (depth >= 3) return null;
  const nameOf = (block: any, i: number, fallback = label) => outlineBlockLabel(block, i, fallback, library);
  return <div className="studio-blocks" data-depth={depth}>
    <SortableList items={blocks} getId={(b: any) => b.id} onReorder={onChange}>
      {blocks.map((block: StudioBlock, i: number) => <SortableRow key={block.id} id={block.id}>
        {({ handleProps }) => <>
          <div className="studio-tree-row" data-selected={selectedId === section.id && blockId === block.id} data-hidden={block.hidden}>
            <button {...handleProps} className="studio-grip" title="Drag to reorder this block" aria-label={`Reorder ${nameOf(block, i, "Block")}`}><GripVertical size={13} /></button>
            <button className="studio-tree-label" aria-current={selectedId === section.id && blockId === block.id} onClick={() => onSelect(section.id, block.id)}>
              {nameOf(block, i)}<small>{block.sharedBlockId ? "Reusable block" : BLOCK_KIND_NAMES[block.type ?? ""] || label}{block.children?.length ? ` · ${block.children.length} children` : ""}</small>
            </button>
            <IconButton label={block.hidden ? "Show block" : "Hide block"} onClick={() => onChange(mapBlock(blocks, block.id, b => ({ ...b, hidden: !b.hidden })))}>{block.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</IconButton>
            {onMoveBlock && <IconButton label={`Move ${nameOf(block, i)} to another section`} onClick={() => onMoveBlock(section.id, block.id)}><ArrowRightLeft size={13} /></IconButton>}
          </div>
          {block.children?.length ? <NestedBlocks blocks={block.children} section={section} depth={depth + 1} selectedId={selectedId} blockId={blockId} label={label} onSelect={onSelect} onMoveBlock={onMoveBlock} library={library}
            onChange={children => onChange(mapBlock(blocks, block.id, b => ({ ...b, children })))} /> : null}
          {depth < 2 && block.type === "group" && <button className="studio-insert" onClick={() => {
            const child: StudioBlock = { id: newId(), type: "text", title: "New nested block", body: "" };
            onChange(addChildBlock(blocks, block.id, child)); onSelect(section.id, child.id);
          }}><Plus size={12} /> Add inside {nameOf(block, i)}</button>}
        </>}
      </SortableRow>)}
    </SortableList>
  </div>;
}

export function StudioOutline({ sections, selectedId, blockId, onSelect, onReorder, onPatch, onAdd, onAddBlock, onDuplicate, onDelete, onToggle, hoveredId, onHover, onRename, actions, device = "desktop", sharedBlocks = [], templateId = "" }: {
  sections: Section[]; selectedId: string | null; blockId: string | null;
  /** The previewed size, so rows can say when a section is hidden there (or scheduled) and so missing from the preview. */
  device?: string;
  /** design.sharedBlocks (linked block names) and the open page template (preview notes). */
  sharedBlocks?: SharedBlock[]; templateId?: string;
  onSelect: (sectionId: string, blockId?: string) => void;
  onReorder: (sections: Section[]) => void; onPatch: (id: string, patch: any) => void;
  onAdd: (index: number) => void; onDuplicate: (id: string) => void;
  /** Opens the block picker for a section (Block library 3.0); without it, Add block adds the section's default block. */
  onAddBlock?: (sectionId: string) => void;
  onDelete: (id: string) => void; onToggle: (id: string) => void;
  /** Section the pointer is over in the preview, and hover reporting back to it. */
  hoveredId?: string | null; onHover?: (sectionId: string | null) => void;
  onRename?: (id: string) => void;
  actions?: OutlineActions;
}) {
  // Sections picked for bulk actions (Ctrl/⌘-click, Shift-click for a range, or "Select" in a row's menu).
  const [picked, setPicked] = useState<string[]>([]);
  const lastPick = useRef<string | null>(null);
  useEffect(() => { setPicked(p => p.filter(id => sections.some(s => s.id === id))); }, [sections]);
  const pick = (id: string, range: boolean) => setPicked(prev => {
    if (range && lastPick.current) {
      // While searching, a range covers only the rows on screen, never hidden sections in between.
      const rows = visibleRows();
      const a = rows.findIndex(s => s.id === lastPick.current), b = rows.findIndex(s => s.id === id);
      if (a >= 0 && b >= 0) { const span = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map(s => s.id); return [...new Set([...prev, ...span])]; }
    }
    lastPick.current = id;
    return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
  });
  const menus = useRef(new Map<string, HTMLDetailsElement>());
  // A row's ··· menu closes when the owner clicks anywhere outside it.
  useEffect(() => {
    const close = (e: PointerEvent) => {
      for (const menu of menus.current.values()) if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const openMenu = (id: string, e: MouseEvent) => {
    const menu = menus.current.get(id); if (!menu) return;
    e.preventDefault(); menu.open = true; menu.querySelector<HTMLButtonElement>("div button")?.focus();
  };
  const [query, setQuery] = useState("");
  const searching = Boolean(query.trim());
  const matches = sections.filter(s => outlineMatches(s, query, getSectionMeta(s.type)?.label));
  function visibleRows() { return searching ? matches : sections; }
  const previousSelection = useRef(selectedId);
  useEffect(() => {
    if (previousSelection.current === selectedId) return;
    previousSelection.current = selectedId;
    const selected = sections.find(s => s.id === selectedId);
    if (selected && !outlineMatches(selected, query, getSectionMeta(selected.type)?.label)) setQuery("");
  }, [selectedId, sections, query]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => { if (selectedId && blockId) setExpanded(prev => new Set([...prev, selectedId])); }, [selectedId, blockId]);
  const insert = (index: number) => <button className="studio-insert" onClick={() => onAdd(index)} aria-label={`Add section at position ${index + 1}`}><Plus size={12} /> Add section here</button>;
  return <div className="studio-outline">
    <div className="studio-outline-tools">
      <input className="studio-search" aria-label="Search sections and blocks" placeholder="Find a section or block…" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="studio-outline-controls"><span role="status">{matches.length} of {sections.length} sections</span>
        <button onClick={() => setExpanded(new Set(sections.map(s => s.id)))}>Expand all</button>
        <button onClick={() => { setQuery(""); setExpanded(new Set()); }}>Collapse all</button>
      </div>
      {searching && <><p className="studio-hint">Matching sections include their blocks. Clear search to reorder the full page.</p><button className="studio-reset" onClick={() => setQuery("")}>Clear search</button></>}
    </div>
    {actions && picked.length > 0 && <div className="studio-bulk-bar" role="toolbar" aria-label="Selected sections">
      <strong>{picked.length} selected</strong>
      <button onClick={() => actions.setVisible(picked, false)}>Hide</button>
      <button onClick={() => actions.setVisible(picked, true)}>Show</button>
      {actions.canPasteStyle && <button onClick={() => actions.pasteStyle(picked)}>Paste style</button>}
      <button onClick={() => actions.moveToPage(picked)}>Move to page…</button>
      <button onClick={() => { actions.remove(picked); setPicked([]); }}>Delete</button>
      <button onClick={() => setPicked(visibleRows().map(s => s.id))}>Select all</button>
      <button onClick={() => setPicked([])}>Clear</button>
    </div>}
    <p className="studio-hint">Drag a handle to reorder. Right-click a section for more actions; Ctrl/⌘-click to pick several.</p>
    {sections.length >= 25 && <p role="status" className="studio-hint">{sections.length} sections — consider fewer sections for a faster page.</p>}
    {!searching && insert(0)}
    <SortableList items={sections} getId={s => s.id} onReorder={next => { if (!searching) onReorder(next); }}>
      {sections.map((section, index) => {
        if (!outlineMatches(section, query, getSectionMeta(section.type)?.label)) return null;
        const meta = getSectionMeta(section.type);
        const key = getBlocksKey(section.type);
        const blocks = section.settings[key] || section.settings.blocks || [];
        const supportsBlocks = Boolean(meta?.blockType && getBlockFields(section.type).length);
        const open = searching || expanded.has(section.id);
        const patchBlocks = (fn: (blocks: any[]) => any[]) => onPatch(section.id, updateBlocks(section, key, fn));
        return <div key={section.id}>
          <SortableRow id={section.id} className="studio-tree-section">
            {({ handleProps }) => <>
              <div className="studio-tree-row" data-selected={selectedId === section.id && !blockId} data-hidden={section.visible === false}
                data-picked={picked.includes(section.id) || undefined}
                data-hovered={hoveredId === section.id} onMouseEnter={() => onHover?.(section.id)} onMouseLeave={() => onHover?.(null)}
                onContextMenu={e => openMenu(section.id, e)}>
                <button {...(searching ? {} : handleProps)} disabled={searching} className="studio-grip" title={searching ? "Clear the search to reorder sections" : "Drag to reorder this section"} aria-label={`Reorder ${meta?.label || "section"}`}><GripVertical size={15} /></button>
                {supportsBlocks && <button className="studio-expand" aria-label={`Expand ${meta?.label}`} aria-expanded={open} disabled={searching}
                  title={searching ? "Matching sections stay open while you search" : open ? "Hide this section's blocks" : "Show this section's blocks"} onClick={() => setExpanded(prev => {
                  const next = new Set(prev); next.has(section.id) ? next.delete(section.id) : next.add(section.id); return next;
                })}><ChevronDown size={14} style={{ transform: open ? undefined : "rotate(-90deg)" }} /></button>}
                <button className="studio-tree-label" aria-current={selectedId === section.id && !blockId} aria-pressed={actions ? picked.includes(section.id) : undefined}
                  onClick={e => { if (actions && (e.ctrlKey || e.metaKey || e.shiftKey)) { e.preventDefault(); pick(section.id, e.shiftKey); return; } setPicked([]); onSelect(section.id); }}>
                  <strong>{picked.includes(section.id) && <Check size={12} className="studio-picked-mark" aria-hidden="true" />}{index + 1}. {(section as any).label || meta?.label || "Section"}</strong>
                  <small>{section.visible === false ? "Hidden · " : sectionPreviewNote(section, device, undefined, templateId) ? `${sectionPreviewNote(section, device, undefined, templateId)} · ` : ""}{(section as any).label ? `${meta?.label || "Section"} · ` : ""}{section.type === "PageContentSection" ? "This page's title and text (written in Pages)" : displayValue(section.settings.title || section.settings.heading) || (supportsBlocks ? `${blocks.length} blocks` : "Section")}</small>
                </button>
                <IconButton label={section.visible === false ? "Show section" : "Hide section"} onClick={() => onToggle(section.id)}>{section.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}</IconButton>
                <details className="studio-row-menu" ref={el => { if (el) menus.current.set(section.id, el); else menus.current.delete(section.id); }}
                  onKeyDown={e => {
                    if (e.key !== "Escape") return;
                    const menu = e.currentTarget as HTMLDetailsElement;
                    menu.open = false; menu.querySelector<HTMLElement>("summary")?.focus();
                  }}
                  onClick={e => { if ((e.target as HTMLElement).closest("div button")) (e.currentTarget as HTMLDetailsElement).open = false; }}>
                  <summary title="More actions: move, rename, duplicate, copy, remove" aria-label={`Actions for ${(section as any).label || meta?.label}`}>···</summary><div>
                  {!searching && <>
                    <button disabled={index === 0} onClick={() => {
                      const next = [...sections]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onReorder(next);
                    }}>Move up</button>
                    <button disabled={index === sections.length - 1} onClick={() => {
                      const next = [...sections]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onReorder(next);
                    }}>Move down</button>
                  </>}
                  {onRename && <button onClick={() => onRename(section.id)}>Rename</button>}
                  <button onClick={() => onDuplicate(section.id)}><Copy size={13} /> Duplicate</button>
                  {actions && <>
                    <button onClick={() => actions.copy(section.id)}>Copy section</button>
                    {actions.canPaste && <button onClick={() => actions.paste(section.id)}>Paste copied section below</button>}
                    <button onClick={() => actions.copyStyle(section.id)}>Copy style</button>
                    {actions.canPasteStyle && <button onClick={() => actions.pasteStyle([section.id])}>Paste style</button>}
                    <button onClick={() => actions.moveToPage([section.id])}><ArrowRightLeft size={13} /> Move to another page…</button>
                    <button onClick={() => actions.saveForReuse(section.id)}>Save for reuse</button>
                    <button onClick={() => pick(section.id, false)}>{picked.includes(section.id) ? "Unselect" : "Select for bulk actions"}</button>
                  </>}
                  <button onClick={() => onDelete(section.id)}><Trash2 size={13} /> Remove</button>
                </div></details>
              </div>
              {supportsBlocks && open && <div>
                {!blocks.length && <p className="studio-hint" data-empty-blocks>This section has no {(meta?.blockLabel || "block").toLowerCase()}s yet, so it shows nothing on the shop. Add one below.</p>}
                <NestedBlocks blocks={blocks} section={section} depth={0} selectedId={selectedId} blockId={blockId} label={meta?.blockLabel || "Block"} onSelect={onSelect} onChange={next => patchBlocks(() => next)} onMoveBlock={actions?.moveBlock} library={sharedBlocks} />
                <SecondaryButton onClick={() => {
                  if (onAddBlock) { onAddBlock(section.id); return; }
                  const block = { ...JSON.parse(JSON.stringify(meta?.blockDefaults || {})), id: newId() };
                  patchBlocks(list => [...list, block]); onSelect(section.id, block.id);
                }}><Plus size={13} /> Add {meta?.blockLabel || "block"}</SecondaryButton>
              </div>}
            </>}
          </SortableRow>
          {!searching && insert(index + 1)}
        </div>;
      })}
    </SortableList>
    {searching && !matches.length && <p className="studio-empty">No sections or blocks match “{query}”.</p>}
    {!sections.length && <p className="studio-empty">Start with a section. Your page’s built-in content remains available.</p>}
  </div>;
}
