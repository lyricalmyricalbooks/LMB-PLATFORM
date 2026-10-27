// Theme actions › Studio Health (3.3): checks the page shown in the preview (healthAudit.ts) plus the whole draft's
// data checks (studioChecks.ts). Each finding can be shown on the page and its part opened for editing. Read-only:
// nothing is changed until the owner edits the part.
import { useEffect, useState, type ReactNode } from "react";
import { Dialog, SecondaryButton, StatusBadge } from "../riso/components";
import { CATEGORY_LABELS, summarise, type HealthFinding } from "./healthAudit";

type BodyProps = {
  /** Runs the page audit; null when the preview isn't ready. */
  run: () => HealthFinding[] | null;
  pageLabel: string;
  deviceLabel: string;
  /** Data checks over the whole draft (every page). */
  designResults: { tone: "ok" | "warn"; text: string }[];
  onShow: (finding: HealthFinding) => void;
  onFix: (finding: HealthFinding) => void;
  /** Checks again whenever this changes (each time the dialog or the Workbench tab opens, after a publish…). */
  runKey?: unknown;
  /** Told how many things need fixing after each check (null = the preview wasn't ready). */
  onResult?: (issues: number | null) => void;
  /** "Check every page" (StudioSiteHealth), shown under this page's results. */
  site?: ReactNode;
};
type Props = BodyProps & { open: boolean; onClose: () => void };

/** The Health list itself: shown in the Workbench (desktop) and inside the Studio Health dialog (phones). */
export function HealthFindings(p: BodyProps) {
  const [findings, setFindings] = useState<HealthFinding[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const check = () => {
    const found = p.run();
    setFindings(found); setCheckedAt(Date.now());
    p.onResult?.(found ? found.filter(f => f.severity === "issue").length : null);
  };
  // Each time it opens, check the page as it is now.
  useEffect(() => { if (p.runKey) check(); }, [p.runKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = findings ? summarise(findings) : null;
  const issues = (findings || []).filter(f => f.severity === "issue");
  const tips = (findings || []).filter(f => f.severity === "tip");
  const row = (f: HealthFinding) => (
    <li key={f.id} className="studio-health-item" data-health-id={f.id}>
      <div>
        <span className="studio-health-cat">{CATEGORY_LABELS[f.category]}</span>
        <strong>{f.title}{f.count > 1 ? ` (${f.count} places)` : ""}</strong>
        <small>{f.detail}</small>
        {f.owner?.label && <small className="studio-health-where">In: {f.owner.label}</small>}
      </div>
      <div className="studio-health-actions">
        {f.element && <SecondaryButton size="sm" onClick={() => p.onShow(f)}>Show me</SecondaryButton>}
        {f.owner && <SecondaryButton size="sm" onClick={() => p.onFix(f)}>Edit this part</SecondaryButton>}
      </div>
    </li>
  );
  return (
      <div className="studio-health" data-studio-panel="health">
        <div className="studio-health-bar">
          <span>Checking <strong>{p.pageLabel}</strong> at <strong>{p.deviceLabel}</strong> size{checkedAt ? ` · ${new Date(checkedAt).toLocaleTimeString()}` : ""}.</span>
          <SecondaryButton size="sm" onClick={check}>Check again</SecondaryButton>
        </div>
        {findings === null && <p className="studio-empty">The preview isn't ready yet. Wait for it to load, then choose Check again.</p>}
        {summary && <p className="studio-health-summary" role="status">
          {summary.issues ? <StatusBadge tone="warning">{summary.issues} to fix</StatusBadge> : <StatusBadge tone="success">Nothing to fix</StatusBadge>}
          {summary.tips > 0 && <StatusBadge tone="info">{summary.tips} suggestion{summary.tips === 1 ? "" : "s"}</StatusBadge>}
        </p>}
        {issues.length > 0 && <section><h3>Fix before publishing</h3><ul className="studio-health-list">{issues.map(row)}</ul></section>}
        {tips.length > 0 && <section><h3>Worth a look</h3><ul className="studio-health-list">{tips.map(row)}</ul></section>}
        {p.site}
        <section>
          <h3>Settings checks across the whole draft</h3>
          <ul className="studio-health-list">
            {p.designResults.map((r, i) => <li key={i} className="studio-health-item"><div><span className="studio-health-cat">{r.tone === "warn" ? "⚠ Check" : "✓ OK"}</span><span>{r.text}</span></div></li>)}
          </ul>
        </section>
        <p className="studio-hint">Check again covers the page shown in the preview; Check every page covers the rest of the shop at the same size. Switch the size in the top bar to check phones.</p>
      </div>
  );
}

export function StudioHealth({ open, onClose, ...body }: Props) {
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Studio Health"
      description="Checks the page in the preview for things shoppers notice: text that's hard to read, pictures without descriptions, small buttons, broken links, heavy pictures and search basics.">
      <HealthFindings {...body} runKey={open ? (body.runKey ?? true) : 0} />
    </Dialog>
  );
}
