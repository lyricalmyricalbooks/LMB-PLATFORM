import { createContext, useContext, useId } from "react";
import { getCopyTemplate, shopCopyFallback, type CopyField } from "../../features/site/storeCopy";
import { StudioAiRewrite } from "./StudioAiRewrite";

/**
 * The {words} in a default that the shop fills in (an order count, an email…). Listed under the box
 * when the field's own hint doesn't already explain them, so they aren't deleted or misspelt.
 */
export function copyPlaceholders(field: CopyField): string[] {
  const found = [...new Set((String(field.default ?? "").match(/\{[a-zA-Z_]+\}/g) || []))];
  return found.filter(token => !(field.hint || "").includes(token));
}

/** Lets a note under a word open the Studio control that overrides it (set by StudioEditor; absent = note text only). */
export const CopyTargetContext = createContext<((target: string, label?: string) => void) | null>(null);

/** Studio › Style › Product page layout › Add-to-bag text (`addToBagLabel`) wins over the Text & labels word on the product page. */
export function addToBagOverride(design: any): boolean {
  return [design, design?.storefront, design?.productPage].some(d => typeof d?.addToBagLabel === "string" && d.addToBagLabel.trim() !== "");
}

/** Missing copy inherits its default; a deliberately empty string remains empty. */
export function StudioCopyField({ field, design, settings, onChange, aiWhere }: {
  field: CopyField; design: any; onChange: (value: string | undefined) => void;
  /** The Text & labels group, told to the AI when the owner chooses Rewrite with AI (3.0 phase 8). */
  aiWhere?: string;
  /** Published shop settings, for defaults that come from the shop's own text (`shopCopyFallback`). */
  settings?: any;
}) {
  const id = useId();
  const openTarget = useContext(CopyTargetContext);
  const override = design.copy?.[field.key];
  const customized = typeof override === "string";
  const Tag = field.multiline ? "textarea" : "input";
  const shown = customized ? override : shopCopyFallback(settings, field.key) ?? getCopyTemplate(design, field.key);
  return <div data-copy-key={field.key} className="studio-copy-field">
    <label htmlFor={id}>{field.label}</label>
    <Tag id={id} value={shown} rows={field.multiline ? 3 : undefined}
      aria-describedby={`${id}-status`} onChange={e => onChange(e.target.value)} />
    <div className="studio-field-status">
      <small id={`${id}-status`}>{customized ? override === "" ? "Changed from default: left blank on purpose" : "Changed from default" : "Using default"}</small>
      {customized && <button type="button" className="studio-reset" onClick={() => onChange(undefined)} aria-label={`Reset to default: ${field.label}`}>Reset to default</button>}
      <StudioAiRewrite kind={field.multiline ? "textarea" : "text"} label={field.label} where={aiWhere ? `Text & labels › ${aiWhere}` : "Text & labels"} value={shown} onChange={onChange} />
    </div>
    {field.hint && <p className="studio-hint">{field.hint}</p>}
    {field.key === "addToBagLabel" && addToBagOverride(design) && <p className="studio-hint" data-copy-override-note>
      Theme settings › Product page › Add-to-bag text is set and wins. Clear it there to use these words.
      {openTarget && <> <button type="button" className="studio-reset" onClick={() => openTarget("style:productPage", "Book page · photos & layout")}>Open Add-to-bag text</button></>}
    </p>}
    {copyPlaceholders(field).length > 0 && <p className="studio-hint" data-copy-tokens>
      Words in {"{ }"} are filled in by the shop; keep them as they are: {copyPlaceholders(field).join(", ")}
    </p>}
  </div>;
}
