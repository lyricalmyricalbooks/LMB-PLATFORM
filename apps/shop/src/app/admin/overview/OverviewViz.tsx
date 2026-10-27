import { Fragment, useId, useState, type ReactNode } from "react";
import "./overviewViz.css";

// The Overview's shared chart look (19 October 2026, "More visual Overview"): the current period in Riso red, the period
// before hatched behind it, and numbers written on the bars instead of in a separate key. Every piece here draws the
// figures a widget already has; nothing in this file reads data. Pure presentation, so the panels stay readable.

const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/**
 * A small line of a figure over the period, with the period before as a faint band behind it and a dot on the latest
 * point. Decorative (the number says it). Colour follows `goodWhen`: a move in the good direction is flare, the other way
 * danger, and "neutral" figures stay ink. `tone` alone (older callers) keeps its old meaning: up = good.
 */
export function Spark({ values, prev, tone = "up", goodWhen = "up" }: {
  values: Array<number | null>; prev?: Array<number | null>; tone?: "up" | "down" | "flat"; goodWhen?: "up" | "down" | "neutral";
}) {
  const all = [...values, ...(prev || [])].filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length < 2 || all.length === 0) return null;
  const max = Math.max(...all), min = Math.min(0, ...all);
  const span = max - min || 1;
  const x = (i: number, n: number) => ((i / (n - 1)) * 100).toFixed(2);
  const y = (v: number | null) => (28 - ((Number(v) || 0) - min) / span * 26 - 1).toFixed(2);
  const path = (vs: Array<number | null>) => vs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i, vs.length)},${y(v)}`).join(" ");
  const look = tone === "flat" || goodWhen === "neutral" ? "flat" : (tone === "up") === (goodWhen === "up") ? "up" : "down";
  const lastY = y(values[values.length - 1]);
  return (
    <svg className="rp-viz-spark" data-tone={look} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {prev && prev.length > 1 && <path d={`${path(prev)} L100,28 L0,28 Z`} className="rp-viz-spark-prev" />}
      <path d={`${path(values)} L100,28 L0,28 Z`} className="rp-viz-spark-fill" />
      <path d={path(values)} className="rp-viz-spark-line" vectorEffect="non-scaling-stroke" />
      <line x1="100" y1={lastY} x2="100" y2={lastY} className="rp-viz-spark-dot" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The key for every chart that draws the period before: "■ This period  ▨ Period before" as swatches (true in night mode too). */
export function CompareKey({ now = "This period", before = "Period before" }: { now?: string; before?: string }) {
  return (
    <span className="rp-viz-key">
      <span><i className="rp-viz-swatch" style={{ background: "var(--rp-primary)" }} aria-hidden="true" />{now}</span>
      <span><i className="rp-viz-swatch rp-viz-hatch" aria-hidden="true" />{before}</span>
    </span>
  );
}

/** The numbers behind a drawn chart, folded under "View as a table" (for custom SVG charts that have no tooltip). */
export function VizTable({ caption, head, rows, summary = "View as a table" }: { caption: string; head: string[]; rows: Array<{ key: string; cells: ReactNode[] }>; summary?: string }) {
  if (!rows.length) return null;
  return (
    <details className="rp-ov-table-toggle rp-viz-table">
      <summary>{summary}</summary>
      <div className="rp-viz-table-wrap">
        <table>
          <caption className="rp-sr-only">{caption}</caption>
          <thead><tr>{head.map((h, i) => <th key={h} scope="col" data-num={i > 0 ? "" : undefined}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.key}>{r.cells.map((c, i) => i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** ▲ 3 / ▼ 1 / NEW: how far a row moved in a ranking against the period before. */
export function Move({ move }: { move: number | "new" | null }) {
  if (move === null) return <span className="rp-viz-move" data-dir="same" aria-label="Same place as before">–</span>;
  if (move === "new") return <span className="rp-viz-move" data-dir="new">NEW</span>;
  if (move === 0) return <span className="rp-viz-move" data-dir="same" aria-label="Same place as before">–</span>;
  return <span className="rp-viz-move" data-dir={move > 0 ? "up" : "down"} aria-label={`${move > 0 ? "Up" : "Down"} ${Math.abs(move)} place${Math.abs(move) === 1 ? "" : "s"}`}>{move > 0 ? "▲" : "▼"} {Math.abs(move)}</span>;
}

export interface RankRow {
  key: string; label: ReactNode; sub?: ReactNode;
  /** Bar length (any unit); `prev` is drawn hatched behind it. */ value: number; prev?: number;
  valueText: ReactNode; cover?: string | null; coverText?: string; move?: number | "new" | null; tone?: "flare" | "info" | "ink";
  /** Opens underneath when the row is pressed (the records behind it). */ details?: ReactNode;
}

/** Ranked horizontal bars with optional book covers, the period before hatched, and rank movement. */
export function RankBars({ rows, label, scaleMax }: { rows: RankRow[]; label: string; scaleMax?: number }) {
  const max = scaleMax || Math.max(1, ...rows.map(r => Math.max(r.value, r.prev || 0)));
  return (
    <ol className="rp-viz-rank" aria-label={label}>
      {rows.map(r => <RankLine key={r.key} row={r} max={max} />)}
    </ol>
  );
}

function RankLine({ row: r, max }: { row: RankRow; max: number }) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      {(r.cover !== undefined || r.coverText) && <Cover url={r.cover} text={r.coverText || ""} />}
      <span className="rp-viz-rank-main">
        <span className="rp-viz-rank-head">
          <span className="rp-viz-rank-label">{r.details && <span aria-hidden="true" className="rp-ov-drill-mark">{open ? "▾" : "▸"}</span>}{r.label}</span>
          <span className="rp-viz-rank-value">{r.valueText}</span>
        </span>
        <span className="rp-viz-track" aria-hidden="true">
          {r.prev !== undefined && r.prev > 0 && <span className="rp-viz-bar-prev" style={{ width: `${clamp((r.prev / max) * 100)}%` }} />}
          <span className="rp-viz-bar" data-tone={r.tone || "flare"} style={{ width: `${clamp((r.value / max) * 100)}%` }} />
          {r.prev !== undefined && r.prev > 0 && <span className="rp-viz-bar-tick" style={{ left: `${clamp((r.prev / max) * 100)}%` }} />}
        </span>
        {r.sub && <span className="rp-viz-rank-sub">{r.sub}</span>}
      </span>
      {r.move !== undefined && <Move move={r.move} />}
    </>
  );
  return (
    <li>
      {r.details
        ? <button type="button" className="rp-viz-rank-row" aria-expanded={open} onClick={() => setOpen(v => !v)}>{body}</button>
        : <div className="rp-viz-rank-row">{body}</div>}
      {r.details && open && <div className="rp-ov-drill-body">{r.details}</div>}
    </li>
  );
}

/** A book cover thumbnail, or a printed block with the title's first letters when there is no photo. */
export function Cover({ url, text, size = "md" }: { url?: string | null; text: string; size?: "sm" | "md" }) {
  return url
    ? <img className="rp-viz-cover" data-size={size} src={url} alt="" loading="lazy" decoding="async" />
    : <span className="rp-viz-cover" data-size={size} aria-hidden="true">{initials(text)}</span>;
}
const initials = (t: string) => t.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

export interface StackPart { key: string; label: string; value: number; tone?: string }
const PALETTE = ["var(--rp-primary)", "var(--rp-text)", "var(--rp-warning)", "var(--rp-info)", "var(--rp-success)", "var(--rp-text-subtle)", "var(--rp-danger)"];
export const toneAt = (i: number) => PALETTE[i % PALETTE.length];

/** One 100% bar split into parts (labels written inside when there is room), with the period before as a thin bar under it. */
export function Stack({ parts, prev, label, unit = (n: number) => n.toLocaleString(), caption = "This period", prevCaption = "The period before" }: {
  parts: StackPart[]; prev?: StackPart[]; label: string; unit?: (n: number) => string; caption?: string; prevCaption?: string;
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const prevTotal = (prev || []).reduce((s, p) => s + Math.max(0, p.value), 0);
  const tone = (p: StackPart, i: number) => p.tone || toneAt(i);
  if (total <= 0) return null;
  return (
    <figure className="rp-viz-stack" aria-label={label}>
      <figcaption className="rp-viz-eyebrow">{caption}</figcaption>
      <div className="rp-viz-stack-bar" aria-hidden="true">
        {parts.map((p, i) => {
          const share = (Math.max(0, p.value) / total) * 100;
          return share > 0 ? (
            <span key={p.key} className="rp-viz-stack-part" style={{ flexBasis: `${share}%`, background: tone(p, i) }} data-ink={i === 0 || tone(p, i) === "var(--rp-warning)" ? undefined : "light"}>
              {share >= 14 && <span>{p.label} {Math.round(share)}%</span>}
            </span>
          ) : null;
        })}
      </div>
      {prev && prevTotal > 0 && (
        <>
          <div className="rp-viz-eyebrow">{prevCaption}</div>
          <div className="rp-viz-stack-bar" data-thin aria-hidden="true">
            {parts.map((p, i) => {
              const v = prev.find(x => x.key === p.key)?.value || 0;
              return v > 0 ? <span key={p.key} className="rp-viz-stack-part" style={{ flexBasis: `${(v / prevTotal) * 100}%`, background: tone(p, i) }} /> : null;
            })}
          </div>
        </>
      )}
      <ul className="rp-viz-legend">
        {parts.map((p, i) => {
          const share = total ? (Math.max(0, p.value) / total) * 100 : 0;
          const before = prev && prevTotal ? ((prev.find(x => x.key === p.key)?.value || 0) / prevTotal) * 100 : null;
          return (
            <li key={p.key}>
              <span className="rp-viz-swatch" style={{ background: tone(p, i) }} aria-hidden="true" />
              <span className="rp-viz-legend-label">{p.label}</span>
              <span className="rp-viz-legend-value">{unit(p.value)} · {Math.round(share)}%{before !== null && <span className="rp-viz-dim"> (was {Math.round(before)}%)</span>}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export interface FallStep {
  key: string; label: string; hint?: string; value: number; kind: "total" | "minus" | "plus";
  /** Money collected for someone else and passed on (sales tax): drawn with a dashed outline and named in the key. */
  passThrough?: boolean;
}

/**
 * Steps from one total to another. Wide: columns that start where the last one ended, joined by thin connectors.
 * Narrow (under ~520px of widget): one horizontal bar per step, label left and value right, the last total in bold.
 * Totals solid flare, money added outlined in ink, money taken away in danger tint; never hatched (hatched = the
 * period before everywhere else). Every bar is at least 6px so a small step stays visible.
 */
export function Waterfall({ steps, label, format }: { steps: FallStep[]; label: string; format: (n: number) => string }) {
  let running = 0;
  const bars = steps.map(s => {
    if (s.kind === "total") { running = s.value; return { ...s, from: 0, to: s.value, end: s.value }; }
    const from = running;
    running = s.kind === "minus" ? running - s.value : running + s.value;
    return { ...s, from: Math.min(from, running), to: Math.max(from, running), end: running };
  });
  const max = Math.max(1, ...bars.map(b => b.to));
  const sign = (b: FallStep) => (b.kind === "minus" ? "−" : b.kind === "plus" ? "+" : "");
  const words = steps.map(s => `${s.label} ${s.kind === "minus" ? "minus " : s.kind === "plus" ? "plus " : ""}${format(s.value)}`).join(", ");
  const hasPass = steps.some(s => s.passThrough);
  const pct = (n: number) => `${((n / max) * 100).toFixed(2)}%`;
  return (
    <figure className="rp-viz-fall" aria-label={`${label}: ${words}`}>
      <div className="rp-viz-fall-cols" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map((b, i) => (
          <div key={b.key} className="rp-viz-fall-col" title={`${b.label}: ${sign(b)}${format(b.value)}`}>
            <div className="rp-viz-fall-plot">
              <span className="rp-viz-fall-bar" data-kind={b.kind} data-pass={b.passThrough ? "" : undefined} style={{ bottom: pct(b.from), height: `max(6px, ${pct(b.to - b.from)})` }}>
                <span className="rp-viz-fall-num">{sign(b)}{format(b.value)}</span>
              </span>
              {i < bars.length - 1 && <span className="rp-viz-fall-link" style={{ bottom: pct(b.end) }} />}
            </div>
            <div className="rp-viz-fall-label">{b.label}</div>
            {b.hint && <div className="rp-viz-fall-hint">{b.hint}</div>}
          </div>
        ))}
      </div>
      <ol className="rp-viz-fall-rows" aria-hidden="true">
        {bars.map((b, i) => (
          <li key={b.key} className="rp-viz-fall-row" data-kind={b.kind} data-last={i === bars.length - 1 ? "" : undefined}>
            <span className="rp-viz-fall-row-label">{b.label}{b.hint && <span className="rp-viz-fall-hint">{b.hint}</span>}</span>
            <span className="rp-viz-fall-row-track">
              <span className="rp-viz-fall-bar" data-kind={b.kind} data-pass={b.passThrough ? "" : undefined} style={{ left: pct(b.from), width: `max(6px, ${pct(b.to - b.from)})` }} />
            </span>
            <span className="rp-viz-fall-row-num">{sign(b)}{format(b.value)}</span>
          </li>
        ))}
      </ol>
      <figcaption className="rp-viz-fall-key">
        <span><i className="rp-viz-swatch" data-kind="total" aria-hidden="true" />Total</span>
        {steps.some(s => s.kind === "plus" && !s.passThrough) && <span><i className="rp-viz-swatch" data-kind="plus" aria-hidden="true" />Added</span>}
        {steps.some(s => s.kind === "minus" && !s.passThrough) && <span><i className="rp-viz-swatch" data-kind="minus" aria-hidden="true" />Taken off</span>}
        {hasPass && <span><i className="rp-viz-swatch" data-kind="pass" aria-hidden="true" />Collected and passed on</span>}
      </figcaption>
    </figure>
  );
}

export interface FunnelStep { key: string; label: string; count: number; details?: ReactNode }

/**
 * Narrowing bars with the share that stopped between each step. Widths use a square root by default so small steps
 * stay readable, and the chart says so; `scale="linear"` draws true widths (with a small minimum).
 */
export function Funnel({ steps, label, scale = "sqrt" }: { steps: FunnelStep[]; label: string; scale?: "sqrt" | "linear" }) {
  const top = Math.max(1, ...steps.map(s => s.count));
  let biggest = -1, biggestAt = -1;
  steps.forEach((s, i) => {
    if (i === 0 || steps[i - 1].count <= 0) return;
    const stop = 1 - s.count / steps[i - 1].count;
    if (stop > biggest) { biggest = stop; biggestAt = i; }
  });
  const width = (n: number) => Math.max(8, (scale === "linear" ? n / top : Math.sqrt(n / top)) * 100);
  return (
    <div className="rp-viz-funnel-wrap">
    <ol className="rp-viz-funnel" aria-label={label}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const stop = prev && prev > 0 ? Math.max(0, Math.round((1 - s.count / prev) * 100)) : null;
        return (
          <Fragment key={s.key}>
            {stop !== null && <li className="rp-viz-funnel-gap" data-worst={i === biggestAt && biggest > 0 ? "" : undefined} aria-hidden="true">▼ {stop}% stop here{i === biggestAt && biggest > 0 ? " · biggest drop" : ""}</li>}
            <FunnelLine step={s} width={width(s.count)} last={i === steps.length - 1}
              said={`${s.label}: ${s.count.toLocaleString()}${stop !== null ? `, ${stop}% stopped before this step` : ""}`} />
          </Fragment>
        );
      })}
    </ol>
    <p className="rp-viz-note">{scale === "linear" ? "Bar widths match the counts." : "Bar widths are scaled so small steps stay visible — read the numbers and the % between steps."}</p>
    </div>
  );
}

function FunnelLine({ step, width, last, said }: { step: FunnelStep; width: number; last: boolean; said: string }) {
  const [open, setOpen] = useState(false);
  const bar = (
    <span className="rp-viz-funnel-bar" data-last={last ? "" : undefined} style={{ width: `${width}%` }}>
      <span>{step.details && <span aria-hidden="true" className="rp-ov-drill-mark">{open ? "▾" : "▸"}</span>}{step.label}</span><strong>{step.count.toLocaleString()}</strong>
    </span>
  );
  return (
    <li className="rp-viz-funnel-step" aria-label={said}>
      {step.details ? <button type="button" className="rp-viz-funnel-btn" aria-expanded={open} onClick={() => setOpen(v => !v)}>{bar}</button> : bar}
      {step.details && open && <div className="rp-ov-drill-body">{step.details}</div>}
    </li>
  );
}

/** A weekday × hour grid of shaded cells, with the busiest stretch written underneath. */
export function HeatGrid({ rows, max, label, unit = "order" }: { rows: Array<{ day: string; hours: number[] }>; max: number; label: string; unit?: string }) {
  let best = { d: "", h: 0, n: 0 };
  rows.forEach(r => r.hours.forEach((n, h) => { if (n > best.n) best = { d: r.day, h, n }; }));
  const ties = best.n ? rows.reduce((t, r) => t + r.hours.filter(n => n === best.n).length, 0) - 1 : 0;
  const top = Math.max(1, max);
  const hourName = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  const plural = (n: number) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return (
    <figure className="rp-viz-heat" aria-label={`${label}. Busiest: ${best.n ? `${best.d} ${hourName(best.h)} with ${plural(best.n)}` : "none yet"}`}>
      <div className="rp-viz-heat-grid" aria-hidden="true">
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="rp-viz-heat-hour">{h % 6 === 0 ? hourName(h) : ""}</span>)}
        {rows.map(r => (
          <Fragment key={r.day}>
            <span className="rp-viz-heat-day">{r.day}</span>
            {r.hours.map((n, h) => (
              <span key={h} className="rp-viz-heat-cell" title={`${r.day} ${hourName(h)}: ${plural(n)}`}
                data-best={best.n && r.day === best.d && h === best.h ? "" : undefined}
                data-empty={n ? undefined : ""} style={n ? ({ "--rp-heat": (Math.min(1, n / top)).toFixed(3) } as any) : undefined} />
            ))}
          </Fragment>
        ))}
      </div>
      <figcaption className="rp-viz-heat-key">
        <span className="rp-viz-heat-scale" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <span>Fewer → more {unit}s (0 to {plural(top)} an hour).</span>
        {best.n > 0 && <strong>Busiest (outlined): {best.d} around {hourName(best.h)}, {plural(best.n)}{ties > 0 ? `, tied with ${ties} other time${ties === 1 ? "" : "s"}` : ""}.</strong>}
      </figcaption>
    </figure>
  );
}

/** Vertical columns for a short series (weekdays, weeks), the period before hatched beside each. */
export function Columns({ items, label, format = (n: number) => n.toLocaleString() }: {
  items: Array<{ key: string; label: string; value: number; prev?: number; title?: string; details?: ReactNode }>; label: string; format?: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map(i => Math.max(i.value, i.prev || 0)));
  const top = items.reduce((b, i) => (i.value > b ? i.value : b), 0);
  return (
    <figure className="rp-viz-cols" aria-label={`${label}: ${items.map(i => `${i.label} ${format(i.value)}`).join(", ")}`}>
      <div className="rp-viz-cols-row" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(i => (
          <div key={i.key} className="rp-viz-col" title={i.title}>
            <span className="rp-viz-col-num">{i.value ? format(i.value) : ""}</span>
            <div className="rp-viz-col-plot">
              {i.prev !== undefined && i.prev > 0 && <span className="rp-viz-col-prev" style={{ height: `${(i.prev / max) * 100}%` }} />}
              <span className="rp-viz-col-bar" data-top={i.value > 0 && i.value === top ? "" : undefined} style={{ height: `${(i.value / max) * 100}%` }} />
            </div>
            <span className="rp-viz-col-label">{i.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** "21 days left" bars on a fixed day scale, with the printer's usual wait marked as a dashed line. */
export function DaysLeft({ rows, leadDays, label, scaleDays = 120 }: {
  rows: Array<{ key: string; label: ReactNode; sub: ReactNode; days: number | null; cover?: string | null; coverText?: string }>;
  leadDays: number; label: string; scaleDays?: number;
}) {
  const id = useId();
  const state = (d: number | null) => (d === null ? "none" : d <= leadDays ? "now" : d <= leadDays * 1.5 ? "soon" : "fine");
  const words = { now: "! Reprint now", soon: "◐ Plan a reprint", fine: "✓ Fine", none: "– No recent sales" } as const;
  return (
    <ul className="rp-viz-days" aria-label={label} aria-describedby={`${id}-key`}>
      {rows.map(r => {
        const s = state(r.days);
        return (
          <li key={r.key} className="rp-viz-days-row" data-state={s}>
            {(r.cover !== undefined || r.coverText) && <Cover url={r.cover} text={r.coverText || ""} size="sm" />}
            <div className="rp-viz-days-main">
              <div className="rp-viz-rank-head">
                <span className="rp-viz-rank-label">{r.label}</span>
                <span className="rp-viz-rank-value">{r.days === null ? "no sales lately" : r.days === 0 ? "sold out" : `${Math.round(r.days)} day${Math.round(r.days) === 1 ? "" : "s"} left`}</span>
              </div>
              <div className="rp-viz-days-track" aria-hidden="true">
                <span className="rp-viz-days-bar" style={{ width: `${clamp(((r.days === null ? scaleDays : r.days) / scaleDays) * 100)}%` }} />
                <span className="rp-viz-days-lead" style={{ left: `${clamp((leadDays / scaleDays) * 100)}%` }} />
              </div>
              <div className="rp-viz-rank-sub">{r.sub} <span className="rp-viz-pill" data-state={s}>{words[s]}</span></div>
            </div>
          </li>
        );
      })}
      <li id={`${id}-key`} className="rp-viz-days-key">Bar = days until sold out at the last 30 days' pace (0–{scaleDays}+). Dashed line = a reprint's usual wait ({leadDays} days).</li>
    </ul>
  );
}

/** A table-like grid of shaded cells: deeper colour = a higher share. `cells` are percentages; null = not yet. */
export function ShadeGrid({ head, rows, label }: { head: string[]; rows: Array<{ key: string; label: ReactNode; sub?: ReactNode; cells: Array<number | null> }>; label: string }) {
  return (
    <div className="rp-viz-shade-wrap">
      <table className="rp-viz-shade" aria-label={label}>
        <thead><tr><th scope="col">First bought</th>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <th scope="row">{r.label}{r.sub && <span className="rp-viz-dim"> {r.sub}</span>}</th>
              {r.cells.map((c, i) => (
                <td key={i} data-none={c === null ? "" : undefined} data-zero={c === 0 ? "" : undefined}
                  title={c === null ? "Not yet" : undefined}
                  style={c ? { background: `color-mix(in srgb, var(--rp-primary) ${Math.round(12 + Math.min(1, c / 40) * 78)}%, var(--rp-surface))` } : undefined}>
                  {c === null ? <span className="rp-sr-only">not yet</span> : c === 0 ? "0" : `${Math.round(c)}%`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
