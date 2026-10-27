// Block picker (Studio 3.0 phase 5): a panel beside the preview, like Add section. Pointing at a choice shows that block
// in its section on the page (a preview-only candidate, blockLibrary.withBlockCandidate); clicking adds it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { BlockChoice, BlockThumb } from "./blockLibrary";

/** Small code-drawn pictures of each kind of choice (no image files). */
function BlockThumbArt({ kind }: { kind: BlockThumb }) {
  const line = (x: number, y: number, w: number, h = 4) => <rect x={x} y={y} width={w} height={h} fill="currentColor" opacity={0.85} />;
  const box = (x: number, y: number, w: number, h: number, dash = false) => <rect x={x} y={y} width={w} height={h} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray={dash ? "4 3" : undefined} />;
  const art: Record<BlockThumb, ReactNode> = {
    text: <>{line(10, 12, 50, 7)}{line(10, 26, 76)}{line(10, 34, 70)}{line(10, 42, 58)}</>,
    image: <>{box(10, 8, 76, 34)}<path d="M14 38l18-16 12 10 10-7 28 13z" fill="currentColor" opacity={0.6} />{line(10, 46, 40, 3)}</>,
    button: <>{box(22, 18, 52, 16)}{line(32, 24, 32)}</>,
    group: <>{box(8, 6, 80, 42, true)}{line(16, 14, 40, 6)}{box(16, 26, 30, 14)}{box(52, 26, 30, 14)}</>,
    block: <>{box(10, 8, 76, 38)}{line(18, 16, 40, 6)}{line(18, 28, 60)}{line(18, 36, 46)}</>,
    copy: <>{box(18, 6, 60, 30)}{box(10, 16, 60, 30)}{line(18, 26, 36)}</>,
    shared: <>{box(10, 12, 32, 28)}{box(54, 12, 32, 28)}<path d="M42 26h12" stroke="currentColor" strokeWidth={2} /></>,
    clipboard: <>{box(22, 8, 52, 40)}{box(36, 4, 24, 8)}{line(30, 22, 36)}{line(30, 30, 30)}</>,
  };
  return <svg className="studio-block-thumb" viewBox="0 0 96 54" aria-hidden="true" focusable="false">{art[kind]}</svg>;
}

export function StudioBlockPicker({ sectionLabel, choices, onPreview, onPick, onClose }: {
  sectionLabel: string;
  choices: BlockChoice[];
  /** The choice being pointed at (shown in the preview), or null. */
  onPreview: (choice: BlockChoice | null) => void;
  onPick: (choice: BlockChoice) => void;
  onClose: () => void;
}) {
  const [pointed, setPointed] = useState<string | null>(null);
  const timer = useRef<number>(0);
  // Point at a choice → show it on the page after a short pause, so sweeping across the list stays calm.
  const point = (choice: BlockChoice | null) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setPointed(choice?.id || null); onPreview(choice); }, choice ? 140 : 0);
  };
  useEffect(() => () => { window.clearTimeout(timer.current); onPreview(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = [...new Set(choices.map(c => c.group))];
  const label = choices.find(c => c.id === pointed)?.label;
  return (
    <div className="studio-library" role="dialog" aria-modal="false" aria-label="Add block" data-studio-block-picker
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="studio-library-head">
        <button type="button" className="studio-structure-switch" onClick={onClose}><ArrowLeft size={14} aria-hidden /> Back to sections</button>
        <h2 className="studio-library-title">Add block</h2>
        <p className="studio-hint">Adding to <strong>{sectionLabel}</strong>. Point at a block to see it on the page; click to add it.</p>
        <p className="studio-library-status" role="status">{label ? `Showing ${label} on the page — click it to add` : ""}</p>
      </div>
      <div className="studio-library-body" onMouseLeave={() => point(null)}>
        {groups.map(group => (
          <section key={group} className="studio-library-group">
            <h3>{group}</h3>
            <div className="studio-library-grid">
              {choices.filter(c => c.group === group).map((choice, i) => (
                <button key={choice.id} type="button" className="studio-library-card" data-block-choice={choice.id} aria-pressed={pointed === choice.id}
                  autoFocus={group === groups[0] && i === 0}
                  onMouseEnter={() => point(choice)} onFocus={() => point(choice)} onClick={() => onPick(choice)}>
                  <BlockThumbArt kind={choice.thumb} />
                  <span className="studio-library-name">{choice.label}</span>
                  <small>{choice.hint}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
        {!choices.length && <p className="studio-hint">This section doesn't take blocks.</p>}
      </div>
    </div>
  );
}
