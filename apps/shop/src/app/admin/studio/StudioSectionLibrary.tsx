// Add section, Studio 2.6: a panel beside the preview (not a pop-up that covers it). Pointing at a card shows that
// section on the page at the spot it would be added; clicking adds it. Saved sections and shared blocks are managed here.
// Since step 2 of the starter websites plan the cards are section designs (sectionDesigns.ts), grouped by what they
// are for, with a row of kinds to show one group. Callbacks get a design id; a plain design's id is its section type.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pencil, Search, Trash2 } from "lucide-react";
import type { SharedBlock } from "../../features/site/sharedBlocks";
import { placementHint, sharedBlockUsage, type LibraryMeta } from "./sectionLibrary";
import { designGroups, SECTION_KINDS, sectionDesigns, type SectionKind } from "./sectionDesigns";
import { SectionThumb, type ThumbLook } from "./sectionThumbs";
import { googleFontHref } from "../../features/site/fonts";
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
  /** The shop's colours, heading font and sample photos, so each picture looks like the shop. */
  look?: ThumbLook;
  /** A design id (sectionDesigns.ts): the plain design of a section is its type. */
  onPreview: (design: string | null) => void;
  onPick: (design: string) => void;
  /** Adds the section where it works best (its `bestIn` group or page) instead of here. */
  onPickBestPlace: (design: string) => void;
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
  // The pictures' headline uses the shop's heading font: load it once into Studio's own page.
  useEffect(() => {
    const font = p.look?.font;
    if (!font || typeof document === "undefined") return;
    const id = `studio-thumb-font-${font.replace(/\W+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = Object.assign(document.createElement("link"), { id, rel: "stylesheet", href: googleFontHref(font) });
    document.head.appendChild(link);
  }, [p.look?.font]);
  const [q, setQ] = useState("");
  const [pointed, setPointed] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const [kind, setKind] = useState<SectionKind | null>(null);
  const designs = useMemo(() => sectionDesigns(p.registry), [p.registry]);
  const metaOf = useMemo(() => new Map(p.registry.map(m => [m.type, m])), [p.registry]);
  const groups = useMemo(() => designGroups(designs, q, kind, d => `${metaOf.get(d.type)?.label || ""} ${metaOf.get(d.type)?.bestIn?.note || ""}`), [designs, q, kind, metaOf]);
  const presets: any[] = (p.design.sectionPresets || []).filter((x: any) => !q || String(x.name || "").toLowerCase().includes(q.toLowerCase()));
  const shared: SharedBlock[] = p.design.sharedBlocks || [];

  // Point at a card → try it on the page (after a short pause, so sweeping the pointer across cards stays calm).
  const point = (type: string | null) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setPointed(type); p.onPreview(type); }, type ? 160 : 0);
  };
  useEffect(() => () => { window.clearTimeout(timer.current); p.onPreview(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const label = pointed ? designs.find(d => d.id === pointed)?.label : null;

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
        <div className="studio-library-kinds" role="group" aria-label="Kinds of section">
          <button type="button" className="studio-library-kind" aria-pressed={kind === null} onClick={() => setKind(null)}>All</button>
          {SECTION_KINDS.map(k => (
            <button key={k.id} type="button" className="studio-library-kind" aria-pressed={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>{k.label}</button>
          ))}
        </div>
      </div>

      <div className="studio-library-body" onMouseLeave={() => point(null)}>
        {p.onDraftPreview && p.onAddDraft && !q && <StudioAiDraft key={p.draftOpen || 0} startOpen={Boolean(p.draftOpen)} onPreview={p.onDraftPreview} onAdd={p.onAddDraft} />}
        {presets.length > 0 && (
          <section className="studio-library-group">
            <h3>Your saved sections</h3>
            {presets.map(preset => (
              <div key={preset.id} className="studio-library-saved">
                <button type="button" className="studio-library-card" onClick={() => p.onPickPreset(preset)}>
                  <SectionThumb type={preset.section?.type} settings={preset.section?.settings} look={p.look} />
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
          <section key={group.kind} className="studio-library-group" data-library-kind={group.kind}>
            <h3>{group.label}</h3>
            <p className="studio-hint studio-library-blurb">{group.blurb}</p>
            <div className="studio-library-grid">
              {group.items.map(design => {
                const meta = metaOf.get(design.type);
                const hint = meta ? placementHint(meta, p.surface) : null;
                const plain = design.id === design.type;
                return (
                  <div key={design.id} className="studio-library-item" data-library-design={design.id} data-library-type={plain ? design.type : undefined}>
                    <button type="button" className="studio-library-card" aria-pressed={pointed === design.id}
                      onMouseEnter={() => point(design.id)} onFocus={() => point(design.id)} onClick={() => p.onPick(design.id)}>
                      <SectionThumb type={design.type} settings={{ ...((meta as any)?.defaults || {}), ...design.settings }} look={p.look} />
                      <span className="studio-library-name">{design.label}</span>
                      <small>{design.description}</small>
                      {!plain && meta && <span className="studio-library-of">Built from {meta.label}</span>}
                      {hint && <span className={`studio-library-hint${hint.elsewhere ? " is-elsewhere" : ""}`}>{hint.note}</span>}
                    </button>
                    {hint?.elsewhere && (
                      <button type="button" className="studio-link-button studio-library-there" onClick={() => p.onPickBestPlace(design.id)}>
                        Add it there instead
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!groups.length && !presets.length && <p className="studio-hint">{q ? `No sections match “${q}”.` : "No sections of this kind."}</p>}

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
