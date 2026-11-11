// Analytics (11 November 2026, Julian): store traffic for a period you pick. Visitors, visits, page views, where people
// came from, what they looked at, their devices and countries, the path to a purchase and what they searched for.
// Google Analytics when it is connected and recorded visitors, otherwise the shop's own counter (analyticsModel.ts).
// Built from the shared .rp-tiles / .rp-tile / .rp-tablecard classes; colours from tokens only (analytics.css).
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api";
import { getOrdersCached } from "../ordersCache";
import { forgetReports, googleAnalyticsApi, type Ga4Answer } from "../googleAnalytics";
import { resolveRange, trafficShift, trafficWindow, type Preset } from "../overview/overviewRange";
import { ErrorState, LoadingState, PageActions, SecondaryButton, Tabs } from "../riso/components";
import { analyticsModel, change, type Bar, type Pair, type Row } from "./analyticsModel";
import { useShopWords } from "../shopWords";
import "./analytics.css";

const PERIODS: Array<{ id: Preset; label: string }> = [
  { id: "today", label: "Today" }, { id: "7d", label: "7 days" }, { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" }, { id: "ytd", label: "This year" }, { id: "365d", label: "12 months" },
];
const PERIOD_KEY = "lm:analytics-period";
const readPeriod = (): Preset => {
  try { const v = window.localStorage.getItem(PERIOD_KEY) as Preset | null; return v && PERIODS.some(p => p.id === v) ? v : "30d"; } catch { return "30d"; }
};

const fmt = (n: number) => n.toLocaleString("en-CA");
const pct = (n: number | null) => (n === null ? "—" : `${n < 10 ? n.toFixed(1) : Math.round(n)}%`);

type Ga = { status: "loading" | "connected" | "off" | "error"; answer?: Ga4Answer };

export function AnalyticsPage({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  const w = useShopWords();
  const [preset, setPreset] = useState<Preset>(readPeriod);
  const [reload, setReload] = useState(0);
  const range = useMemo(() => resolveRange(preset), [preset, reload]);
  const shift = trafficShift(range);
  const { fromKey, toKey } = trafficWindow(range);

  const [daily, setDaily] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const [ga, setGa] = useState<Ga>({ status: "loading" });
  const [orders, setOrders] = useState<any[] | null>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [shopTag, setShopTag] = useState<string | undefined>();

  useEffect(() => { try { window.localStorage.setItem(PERIOD_KEY, preset); } catch { /* this browser only */ } }, [preset]);

  useEffect(() => {
    let live = true;
    setDaily(d => ({ rows: d.rows, error: false }));
    adminApi.getDailyAnalyticsBetween(fromKey, toKey)
      .then((rows: any[]) => { if (live) setDaily({ rows, error: false }); })
      .catch(() => { if (live) setDaily({ rows: null, error: true }); });
    return () => { live = false; };
  }, [fromKey, toKey, reload]);

  useEffect(() => {
    let live = true;
    setGa(g => ({ status: "loading", answer: g.answer }));
    googleAnalyticsApi.report({ startDate: range.startKey, endDate: range.endKey, prevStartDate: range.prevStartKey, prevEndDate: range.prevEndKey })
      .then(answer => { if (live) setGa({ status: answer.connected ? "connected" : answer.code === "no_property" ? "off" : "error", answer }); })
      .catch(() => { if (live) setGa({ status: "error" }); });
    return () => { live = false; };
  }, [range.startKey, range.endKey, range.prevStartKey, range.prevEndKey, reload]);

  useEffect(() => {
    getOrdersCached({ force: reload > 0 }).then(setOrders).catch(() => setOrders([]));
    adminApi.getAllBooks().then(setBooks).catch(() => setBooks([]));
    adminApi.getSettings().then((s: any) => setShopTag(s?.analytics?.ga4MeasurementId)).catch(() => undefined);
  }, [reload]);

  const refresh = useCallback(() => { forgetReports(); setReload(r => r + 1); }, []);

  // Wait for Google's answer before choosing a source, so the page doesn't flip from the counter to Google.
  const report = ga.status === "connected" ? ga.answer?.report : undefined;
  const ready = ga.status !== "loading" && (daily.rows !== null || daily.error);
  const model = useMemo(() => (ready ? analyticsModel({ range, shift, daily: daily.rows, report, streamIds: ga.answer?.streamIds, shopTag, orders, books }) : null),
    [ready, range, shift, daily.rows, report, ga.answer?.streamIds, shopTag, orders, books]);
  const google = model?.source === "google";
  const before = range.before;
  const openGoogle = () => setActiveTab?.("google");

  return (
    <div className="rp-stack rp-an" data-testid="analytics-page">
      <PageActions><SecondaryButton size="sm" onClick={refresh}>Refresh</SecondaryButton></PageActions>
      <div className="rp-an-bar">
        <Tabs tabs={PERIODS} value={preset} onChange={setPreset} label="Period" idPrefix="an-" />
        {model && (
          <p className="rp-an-source">
            {google ? "From Google Analytics" : model.source === "shop" ? "From your shop's own visit counter" : null}
            {google && typeof report?.activeNow === "number" && <> · <strong>{fmt(report.activeNow)}</strong> on the shop now</>}
          </p>
        )}
      </div>

      {!model && (daily.error && ga.status === "error" ? <ErrorState title="Your visitor figures couldn't be read" description="Check your connection and try again." onRetry={refresh} /> : <LoadingState label="Reading your visitor figures…" />)}

      {model && (
        <>
          {model.gap?.mismatch && (
            <div className="rp-alert" data-tone="warning" role="status">
              <span className="rp-alert-glyph" aria-hidden="true">!</span>
              <div className="rp-alert-text"><span className="rp-alert-detail">Google Analytics is listening for a different tag than your shop sends ({model.gap.mismatch.tag}), so some visits may be missing.</span></div>
              <div className="rp-alert-actions"><SecondaryButton size="sm" onClick={openGoogle}>Check Google</SecondaryButton></div>
            </div>
          )}
          {model.gap?.kind === "fallback" && <p className="rp-hint rp-an-note">Google recorded nobody on these days, so these are your shop's own counts.</p>}
          {ga.status === "error" && <p className="rp-hint rp-an-note">Google Analytics couldn't be read just now, so these are your shop's own counts. <button type="button" className="rp-an-link" onClick={refresh}>Try again</button></p>}
          {ga.status === "off" && <p className="rp-hint rp-an-note">Connect Google to see every page, country and session. <button type="button" className="rp-an-link" onClick={openGoogle}>Connect Google</button></p>}

          <div className="rp-tiles">
            <Tile tone="mint" label="Visitors" pair={model.visitors} before={before} />
            {model.sessions
              ? <Tile tone="sky" label="Visits" pair={model.sessions} before={before} />
              : <Tile tone="sky" label={model.views?.what === "products" ? `${w("Book")} pages opened` : "Page views"} pair={model.views} before={before} />}
            <Tile tone="lilac" label="Bought something" value={pct(model.conversion.cur)} sub={model.conversion.cur === null ? "No visitors yet" : `${fmt(model.orders.cur)} ${model.orders.cur === 1 ? "order" : "orders"} from ${fmt(model.visitors?.cur ?? 0)} visitors`} />
            {model.sessions && model.views
              ? <Tile tone="apricot" label="Page views" pair={model.views} before={before} />
              : <Tile tone="apricot" label="Orders" pair={model.orders} before={before} />}
          </div>

          <VisitorBars bars={model.bars} grain={model.grain} recorded={!!model.visitors && model.visitors.cur > 0} />

          <div className="rp-an-grid">
            <TableCard title="Where visitors came from" head={google ? ["Channel", "Visits", "Share"] : ["Source", "Visitors", "Bought"]} rows={model.sources}
              empty={google ? "No visits yet" : "Not recorded yet"} />
            {google && <TableCard title="Top pages" head={["Page", "Views"]} rows={model.pages} mono empty="No page views yet" />}
            <TableCard title={`Most viewed ${w("books")}`} head={[w("Book"), "Views", "Bought"]} rows={model.products} empty="Not recorded yet" />
            <TableCard title="Devices" head={["Device", "Visitors", "Share"]} rows={model.devices} empty="Not recorded yet" />
            <FunnelCard steps={model.funnel?.map(s => ({ ...s, label: w(s.label) })) ?? null} />
            {google && <TableCard title="Countries" head={["Country", "Visitors"]} rows={model.countries} empty="No visits yet" />}
            <TableCard title="What people searched for" head={["Search", "Times"]} rows={model.searches} empty="Not recorded yet" />
            <TableCard title="Searches that found nothing" head={["Search", "Times"]} rows={model.noResults} empty="Not recorded yet" />
            {!google && <TableCard title="Top pages and countries" head={[]} rows={null} empty="These come with Google Analytics." action={{ label: "Connect Google", run: openGoogle }} />}
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ tone, label, pair, value, sub, before }: { tone: string; label: string; pair?: Pair | null; value?: string; sub?: string; before?: string }) {
  const shown = value ?? (pair ? fmt(pair.cur) : "—");
  const diff = pair ? change(pair) : null;
  const note = sub ?? (pair ? (diff ? `${diff} vs ${before}` : `None ${before} either`) : "Not recorded yet");
  return (
    <div className="rp-tile" data-tone={tone}>
      <span className="rp-tile-label">{label}</span>
      <span className="rp-tile-value">{shown}</span>
      <span className="rp-tile-sub">{note}</span>
    </div>
  );
}

function VisitorBars({ bars, grain, recorded }: { bars: Bar[]; grain: string; recorded: boolean }) {
  const top = Math.max(1, ...bars.map(b => b.visitors));
  const per = grain === "day" ? "day" : grain === "week" ? "week" : "month";
  return (
    <section className="rp-tablecard rp-an-chart" aria-labelledby="an-chart">
      <h2 className="rp-an-h2" id="an-chart">Visitors per {per}</h2>
      {!recorded ? <p className="rp-hint">Not recorded yet</p> : (
        <>
          <ol className="rp-an-bars" data-count={bars.length}>
            {bars.map(b => (
              <li key={b.key} title={`${b.label}: ${fmt(b.visitors)} visitors, ${fmt(b.orders)} ${b.orders === 1 ? "order" : "orders"}`}>
                <span className="rp-an-barfill" style={{ height: `${(b.visitors / top) * 100}%` }} />
                {b.orders > 0 && <span className="rp-an-dot" aria-hidden="true" />}
                <span className="rp-sr-only">{b.label}: {fmt(b.visitors)} visitors, {fmt(b.orders)} orders</span>
              </li>
            ))}
          </ol>
          <div className="rp-an-axis" aria-hidden="true"><span>{bars[0]?.label}</span><span>{bars[bars.length - 1]?.label}</span></div>
          <p className="rp-hint rp-an-legend"><span className="rp-an-dot" aria-hidden="true" /> a {per} with an order</p>
        </>
      )}
    </section>
  );
}

function TableCard({ title, head, rows, empty, mono, action }: {
  title: string; head: string[]; rows: Row[] | null; empty: string; mono?: boolean; action?: { label: string; run: () => void };
}) {
  return (
    <section className="rp-tablecard rp-an-card" aria-label={title}>
      <h2 className="rp-an-h2">{title}</h2>
      {!rows || rows.length === 0 ? (
        <p className="rp-hint rp-an-empty">{rows ? "Nobody yet in this period" : empty}{action && <> <button type="button" className="rp-an-link" onClick={action.run}>{action.label}</button></>}</p>
      ) : (
        <table>
          <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={i > 0 ? "rp-tc-end" : undefined}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <td><span className={mono ? "rp-mono rp-an-path" : undefined}>{r.label}</span>{r.sub && <span className="rp-tc-sub">{r.sub}</span>}</td>
                <td className="rp-tc-end">{fmt(r.value)}</td>
                {head.length > 2 && <td className="rp-tc-end">{r.extra ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FunnelCard({ steps }: { steps: Array<{ key: string; label: string; count: number; ofPrevious: number | null }> | null }) {
  const top = steps ? Math.max(1, steps[0]?.count || 0) : 1;
  return (
    <section className="rp-tablecard rp-an-card" aria-label="Path to a purchase">
      <h2 className="rp-an-h2">Path to a purchase</h2>
      {!steps || steps.every(s => s.count === 0) ? <p className="rp-hint rp-an-empty">{steps ? "Nobody yet in this period" : "Not recorded yet"}</p> : (
        <ol className="rp-an-funnel">
          {steps.map(s => (
            <li key={s.key}>
              <span className="rp-an-step">{s.label}{s.ofPrevious !== null && <span className="rp-tc-sub">{pct(s.ofPrevious)} of the step before</span>}</span>
              <span className="rp-an-track"><span style={{ width: `${(s.count / top) * 100}%` }} /></span>
              <strong>{fmt(s.count)}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
