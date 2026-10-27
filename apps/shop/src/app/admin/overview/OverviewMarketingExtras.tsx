import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { DataTable, EmptyState, ErrorState, LoadingState, SecondaryButton, SectionCard, StatusBadge, type Column } from "../riso/components";
import type { Order } from "./overviewInsights";
import type { Daily } from "./overviewTraffic";
import {
  acquisitionCoverage, campaignOf, campaignPerformance, checkoutJourney, landingOf, gaCampaignVisits, landingPerformance, pageSpeedSummary,
  PASS_SHARE, VITAL_WORDS, type CampaignRow, type LandingRow, type VitalSummary,
} from "./overviewSignals";
import { googleAnalyticsApi, type Ga4Range, type SearchConsoleAnswer, type SearchRow } from "../googleAnalytics";
import { BarRow, DrillList, StatRow, Trend, money, percent } from "./OverviewParts";
import { OrdersDrill } from "./OverviewDrill";
import { countsByDay } from "./overviewDrill";
import { isRealPaidOrder } from "./overviewInsights";
import { sharedLoad } from "./overviewShared";

// Overview › Marketing & traffic, the 18 October 2026 panels: where checkout loses people, campaigns and links that
// sell, pages that start sales, real page speed and Google searches (Search Console). Pure maths in overviewSignals.ts.

// ─── "Connect Google" once per board ──────────────────────────────────────────────────────────────────────────────
// Several widgets need the same Google connection. The first one on screen (the first to mount) explains it in full;
// the rest say so in one line with a Set up link. When the first one goes (folded, removed) the next takes over.
const claims = new Map<string, string[]>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** True for the first mounted caller of `kind` (pass `active = false` to stay out of the queue). */
export function useFirstOfKind(kind: string, active = true): boolean {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    claims.set(kind, [...(claims.get(kind) || []), id]);
    notify();
    return () => { claims.set(kind, (claims.get(kind) || []).filter(x => x !== id)); notify(); };
  }, [kind, id, active]);
  return useSyncExternalStore(subscribe, () => !active || (claims.get(kind) || [id])[0] === id, () => true);
}

/** The one-line form of a "not connected" card: what it needs and a link to set it up. */
export function SetUpLine({ needs, onSetUp }: { needs: string; onSetUp?: () => void }) {
  return (
    <p className="rp-hint" style={{ margin: 0 }}>
      Needs {needs}.{onSetUp && <> <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={onSetUp} style={{ padding: "0 4px", minHeight: 0 }}>Set up →</button></>}
    </p>
  );
}

const NOT_YET = (what: string) => <EmptyState icon="⏳" title="Not recorded yet" description={`${what} start counting once shoppers use the updated storefront. Until then there is nothing to show — not even zero.`} />;
const day = (key: string | null) => (key ? new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

/** Started checkout → typed an email → finished the address → saw the delivery price → pressed Pay → bought. */
export function CheckoutJourneyCard({ dailyCurrent }: { dailyCurrent: Daily[] }) {
  const j = useMemo(() => checkoutJourney(dailyCurrent), [dailyCurrent]);
  const top = Math.max(1, ...j.steps.map(s => s.count));
  return (
    <SectionCard title="Where checkout loses people" description="Each step of checkout, counted once per visit by the shop's own counter">
      {!j.recorded ? NOT_YET("Checkout steps") : (
        <>
          <ol className="rp-list" style={{ margin: -20 }} aria-label="Checkout steps">
            {j.steps.map(s => (
              <BarRow key={s.key} label={s.label} color="var(--rp-info)" share={(s.count / top) * 100}
                value={<>{s.count.toLocaleString()}{s.ofPrevious !== null && <span style={{ color: "var(--rp-text-muted)" }}> · {percent(s.ofPrevious, 0)}</span>}</>}
                details={s.count > 0 ? <DrillList label={`${s.label} by day`} items={countsByDay(dailyCurrent, s.key === "start" ? "funnel" : s.key === "bought" ? "funnel" : "checkout", s.key === "start" ? "checkout_start" : s.key === "bought" ? "purchase" : s.key)} /> : undefined} />
            ))}
          </ol>
          {j.biggestDrop && <p className="rp-hint" style={{ margin: "28px 0 0" }}>{j.biggestDrop}</p>}
          <p className="rp-hint" style={{ margin: "8px 0 0" }}>
            Pay pressed with a missing field: <strong>{j.problems.fields.toLocaleString()}</strong> · card declined: <strong>{j.problems.declined.toLocaleString()}</strong> · payment error: <strong>{j.problems.failed.toLocaleString()}</strong>
          </p>
        </>
      )}
    </SectionCard>
  );
}

/** Paid orders per tagged campaign or source, with new customers and (where known) visits. */
export function CampaignsCard({ current, paidAll, dailyCurrent, gaCampaigns }: {
  current: Order[]; paidAll: Order[]; dailyCurrent: Daily[]; gaCampaigns?: Array<Record<string, any>>;
}) {
  const visitsBySource = useMemo(() => {
    const out: Record<string, number> = {};
    dailyCurrent.forEach(d => Object.entries(d?.sources || {}).forEach(([k, v]) => { out[k] = (out[k] || 0) + (Number(v) || 0); }));
    return out;
  }, [dailyCurrent]);
  const rows = useMemo(() => campaignPerformance(current, paidAll, { visitsBySource, gaVisits: gaCampaignVisits(gaCampaigns) }), [current, paidAll, visitsBySource, gaCampaigns]);
  const coverage = useMemo(() => acquisitionCoverage(current, paidAll), [current, paidAll]);
  const [picked, setPicked] = useState<string | null>(null);
  const toggle = (key: string) => setPicked(p => (p === key ? null : key));
  const pickedRow = rows.find(r => r.key === picked);
  const columns: Column<CampaignRow>[] = [
    { key: "name", header: "Campaign or source", lead: true, render: r => (
      <button type="button" className="rp-ov-drill" aria-expanded={picked === r.key} onClick={() => toggle(r.key)} style={{ display: "flex" }}>
        <span aria-hidden="true" className="rp-ov-drill-mark">{picked === r.key ? "▾" : "▸"}</span>
        <div><strong style={{ overflowWrap: "anywhere" }}>{r.label}</strong>{r.detail && <div className="rp-hint">{r.detail}</div>}</div>
      </button>
    ) },
    { key: "orders", header: "Orders", numeric: true, render: r => r.orders },
    { key: "rev", header: "Revenue", numeric: true, render: r => money(r.revenue) },
    { key: "aov", header: "Per order", numeric: true, render: r => money(r.aov) },
    { key: "new", header: "New customers", numeric: true, render: r => r.newCustomers },
    { key: "visits", header: "Visits", numeric: true, render: r => (r.visits === null ? "—" : r.visits.toLocaleString()) },
    { key: "conv", header: "Visit → sale", numeric: true, render: r => (r.visits ? percent((r.orders / r.visits) * 100) : "—") },
  ];
  return (
    <SectionCard flush title="Campaigns and links that sell"
      description="Paid orders by what brought the shopper: a tagged campaign, a ?ref= link, Instagram, Google, a newsletter, or typed in directly">
      {rows.length === 0 ? <EmptyState title="No sales in this period" description="Campaigns appear here as soon as they bring an order." />
        : <DataTable caption="Campaigns and links that sell" columns={columns} rows={rows} rowKey={r => r.key} onRowClick={r => toggle(r.key)} />}
      {pickedRow && (
        <div className="rp-ov-drill-body" style={{ margin: "12px 20px 0" }}>
          <strong style={{ display: "block", marginBottom: 6 }}>Orders from {pickedRow.label}</strong>
          <OrdersDrill label={`Orders from ${pickedRow.label}`} orders={current.filter(o => isRealPaidOrder(o) && campaignOf(o).key === pickedRow.key)} />
        </div>
      )}
      <p className="rp-hint" style={{ padding: "12px 20px 16px", margin: 0 }}>
        {coverage.orders > 0 && `${coverage.recorded} of ${coverage.orders} orders in this period carry the full record${coverage.since ? ` (saved since ${day(coverage.since)})` : ""}; older orders only know the site they came from. `}
        Tag a link with <span className="rp-mono">?utm_campaign=autumn-launch&amp;utm_source=instagram</span> (or simply <span className="rp-mono">?ref=name</span>) and its sales show up here under that name.
      </p>
    </SectionCard>
  );
}

/** The first page shoppers saw before ordering. */
export function LandingSalesCard({ current }: { current: Order[] }) {
  const rows = useMemo(() => landingPerformance(current), [current]);
  const top = Math.max(1, ...rows.map(r => r.revenue));
  return (
    <SectionCard flush title="Pages that start sales" description="The first page a buyer saw on the visit that ended in an order">
      {rows.length === 0 ? <EmptyState title="No landing pages recorded yet" description="Orders placed from 18 October 2026 remember the page the shopper arrived on." /> : (
        <ul className="rp-list" aria-label="Pages that start sales">
          {rows.slice(0, 10).map((r: LandingRow) => (
            <BarRow key={r.page} label={<span className="rp-mono" style={{ fontWeight: 500 }}>{r.page}</span>} share={(r.revenue / top) * 100} color="var(--rp-success)"
              value={`${money(r.revenue)} · ${r.orders} ${r.orders === 1 ? "order" : "orders"}`}
              details={<OrdersDrill label={`Orders that started on ${r.page}`} orders={current.filter(o => isRealPaidOrder(o) && landingOf(o) === r.page)} />} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const vitalBadge = (v: VitalSummary) => (v.goodShare === null ? <StatusBadge tone="neutral">not measured</StatusBadge>
  : <StatusBadge tone={v.passes ? "success" : v.goodShare >= 50 ? "warning" : "danger"} glyph={v.passes ? "✓" : "!"}>{percent(v.goodShare, 0)} good</StatusBadge>);

/** Google's three speed measures from shoppers' own visits, phones and computers apart. */
export function PageSpeedCard({ dailyCurrent }: { dailyCurrent: Daily[] }) {
  const s = useMemo(() => pageSpeedSummary(dailyCurrent), [dailyCurrent]);
  return (
    <SectionCard title="Page speed for real shoppers"
      description={`Measured in shoppers' own browsers on the first page of each visit. Google calls a site fast when at least ${PASS_SHARE}% of visits are good on all three.`}>
      {!s.recorded ? NOT_YET("Page speed measurements") : (
        <div className="rp-stack" style={{ gap: 16 }}>
          {s.devices.map(d => (
            <div key={d.device}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <strong>{d.device === "phone" ? "Phones" : "Computers and tablets"}</strong>
                <span className="rp-hint rp-mono">{d.visits.toLocaleString()} visits measured</span>
              </div>
              <ul className="rp-list" aria-label={`Page speed on ${d.device === "phone" ? "phones" : "computers"}`} style={{ margin: "4px -20px 0" }}>
                {(["lcp", "inp", "cls"] as const).map(k => (
                  <StatRow key={k} label={VITAL_WORDS[k].name} hint={`${VITAL_WORDS[k].plain} · ${d[k].good} good, ${d[k].ok} so-so, ${d[k].poor} slow`} value={vitalBadge(d[k])} />
                ))}
              </ul>
            </div>
          ))}
          <p className="rp-hint" style={{ margin: 0 }}>Visits with no tap or click have no "Responding" measure and are left out of that line only. A visit is sent after 45 seconds or when the shopper switches away, so some very short visits are missed and real loading may be a little slower than shown.</p>
        </div>
      )}
    </SectionCard>
  );
}

type ScState = { status: "loading" } | { status: "done"; answer: SearchConsoleAnswer } | { status: "error"; message: string };

/** What people typed into Google before seeing or clicking the shop (Search Console, read by the shop's server). */
export function FoundOnGoogleCard({ range, setActiveTab, part }: {
  range: Ga4Range; setActiveTab?: (tab: string) => void;
  /** One of the three cards only (an Overview board widget); every widget shares one Search Console read. */
  part?: "totals" | "queries" | "pages";
}) {
  const [state, setState] = useState<ScState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    const key = `searchConsole:${range.startDate}:${range.endDate}:${range.prevStartDate}:${range.prevEndDate}`;
    sharedLoad(key, () => googleAnalyticsApi.searchConsoleReport(range), attempt > 0)
      .then(answer => { if (live) setState({ status: "done", answer }); })
      .catch((err: any) => { if (live) setState({ status: "error", message: err?.message || "Search Console couldn't be read." }); });
    return () => { live = false; };
  }, [range.startDate, range.endDate, range.prevStartDate, range.prevEndDate, attempt]);

  const columns = (lead: string): Column<SearchRow>[] => [
    { key: "k", header: lead, lead: true, render: r => <span style={{ overflowWrap: "anywhere" }}>{lead === "Page" ? r.key.replace(/^https?:\/\/[^/]+/, "") || "/" : r.key}</span> },
    { key: "c", header: "Clicks", numeric: true, render: r => r.clicks.toLocaleString() },
    { key: "i", header: "Seen", numeric: true, render: r => r.impressions.toLocaleString() },
    { key: "r", header: "Click rate", numeric: true, render: r => percent(r.ctr, 1) },
    { key: "p", header: "Position", numeric: true, render: r => r.position.toFixed(1) },
  ];

  const cardTitle = part === "queries" ? "What people searched on Google" : part === "pages" ? "Pages Google showed" : "Found on Google";
  if (state.status === "loading") return <SectionCard title={cardTitle}><LoadingState label="Reading Search Console…" /></SectionCard>;
  if (state.status === "error") return <SectionCard title={cardTitle}><ErrorState title="Search Console couldn't be read" description={state.message} onRetry={() => setAttempt(a => a + 1)} /></SectionCard>;
  const a = state.answer;
  if (!a.connected || !a.report) {
    return <SearchConsoleOff title={cardTitle} part={part} message={a.code === "no_token" ? a.error ?? "" : `Not connected yet. ${a.error || ""}`} setActiveTab={setActiveTab} />;
  }
  const { totals, queries, pages } = a.report;
  return (
    <>
      {(!part || part === "totals") && <SectionCard title="Found on Google" description={`Google searches for ${a.site} · Google's figures run two to three days behind`}>
        <ul className="rp-list" style={{ margin: -20 }} aria-label="Google search totals">
          <StatRow label="Clicks from Google" hint={`${totals.previous.clicks.toLocaleString()} before`} value={<>{totals.current.clicks.toLocaleString()} <Trend now={totals.current.clicks} before={totals.previous.clicks} /></>} />
          <StatRow label="Times the shop was seen in results" hint={`${totals.previous.impressions.toLocaleString()} before`} value={<>{totals.current.impressions.toLocaleString()} <Trend now={totals.current.impressions} before={totals.previous.impressions} /></>} />
          <StatRow label="Click rate" hint={`${percent(totals.previous.ctr, 1)} before`} value={percent(totals.current.ctr, 1)} />
          <StatRow label="Average position" hint={`${totals.previous.position ? totals.previous.position.toFixed(1) : "—"} before · 1 is the top of the first page`} value={totals.current.position ? totals.current.position.toFixed(1) : "—"} />
        </ul>
      </SectionCard>}
      {(!part || part === "queries") && <SectionCard flush title="What people searched on Google" description="Searches that showed the shop, most clicked first">
        {queries.length === 0 ? <EmptyState title="No searches in this period" description="Google lists searches once enough people see the shop in results." />
          : <DataTable caption="Google searches" columns={columns("Search")} rows={queries} rowKey={r => r.key} />}
      </SectionCard>}
      {(!part || part === "pages") && <SectionCard flush title="Pages Google showed" description="Shop pages in Google results, most clicked first">
        {pages.length === 0 ? <EmptyState title="No pages in this period" />
          : <DataTable caption="Pages Google showed" columns={columns("Page")} rows={pages} rowKey={r => r.key} />}
      </SectionCard>}
    </>
  );
}

const SC_WORDS: Record<"totals" | "queries" | "pages", string> = {
  totals: "How often the shop was seen and clicked in Google results",
  queries: "What people typed into Google before they saw or clicked the shop",
  pages: "Which shop pages Google showed in its results, most clicked first",
};

/** Search Console isn't connected: the first such widget explains it, the others say so in one line. */
function SearchConsoleOff({ title, part, message, setActiveTab }: { title: string; part?: "totals" | "queries" | "pages"; message: string; setActiveTab?: (tab: string) => void }) {
  const first = useFirstOfKind("searchConsole", !!part);
  const setUp = setActiveTab ? () => setActiveTab("general") : undefined;
  if (!first) return <SectionCard title={title}><SetUpLine needs="Google Search Console" onSetUp={setUp} /></SectionCard>;
  return (
    <SectionCard title={title} description={SC_WORDS[part || "totals"]}
      actions={setUp ? <SecondaryButton size="sm" onClick={setUp}>Set up Search Console</SecondaryButton> : undefined}>
      <p className="rp-hint" style={{ margin: 0 }}>{message} Setup is in Settings › General › Google Search Console.</p>
    </SectionCard>
  );
}
