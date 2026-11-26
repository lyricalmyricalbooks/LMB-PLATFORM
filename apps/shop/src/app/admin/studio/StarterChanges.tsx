// Studio › Version history › Compare with the starter (one website picker plan, step 3, 26 November 2026; was the
// "Your changes" box at the top of Studio › Designs): the owner's own edits kept apart from the starter they began
// from, each one resettable, plus the "new version is ready" update when a release changed the starter.
import { Eye } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "../riso/components";
import type { StarterUpdate, SwitchItem } from "./themeSwitch";

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(.*\))$/i;
/** A setting's value as the owner would describe it: a swatch for a colour, On/Off, or the words themselves. */
function SwitchValue({ value }: { value: any }) {
  if (value === undefined || value === null || value === "") return <em>default</em>;
  if (typeof value === "boolean") return <>{value ? "On" : "Off"}</>;
  const text = typeof value === "object" ? "custom" : String(value);
  if (COLOR.test(text)) return <span className="studio-switch-swatch" style={{ background: text }} role="img" aria-label={`colour ${text}`} />;
  return <>{text.length > 28 ? `${text.slice(0, 27)}…` : text}</>;
}

/** Version history › Compare with the starter: the press's edits kept apart from the look they started from, each one resettable. */
export function OwnEditsPanel({ lookName, edits, update, previewing, onPreview, onReset, onUpdate }: {
  lookName: string; edits: SwitchItem[]; update?: StarterUpdate | null; previewing?: boolean;
  onPreview?: (on: boolean) => void; onReset: (items: SwitchItem[]) => void; onUpdate?: (theme: any) => void;
}) {
  const n = edits.length;
  return (
    <section className="studio-switch studio-own-edits" data-own-edits aria-labelledby="studio-own-edits-title">
      <h3 id="studio-own-edits-title">Your changes to {lookName}</h3>
      {update && onUpdate && (
        <div className="studio-own-update" data-look-update={update.to}>
          <p className="studio-switch-summary">A new version of {update.name} is ready.</p>
          {/* What changed since the shop's version, newest first (starterVersions.ts). */}
          {update.releases.length === 1 ? <p className="studio-update-notes" data-look-update-note>{update.releases[0].note}</p>
            : <ul className="studio-update-notes" aria-label={`What's new in ${update.name}`}>{update.releases.map((r) => <li key={r.version}>{r.note}</li>)}</ul>}
          <p className="studio-hint">Updating changes only what you haven't changed{n ? `: ${n === 1 ? "your change stays" : `your ${n} changes stay`} on top` : ""}. Nothing goes live until you Publish, and you can undo it.</p>
          <div className="studio-update-actions">
            <PrimaryButton size="sm" onClick={() => onUpdate(update.theme)}>Update {update.name}</PrimaryButton>
            {onPreview && <SecondaryButton size="sm" aria-pressed={!!previewing} data-look-update-preview onClick={() => onPreview(!previewing)}>
              <Eye size={13} aria-hidden /> {previewing ? "Stop preview" : "Preview it"}
            </SecondaryButton>}
          </div>
        </div>
      )}
      <p className="studio-hint">
        {n ? `${n} setting${n === 1 ? " is" : "s are"} yours; everything else comes from ${lookName}.`
          : `Nothing changed yet: every style setting comes from ${lookName}.`}
      </p>
      {n > 0 && (
        <details className="studio-switch-kept">
          <summary>Show your changes ({n})</summary>
          <ul className="studio-switch-list" data-own-edit-list>
            {edits.map((item) => (
              <li key={`${item.surface || ""}:${item.key}`}>
                <span className="studio-switch-label">{item.label}</span>
                <span className="studio-switch-values">
                  <span title={lookName}><SwitchValue value={item.after} /></span> <span aria-hidden>→</span> <span className="sr-only">yours</span> <span title="Yours"><SwitchValue value={item.before} /></span>
                </span>
                <SecondaryButton size="sm" aria-label={`Use the starter's ${item.label}`} onClick={() => onReset([item])}>Use the starter's</SecondaryButton>
              </li>
            ))}
          </ul>
          {n > 1 && <SecondaryButton size="sm" onClick={() => onReset(edits)}>Use the starter's for all {n}</SecondaryButton>}
        </details>
      )}
    </section>
  );
}
