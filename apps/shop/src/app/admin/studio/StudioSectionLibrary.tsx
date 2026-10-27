// Add section, Studio 2.6: a panel beside the preview (not a pop-up that covers it). Pointing at a card shows that
// section on the page at the spot it would be added; clicking adds it. Saved sections and shared blocks are managed here.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pencil, Search, Trash2 } from "lucide-react";
import type { SharedBlock } from "../../features/site/sharedBlocks";
import { libraryGroups, placementHint, sharedBlockUsage, type LibraryMeta } from "./sectionLibrary";
import { SectionThumb } from "./sectionThumbs";
import { StudioAiDraft } from "./StudioAiDraft";
import type { Section } from "./studioModel";

export type LibraryProps = {
  registry: LibraryMeta[];
  /** The page or section group being added to ("heroPage", "headerSections"…), its name, and the insert position. */
  surface: string;
  surfaceLabel: string;
  at: number;
  total: number;
  design: any;
  onPreview: (type: string | null) => void;
  onPick: (type: string) => void;
  /** Adds the section where it works best (its `bestIn` group or page) instead of here. */
  onPickBestPlace: (type: string) => void;
  onPickPreset: (preset: any) => void;
  onRenamePreset: (preset: any) => void;
  onDeletePreset: (preset: any) => void;
  onRenameShared: (shared: SharedBlock) => void;
  onDeleteShared: (shared: SharedBlock) => void;
  onClose: () => void;
  /** Add section › Draft with AI (3.0 phase 8): show a drafted section on the page / add it. */
  onDraftPreview?: (section: Section | null) => void;
  onAddDraft?: (section: Section) => void;
  /** Changes when Find anything › Draft a section with AI opens the panel: the AI form starts open. */
  draftOpen?: number;
};

export function StudioSectionLibrary(p: LibraryProps) {
  const [q, setQ] = useState("");
  const [pointed, setPointed] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const groups = useMemo(() => libraryGroups(p.registry, q), [p.registry, q]);
  const presets: any[] = (p.design.sectionPresets || []).filter((x: any) => !q || String(x.name || "").toLowerCase().includes(q.toLowerCase()));
  const shared: SharedBlock[] = p.design.sharedBlocks || [];

  // Point at a card → try it on the page (after a short pause, so sweeping the pointer across cards stays calm).
  const point = (type: string | null) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setPointed(type); p.onPreview(type); }, type ? 160 : 0);
  };
  useEffect(() => () => { window.clearTimeout(timer.current); p.onPreview(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const label = pointed ? p.registry.find(m => m.type === pointed)?.label : null;

  return (
    <div className="studio-library" role="dialog" aria-modal="false" aria-label="Add section" data-studio-library
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); p.onClose(); } }}>
      <div className="studio-library-head">
        <button type="button" className="studio-structure-switch" onClick={p.onClose}><ArrowLeft size={14} aria-hidden /> Back to sections</button>
        <h2 className="studio-library-title">Add section</h2>
        <p className="studio-hint">
          Adding to <strong>{p.surfaceLabel}</strong>, position {Math.min(p.at, p.total) + 1} of {p.total + 1}. Point at a section to try it on the page; click to add it.
        </p>
        <p className="studio-library-status" role="status">{label ? `Showing ${label} on the page — click it to add` : ""}</p>
        <label className="studio-library-search">
          <Search size={14} aria-hidden />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search sections…" aria-label="Search sections" />
        </label>
      </div>

      <div className="studio-library-body" onMouseLeave={() => point(null)}>
        {p.onDraftPreview && p.onAddDraft && !q && <StudioAiDraft key={p.draftOpen || 0} startOpen={Boolean(p.draftOpen)} onPreview={p.onDraftPreview} onAdd={p.onAddDraft} />}
        {presets.length > 0 && (
          <section className="studio-library-group">
            <h3>Your saved sections</h3>
            {presets.map(preset => (
              <div key={preset.id} className="studio-library-saved">
                <button type="button" className="studio-library-card" onClick={() => p.onPickPreset(preset)}>
                  <SectionThumb type={preset.section?.type} />
                  <span className="studio-library-name">{preset.name}</span>
                  <small>Saved with Section tools › Save section for reuse</small>
                </button>
                <div className="studio-library-actions">
                  <button type="button" className="studio-link-button" aria-label={`Rename ${preset.name}`} onClick={() => p.onRenamePreset(preset)}><Pencil size={13} aria-hidden /> Rename</button>
                  <button type="button" className="studio-link-button" aria-label={`Delete ${preset.name}`} onClick={() => p.onDeletePreset(preset)}><Trash2 size={13} aria-hidden /> Delete</button>
                </div>
              </div>
            ))}
          </section>
        )}
        {groups.map(group => (
          <section key={group.category} className="studio-library-group">
            <h3>{group.category}</h3>
            <div className="studio-library-grid">
              {group.items.map(meta => {
                const hint = placementHint(meta, p.surface);
                return (
                  <div key={meta.type} className="studio-library-item" data-library-type={meta.type}>
                    <button type="button" className="studio-library-card" aria-pressed={pointed === meta.type}
                      onMouseEnter={() => point(meta.type)} onFocus={() => point(meta.type)} onClick={() => p.onPick(meta.type)}>
                      <SectionThumb type={meta.type} />
                      <span className="studio-library-name">{meta.label}</span>
                      <small>{meta.description}</small>
                      {hint && <span className={`studio-library-hint${hint.elsewhere ? " is-elsewhere" : ""}`}>{hint.note}</span>}
                    </button>
                    {hint?.elsewhere && (
                      <button type="button" className="studio-link-button studio-library-there" onClick={() => p.onPickBestPlace(meta.type)}>
                        Add it there instead
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!groups.length && !presets.length && <p className="studio-hint">No sections match “{q}”.</p>}

        {shared.length > 0 && (
          <details className="studio-library-group studio-library-shared">
            <summary>Shared blocks ({shared.length})</summary>
            <p className="studio-hint">A shared block's words and pictures show everywhere it is placed. Deleting one keeps each placement as an ordinary copy.</p>
            {shared.map(item => {
              const uses = sharedBlockUsage(p.design, item.id).length;
              return (
                <div key={item.id} className="studio-library-saved">
                  <p className="studio-library-name">{item.name}<small> · {uses ? `used in ${uses} place${uses === 1 ? "" : "s"}` : "not used"}</small></p>
                  <div className="studio-library-actions">
                    <button type="button" className="studio-link-button" aria-label={`Rename shared block ${item.name}`} onClick={() => p.onRenameShared(item)}><Pencil size={13} aria-hidden /> Rename</button>
                    <button type="button" className="studio-link-button" aria-label={`Delete shared block ${item.name}`} onClick={() => p.onDeleteShared(item)}><Trash2 size={13} aria-hidden /> Delete</button>
                  </div>
                </div>
              );
            })}
          </details>
        )}
      </div>
    </div>
  );
}
