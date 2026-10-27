// Where you are in Studio: "Theme settings › Buttons › Primary button" or "Page layout › Home › Newsletter › Block 2",
// under the top bar. Every part but the last is a button that steps back out to that level, and ← Back returns to
// the place you were before your last jump (Find, a click in the preview, a new page; Alt+←).
// The steps are links (the breadcrumb pattern), so they never pose as the rail's workspace buttons of the same name.
type Crumb = { label: string; onSelect?: () => void };

export function StudioBreadcrumb({ crumbs, onBack, canBack = false, backTitle }: { crumbs: Crumb[]; onBack?: () => void; canBack?: boolean; backTitle?: string }) {
  if (crumbs.length < 1 && !onBack) return null;
  return (
    <nav className="studio-breadcrumb" aria-label="Where you are" data-studio-breadcrumb>
      {onBack && <button type="button" className="studio-back" data-studio-back onClick={onBack} disabled={!canBack} title={backTitle}
        aria-keyshortcuts="Alt+ArrowLeft"><span aria-hidden>←</span> Back</button>}
      <ol className="studio-crumbs">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return <li key={i} className="studio-crumb">
            {i > 0 && <span aria-hidden className="studio-crumb-sep"> › </span>}
            {last || !c.onSelect ? <span aria-current={last ? "location" : undefined}>{c.label}</span>
              : <button type="button" role="link" onClick={c.onSelect}>{c.label}</button>}
          </li>;
        })}
      </ol>
    </nav>
  );
}
