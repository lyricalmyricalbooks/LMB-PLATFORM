// Studio › Theme settings › Colour schemes: add, rename, duplicate, reorder and delete schemes,
// pick each role's colour, see a live swatch and the three WCAG contrast checks.
// Every edit is one named, undoable draft change (`change`); deleting a scheme in use asks first.
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { SectionFieldEditor } from "../ThemeEditorExtensions";
import {
  resolveScheme, schemeContrast, SCHEME_ROLE_LABELS, SCHEME_ROLES, usesAllRoles, type ColorScheme, type SchemeRole,
} from "../../features/site/colorSchemes";
import {
  addScheme, deleteScheme, duplicateScheme, editableSchemes, moveScheme, newSchemeId, renameScheme, schemeUsage, setSchemeRole,
  upgradeSchemeIn, usageText, writeSchemes,
} from "./colorSchemeOps";

type Change = (fn: (d: any) => any, meta?: { label?: string; coalesce?: string }) => void;

const btn = "inline-flex items-center gap-1.5 px-3 h-9 text-xs font-bold border border-neutral-300 rounded-lg bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed";
const iconBtn = "inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px] rounded-md text-neutral-600 hover:bg-neutral-200 disabled:opacity-30";

/** A small picture of the scheme: background, panel, text, muted text, a tag, a button and a link. */
export function SchemeSwatch({ scheme }: { scheme: ColorScheme }) {
  const s = resolveScheme(scheme);
  return (
    <div className="studio-scheme-swatch" aria-hidden="true" style={{ background: s.background, color: s.text, borderColor: s.border }}>
      <div className="studio-scheme-swatch-row">
        <strong style={{ color: s.text }}>Aa</strong>
        <span style={{ color: s.muted }}>Muted</span>
        <span className="studio-scheme-swatch-tag" style={{ background: s.accent, color: s.onAccent }}>Tag</span>
      </div>
      <div className="studio-scheme-swatch-row">
        <span className="studio-scheme-swatch-panel" style={{ background: s.surface, borderColor: s.border, color: s.text }}>Panel</span>
        <span className="studio-scheme-swatch-button" style={{ background: s.buttonBg, color: s.buttonText }}>Button</span>
        <span style={{ color: s.link, textDecoration: "underline" }}>Link</span>
      </div>
    </div>
  );
}

/** The three WCAG checks as glyph + word badges. */
export function ContrastBadges({ scheme }: { scheme: ColorScheme }) {
  return (
    <ul className="studio-scheme-contrast" aria-label="Contrast checks">
      {schemeContrast(scheme).map((c) => {
        const tone = c.level === "Low" ? "danger" : c.level === "AA large" ? "warning" : "success";
        const glyph = c.level === "Low" ? "✕" : c.level === "AA large" ? "!" : "✓";
        return (
          <li key={c.id} className="rp-badge" data-tone={c.ratio == null ? "neutral" : tone}
            title={c.level === "AA large" ? "Readable for large text only (WCAG AA needs 4.5:1 for body text)." : c.level === "Low" ? "Hard to read: below 3:1." : "Meets WCAG for body text."}>
            {c.ratio == null ? `? ${c.label}: can't check` : `${glyph} ${c.label} ${c.ratio.toFixed(1)}:1 ${c.level}`}
          </li>
        );
      })}
    </ul>
  );
}

export function StudioColorSchemes({ design, change, onNotice, confirm }: {
  design: any;
  change: Change;
  /** Toast; `undo` adds an Undo button. */
  onNotice: (text: string, undo?: boolean) => void;
  confirm: (opts: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const schemes = editableSchemes(design);
  const [openId, setOpenId] = useState<string | null>(null);
  const edit = (fn: (list: ColorScheme[]) => ColorScheme[], label: string, coalesce?: string) =>
    change((d) => writeSchemes(d, fn(editableSchemes(d))), { label, coalesce });

  const add = () => {
    const id = newSchemeId(schemes);
    edit((l) => addScheme(l, id), "Add colour scheme");
    setOpenId(id);
  };
  const duplicate = (s: ColorScheme) => {
    const id = newSchemeId(schemes);
    edit((l) => duplicateScheme(l, s.id, id), `Duplicate ${s.name}`);
    setOpenId(id);
    onNotice(`Duplicated “${s.name}”.`);
  };
  const remove = async (s: ColorScheme) => {
    const used = usageText(schemeUsage(design, s.id));
    if (used) {
      const ok = await confirm({
        title: "Delete colour scheme?",
        message: `“${s.name}” is used by ${used}. They will go back to the theme's own colours. You can undo this.`,
        confirmLabel: "Delete scheme",
      });
      if (!ok) return;
    }
    change((d) => deleteScheme(d, s.id), { label: `Delete ${s.name}` });
    if (openId === s.id) setOpenId(null);
    onNotice(`Deleted “${s.name}”.`, true);
  };

  return (
    <div className="studio-schemes" data-studio-schemes>
      <p className="studio-hint">
        A colour scheme is a named set of colours. Give a section one in its <b>Style</b> tab › <b>Colour scheme</b>,
        or pick one for book cards, the buy card or the bag below. Changing a scheme updates everything that uses it;
        while a part follows a scheme, the scheme's colours replace that part's own colour settings.
      </p>
      <ul className="studio-scheme-list">
        {schemes.map((s, i) => {
          const usage = usageText(schemeUsage(design, s.id));
          const open = openId === s.id;
          const full = resolveScheme(s);
          return (
            <li key={s.id} className="studio-scheme" data-scheme-id={s.id}>
              <button type="button" className="studio-scheme-head" aria-expanded={open} onClick={() => setOpenId(open ? null : s.id)}
                aria-label={`${open ? "Close" : "Edit"} colour scheme ${s.name}`}>
                <SchemeSwatch scheme={s} />
                <span className="studio-scheme-name">
                  <strong>{s.name || "Untitled scheme"}</strong>
                  <small>{usage ? `Used by ${usage}` : "Not used yet"}</small>
                </span>
              </button>
              <ContrastBadges scheme={s} />
              {open && (
                <div className="studio-scheme-body">
                  <label className="studio-scheme-field">
                    <span>Scheme name</span>
                    <input value={s.name} aria-label="Scheme name"
                      onChange={(e) => edit((l) => renameScheme(l, s.id, e.target.value), `Rename ${s.name || "scheme"}`, `scheme-name:${s.id}`)} />
                  </label>
                  {!usesAllRoles(s) && (
                    <div className="studio-scheme-legacy" role="note">
                      <p>Saved before colour schemes had roles: sections using it only take its background and text colour. Changing any colour below uses every role.</p>
                      <button type="button" className={btn} onClick={() => edit((l) => upgradeSchemeIn(l, s.id), `Use every colour of ${s.name}`)}>Use every colour role</button>
                    </div>
                  )}
                  <div className="studio-scheme-roles">
                    {SCHEME_ROLES.map((role: SchemeRole) => (
                      <div key={role} className="studio-field" data-scheme-role={role}>
                        <SectionFieldEditor field={{ key: role, label: SCHEME_ROLE_LABELS[role].label, kind: "color" } as any}
                          value={(s as any)[role] || full[role]}
                          onChange={(v: string) => edit((l) => setSchemeRole(l, s.id, role, v), `Change ${s.name} ${SCHEME_ROLE_LABELS[role].label.toLowerCase()}`, `scheme:${s.id}:${role}`)} />
                        <small className="studio-scheme-role-hint">{SCHEME_ROLE_LABELS[role].hint}</small>
                      </div>
                    ))}
                  </div>
                  <div className="studio-scheme-actions">
                    <button type="button" className={btn} onClick={() => duplicate(s)}><Copy size={13} /> Duplicate</button>
                    <button type="button" className={iconBtn} aria-label={`Move ${s.name} up`} disabled={i === 0}
                      onClick={() => edit((l) => moveScheme(l, s.id, -1), `Move ${s.name} up`)}><ArrowUp size={14} /></button>
                    <button type="button" className={iconBtn} aria-label={`Move ${s.name} down`} disabled={i === schemes.length - 1}
                      onClick={() => edit((l) => moveScheme(l, s.id, 1), `Move ${s.name} down`)}><ArrowDown size={14} /></button>
                    <button type="button" className={btn} disabled={schemes.length <= 1} title={schemes.length <= 1 ? "Keep at least one scheme." : undefined}
                      onClick={() => void remove(s)}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className={`${btn} w-full justify-center`} onClick={add}><Plus size={13} /> Add colour scheme</button>
    </div>
  );
}
