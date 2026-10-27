import { StudioSpacingControls } from "./StudioSpacingControls";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Trash2, X } from "lucide-react";
import { uploadStudioImage } from "./mediaUpload";
import { ConnectableField } from "./StudioConnect";
import { BlockFieldEditor, BlockListFieldEditor, getBlockFields, getBlocksKey, getSectionFields, getSectionMeta, SectionFieldEditor } from "../ThemeEditorExtensions";
import { SECTION_TABS, sectionStyleFields, type SectionTab } from "./sectionStyleSchema";
import { StudioSectionStyle } from "./StudioSectionStyle";
import { IconButton, useFocusTrap, usePrompt } from "../riso/components";
import { findBlock, freshBlockIds, insertBlockAfter, mapBlock, removeBlock, resolveSharedBlocks, type Section, type SharedBlock } from "./studioModel";
import { updateBlocks } from "./studioWorkflow";
import { blockLabel } from "./StudioOutline";
import { autoFitSection, resetPhoneLayout } from "./autoMobile";
import { layerOrder, setBlockGrid, shiftLayer } from "./gridPlacement";
import { blockMoveRoom, HIDE_DEVICES, moveBlockBy, tabAfterSelection, withDeviceHidden, type InspectorTab } from "./inspectorState";

export function StudioInspector({ section, blockId, colorSchemes, device, sharedBlocks, onSaveShared, onPatchShared, onInsertShared, onPatch, onSelectBlock, onDuplicate, onDelete, onToggle, onClose, onNotice, onMoveSection, sectionRoom, arranging = false, onArrange, onReplayMotion, onAddBlock, onCopyBlock, canPasteBlock = false, onPasteBlock }: {
  section: Section; blockId: string | null; colorSchemes: any[];
  device: "desktop" | "tablet" | "mobile"; sharedBlocks: SharedBlock[];
  onSaveShared: (blockId: string, name: string) => void; onInsertShared: (shared: SharedBlock) => void;
  onPatchShared: (sharedId: string, patch: Record<string, any>) => void;
  onPatch: (patch: Record<string, any>, meta?: { label: string }) => void; onSelectBlock: (id: string | null) => void;
  onDuplicate: () => void; onDelete: () => void; onToggle: () => void; onClose: () => void;
  onNotice?: (text: string) => void;
  /** Move the section one place up/down on its page, and whether there is room to (Move up / Move down buttons). */
  onMoveSection?: (direction: -1 | 1) => void; sectionRoom?: { up: boolean; down: boolean };
  /** Flexible composition: whether its blocks are being arranged on the preview's grid (3.0 phase 3). */
  arranging?: boolean; onArrange?: (on: boolean) => void;
  /** Plays this section's motion again in the preview (3.0 phase 4). */
  onReplayMotion?: () => void;
  /** Block library 3.0: open the block picker, copy a block, and paste the copied block (after a block, or at the end). */
  onAddBlock?: () => void; onCopyBlock?: (blockId: string) => void; canPasteBlock?: boolean; onPasteBlock?: (afterId: string | null) => void;
}) {
  const [sectionTab, setTab] = useState<"content" | SectionTab>("content");
  const [askText, promptNode] = usePrompt();
  const [search, setSearch] = useState("");
  // Docked in its own resizable panel on tablets and desktops; a full-screen sheet on phones.
  const [overlay, setOverlay] = useState(() => !!window.matchMedia?.("(max-width: 767px)").matches);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 767px)");
    if (!media) return;
    const update = () => setOverlay(media.matches); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useFocusTrap(ref, overlay, onClose);
  // The chosen tab sticks when another section of the same kind is selected; a different kind (or an unknown tab) starts on Content.
  const lastType = useRef(section.type);
  useEffect(() => {
    setTab(cur => tabAfterSelection(cur, lastType.current, section.type) as "content" | SectionTab);
    lastType.current = section.type;
  }, [section.id, section.type]);
  useEffect(() => { setSearch(""); }, [section.id, blockId]);
  const styleFields = useMemo(() => sectionStyleFields(colorSchemes), [colorSchemes]);
  const meta = getSectionMeta(section.type);
  const key = getBlocksKey(section.type);
  const blocks = section.settings[key] || section.settings.blocks || [];
  const placement = blockId ? findBlock(blocks, blockId) : undefined;
  const block = placement ? resolveSharedBlocks([placement], sharedBlocks)[0] : undefined;
  // A selected block always shows its Content; the section's tab is remembered for when the owner goes back.
  const tab: InspectorTab = block ? "content" : sectionTab;
  const fields = (block ? getBlockFields(section.type) : getSectionFields(section.type)).filter(f => `${f.label} ${f.key}`.toLowerCase().includes(search.toLowerCase()));
  const patchBlock = (patch: any) => {
    if (placement?.sharedBlockId && !Object.keys(patch).some(k => k === "grid" || k === "responsive" || k === "hidden")) onPatchShared(placement.sharedBlockId, patch);
    else if (block) onPatch(updateBlocks(section, key, list => mapBlock(list, block.id, b => ({ ...b, ...patch }))));
  };
  const patchResponsive = (group: "responsive" | "grid", field: string, value: any) => patchBlock({
    [group]: { ...(block?.[group] || {}), [device]: { ...(block?.[group]?.[device] || {}), [field]: value } },
  });
  const fitPhone = (overwrite: boolean) => {
    const r = autoFitSection(section, overwrite);
    if (!Object.keys(r.value).length) { onNotice?.(r.changes.length ? `${r.changes[0]}. Nothing else needed changing.` : "This section already looks right on phones — nothing to change."); return; }
    onPatch(r.value);
    onNotice?.(`Phone layout updated: ${r.changes.join("; ")}. Switch to the phone preview to check it; Undo (Ctrl+Z) reverts.`);
  };
  const resetPhone = () => {
    const patch = resetPhoneLayout(section);
    if (!Object.keys(patch).length) { onNotice?.("This section has nothing set just for phones or tablets."); return; }
    onPatch(patch);
    onNotice?.("Phone and tablet adjustments removed from this section.");
  };
  /** Turns a linked placement into an ordinary block holding the shared content, so later edits stay here. */
  const makeIndependent = () => {
    if (!placement?.sharedBlockId) return;
    const source = sharedBlocks.find(s => s.id === placement.sharedBlockId)?.block;
    if (!source) { onNotice?.("Its shared source is missing, so there's no content to copy into it."); return; }
    const { sharedBlockId: _link, ...own } = placement;
    const copy: any = { ...JSON.parse(JSON.stringify(source)), ...own, id: placement.id };
    delete copy.sharedBlockId;
    // Children inherited from the source get their own ids (other placements show the same source children).
    if (!placement.children && Array.isArray(source.children)) copy.children = source.children.map(freshBlockIds);
    onPatch(updateBlocks(section, key, list => mapBlock(list, placement.id, () => copy)));
    onNotice?.("This block no longer syncs: editing it no longer changes the reusable block. Undo (Ctrl+Z) links it again.");
  };
  const title = block ? blockLabel(block, Math.max(0, blocks.findIndex((b: any) => b.id === blockId)), meta?.blockLabel) : meta?.label || "Section";
  return <aside ref={ref} className="studio-inspector" role={overlay ? "dialog" : undefined} aria-modal={overlay || undefined} aria-label="Content settings" tabIndex={-1}>
    {promptNode}
    <header className="studio-inspector-head">
      <div><small>{block ? `${meta?.label || "Section"} / Block` : "SECTION"}</small><h2>{title}</h2></div>
      <IconButton label="Close settings" onClick={onClose}><X size={17} /></IconButton>
    </header>
    <div className="studio-edit-context" role="status">
      <strong>{device === "mobile" ? "Phone" : device === "tablet" ? "Tablet" : "Desktop"} preview</strong>
      <span>Words and pictures are the same on every screen. Layout changes here apply to this screen size only.</span>
    </div>
    <div className="studio-inspector-actions">
      {block && <IconButton label="Back to section" onClick={() => onSelectBlock(null)}><ArrowLeft size={15} /></IconButton>}
      <IconButton label={block ? (block.hidden ? "Show block" : "Hide block") : section.visible === false ? "Show section" : "Hide section"} onClick={block ? () => patchBlock({ hidden: !block.hidden }) : onToggle}>{(block ? block.hidden : section.visible === false) ? <EyeOff size={15} /> : <Eye size={15} />}</IconButton>
      {(block ? true : !!onMoveSection) && (() => {
        const room = block ? blockMoveRoom(blocks, block.id) : sectionRoom || { up: false, down: false };
        const move = (d: -1 | 1) => block ? onPatch(updateBlocks(section, key, list => moveBlockBy(list, block.id, d)), { label: `Move ${meta?.blockLabel || "block"} ${d < 0 ? "up" : "down"}` }) : onMoveSection?.(d);
        return <>
          <IconButton label="Move up" disabled={!room.up} onClick={() => move(-1)}><ChevronUp size={15} /></IconButton>
          <IconButton label="Move down" disabled={!room.down} onClick={() => move(1)}><ChevronDown size={15} /></IconButton>
        </>;
      })()}
      <IconButton label={block ? "Duplicate block" : "Duplicate section"} onClick={block && placement ? () => {
        // Copy the stored placement (a linked block stays linked) and put it right after the original, in the same group.
        const copy = freshBlockIds(placement);
        onPatch(updateBlocks(section, key, list => insertBlockAfter(list, placement.id, copy)));
        onSelectBlock(copy.id);
      } : onDuplicate}><Copy size={15} /></IconButton>
      <IconButton label={block ? "Remove block" : "Delete section"} tone="danger" onClick={block ? () => {
        onPatch(updateBlocks(section, key, list => removeBlock(list, block.id))); onSelectBlock(null);
        onNotice?.("Block removed. Press Ctrl/Cmd+Z to bring it back.");
      } : onDelete}><Trash2 size={15} /></IconButton>
      <small>{(block ? block.hidden : section.visible === false) ? "Hidden on storefront" : "Visible on storefront"}</small>
    </div>
    {!block && <div className="studio-tabs" role="tablist" aria-label="Section settings">
      {SECTION_TABS.map(t => <button role="tab" aria-selected={tab === t.id} key={t.id} onClick={() => { setTab(t.id); setSearch(""); }}>{t.label}</button>)}
    </div>}
    <div className="studio-inspector-body">
      {(tab === "content" || tab === "style") && <input className="studio-search" aria-label={`Search ${tab} settings`} placeholder="Find a setting…" value={search} onChange={e => setSearch(e.target.value)} />}
      {tab === "content" && <>
        {(onAddBlock || onCopyBlock || onPasteBlock) && meta?.blockType && !search && <div className="studio-control-card" data-studio-panel="block-clipboard">
          <strong>{block ? "This block" : meta?.blockLabel ? `${meta.blockLabel}s` : "Blocks"}</strong>
          <div className="studio-inline-actions">
            {!block && onAddBlock && <button className="studio-link-button" onClick={onAddBlock}>Add block…</button>}
            {block && onCopyBlock && <button className="studio-link-button" onClick={() => onCopyBlock(block.id)}>Copy block</button>}
            {onPasteBlock && <button className="studio-link-button" disabled={!canPasteBlock} title={canPasteBlock ? undefined : "Copy a block from a section of this kind first"}
              onClick={() => onPasteBlock(block ? block.id : null)}>{block ? "Paste copied block after this one" : "Paste copied block"}</button>}
          </div>
        </div>}
        {!block && section.type === "CompositionSection" && <div className="studio-control-card" data-studio-panel="grid-arrange">
          <strong>Arrange on the page · {device}</strong>
          <p className="studio-hint">Drag blocks on the grid in the preview to move them; drag a block's corner to resize it. Arrow keys move the focused block one cell, Shift + arrows resize it. Placement is kept for each screen size.</p>
          {onArrange && <button className="studio-link-button" aria-pressed={arranging} onClick={() => onArrange(!arranging)}>{arranging ? "Stop arranging" : "Arrange on page"}</button>}
          {blocks.length > 1 && <>
            <strong>Layers (front first)</strong>
            <ol className="studio-layers" aria-label="Layers, front first">
              {layerOrder(blocks, device).map((b: any) => {
                const forward = shiftLayer(blocks, b.id, device, "forward"), back = shiftLayer(blocks, b.id, device, "back");
                const setZ = (z: number | null) => z != null && onPatch(updateBlocks(section, key, list => setBlockGrid(list, b.id, device, { z })));
                return <li key={b.id}>
                  <button className="studio-link-button" onClick={() => onSelectBlock(b.id)}>{blockLabel(b, blocks.indexOf(b), meta?.blockLabel)}</button>
                  <button className="studio-link-button" disabled={forward == null} onClick={() => setZ(forward)}>Bring forward</button>
                  <button className="studio-link-button" disabled={back == null} onClick={() => setZ(back)}>Send back</button>
                </li>;
              })}
            </ol>
          </>}
        </div>}
        {!fields.length && <p className="studio-hint">{search ? "No matching settings." : blocks.length ? "This section's words live in its blocks: select one in the outline. Colours and spacing are in the Style and Layout tabs." : "This section has no words to edit here. Use the Style and Layout tabs."}</p>}
        {fields.map(f => <div key={f.key} className="studio-field">
          {block ? f.kind === "list" ? <BlockListFieldEditor field={f as any} value={block[f.key]} onChange={v => patchBlock({ [f.key]: v })} /> :
            <ConnectableField fieldKind={f.kind} label={f.label} aiWhere={`${meta?.label || section.type} › ${meta?.blockLabel || "block"}`} value={block[f.key]} onChange={v => patchBlock({ [f.key]: v })}>
              <BlockFieldEditor field={f as any} value={block[f.key]} onChange={v => patchBlock({ [f.key]: v })} uploadFile={uploadStudioImage} block={block} onPatchBlock={patchBlock} />
            </ConnectableField> :
            <ConnectableField fieldKind={f.kind} label={f.label} aiWhere={meta?.label || section.type} value={section.settings[f.key]} onChange={v => onPatch({ [f.key]: v })}>
              <SectionFieldEditor field={f as any} value={section.settings[f.key]} settings={section.settings} onChange={v => onPatch({ [f.key]: v })} onPatch={onPatch} uploadFile={uploadStudioImage} />
            </ConnectableField>}
        </div>)}
        {block && section.type === "CompositionSection" && <div className="studio-control-card">
          <strong>Responsive layout · {device}</strong>
          <p className="studio-hint">Changes here only apply at this screen size. Blank = same as the computer version. The Hide boxes work whichever size you are previewing.</p>
          <label>Alignment<select value={block.responsive?.[device]?.align || ""} onChange={e => patchResponsive("responsive", "align", e.target.value || undefined)}><option value="">Same as the larger screen</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          <div className="studio-hide-devices" role="group" aria-label="Hide this block on some screens">
            {HIDE_DEVICES.map(h => {
              // Hidden on tablets covers phones too (the storefront rule is "up to tablet width").
              const coveredByTablet = h.device === "mobile" && Boolean(block.responsive?.tablet?.hidden);
              return <label key={h.device} title={coveredByTablet ? "Already hidden on phones because it is hidden on tablets and phones" : undefined}><input type="checkbox" disabled={coveredByTablet} checked={coveredByTablet || Boolean(block.responsive?.[h.device]?.hidden)}
              onChange={e => patchBlock({ responsive: withDeviceHidden(block.responsive, h.device, e.target.checked) })} /> {h.label}</label>;
            })}
          </div>
          {section.type === "CompositionSection" && <div className="studio-grid-fields" data-studio-panel="block-look">
            {[["rotate", "Rotate (°)", -45, 45], ["scale", "Size (%)", 50, 150], ["opacity", "See-through (%)", 10, 100]].map(([field, label, min, max]) => <label key={String(field)}>{label}<input type="number" min={Number(min)} max={Number(max)} value={block.responsive?.[device]?.[String(field)] ?? ""} onChange={e => patchResponsive("responsive", String(field), e.target.value === "" ? undefined : Math.max(Number(min), Math.min(Number(max), Number(e.target.value))))} /></label>)}
          </div>}
          {section.type === "CompositionSection" && <div className="studio-grid-fields">
            {[["column", "Column", 1, 24], ["span", "Width", 1, 24], ["row", "Row", 1, 30], ["rowSpan", "Height", 1, 12], ["z", "Layer", 0, 20]].map(([field, label, min, max]) => <label key={String(field)}>{label}<input type="number" min={Number(min)} max={Number(max)} value={block.grid?.[device]?.[String(field)] ?? ""} onChange={e => patchResponsive("grid", String(field), e.target.value ? Number(e.target.value) : undefined)} /></label>)}
          </div>}
          {!placement?.sharedBlockId && <button className="studio-link-button" onClick={async () => { const name = await askText({ title: "Save as reusable block", label: "Name", defaultValue: title, confirmLabel: "Save block" }); if (name?.trim()) onSaveShared(block.id, name.trim()); }}>Save as reusable block</button>}
          {placement?.sharedBlockId && <button className="studio-link-button" onClick={makeIndependent}>Stop syncing this block</button>}
          {block.sharedBlockId && <small>Linked to {sharedBlocks.find(s => s.id === block.sharedBlockId)?.name || "a missing reusable block"}. Content updates from its library source; layout stays local.</small>}
        </div>}
      </>}
      {!block && sharedBlocks.some(shared => !shared.sectionType || shared.sectionType === section.type) && <div className="studio-control-card"><strong>Shared blocks</strong><p className="studio-hint">Insert a compatible linked instance. Editing its source updates every placement.</p>{sharedBlocks.filter(shared => !shared.sectionType || shared.sectionType === section.type).map(shared => <button key={shared.id} className="studio-link-button" onClick={() => onInsertShared(shared)}>+ {shared.name}</button>)}</div>}
      {tab === "style" && onReplayMotion && !search && <div className="studio-control-card" data-studio-panel="motion-preview">
        <strong>Motion</strong>
        <p className="studio-hint">Set it in the Motion group below. Shoppers whose device asks for less motion never see it.</p>
        <button className="studio-link-button" onClick={onReplayMotion}>Play this section's motion</button>
      </div>}
      {tab === "style" && <StudioSectionStyle fields={styleFields} tab="style" settings={section.settings} search={search} onPatch={onPatch} />}
      {tab === "visibility" && <>
        <div className="studio-control-card">
          <strong>On the storefront</strong>
          <p className="studio-hint">{section.visible === false ? "Hidden everywhere. Shoppers don't see this section." : "Shown. Use the switches below to hide it on some screen sizes or outside a date window."}</p>
          <button className="studio-link-button" onClick={onToggle}>{section.visible === false ? "Show this section" : "Hide this section everywhere"}</button>
        </div>
        <StudioSectionStyle fields={styleFields} tab="visibility" settings={section.settings} search="" onPatch={onPatch} />
      </>}
      {tab === "layout" && <>
        <div className="studio-control-card" data-studio-panel="phone-layout">
          <strong>Phone &amp; tablet layout</strong>
          <p className="studio-hint">Works out phone spacing, heading size{section.type === "CompositionSection" ? ", and stacked block placement for phones and tablets" : " and columns"} from your desktop design. Values you set yourself are kept.</p>
          <button className="studio-link-button" onClick={() => fitPhone(false)}>Auto-fit this section for phones</button>
          <button className="studio-link-button" onClick={() => fitPhone(true)}>Redo all phone values (replaces mine)</button>
          <button className="studio-link-button" onClick={resetPhone}>Reset phone layout</button>
        </div>
        <StudioSpacingControls section={section} device={device} onPatch={onPatch} />
        <StudioSectionStyle fields={styleFields} tab="layout" settings={section.settings} search="" onPatch={onPatch} />
      </>}
    </div>
  </aside>;
}
