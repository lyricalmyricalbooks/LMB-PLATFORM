import { Children, isValidElement, useId, useState, type ReactElement, type ReactNode } from "react";
import "./overviewViz.css";
import { SecondaryButton, SectionCard, StatusBadge, GhostButton, ErrorState, type BadgeTone } from "../riso/components";
import { change } from "./overviewInsights";
import { SHOP_TZ } from "../../lib/shopDay";
import { readinessProgress, readinessSummary, type ReadinessItem } from "../launchReadiness";
import type { Change } from "./overviewChanges";

// Small pieces shared by the Overview shell and its four detail tabs.

/** Money in lists, tables and drill rows: always two decimals ("CA$30.60"), so amounts line up and compare. */
export const money = (n: number) => `CA$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A widget's single big number: whole dollars from CA$1,000 ("CA$1,240"), two decimals below ("CA$84.50"). */
export const moneyFigure = (n: number) => {
  const v = Number(n || 0);
  return Math.abs(v) >= 1000 ? `CA$${Math.round(v).toLocaleString()}` : money(v);
};
/** Short money for chart labels and axes: "$681", "$1.2k", "$12k" (whole dollars; thousands as k). */
export const moneyShort = (n: number) => {
  const v = Number(n || 0), a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (a >= 10000) return `${sign}$${Math.round(a / 1000)}k`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(a)}`;
};
export const percent = (n: number, digits = 1) => `${Number(n || 0).toFixed(digits)}%`;
/** A moment in the shop's own time, e.g. "Oct 17, 3:42 PM"; "" when unknown. */
export const shopWhen = (v: unknown) => {
  const t = new Date(v as any).getTime();
  return Number.isNaN(t) || !v ? "" : new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: SHOP_TZ });
};
/** The admin address of one order (opens Orders on it). */
export const orderHref = (id: string) => `#orders/${encodeURIComponent(id)}`;
export const SPLIT = { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" } as const;
export const ROW = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 } as const;

/**
 * % change badge; "new" when there is nothing earlier to compare with. One mark only (▲ / ▼ / =), and the words "up" /
 * "down" for screen readers. `goodWhen="down"` (refunds, days to ship) colours a fall as good; "neutral" never colours.
 */
export function Trend({ now, before, goodWhen = "up" }: { now: number; before: number; goodWhen?: "up" | "down" | "neutral" }) {
  const v = change(now, before);
  if (v === null) return <StatusBadge tone="neutral">new</StatusBadge>;
  const dir = v > 0 ? "up" : v < 0 ? "down" : "same";
  const tone: BadgeTone = dir === "same" || goodWhen === "neutral" ? "neutral" : dir === goodWhen ? "success" : "danger";
  return (
    <StatusBadge tone={tone} glyph={dir === "up" ? "▲" : dir === "down" ? "▼" : "="}>
      <span className="rp-sr-only">{dir === "same" ? "no change, " : `${dir} `}</span>{`${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
    </StatusBadge>
  );
}

/** One muted takeaway sentence above a chart ("Best month: March, CA$1,240"). Say what the chart shows, from its own data. */
export function Takeaway({ children }: { children: ReactNode }) {
  return <p className="rp-viz-takeaway">{children}</p>;
}

/** A thin proportional bar. Decorative on its own; give it `label` when it stands alone as a progress readout. */
export function Meter({ share, color = "var(--rp-primary)", label, valueText }: { share: number; color?: string; label?: string; valueText?: string }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(share) ? share : 0));
  return (
    <div role={label ? "progressbar" : "presentation"} aria-label={label} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(pct) : undefined} aria-valuetext={label ? valueText : undefined}
      style={{ height: 8, marginTop: 8, background: "var(--rp-surface-inset)", border: "1px solid var(--rp-border)" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color }} />
    </div>
  );
}

/** A bar row: label + value, with a proportional bar underneath. With `details`, the row opens to show what's behind it. */
export function BarRow({ label, value, share, color, details }: { label: ReactNode; value: ReactNode; share: number; color?: string; details?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const head = <div style={ROW}><strong style={{ minWidth: 0, overflowWrap: "anywhere" }}>{details ? <Chevron open={open} /> : null}{label}</strong><span className="rp-mono" style={{ whiteSpace: "nowrap" }}>{value}</span></div>;
  return (
    <li>
      {details ? <button type="button" className="rp-ov-drill" aria-expanded={open} onClick={() => setOpen(v => !v)}>{head}<Meter share={share} color={color} /></button>
        : <>{head}<Meter share={share} color={color} /></>}
      {details && open && <div className="rp-ov-drill-body">{details}</div>}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <span aria-hidden="true" className="rp-ov-drill-mark">{open ? "▾" : "▸"}</span>;
}

/** One record behind a figure: what it is, a line of facts, and its own value; `href` opens it in the admin. */
export interface DrillItem { key: string; title: ReactNode; sub?: ReactNode; value?: ReactNode; href?: string; tone?: "danger" | "success" | "muted" }

/** The records behind a figure, shown when a row opens: the first `limit`, then "Show all". */
export function DrillList({ items, empty = "Nothing to show for this period.", limit = 8, label }: { items: DrillItem[]; empty?: ReactNode; limit?: number; label: string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="rp-hint" style={{ margin: 0 }}>{empty}</p>;
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      <ul className="rp-ov-drill-list" aria-label={label}>
        {shown.map(it => (
          <li key={it.key}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{it.href ? <a href={it.href}>{it.title}</a> : it.title}</div>
              {it.sub && <div className="rp-hint" style={{ overflowWrap: "anywhere" }}>{it.sub}</div>}
            </div>
            {it.value !== undefined && <span className="rp-mono" style={{ whiteSpace: "nowrap", color: it.tone === "danger" ? "var(--rp-danger)" : it.tone === "success" ? "var(--rp-success)" : it.tone === "muted" ? "var(--rp-text-muted)" : undefined }}>{it.value}</span>}
          </li>
        ))}
      </ul>
      {items.length > limit && <GhostButton size="sm" onClick={() => setAll(v => !v)}>{all ? "Show fewer" : `Show all ${items.length}`}</GhostButton>}
    </>
  );
}

/**
 * One line of the run sheet (the ink "to do" tile): a big count, what it is, and where to fix it. `label` is the plural
 * ("reviews to moderate", also used by the All clear line); `one` and `detailOne` are what a count of 1 reads instead,
 * so a single item says "1 review to moderate" rather than "1 reviews to moderate".
 */
export function RunRow({ label, one, detail, detailOne, count, loading, onOpen, openLabel }: {
  label: string; one?: string; detail: string; detailOne?: string; count: number | null; loading: boolean; onOpen: () => void; openLabel: string;
}) {
  const clear = count === 0;
  const single = count === 1;
  return (
    <li className="rp-ov-run-row" data-clear={clear || undefined}>
      <span className="rp-ov-run-count">{loading ? "…" : count}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="rp-ov-run-label">{single && one ? one : label}</div>
        <div className="rp-ov-run-detail">{loading ? "Loading…" : clear ? "✓ All clear" : single && detailOne ? detailOne : detail}</div>
        {!loading && !clear && <button type="button" className="rp-ov-run-go" onClick={onOpen}>{openLabel} <span aria-hidden="true">→</span></button>}
      </div>
    </li>
  );
}

/**
 * The Needs you list: only the lines with something to do, then one "✓ All clear: …" line naming the rest. Takes
 * `RunRow` children (same props as before); a line still loading stays listed.
 */
export function RunList({ children, label = "Things that need attention" }: { children: ReactNode; label?: string }) {
  const rows = Children.toArray(children).filter(isValidElement) as Array<ReactElement<Parameters<typeof RunRow>[0]>>;
  const clear = rows.filter(r => !r.props.loading && r.props.count === 0);
  const busy = rows.filter(r => !clear.includes(r));
  return (
    <ul className="rp-list" aria-label={label}>
      {busy}
      {clear.length > 0 && (
        <li className="rp-ov-run-row rp-ov-run-clear" data-clear="">
          <span className="rp-ov-run-count" aria-hidden="true">✓</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="rp-ov-run-label">All clear</div>
            <div className="rp-ov-run-detail">No {clear.map(r => r.props.label).join(", ")}.</div>
          </div>
        </li>
      )}
    </ul>
  );
}

/** What changed's badge for each kind of move. */
export const CHANGE_BADGE: Record<Change["tone"], { tone: BadgeTone; text: string }> = {
  up: { tone: "success", text: "▲ Up" }, down: { tone: "danger", text: "▼ Down" }, info: { tone: "info", text: "● New" }, warn: { tone: "warning", text: "! Check" },
};

/**
 * The What changed list. Each badge sits level with its line's title and every badge is the same width, so the
 * titles and figures start and end in one straight column however the moves are mixed.
 */
export function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <ul className="rp-list rp-ov-changes" aria-label="What changed">
      {changes.map(c => (
        <li key={c.id} className="rp-ov-change">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{c.title}</div>
            <div className="rp-hint">{c.detail}</div>
          </div>
          <StatusBadge tone={CHANGE_BADGE[c.tone].tone} glyph={false}>{CHANGE_BADGE[c.tone].text}</StatusBadge>
        </li>
      ))}
    </ul>
  );
}

/** One column of the Overview's ruled figures strip. Named by its label for screen readers; the value and change follow. */
export function Figure({ label, value, foot, tone, spark }: { label: string; value: ReactNode; foot: ReactNode; tone?: "warn"; spark?: ReactNode }) {
  const id = useId();
  return (
    <div className="rp-ov-figure" data-tone={tone} role="group" aria-labelledby={id}>
      <div className="rp-ov-figure-label" id={id}>{label}</div>
      <div className="rp-ov-figure-value">{value}</div>
      <div className="rp-ov-figure-foot">{foot}</div>
      {spark}
    </div>
  );
}

/** A "label … value" line inside an `rp-list`, with an optional hint underneath. With `details`, it opens to show the records behind it. */
export function StatRow({ label, hint, value, tone, details }: { label: ReactNode; hint?: ReactNode; value: ReactNode; tone?: "danger" | "muted"; details?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const head = (
    <>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 600, overflowWrap: "anywhere", color: tone === "muted" ? "var(--rp-text-muted)" : undefined }}>{details ? <Chevron open={open} /> : null}{label}</span>
        {hint && <div className="rp-hint rp-mono">{hint}</div>}
      </div>
      <span className="rp-mono" style={{ whiteSpace: "nowrap", color: tone === "danger" ? "var(--rp-danger)" : undefined }}>{value}</span>
    </>
  );
  if (!details) return <li style={ROW}>{head}</li>;
  return (
    <li>
      <button type="button" className="rp-ov-drill" aria-expanded={open} onClick={() => setOpen(v => !v)} style={ROW}>{head}</button>
      {open && <div className="rp-ov-drill-body">{details}</div>}
    </li>
  );
}

function ReadinessRow({ item, onOpen }: { item: ReadinessItem; onOpen: (tab: string) => void }) {
  return (
    <li style={{ ...ROW, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 240px", overflowWrap: "anywhere" }}>
        <div style={{ fontWeight: 600 }}>{item.label}</div>
        <div className="rp-hint">{item.detail}</div>
      </div>
      {item.status === "ok"
        ? <StatusBadge tone="success">Done</StatusBadge>
        : <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <StatusBadge tone={item.status === "block" ? "danger" : "warning"}>{item.status === "block" ? "Blocking" : "Check"}</StatusBadge>
            {item.href ? <a className="rp-btn rp-btn-secondary rp-btn-sm" href={item.href} target="_blank" rel="noopener noreferrer">{item.action}</a> : <SecondaryButton size="sm" onClick={() => onOpen(item.tab)}>{item.action}</SecondaryButton>}
          </span>}
    </li>
  );
}

/**
 * "Ready to sell?" as a slim progress strip: how many checks are green, only the open ones listed, and the finished
 * ones folded away. The page parent hides it entirely once every check passes.
 */
export function ReadinessStrip({ items, onOpen }: { items: ReadinessItem[]; onOpen: (tab: string) => void }) {
  const [showDone, setShowDone] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { done, total, open: openChecks, completed } = readinessProgress(items);
  const blocking = openChecks.some(i => i.status === "block");
  // Blocking checks first; the rest fold behind "+N more to check" so the strip stays short.
  const sorted = [...openChecks].sort((a, b) => Number(b.status === "block") - Number(a.status === "block"));
  const first = sorted.filter(i => i.status === "block");
  const lead = first.length ? first : sorted.slice(0, 3);
  const rest = sorted.slice(lead.length);
  const open = showAll ? sorted : lead;
  return (
    <SectionCard flush title="Ready to sell?"
      description={`${done} of ${total} launch checks are ready${blocking ? " — something is blocking sales" : ""}`}
      actions={completed.length > 0
        ? <GhostButton size="sm" aria-expanded={showDone} aria-controls="overview-readiness-done" onClick={() => setShowDone(v => !v)}>
            {showDone ? "Hide" : "Show"} completed ({completed.length})
          </GhostButton>
        : undefined}>
      <div style={{ padding: "0 20px 16px" }}>
        <Meter share={total ? (done / total) * 100 : 0} color={blocking ? "var(--rp-danger)" : "var(--rp-primary)"}
          label="Launch checks ready" valueText={`${done} of ${total}`} />
      </div>
      <ul className="rp-list" aria-label="Launch checks still open">
        {open.map(item => <ReadinessRow key={item.id} item={item} onOpen={onOpen} />)}
      </ul>
      {rest.length > 0 && (
        <div style={{ padding: "4px 20px 12px" }}>
          <GhostButton size="sm" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>
            {showAll ? "Show fewer" : `+${rest.length} more to check`} <span aria-hidden="true">{showAll ? "▾" : "▸"}</span>
          </GhostButton>
        </div>
      )}
      {showDone && (
        <ul id="overview-readiness-done" className="rp-list" aria-label="Launch checks already done" style={{ borderTop: "1px solid var(--rp-divider)" }}>
          {completed.map(item => <ReadinessRow key={item.id} item={item} onOpen={onOpen} />)}
        </ul>
      )}
    </SectionCard>
  );
}

/** A failed readiness read remains visible as unknown and can be retried. */
export function ReadinessPanel({ error, items, onRetry, onOpen }: { error: boolean; items: ReadinessItem[] | null; onRetry: () => void; onOpen: (tab: string) => void }) {
  if (error) return <ErrorState title="Launch checks unavailable" description="Settings, shipping or email records could not be loaded. Readiness is unknown until these checks refresh." onRetry={onRetry} />;
  return items && readinessSummary(items) !== "ok" ? <ReadinessStrip items={items} onOpen={onOpen} /> : null;
}
