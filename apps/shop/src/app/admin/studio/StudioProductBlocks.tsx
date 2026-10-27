// Page layout › Buy box blocks (Studio 2.9): the order of the product page's buy card, per book-page template.
// Built-in blocks can be moved and hidden (title and Add to bag stay); added blocks (text, collapsible note, badge,
// look-inside link, book detail) can be edited, connected to the book's details (2.7) and removed.
// Data: features/site/productBlocks.ts; written to the template's own surface with writeDesignValue.
import { useContext } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Trash2 } from "lucide-react";
import {
  addBlock, blockLabel, BUILT_IN_BLOCKS, CUSTOM_BLOCKS, isBuiltIn, isRequired, moveBlock, productBlocks, removeBlock,
  toggleBlock, updateBlock, type ProductBlock,
} from "../../features/site/productBlocks";
import { writeDesignValue } from "../../features/site/designModel";
import { resolveProductDesign } from "../../features/site/surfaceDesign";
import { parseAltSurface } from "../../features/site/templateAlternates";
import { ConnectableField, DynamicSourcesContext } from "./StudioConnect";
import { LinkPicker } from "./StudioPickers";

type Change = (fn: (d: any) => any, meta?: { label?: string; coalesce?: string }) => void;

export function isProductTemplate(templateId: string) {
  return templateId === "productPage" || parseAltSurface(templateId)?.base === "productPage";
}

export function StudioProductBlocks({ design, templateId, change, onNotice }: { design: any; templateId: string; change: Change; onNotice?: (text: string, undo?: boolean) => void }) {
  const ctx = useContext(DynamicSourcesContext);
  if (!isProductTemplate(templateId)) return null;
  const alt = parseAltSurface(templateId);
  const own = Array.isArray(design?.[templateId]?.productInfoBlocks);
  const list = productBlocks(resolveProductDesign(design, templateId));
  const write = (next: ProductBlock[], label: string, coalesce?: string) =>
    change(d => writeDesignValue(d, "productInfoBlocks", next, { surface: templateId }), { label, coalesce });
  const field = (block: ProductBlock, key: string, label: string, kind: "text" | "textarea" = "text") => (
    <ConnectableField key={key} fieldKind={kind} label={label} value={block.settings?.[key]} onChange={v => write(updateBlock(list, block.id, { [key]: v }), `Edit ${blockLabel(block)}`, `pdp-${block.id}-${key}`)}>
      <label className="studio-scheme-field">{label}
        {kind === "textarea"
          ? <textarea rows={3} value={typeof block.settings?.[key] === "string" ? block.settings[key] : ""} onChange={e => write(updateBlock(list, block.id, { [key]: e.target.value }), `Edit ${blockLabel(block)}`, `pdp-${block.id}-${key}`)} />
          : <input value={typeof block.settings?.[key] === "string" ? block.settings[key] : ""} onChange={e => write(updateBlock(list, block.id, { [key]: e.target.value }), `Edit ${blockLabel(block)}`, `pdp-${block.id}-${key}`)} />}
      </label>
    </ConnectableField>
  );

  return (
    <div className="studio-pdp-blocks" data-studio-panel="product-blocks">
      <h3 className="studio-announcements-title">Buy box blocks</h3>
      <p className="studio-hint">
        The order of the book page's buy box{alt ? " for this template" : ""}. Move or hide pieces, or add your own.
        {alt && !own && " This template follows the default book page until you change something here."}
      </p>
      <ol className="studio-pdp-block-list">
        {list.map((block, i) => {
          const builtIn = isBuiltIn(block.type);
          const required = isRequired(block.type);
          const hint = BUILT_IN_BLOCKS.find(b => b.type === block.type)?.hint;
          return (
            <li key={block.id} className={`studio-pdp-block${block.hidden ? " is-hidden" : ""}${block.type === "divider" ? " is-divider" : ""}`} data-pdp-block-row={block.type}>
              <div className="studio-pdp-block-head">
                <span className="studio-pdp-block-name">{blockLabel(block)}{block.hidden ? " (hidden)" : ""}</span>
                <span className="studio-scheme-actions">
                  <button type="button" className="studio-link-button" aria-label={`Move ${blockLabel(block)} up`} disabled={i === 0} onClick={() => write(moveBlock(list, block.id, -1), `Move ${blockLabel(block)} up`)}><ArrowUp size={13} aria-hidden /></button>
                  <button type="button" className="studio-link-button" aria-label={`Move ${blockLabel(block)} down`} disabled={i === list.length - 1} onClick={() => write(moveBlock(list, block.id, 1), `Move ${blockLabel(block)} down`)}><ArrowDown size={13} aria-hidden /></button>
                  {required
                    ? <span className="studio-pdp-lock" title="Always shown — shoppers need it"><Lock size={13} aria-hidden /> Always shown</span>
                    : block.type !== "divider" && <button type="button" className="studio-link-button" aria-label={`${block.hidden ? "Show" : "Hide"} ${blockLabel(block)}`} onClick={() => write(toggleBlock(list, block.id), `${block.hidden ? "Show" : "Hide"} ${blockLabel(block)}`)}>{block.hidden ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}</button>}
                  {!builtIn && <button type="button" className="studio-link-button" aria-label={`Remove ${blockLabel(block)}`} onClick={() => { write(removeBlock(list, block.id), `Remove ${blockLabel(block)}`); onNotice?.(`${blockLabel(block)} removed.`, true); }}><Trash2 size={13} aria-hidden /></button>}
                </span>
              </div>
              {builtIn && hint && <small className="studio-hint">{hint}</small>}
              {block.type === "text" && field(block, "text", "Text", "textarea")}
              {block.type === "collapsible" && <>{field(block, "heading", "Heading")}{field(block, "body", "Text", "textarea")}</>}
              {block.type === "badge" && <>
                {field(block, "label", "Badge text")}
                <label className="studio-scheme-field">Colour
                  <select value={block.settings?.tone || "accent"} onChange={e => write(updateBlock(list, block.id, { tone: e.target.value }), "Change badge colour")}>
                    <option value="accent">Accent</option><option value="success">Success (green)</option><option value="warning">Warning (amber)</option><option value="danger">Danger (red)</option>
                  </select>
                </label>
              </>}
              {block.type === "lookInside" && <>
                {field(block, "label", "Link text")}
                <LinkPicker label="Link" value={block.settings?.link || ""} onChange={v => write(updateBlock(list, block.id, { link: v }), "Change look-inside link")} />
              </>}
              {block.type === "customField" && <>
                <label className="studio-scheme-field">Book detail
                  <select value={block.settings?.fieldKey || ""} onChange={e => write(updateBlock(list, block.id, { fieldKey: e.target.value }), "Choose book detail")}>
                    <option value="">Choose a detail…</option>
                    {(ctx?.fields || []).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </label>
                {!(ctx?.fields || []).length && <small className="studio-hint">Add details first in Books › edit › More details › Book fields.</small>}
                {field(block, "label", "Label shown before it (optional)")}
              </>}
              {!builtIn && block.type !== "divider" && block.type !== "customField" && (
                <label className="studio-pdp-check"><input type="checkbox" checked={block.settings?.hideWhenEmpty === true}
                  onChange={e => write(updateBlock(list, block.id, { hideWhenEmpty: e.target.checked }), "Hide when empty")} /> Hide when a connected detail is empty</label>
              )}
            </li>
          );
        })}
      </ol>
      <div className="studio-pdp-add">
        <label className="studio-scheme-field">Add a block
          <select value="" onChange={e => {
            const type = e.target.value as any;
            if (!type) return;
            write(addBlock(list, type).list, `Add ${type === "divider" ? "divider" : CUSTOM_BLOCKS.find(b => b.type === type)?.label}`);
          }}>
            <option value="">Choose…</option>
            {CUSTOM_BLOCKS.map(b => <option key={b.type} value={b.type}>{b.label}</option>)}
            <option value="divider">Divider (starts a new part of the box)</option>
          </select>
        </label>
        {own && <button type="button" className="studio-link-button" onClick={() => { write(undefined as any, alt ? "Use the default book page's blocks" : "Reset buy box blocks"); onNotice?.(alt ? "This template follows the default book page's buy box again." : "Buy box back to the standard order.", true); }}>
          {alt ? "Use the default book page's blocks" : "Reset to the standard order"}
        </button>}
      </div>
    </div>
  );
}
