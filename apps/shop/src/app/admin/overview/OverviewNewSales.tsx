import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EmptyState, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, TextField } from "../riso/components";
import type { Book, Order } from "./overviewInsights";
import type { Range } from "./overviewRange";
import { monthPace } from "./overviewSeries";
import { shopDayKey } from "../../lib/shopDay";
import { smallPhotoUrl } from "../../features/site/photoSources";
import { money, moneyFigure, moneyShort } from "./OverviewParts";
import { Cover, RankBars, VizTable } from "./OverviewViz";
import {
  bookOfTheWeek, calendarLegend, calendarLevel, calendarMonths, goalGap, launchCurves, monthGoal, niceTicks, parseGoal, salesCalendar, shipHeadline,
  shipWeeks, signedMix,
} from "./overviewNewSales";
import "./overviewNew.css";

export type NewSalesWidget = "calendar" | "goal" | "shipDays" | "launches" | "bookOfWeek" | "signed";

const dayWords = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const fullDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthWords = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
const days = (n: number | null) => (n === null ? "—" : `${n < 10 ? n.toFixed(1) : Math.round(n)} day${n === 1 ? "" : "s"}`);

/**
 * Six Overview widgets added 19 October 2026 (Sales calendar, Month goal, Days to ship, Launch curves, Book of the week,
 * Signed or not). They draw only orders and books the board already loaded; the maths is in overviewNewSales.ts.
 */
export function OverviewNewSales({ only, paid, current, books, range, config, onConfig, full, onEditBook }: {
  only: NewSalesWidget; paid: Order[]; current: Order[]; previous?: Order[]; books: Book[]; range: Range;
  config: { goal?: number }; onConfig: (patch: { goal?: number }) => void; full?: boolean; onEditBook?: (id: string) => void;
}) {
  const today = shopDayKey(Date.now());
  switch (only) {
    case "calendar": return <SalesCalendarWidget paid={paid} today={today} />;
    case "goal": return <MonthGoalWidget paid={paid} today={today} goal={config.goal} onGoal={goal => onConfig({ goal })} />;
    case "shipDays": return <ShipDaysWidget paid={paid} today={today} />;
    case "launches": return <LaunchCurvesWidget paid={paid} books={books} today={today} full={full} />;
    case "bookOfWeek": return <BookOfWeekWidget paid={paid} books={books} today={today} onEditBook={onEditBook} />;
    case "signed": return <SignedWidget current={current} books={books} phrase={range.phrase} />;
  }
}

/** The rendered width of an element, kept up to date (0 until it has been laid out). A callback ref, so it also
 *  follows an element that only appears after the first render. */
function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [w, setW] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect(); ro.current = null;
    if (!el) return;
    const cs = getComputedStyle(el);
    setW(Math.round(el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)));
    if (typeof ResizeObserver === "undefined") return;
    ro.current = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, w];
}

/** Narrowest a calendar square may get before the calendar shows fewer weeks (the most recent ones). */
const MIN_CELL = 10;
const DAY_COL = 30;

function SalesCalendarWidget({ paid, today }: { paid: Order[]; today: string }) {
  const cal = useMemo(() => salesCalendar(paid, today), [paid, today]);
  const monthly = useMemo(() => calendarMonths(cal), [cal]);
  const [box, width] = useWidth<HTMLDivElement>();
  if (cal.daysWithSale === 0) {
    return <EmptyState inline title="No sales in the past 12 months"
      description="Each day a paid order comes in fills a square here, darker for bigger days. Once the first order is paid the calendar starts on its own." />;
  }
  // Squares grow to fill the widget; when there isn't room for a whole year at a readable size, the latest weeks show.
  const fit = width > 0 ? Math.floor((width - DAY_COL) / (MIN_CELL + 2)) : cal.weeks.length;
  const shown = Math.max(8, Math.min(cal.weeks.length, fit));
  const from = cal.weeks.length - shown;
  const weeks = cal.weeks.slice(from);
  const months = cal.months.map(m => ({ ...m, col: m.col - from })).filter(m => m.col >= 0);
  const legend = calendarLegend(cal.max);
  const summary = `Sales calendar, ${shown < cal.weeks.length ? `last ${shown} weeks shown of ` : ""}the past 12 months: ${money(cal.total)} over ${cal.daysWithSale} of ${cal.days} days with a sale.`
    + (cal.longest ? ` Longest run: ${cal.longest.length} days in a row (${dayWords(cal.longest.from)} to ${dayWords(cal.longest.to)}).` : "")
    + (cal.busiest ? ` Busiest day: ${fullDay(cal.busiest.date)}, ${money(cal.busiest.revenue)}.` : "");
  const ROWS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
  return (
    <div className="rp-nw">
      {monthly.best && <p className="rp-viz-takeaway">Best month: <strong>{monthWords(monthly.best.month)}</strong>, {moneyFigure(monthly.best.revenue)}.</p>}
      <dl className="rp-nw-stats">
        <div><dt>Past 12 months</dt><dd>{moneyFigure(cal.total)}</dd></div>
        <div><dt>Sold on</dt><dd>{cal.daysWithSale} <small>of {cal.days} days</small></dd></div>
        {cal.longest && <div><dt>Longest run</dt><dd>{cal.longest.length} days <small>({dayWords(cal.longest.from)} – {dayWords(cal.longest.to)})</small></dd></div>}
        {cal.busiest && <div><dt>Busiest day</dt><dd>{moneyFigure(cal.busiest.revenue)} <small>{fullDay(cal.busiest.date)}</small></dd></div>}
      </dl>
      <figure className="rp-nw-cal" aria-label={summary} ref={box}>
        <div className="rp-nw-cal-grid" aria-hidden="true" style={{ gridTemplateColumns: `${DAY_COL - 3}px repeat(${weeks.length}, minmax(0, 1fr))` }}>
          <span />
          {weeks.map((_, c) => <span key={c} className="rp-nw-cal-month">{months.find(m => m.col === c)?.label || ""}</span>)}
          {ROWS.map((name, r) => (
            <Row key={r} name={name} cells={weeks.map(w => w[r])} max={cal.max} />
          ))}
        </div>
        <figcaption className="rp-nw-cal-key">
          {shown < cal.weeks.length && <span className="rp-nw-cal-note">Last {shown} weeks shown; every month is in the table below.</span>}
          <span className="rp-nw-cal-scale">
            <span><i className="rp-nw-cal-cell" data-level={0} aria-hidden="true" />No sale</span>
            {legend.map((l, i) => (
              <span key={l.level}><i className="rp-nw-cal-cell" data-level={l.level} aria-hidden="true" />
                {i === 0 ? `up to ${moneyShort(l.upTo)}` : i === legend.length - 1 ? `${moneyShort(legend[i - 1].upTo)}–${moneyShort(l.upTo)} (best day)` : `${moneyShort(legend[i - 1].upTo)}–${moneyShort(l.upTo)}`}
              </span>
            ))}
          </span>
        </figcaption>
      </figure>
      <VizTable caption="Net sales by month, past 12 months" head={["Month", "Sales", "Orders"]} summary="View months as a table"
        rows={monthly.months.map(m => ({ key: m.month, cells: [monthWords(m.month), money(m.revenue), m.orders.toLocaleString()] }))} />
    </div>
  );
}

function Row({ name, cells, max }: { name: string; cells: Array<{ date: string; revenue: number; orders: number } | null>; max: number }) {
  return (
    <>
      <span className="rp-nw-cal-day">{name}</span>
      {cells.map((d, i) => d
        ? <i key={i} className="rp-nw-cal-cell" data-level={calendarLevel(d.revenue, max)}
            title={`${fullDay(d.date)}: ${d.orders ? `${money(d.revenue)} · ${d.orders} order${d.orders === 1 ? "" : "s"}` : "no sale"}`} />
        : <i key={i} className="rp-nw-cal-cell" data-empty />)}
    </>
  );
}

function MonthGoalWidget({ paid, today, goal, onGoal }: { paid: Order[]; today: string; goal?: number; onGoal: (goal: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(goal ? String(goal) : "");
  const [error, setError] = useState("");
  const input = useRef<HTMLDivElement>(null);
  const g = useMemo(() => monthGoal(paid, today, goal || 0), [paid, today, goal]);
  const pace = useMemo(() => monthPace(paid, today), [paid, today]);
  useEffect(() => { if (editing) input.current?.querySelector("input")?.focus(); }, [editing]);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = parseGoal(text);
    if (n === null) { setError("Type an amount in dollars, for example 2000."); return; }
    setError(""); setEditing(false); onGoal(n);
  };
  if (!goal || editing) {
    return (
      <form className="rp-nw rp-nw-goalform" onSubmit={save} aria-label={goal ? "Change the monthly goal" : "Set a monthly goal"}>
        <p className="rp-hint" style={{ margin: 0 }}>
          {goal ? "Change the amount you want to take in each month." : "Set what you'd like to take in each month, and this shows whether you're on track."}
          {" "}So far in {g.month}: <strong>{money(g.soFar)}</strong>.
        </p>
        <div ref={input}>
          <TextField label="Monthly goal (CA$)" inputMode="decimal" value={text} onChange={e => setText(e.target.value)} error={error || undefined} placeholder="e.g. 2,000"
            hint="Net sales after refunds, this calendar month. Each Month goal widget keeps its own amount." />
        </div>
        <div className="rp-nw-row">
          <PrimaryButton size="sm" type="submit">{goal ? "Save goal" : "Set goal"}</PrimaryButton>
          {goal ? <GhostButton size="sm" type="button" onClick={() => { setEditing(false); setError(""); setText(String(goal)); }}>Cancel</GhostButton> : null}
        </div>
      </form>
    );
  }
  const gap = goalGap(g);
  const R = 52, C = 2 * Math.PI * R;
  const shown = Math.min(100, g.share);
  const paceAngle = (g.paceShare / 100) * 2 * Math.PI - Math.PI / 2;
  const reached = g.soFar >= g.goal;
  const verdict = reached ? "Goal reached" : g.ahead ? `Ahead of pace by ${moneyFigure(Math.round(gap.paceGap))}` : `Behind pace by ${moneyFigure(Math.round(-gap.paceGap))}`;
  const said = `${money(g.soFar)} of a ${money(g.goal)} goal for ${g.month} (${Math.round(g.share)}%). ${g.daysIn} of ${g.daysInMonth} days gone, so an even pace would be ${Math.round(g.paceShare)}%. ${verdict}.`;
  return (
    <div className="rp-nw rp-nw-goal">
      <svg className="rp-nw-ring" viewBox="0 0 128 128" role="img" aria-label={said}>
        <circle cx="64" cy="64" r={R} className="rp-nw-ring-track" />
        <circle cx="64" cy="64" r={R} className="rp-nw-ring-fill" data-ahead={g.ahead ? "" : undefined}
          strokeDasharray={`${(shown / 100) * C} ${C}`} transform="rotate(-90 64 64)" />
        <line className="rp-nw-ring-pace" x1={64 + Math.cos(paceAngle) * (R - 11)} y1={64 + Math.sin(paceAngle) * (R - 11)} x2={64 + Math.cos(paceAngle) * (R + 11)} y2={64 + Math.sin(paceAngle) * (R + 11)} />
        <text x="64" y="62" className="rp-nw-ring-big">{Math.round(g.share)}%</text>
        <text x="64" y="80" className="rp-nw-ring-small">of goal</text>
      </svg>
      <div className="rp-nw-goal-text">
        <span className="rp-viz-hero">{moneyFigure(g.soFar)}</span>
        <span className="rp-viz-hero-sub">of {moneyFigure(g.goal)} · {g.month}, day {g.daysIn} of {g.daysInMonth}</span>
        <div style={{ margin: "10px 0 6px" }}><StatusBadge tone={g.ahead ? "success" : "warning"} glyph={g.ahead ? "✓" : "!"}>{verdict}</StatusBadge></div>
        <p className="rp-hint" style={{ margin: 0 }}>
          {reached ? <>You've taken in {moneyFigure(g.soFar - g.goal)} more than the goal. </>
            : gap.perDay !== null ? <><strong>{moneyFigure(Math.round(gap.toGo))} to go</strong> — about {moneyFigure(Math.round(gap.perDay))} a day for the {gap.daysLeft} day{gap.daysLeft === 1 ? "" : "s"} left. </>
            : <><strong>{moneyFigure(Math.round(gap.toGo))} to go</strong> today, the last day of the month. </>}
          {pace ? <>At this month's pace you'd end near <strong>{moneyFigure(Math.round(pace.projected))}</strong>.</> : null}
        </p>
        <p className="rp-viz-note">The tick on the ring is where an even pace would put you today ({Math.round(g.paceShare)}%).</p>
        <SecondaryButton size="sm" onClick={() => { setText(String(goal)); setEditing(true); }} style={{ marginTop: 10 }}>Change goal</SecondaryButton>
      </div>
    </div>
  );
}

function ShipDaysWidget({ paid, today }: { paid: Order[]; today: string }) {
  const weeks = useMemo(() => shipWeeks(paid, today), [paid, today]);
  const head = useMemo(() => shipHeadline(paid, today), [paid, today]);
  if (weeks.every(w => !w.shipped)) {
    return <EmptyState inline title="Nothing shipped in the last 12 weeks"
      description="Mark a parcel as sent in Orders (with or without a label) and this shows how many days it waited after payment." />;
  }
  const faster = head.recent !== null && head.before !== null ? head.recent < head.before - 0.05 ? "faster" : head.recent > head.before + 0.05 ? "slower" : "same" : null;
  const top = Math.max(1, ...weeks.map(w => w.median || 0));
  const latest = weeks.length - 1;
  const slowest = weeks.reduce((b, w, i) => ((w.median ?? -1) > (weeks[b].median ?? -1) ? i : b), 0);
  const ticks = niceTicks(top, 2);
  const scale = ticks[ticks.length - 1];
  // Every third week is labelled (the latest always), so labels never squeeze into "J… A…".
  const labelled = (i: number) => i === latest || (latest - i) % 3 === 0;
  return (
    <div className="rp-nw">
      <div className="rp-nw-head">
        <div><span className="rp-viz-hero">{days(head.recent)}</span><span className="rp-viz-hero-sub">typical wait, last 4 weeks</span></div>
        {faster && <StatusBadge tone={faster === "faster" ? "success" : faster === "slower" ? "warning" : "neutral"} glyph={faster === "faster" ? "✓" : faster === "slower" ? "!" : "="}>
          {faster === "faster" ? "Faster" : faster === "slower" ? "Slower" : "About the same"} than the 4 weeks before ({days(head.before)})</StatusBadge>}
      </div>
      <figure className="rp-nw-ship" aria-label={`Typical days to ship, by week: ${weeks.map(w => `week of ${w.label} ${w.shipped ? days(w.median) : "nothing shipped"}`).join(", ")}.`}>
        <div className="rp-nw-ship-plot" aria-hidden="true">
          {ticks.slice(1).map(t => <span key={t} className="rp-nw-ship-grid" style={{ bottom: `${(t / scale) * 100}%` }}><span>{t}d</span></span>)}
          <div className="rp-nw-ship-cols" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((w, i) => (
              <div key={w.week} className="rp-nw-ship-col" data-latest={i === latest ? "" : undefined} data-none={w.shipped ? undefined : ""}
                title={`Week of ${w.label}: ${w.shipped ? `${days(w.median)} typical, ${w.shipped} parcel${w.shipped === 1 ? "" : "s"}` : "nothing shipped"}`}>
                {i === slowest && w.median !== null && i !== latest && <span className="rp-nw-ship-flag">slowest</span>}
                <span className="rp-nw-ship-bar" style={{ height: `${((w.median || 0) / scale) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="rp-nw-ship-labels" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.map((w, i) => <span key={w.week}>{labelled(i) ? (i === latest ? "This wk" : w.label) : ""}</span>)}
        </div>
      </figure>
      <p className="rp-viz-note">Each column is one week, by the day parcels left; this week in red. Days count from payment; pre-orders count from release day.</p>
      <VizTable caption="Typical days to ship, by week" head={["Week of", "Typical days", "Parcels"]}
        rows={weeks.map(w => ({ key: w.week, cells: [w.label, w.shipped ? days(w.median) : "—", w.shipped.toLocaleString()] }))} />
    </div>
  );
}

const LAUNCH_PAD = { l: 34, t: 10, b: 24 };
function LaunchCurvesWidget({ paid, books, today, full }: { paid: Order[]; books: Book[]; today: string; full?: boolean }) {
  const curves = useMemo(() => launchCurves(paid, books, today, full ? 6 : 4), [paid, books, today, full]);
  const [box, width] = useWidth<HTMLDivElement>();
  if (!curves.length) {
    return <EmptyState inline title="No book has sold yet"
      description="Each book's first 30 days of sales draw here as a line, starting from its first paid order. Publish a book and share it to start one." />;
  }
  // Drawn at the widget's real width, so text stays at its true size (no scaled-up SVG lettering).
  const W = Math.max(260, width || 320), H = full ? 280 : 200;
  const endLabels = W >= 460;
  const P = { ...LAUNCH_PAD, r: endLabels ? Math.min(170, Math.round(W * 0.3)) : 12 };
  const top = Math.max(1, ...curves.map(c => c.total));
  const ticks = niceTicks(top, 3);
  const max = ticks[ticks.length - 1];
  const x = (d: number) => P.l + (d / 30) * (W - P.l - P.r);
  const y = (n: number) => H - P.b - (n / max) * (H - P.t - P.b);
  // End labels sit beside each line's last point, nudged apart so two launches never print on top of each other.
  const labels = curves.map((c, i) => ({ i, c, y: y(c.total) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 14) labels[k].y = labels[k - 1].y + 14;
  const leader = curves[0];
  const said = curves.map(c => `${c.title}: ${c.total} cop${c.total === 1 ? "y" : "ies"} by day ${c.daysSoFar}`).join("; ");
  const maxChars = Math.max(6, Math.floor((P.r - 10) / 6.4));
  const cut = (t: string) => (t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t);
  return (
    <div className="rp-nw" ref={box}>
      <p className="rp-viz-takeaway">Newest: <strong>{leader.title}</strong>, {leader.total} cop{leader.total === 1 ? "y" : "ies"} in its first {leader.daysSoFar} day{leader.daysSoFar === 1 ? "" : "s"}.</p>
      <svg className="rp-nw-launch" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Launch curves, copies sold in each book's first 30 days. ${said}.`}>
        {ticks.map(t => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="rp-nw-grid" /><text x={P.l - 6} y={y(t) + 4} className="rp-nw-axis" textAnchor="end">{t}</text></g>)}
        {[0, 10, 20, 30].map(d => <text key={d} x={x(d)} y={H - 6} className="rp-nw-axis" textAnchor={d === 0 ? "start" : d === 30 && !endLabels ? "end" : "middle"}>{d === 0 ? "Day 0" : `Day ${d}`}</text>)}
        {[...curves].reverse().map((c, ri) => {
          const i = curves.length - 1 - ri;
          return <path key={c.id} d={c.points.map((n, d) => `${d ? "L" : "M"}${x(d).toFixed(1)},${y(n).toFixed(1)}`).join(" ")} className="rp-nw-line" data-rank={Math.min(i, 3)}>
            <title>{`${c.title}: ${c.total} by day ${c.daysSoFar}`}</title>
          </path>;
        })}
        {curves.map((c, i) => <circle key={c.id} cx={x(c.daysSoFar)} cy={y(c.total)} r={i === 0 ? 4 : 3} className="rp-nw-dot" data-rank={Math.min(i, 3)} />)}
        {endLabels && labels.map(l => (
          <text key={l.c.id} x={W - P.r + 8} y={l.y + 4} className="rp-nw-endlabel" data-rank={Math.min(l.i, 3)}>
            {cut(l.c.title)} <tspan className="rp-nw-endval">{l.c.total}</tspan>
          </text>
        ))}
      </svg>
      <ul className="rp-nw-legend" aria-label="Books in the chart">
        {curves.map((c, i) => (
          <li key={c.id}>
            <i className="rp-nw-key" data-rank={Math.min(i, 3)} aria-hidden="true" />
            <span className="rp-nw-legend-title">{c.title}{i === 0 && <span className="rp-viz-dim"> (newest)</span>}</span>
            <span className="rp-nw-legend-val">{c.total} by day {c.daysSoFar}{c.daysSoFar < 30 ? " so far" : ""} · first sale {dayWords(c.firstDay)}</span>
          </li>
        ))}
      </ul>
      <p className="rp-viz-note">Copies sold, counted from each book's first paid order. The newest launch is red; older ones are grey.</p>
    </div>
  );
}

function BookOfWeekWidget({ paid, books, today, onEditBook }: { paid: Order[]; books: Book[]; today: string; onEditBook?: (id: string) => void }) {
  const top = useMemo(() => bookOfTheWeek(paid, today), [paid, today]);
  if (!top) {
    return <EmptyState inline title="No sales in the last 7 days"
      description="The book that sells the most copies in the last 7 days shows here, against the week before. A post or newsletter about one title is a quick way to wake it up." />;
  }
  const book = books.find(b => String(b.id) === top.id);
  const diff = top.copies - top.before;
  return (
    <div className="rp-nw rp-nw-bow">
      <Cover url={smallPhotoUrl(book?.photos?.[0], 160) || null} text={top.title} />
      <div style={{ minWidth: 0 }}>
        <StatusBadge tone="neutral" glyph="★">#1 this week</StatusBadge>
        <div className="rp-nw-bow-title">{onEditBook ? <button type="button" className="rp-nw-link" onClick={() => onEditBook(top.id)}>{top.title}</button> : top.title}</div>
        <span className="rp-viz-hero">{top.copies} <small className="rp-nw-unit">cop{top.copies === 1 ? "y" : "ies"}</small></span>
        <span className="rp-viz-hero-sub">{money(top.revenue)} in the last 7 days</span>
        <p className="rp-hint" style={{ margin: "4px 0 0" }}>
          {top.before === 0 ? "No copies the week before." : diff > 0 ? `Up from ${top.before} the week before${top.beforeRank ? ` (#${top.beforeRank} then)` : ""}.` : diff < 0 ? `Down from ${top.before} the week before, but still the top seller.` : `Same as the week before (${top.before}).`}
          {top.runnerUp ? ` Runner-up: ${top.runnerUp}.` : ""}
        </p>
      </div>
    </div>
  );
}

function SignedWidget({ current, books, phrase }: { current: Order[]; books: Book[]; phrase: string }) {
  const mix = useMemo(() => signedMix(current, books), [current, books]);
  if (!mix.rows.length) {
    return <EmptyState inline title={mix.booksWithSigned ? `No signed or unsigned copies sold in ${phrase}` : "No signed editions yet"}
      description='A copy counts as signed when its edition is named with the word "Signed" (for example "Signed hardcover"). Name an edition that way in Books › edit › Editions and it shows up here.' />;
  }
  return (
    <div className="rp-nw">
      <div className="rp-nw-head">
        <div><span className="rp-viz-hero">{Math.round(mix.share)}%</span><span className="rp-viz-hero-sub">of these copies sold signed · {mix.signed} of {mix.all}</span></div>
      </div>
      <RankBars label="Share of copies sold signed, by book" scaleMax={100}
        rows={mix.rows.map(r => ({
          key: r.id, label: r.title, value: r.share,
          valueText: `${Math.round(r.share)}% signed`,
          sub: `${r.signed} signed · ${r.unsigned} not${r.signedPrice !== null && r.unsignedPrice !== null ? ` · signed ${money(r.signedPrice)} vs ${money(r.unsignedPrice)}` : ""}`,
        }))} />
      <p className="rp-hint rp-nw-foot">
        {mix.premium !== null ? <>Readers paid <strong>{money(Math.abs(mix.premium))} {mix.premium >= 0 ? "more" : "less"}</strong> on average for a signed copy of the same book. </> : null}
        Books with a signed edition, {phrase}. Bar = share of copies sold signed.
      </p>
    </div>
  );
}
