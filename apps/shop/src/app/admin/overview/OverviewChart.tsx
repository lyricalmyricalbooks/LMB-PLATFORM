import { useEffect, useMemo, useRef } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Checkbox, DataTable, ErrorState, LoadingState, SecondaryButton } from "../riso/components";
import type { Order } from "./overviewInsights";
import { autoGrain, resolveRange, type CompareMode, type Grain, type Range } from "./overviewRange";
import { bucketSeries, buildRangeSeries, CHART_METRICS, metricValue, seriesSummary, type ChartMetric } from "./overviewSeries";
import type { TrafficFigures, TrafficGap } from "./overviewSources";
import type { ChartGrain, WidgetConfig } from "./overviewBoard";
import { Trend, money, moneyShort, percent } from "./OverviewParts";

/**
 * One trend chart on the Overview board. Each chart widget keeps its own measure, grouping and comparison
 * (saved in the widget's settings), so the owner can line up revenue, orders and visitors side by side.
 */
/**
 * Why the visitors aren't Google's, or aren't there: one tinted line (the admin's alert style) with the way to fix it.
 * A window Google and the shop's counter both left empty says so instead of drawing a flat line at 0.
 */
function TrafficGapNote({ gap, phrase, onOpen }: { gap: TrafficGap; phrase: string; onOpen?: () => void }) {
  const wrongProperty = gap.mismatch
    ? <>The property Google reads doesn't hold your shop's tag <span className="rp-mono" style={{ whiteSpace: "nowrap" }}>{gap.mismatch.tag}</span>.</>
    : null;
  const [title, detail] = gap.kind === "empty" ? ["No visitors recorded", wrongProperty || `Google Analytics and the shop's counter have nothing for ${phrase}.`]
    : gap.kind === "fallback" ? ["Google Analytics came back empty", <>{wrongProperty}{wrongProperty && " "}Showing the shop's own counter.</>]
    : ["Check your Google Analytics property", wrongProperty];
  return (
    <div role="status" className="rp-alert rp-ov-gap" data-tone="warning">
      <span className="rp-alert-glyph" aria-hidden="true">!</span>
      <div className="rp-alert-text">
        <span className="rp-alert-kicker">Visitors</span>
        <strong className="rp-alert-title">{title}</strong>
        <span className="rp-alert-detail">{detail}</span>
      </div>
      {onOpen && <div className="rp-alert-actions"><SecondaryButton size="sm" onClick={onOpen}>Check connection</SecondaryButton></div>}
    </div>
  );
}

export function OverviewChart({ widgetId, paid, range, compareMode, traffic, trafficReady, trafficFailed, ordersError, sourceName, trafficGap = null, onOpenTrafficSettings, config, onConfig, onRetry, onRetryTraffic, full }: {
  widgetId: string; paid: Order[] | null; range: Range; compareMode: CompareMode; traffic: TrafficFigures | null;
  trafficReady: boolean; trafficFailed: boolean; ordersError: boolean; sourceName: string;
  trafficGap?: TrafficGap | null; onOpenTrafficSettings?: () => void;
  config: WidgetConfig; onConfig: (patch: WidgetConfig) => void; onRetry: () => void; onRetryTraffic: () => void; full?: boolean;
}) {
  const metric: ChartMetric = config.metric || "revenue";
  const grainChoice: ChartGrain = config.grain || "auto";
  const showCompare = config.compare !== false;
  const tabIds = useRef(Object.fromEntries(CHART_METRICS.map(m => [m.id, `${widgetId}-tab-${m.id}`])) as Record<ChartMetric, string>);
  const panelId = `${widgetId}-panel`;

  // "Today" has no hourly data, so it shows the last 7 days for context.
  const chartRange = useMemo(() => (range.preset === "today" ? resolveRange("7d", { compare: compareMode }) : range), [range, compareMode]);
  const meta = CHART_METRICS.find(m => m.id === metric) || CHART_METRICS[0];
  // Days in the range with anything to chart for this measure: a quiet month groups by week under Auto.
  const daySeries = useMemo(() => (paid ? buildRangeSeries(paid, chartRange, traffic?.visitsOn || (() => 0)) : []), [paid, chartRange, traffic]);
  const activeDays = useMemo(() => daySeries.filter(d => (metricValue(d, metric) || 0) > 0).length, [daySeries, metric]);
  const auto = autoGrain(chartRange.days, daySeries.length ? activeDays : undefined);
  const grain: Grain = grainChoice === "auto" ? auto : grainChoice;
  // Draw-in animation only the first time the chart appears (never on refresh or a measure switch), and never with
  // reduced motion.
  const animate = useRef(typeof window !== "undefined" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { const t = setTimeout(() => { animate.current = false; }, 1500); return () => clearTimeout(t); }, []);
  // Google's figures cover only the chosen range, so "Today"'s 7-day context can't chart Google visitors.
  const visitorsCharted = trafficReady && !(range.preset === "today" && traffic?.source === "google");
  const usable = !meta.needsTraffic || visitorsCharted;
  const buckets = useMemo(() => (paid ? bucketSeries(daySeries, grain) : []), [paid, daySeries, grain]);
  const data = useMemo(() => buckets.map(b => ({ key: b.date, label: b.label, value: metricValue(b, metric), prev: metricValue(b, metric, true) })), [buckets, metric]);
  const summary = useMemo(() => seriesSummary(buckets, metric), [buckets, metric]);
  const fmt = (v: number | null) => (v === null ? "—" : meta.kind === "money" ? money(v) : meta.kind === "percent" ? percent(v, 2) : Math.round(v).toLocaleString());
  const axisFmt = (v: number) => (meta.kind === "money" ? moneyShort(v) : meta.kind === "percent" ? `${v}%` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
  const empty = data.every(d => !d.value) && data.every(d => !d.prev);
  const words = buckets.length
    ? `${meta.label} by ${grain} over ${chartRange.phrase}: ${fmt(summary.value)}${summary.previous !== null ? ` (${fmt(summary.previous)} in ${chartRange.before})` : ""}.${summary.best ? ` Best ${grain}: ${summary.best.label}, ${fmt(summary.best.value)}.` : ""}`
    : "No chart data for this period.";

  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const ids = CHART_METRICS.map(m => m.id);
    const i = ids.indexOf(metric);
    const target = e.key === "Home" ? ids[0] : e.key === "End" ? ids[ids.length - 1] : ids[(i + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    onConfig({ metric: target });
    requestAnimationFrame(() => document.getElementById(tabIds.current[target])?.focus());
  };

  const ink = "var(--rp-text)";
  const flare = "var(--rp-primary)";
  return (
    <div className="rp-wb-chart">
      <div className="rp-ov-switch" role="tablist" aria-label="Chart measure">
        {CHART_METRICS.map(m => (
          <button key={m.id} id={tabIds.current[m.id]} type="button" role="tab" aria-selected={metric === m.id}
            aria-controls={panelId} tabIndex={metric === m.id ? 0 : -1} onKeyDown={onKey} onClick={() => onConfig({ metric: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabIds.current[metric]}>
        {ordersError ? <ErrorState title="Chart unavailable" description="Orders could not be loaded, so the trend can't be drawn." onRetry={onRetry} />
          : meta.needsTraffic && trafficFailed ? <ErrorState title="Traffic unavailable" description="Visits could not be loaded." onRetry={onRetryTraffic} />
          : !paid || (meta.needsTraffic && !trafficReady) ? <LoadingState label="Loading chart…" />
          : !usable ? <p className="rp-hint" style={{ marginTop: 16 }}>Google Analytics visitors chart over a longer period — choose 7 days or more.</p>
          : meta.needsTraffic && trafficGap?.kind === "empty" ? <TrafficGapNote gap={trafficGap} phrase={chartRange.phrase} onOpen={onOpenTrafficSettings} />
          : empty ? <p className="rp-hint" style={{ marginTop: 16 }}>{meta.needsTraffic ? "Visitors will chart here once the storefront records them." : "This will chart here once customers place paid orders."}</p>
          : (
            <>
              {meta.needsTraffic && trafficGap && <TrafficGapNote gap={trafficGap} phrase={chartRange.phrase} onOpen={onOpenTrafficSettings} />}
              <p className="rp-sr-only">{words}</p>
              <div className="rp-ov-chart-stats" aria-hidden="true">
                <span><b>{fmt(summary.value)}</b> {metric === "aov" || metric === "conversion" ? "average" : "in total"}{summary.previous !== null && <> · <Trend now={summary.value || 0} before={summary.previous || 0} /></>}</span>
                {summary.perDay !== null && <span><b>{fmt(summary.perDay)}</b> a day</span>}
                {summary.best && <span>Best {grain}: <b>{summary.best.label}</b> ({fmt(summary.best.value)})</span>}
              </div>
              <div style={{ height: full ? 420 : 240, width: "100%", marginTop: 8 }} role="img" aria-label={words}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ink} strokeOpacity={0.12} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{ fontSize: 11, fill: ink }} />
                    <YAxis axisLine={false} tickLine={false} width={48} tick={{ fontSize: 11, fill: ink }} tickFormatter={axisFmt} />
                    <Tooltip itemSorter={(item: any) => (item?.dataKey === "value" ? 0 : 1)} formatter={(v: any, name: any) => [fmt(v === null || v === undefined ? null : Number(v)), name]}
                      contentStyle={{ background: "var(--rp-surface)", border: "1px solid var(--rp-border)", borderRadius: 0, color: "var(--rp-text)", fontSize: 12 }} />
                    {showCompare && <Area type="linear" isAnimationActive={animate.current} dataKey="prev" name={`${meta.label} (${chartRange.compare === "lastYear" ? "last year" : "before"})`} stroke={ink} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 4" fill="none" connectNulls />}
                    <Area type="linear" isAnimationActive={animate.current} dataKey="value" name={meta.label} stroke={flare} strokeWidth={3} fill={flare} fillOpacity={0.14} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="rp-ov-lead-foot">
                <span className="rp-ov-legend">
                  <span><i data-line="solid" aria-hidden="true" style={{ borderTopColor: flare }} />{meta.label}{meta.needsTraffic ? ` · ${sourceName}` : ""}</span>
                  {showCompare && <span><i data-line="dashed" aria-hidden="true" />{chartRange.compare === "lastYear" ? "Same days last year" : range.preset === "today" ? "Week before" : "Period before"}</span>}
                </span>
                <span style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="rp-viz-grain">Group by
                    <select value={grainChoice} onChange={e => onConfig({ grain: e.target.value as ChartGrain })}>
                      {(["auto", "day", "week", "month"] as const).map(g => (
                        <option key={g} value={g}>{g === "auto" ? `Automatic (${auto})` : g === "day" ? "Day" : g === "week" ? "Week" : "Month"}</option>
                      ))}
                    </select>
                  </label>
                  <Checkbox label="Show comparison" checked={showCompare} onChange={e => onConfig({ compare: e.target.checked })} />
                </span>
              </div>
              {range.preset === "today" && <p className="rp-hint" style={{ marginTop: 4 }}>Hourly data isn't recorded — the chart shows the last 7 days for context.</p>}
              <details className="rp-ov-table-toggle" open={full || undefined}>
                <summary>View chart data as a table</summary>
                <div style={{ marginTop: 8 }}>
                  <DataTable caption="Chart data" rows={data} rowKey={d => d.key}
                    columns={[
                      { key: "d", header: grain === "day" ? "Date" : grain === "week" ? "Week" : "Month", render: d => d.label },
                      { key: "v", header: meta.label, numeric: true, render: d => fmt(d.value) },
                      { key: "p", header: chartRange.compare === "lastYear" ? "Last year" : "Before", numeric: true, render: d => fmt(d.prev) },
                    ]} />
                </div>
              </details>
            </>
          )}
      </div>
    </div>
  );
}
