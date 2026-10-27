// Studio Workbench (Studio 3.0 phase 1): a panel docked under the preview, like Stripe's Workbench, so checks and
// history stay in view while the owner edits. Three tabs: Health (the page audit), Changes (every undo step, click
// one to go back to it, plus what differs from the live shop) and Setup (the launch checklist). Collapsed, it is a
// one-line taskbar. Read-only apart from Changes' jump, which is ordinary Undo/Redo.
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp, History, ListChecks, ShieldCheck } from "lucide-react";
import { SecondaryButton, StatusBadge } from "../riso/components";
import type { SetupItem } from "./setupChecklist";

export type WorkbenchTab = "health" | "changes" | "setup";
export type ChangeRow = { label: string; state: "past" | "current" | "future" };

type Props = {
  open: boolean;
  tab: WorkbenchTab;
  onOpen: (tab: WorkbenchTab) => void;
  onCollapse: () => void;
  /** Health tab body (HealthFindings), rendered only while that tab is open. */
  health: ReactNode;
  /** Things to fix from the last Health run (null = not run yet), for the taskbar badge. */
  healthIssues: number | null;
  changes: {
    rows: ChangeRow[];
    /** Moves through history by this many steps (negative = back). */
    onJump: (steps: number) => void;
    /** Why jumping is unavailable right now (a text edit in the preview), else null. */
    blocked: string | null;
    /** What the draft changes compared with the live shop; computed only while the tab is open. */
    sinceLive: string[] | null;
  };
  setup: { items: SetupItem[]; onGo: (item: SetupItem) => void };
};

const TABS: { id: WorkbenchTab; label: string; Icon: typeof History }[] = [
  { id: "health", label: "Health", Icon: ShieldCheck },
  { id: "changes", label: "Changes", Icon: History },
  { id: "setup", label: "Setup", Icon: ListChecks },
];

export function StudioWorkbench(p: Props) {
  const done = p.setup.items.filter(x => x.done).length;
  const steps = p.changes.rows.filter(r => r.state === "past").length;
  const badge = (id: WorkbenchTab) => id === "health" ? (p.healthIssues == null ? "" : p.healthIssues ? `${p.healthIssues} to fix` : "✓")
    : id === "changes" ? (steps ? String(steps) : "") : `${done}/${p.setup.items.length}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<WorkbenchTab, HTMLButtonElement | null>>>({});
  // Esc inside the Workbench collapses it and puts focus back on its tab, so keyboard users don't lose their place.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !p.open) return;
    e.stopPropagation();
    p.onCollapse();
    requestAnimationFrame(() => tabRefs.current[p.tab]?.focus());
  };
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    p.onOpen(next.id);
    tabRefs.current[next.id]?.focus();
  };
  // A newly opened tab scrolls to its top.
  useEffect(() => { panelRef.current?.scrollTo?.({ top: 0 }); }, [p.tab, p.open]);

  return (
    <section className="studio-workbench" data-studio-workbench data-open={p.open ? "true" : "false"} aria-label="Workbench" onKeyDown={onKeyDown}>
      <div className="studio-workbench-bar">
        <div role="tablist" aria-label="Workbench">
          {TABS.map(({ id, label, Icon }, i) => (
            <button key={id} type="button" role="tab" id={`studio-wb-tab-${id}`} aria-controls="studio-wb-panel"
              aria-selected={p.open && p.tab === id} tabIndex={p.tab === id ? 0 : -1}
              ref={el => { tabRefs.current[id] = el; }} onKeyDown={e => onTabKey(e, i)}
              onClick={() => (p.open && p.tab === id ? p.onCollapse() : p.onOpen(id))}>
              <Icon size={14} aria-hidden /> {label}
              {badge(id) && <span className="studio-workbench-badge" data-tone={id === "health" && p.healthIssues ? "warn" : undefined}>{badge(id)}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="studio-workbench-toggle" aria-expanded={p.open} aria-controls="studio-wb-panel"
          title="Open or close the Workbench (W)" onClick={() => (p.open ? p.onCollapse() : p.onOpen(p.tab))}>
          {p.open ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
          <span className="sr-only">{p.open ? "Close the Workbench" : "Open the Workbench"}</span>
        </button>
      </div>
      {p.open && (
        <div className="studio-workbench-panel" id="studio-wb-panel" role="tabpanel" aria-labelledby={`studio-wb-tab-${p.tab}`} ref={panelRef} tabIndex={-1}>
          {p.tab === "health" && p.health}
          {p.tab === "changes" && <ChangesTab {...p.changes} />}
          {p.tab === "setup" && <SetupTab {...p.setup} />}
        </div>
      )}
    </section>
  );
}

function ChangesTab({ rows, onJump, blocked, sinceLive }: Props["changes"]) {
  const current = rows.findIndex(r => r.state === "current");
  return (
    <div className="studio-workbench-changes" data-studio-panel="workbench-changes">
      <section>
        <h3>This session's steps</h3>
        {rows.length <= 1
          ? <p className="studio-empty">No changes yet. Every edit you make appears here; click one to go back to it.</p>
          : <ol className="studio-workbench-steps">
              {rows.map((r, i) => (
                <li key={i} data-state={r.state}>
                  <button type="button" disabled={r.state === "current" || Boolean(blocked)} title={blocked || undefined}
                    aria-current={r.state === "current" ? "step" : undefined} onClick={() => onJump(i - current)}>
                    <span className="studio-workbench-step-n">{i === 0 ? "Start" : i}</span>
                    <span>{r.label}</span>
                    {r.state === "current" && <StatusBadge tone="info">You are here</StatusBadge>}
                    {r.state === "future" && <small>undone</small>}
                  </button>
                </li>
              ))}
            </ol>}
        <p className="studio-hint">Going back is the same as pressing Undo several times: nothing is saved until you choose Save draft.</p>
      </section>
      <section>
        <h3>Different from the live shop</h3>
        {sinceLive === null ? <p className="studio-empty">Working it out…</p>
          : sinceLive.length ? <ul className="studio-health-list">{sinceLive.map(line => <li key={line} className="studio-health-item"><div><span>{line}</span></div></li>)}</ul>
          : <p className="studio-empty">The draft matches what shoppers see now.</p>}
      </section>
    </div>
  );
}

function SetupTab({ items, onGo }: Props["setup"]) {
  const done = items.filter(x => x.done).length;
  return (
    <div className="studio-workbench-setup" data-studio-panel="workbench-setup">
      <p className="studio-workbench-progress" role="status">
        <strong>{done} of {items.length} done</strong>
        <span className="studio-workbench-meter" aria-hidden><span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></span>
      </p>
      <ul className="studio-health-list">
        {items.map(item => (
          <li key={item.id} className="studio-health-item" data-setup-id={item.id} data-done={item.done ? "true" : "false"}>
            <div>
              <span className="studio-health-cat">{item.done ? "✓ Done" : "○ To do"}</span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </div>
            {item.go && !item.done && <div className="studio-health-actions"><SecondaryButton size="sm" onClick={() => onGo(item)}>Show me</SecondaryButton></div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
