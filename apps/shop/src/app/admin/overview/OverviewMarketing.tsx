import { useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { DataTable, EmptyState, LoadingState, MetricCard, SecondaryButton, SectionCard, StatusBadge, useConfirm, type Column } from "../riso/components";
import type { Book, Order } from "./overviewInsights";
import { bookInterest, rankMap, recordedSince, sourceOf, sourcePerformance, sumMap, type Daily, type SourceRow } from "./overviewTraffic";
import { isRealPaidOrder } from "./overviewInsights";
import { OrdersDrill } from "./OverviewDrill";
import { countsByDay, copiesOf, ordersWithBook } from "./overviewDrill";
import { funnelSteps, type TrafficFigures } from "./overviewSources";
import type { Ga4Answer } from "../googleAnalytics";
import { BarRow, DrillList, SPLIT, StatRow, Trend, money, percent } from "./OverviewParts";
import { Funnel, RankBars, Stack } from "./OverviewViz";
import { CampaignsCard, CheckoutJourneyCard, FoundOnGoogleCard, LandingSalesCard, PageSpeedCard, SetUpLine, useFirstOfKind } from "./OverviewMarketingExtras";
import type { Ga4Range } from "../googleAnalytics";

const since = (key: string | null) => (key ? new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);
const NOT_YET = (what: string) => <EmptyState icon="⏳" title="Not recorded yet" description={`${what} start counting once shoppers visit the updated storefront. Until then there is nothing to show — not even zero.`} />;
const duration = (s: number) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return `${m}m ${String(r).padStart(2, "0")}s`; };
const num = (v: unknown) => Number(v) || 0;

/** Panels that only exist when Google Analytics is connected. */
export const GA_PANELS = ["channels", "gaSources", "landing", "gaPages", "gaCountries", "gaDevices"];
export const GOOGLE_PARTS: Record<string, "totals" | "queries" | "pages"> = { google: "totals", googleQueries: "queries", googlePages: "pages" };

export type GaState = { status: "loading" | "off" | "error" | "connected"; answer?: Ga4Answer; message?: string };
type Row = Record<string, any>;

/** Overview › Dig deeper › Marketing & traffic: how people arrive, what they look for, and where they drop off. */
export function OverviewMarketing({ ga, traffic, dailyCurrent, dailyAll, current, paidAll, range, books, lastReset, firstDay, onReset, setActiveTab, only }: {
  /** Show just one panel (an Overview board widget); see GA_PANELS and the show() ids below. */
  only?: string;
  ga: GaState; traffic: TrafficFigures; dailyCurrent: Daily[]; dailyAll: Daily[]; current: Order[]; paidAll: Order[]; range: Ga4Range; books: Book[];
  lastReset: { at: string; removedDays: number } | null; firstDay: string | null; onReset: () => Promise<void>; setActiveTab?: (tab: string) => void;
}) {
  const [confirm, confirmNode] = useConfirm();
  const [resetting, setResetting] = useState(false);
  const [pickedSource, setPickedSource] = useState<string | null>(null);
  const funnel = useMemo(() => funnelSteps(traffic.funnel), [traffic.funnel]);
  const visitsBySource = useMemo(() => sumMap(dailyCurrent, "sources"), [dailyCurrent]);
  const sources = useMemo(() => sourcePerformance(visitsBySource, current), [visitsBySource, current]);
  const devices = useMemo(() => rankMap(sumMap(dailyCurrent, "devices"), 3), [dailyCurrent]);
  const searches = useMemo(() => rankMap(sumMap(dailyCurrent, "searches"), 8), [dailyCurrent]);
  const missed = useMemo(() => rankMap(sumMap(dailyCurrent, "noResults"), 8), [dailyCurrent]);
  const interest = useMemo(() => bookInterest(sumMap(dailyCurrent, "bookViews"), current, books), [dailyCurrent, current, books]);
  const report = ga.status === "connected" ? ga.answer?.report : undefined;

  const deviceTotal = devices.reduce((s, d) => s + d.count, 0);
  const sourceColumns: Column<SourceRow>[] = [
    { key: "src", header: "Source", lead: true, render: r => r.orders > 0
      ? <button type="button" className="rp-ov-drill" aria-expanded={pickedSource === r.source} onClick={() => setPickedSource(p => (p === r.source ? null : r.source))}>
          <span aria-hidden="true" className="rp-ov-drill-mark">{pickedSource === r.source ? "▾" : "▸"}</span>{r.source}</button>
      : r.source },
    { key: "visits", header: "Visits", numeric: true, render: r => (r.visits ? r.visits.toLocaleString() : "—") },
    { key: "orders", header: "Orders", numeric: true, render: r => r.orders },
    { key: "rev", header: "Revenue", numeric: true, render: r => money(r.revenue) },
    { key: "conv", header: "Visit → sale", numeric: true, render: r => (r.conversion === null ? "—" : percent(r.conversion)) },
  ];
  const gaColumns = (lead: string, label: (r: Row) => string): Column<Row>[] => [
    { key: "k", header: lead, lead: true, render: r => <span style={{ overflowWrap: "anywhere" }}>{label(r) || "(not set)"}</span> },
    { key: "s", header: "Sessions", numeric: true, render: r => num(r.sessions).toLocaleString() },
    { key: "u", header: "Visitors", numeric: true, render: r => num(r.activeUsers).toLocaleString() },
    { key: "e", header: "Engaged", numeric: true, render: r => percent(num(r.engagementRate) * 100, 0) },
  ];

  const reset = async () => {
    const ok = await confirm({
      title: "Start traffic counts again?",
      message: "This deletes the shop's own visit, add-to-bag, checkout-step, search, source, book-view and page-speed counts so far (for example test visits before launch) and starts counting from now. Orders, revenue, customers and Google Analytics are not touched. This can't be undone.",
      confirmLabel: "Reset counts",
    });
    if (!ok) return;
    setResetting(true);
    try { await onReset(); } catch (err: any) { toast.error(err?.message || "The counts couldn't be reset."); } finally { setResetting(false); }
  };

  const show = (id: string) => !only || only === id;
  const gaPanel = !!only && GA_PANELS.includes(only);
  const gaAsked = !only || only === "gaKpis" || gaPanel;
  // On the board only the first Google Analytics widget explains the connection; the others say so in one line.
  const gaPitch = useFirstOfKind("googleAnalytics", !!only && gaAsked && ga.status === "off");
  const t = report?.totals;
  const engagedRate = num(t?.current?.engagementRate) * 100;
  const visitorType = (key: string) => num(report?.visitorType?.find(r => r.newVsReturning === key)?.activeUsers);
  const pagesPerVisit = num(t?.current?.sessions) > 0 ? num(t?.current?.screenPageViews) / num(t?.current?.sessions) : 0;

  return (
    <>
      {gaAsked && ga.status === "loading" && <LoadingState label="Reading Google Analytics…" />}
      {ga.status === "connected" && report && (
        <>
          {show("gaKpis") && <div className="rp-kpi-grid">
            <MetricCard label="On the site now" tone="gold" value={report.activeNow === null ? "—" : report.activeNow.toLocaleString()} footer="Google Analytics, last 30 minutes" />
            <MetricCard label="Visitors" value={num(t?.current?.activeUsers).toLocaleString()}
              footer={<><Trend now={num(t?.current?.activeUsers)} before={num(t?.previous?.activeUsers)} /> {num(t?.current?.newUsers).toLocaleString()} new</>} />
            <MetricCard label="Sessions" value={num(t?.current?.sessions).toLocaleString()}
              footer={<><Trend now={num(t?.current?.sessions)} before={num(t?.previous?.sessions)} /> {pagesPerVisit.toFixed(1)} pages per visit</>} />
            <MetricCard label="Engaged visits" value={percent(engagedRate, 0)} footer={`${duration(num(t?.current?.averageSessionDuration))} average visit`} />
            <MetricCard label="Returning visitors" value={visitorType("returning").toLocaleString()} footer={`${visitorType("new").toLocaleString()} new visitors`} />
          </div>}
          {(!only || gaPanel) && <div className="rp-split" style={SPLIT}>
            {show("channels") && <SectionCard flush title="How people find you" description="Google Analytics channels: search, social, email, links from other sites, or typed in directly">
              {report.channels.length === 0 ? <EmptyState title="No visits yet" description="Channels appear once Google Analytics records visits." />
                : <ChannelsViz rows={report.channels} table={<DataTable caption="Channels" columns={gaColumns("Channel", r => r.sessionDefaultChannelGroup)} rows={report.channels} rowKey={r => r.sessionDefaultChannelGroup} />} />}
            </SectionCard>}
            {show("gaSources") && <SectionCard flush title="Sources" description="The exact site, search engine or campaign (source / medium)">
              {report.sources.length === 0 ? <EmptyState title="No visits yet" description="Sources appear once Google Analytics records visits." />
                : <DataTable caption="Sources" columns={gaColumns("Source / medium", r => `${r.sessionSource} / ${r.sessionMedium}`)} rows={report.sources.slice(0, 12)} rowKey={r => `${r.sessionSource}/${r.sessionMedium}`} />}
            </SectionCard>}
            {show("landing") && <SectionCard flush title="Landing pages" description="The first page people saw — where your visits start">
              {report.landing.length === 0 ? <EmptyState title="No visits yet" description="Landing pages appear once Google Analytics records visits." />
                : <DataTable caption="Landing pages" columns={gaColumns("Page", r => r.landingPage)} rows={report.landing.slice(0, 12)} rowKey={r => r.landingPage} />}
            </SectionCard>}
            {show("gaPages") && <SectionCard flush title="Most viewed pages" description="Page views in this period">
              {report.pages.length === 0 ? <EmptyState title="No page views yet" /> : (
                <ul className="rp-list" aria-label="Most viewed pages">
                  {report.pages.slice(0, 10).map(p => <StatRow key={p.pagePath} label={<span className="rp-mono" style={{ fontWeight: 500 }}>{p.pagePath}</span>} hint={`${num(p.activeUsers).toLocaleString()} visitors`} value={num(p.screenPageViews).toLocaleString()} />)}
                </ul>
              )}
            </SectionCard>}
            {show("gaCountries") && <SectionCard flush title="Where visitors are" description="Visitors by country (Google Analytics)">
              {report.countries.length === 0 ? <EmptyState title="No visits yet" /> : (
                <ul className="rp-list" aria-label="Visitors by country">
                  {(() => { const top = Math.max(1, ...report.countries.map(c => num(c.activeUsers))); return report.countries.slice(0, 8).map(c => (
                    <BarRow key={c.country} label={c.country || "(not set)"} value={`${num(c.activeUsers).toLocaleString()} · ${num(c.sessions).toLocaleString()} sessions`} share={(num(c.activeUsers) / top) * 100} color="var(--rp-info)" />
                  )); })()}
                </ul>
              )}
            </SectionCard>}
            {show("gaDevices") && <SectionCard flush title="Devices" description="What visitors browse on (Google Analytics)">
              {report.devices.length === 0 ? <EmptyState title="No visits yet" /> : (
                <ul className="rp-list" aria-label="Visitors by device">
                  {(() => { const all = report.devices.reduce((s, d) => s + num(d.activeUsers), 0); return report.devices.map(d => (
                    <BarRow key={d.deviceCategory} label={String(d.deviceCategory || "other").replace(/^./, c => c.toUpperCase())} value={`${num(d.activeUsers).toLocaleString()} · ${percent(all ? (num(d.activeUsers) / all) * 100 : 0, 0)}`} share={all ? (num(d.activeUsers) / all) * 100 : 0} color="var(--rp-info)" />
                  )); })()}
                </ul>
              )}
            </SectionCard>}
          </div>}
        </>
      )}
      {gaAsked && ga.status === "off" && !gaPitch && (
        <SectionCard title="Google Analytics"><SetUpLine needs="Google Analytics" onSetUp={setActiveTab ? () => setActiveTab("general") : undefined} /></SectionCard>
      )}
      {gaAsked && ga.status === "off" && gaPitch && (
        <SectionCard title="Connect Google Analytics" description="See where visitors come from (search, social, email, other sites), which pages they land on, how long they stay, their countries and devices — and how many are on the site right now."
          actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("general")}>Set up Google Analytics</SecondaryButton>}>
          <p className="rp-hint" style={{ margin: 0 }}>Until it is connected, visit figures come from the shop's own simple counter. Setup is in Settings › General › Google Analytics and takes about five minutes.</p>
        </SectionCard>
      )}
      {gaAsked && ga.status === "error" && (
        <SectionCard title={ga.answer?.code ? "Google Analytics isn't connected yet" : "Google Analytics couldn't be read just now"} actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("general")}>Open Google Analytics settings</SecondaryButton>}>
          <p className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>✕ {ga.message || "Google Analytics couldn't be read."}</p>
          <p className="rp-hint" style={{ margin: "8px 0 0" }}>The figures below come from the shop's own counter meanwhile.</p>
        </SectionCard>
      )}

      {(!only || !gaAsked) && <div className="rp-split" style={SPLIT}>
        {show("funnel") && <SectionCard title="Shopping funnel"
          description={`${traffic.source === "google" ? "Google Analytics shop events" : "The shop's own counter"} · ${funnel[0].count > 0 ? `${percent((funnel[3].count / funnel[0].count) * 100, 2)} of book views end in a purchase` : "only recorded events are shown"}`}>
          {funnel[0].count === 0 && funnel[1].count === 0 ? (
            <EmptyState title="No shopping events recorded" description="Book views, add-to-bag, checkout and purchase events chart here once shoppers generate them." />
          ) : (
            <div style={{ margin: -20 }}>
              <Funnel label="Shopping funnel" steps={funnel.map(step => ({
                key: step.key, label: step.label, count: step.count,
                details: step.key === "purchase" ? <OrdersDrill label="Orders in this period" orders={current.filter(isRealPaidOrder)} />
                  : traffic.source !== "google" && step.count > 0 ? <DrillList label={`${step.label} by day`} items={countsByDay(dailyCurrent, "funnel", step.key)} /> : undefined,
              }))} />
            </div>
          )}
        </SectionCard>}

        {show("checkout") && <CheckoutJourneyCard dailyCurrent={dailyCurrent} />}

        {show("sources") && <SectionCard flush title="Sources that sell"
          description={recordedSince(dailyAll, "sources") ? `Visits per source beside the paid orders that came from it · shop counter since ${since(recordedSince(dailyAll, "sources"))}` : "Visits per source beside the paid orders that came from it"}>
          {sources.length === 0
            ? (recordedSince(dailyAll, "sources") ? <EmptyState title="No visits in this period" description="Sources appear when shoppers arrive." /> : NOT_YET("Traffic sources"))
            : <DataTable caption="Sources that sell" columns={sourceColumns} rows={sources} rowKey={r => r.source}
                onRowClick={r => { if (r.orders > 0) setPickedSource(p => (p === r.source ? null : r.source)); }} />}
          {pickedSource && sources.some(r => r.source === pickedSource) && (
            <div className="rp-ov-drill-body" style={{ margin: "12px 20px 0" }}>
              <strong style={{ display: "block", marginBottom: 6 }}>Orders from {pickedSource}</strong>
              <OrdersDrill label={`Orders from ${pickedSource}`} orders={current.filter(o => isRealPaidOrder(o) && sourceOf(o) === pickedSource)} />
            </div>
          )}
          <p className="rp-hint" style={{ padding: "12px 20px 16px" }}>Share a link ending in <span className="rp-mono">?ref=name</span> and it shows up here under that name. Visits with no referrer count as direct.</p>
        </SectionCard>}

        {show("campaigns") && <CampaignsCard current={current} paidAll={paidAll} dailyCurrent={dailyCurrent} gaCampaigns={report?.campaigns} />}

        {show("landingSales") && <LandingSalesCard current={current} />}

        {(only === "devices" || (!only && ga.status !== "connected")) && (
          <SectionCard flush title="Devices" description="What shoppers browse on (shop counter)">
            {devices.length === 0 ? NOT_YET("Devices") : (
              <ul className="rp-list" aria-label="Visits by device">
                {devices.map(d => <BarRow key={d.key} label={d.key[0].toUpperCase() + d.key.slice(1)} value={`${d.count.toLocaleString()} · ${percent(deviceTotal ? (d.count / deviceTotal) * 100 : 0, 0)}`}
                  share={deviceTotal ? (d.count / deviceTotal) * 100 : 0} color="var(--rp-info)"
                  details={<DrillList label={`${d.key} visits by day`} items={countsByDay(dailyCurrent, "devices", d.key, "visit")} />} />)}
              </ul>
            )}
          </SectionCard>
        )}

        {show("searches") && <SectionCard flush title="What people search for" description="Most common searches that found books">
          {searches.length === 0 ? NOT_YET("Search terms") : (
            <ul className="rp-list" aria-label="Top searches">
              {searches.map(s => <StatRow key={s.key} label={s.key} value={`${s.count}×`}
                details={<DrillList label={`Searches for ${s.key} by day`} items={countsByDay(dailyCurrent, "searches", s.key, "search")} />} />)}
            </ul>
          )}
        </SectionCard>}

        {show("missed") && <SectionCard flush title="Searches that found nothing" description="Books or topics shoppers want that the shop doesn't show">
          {missed.length === 0
            ? (recordedSince(dailyAll, "noResults") || recordedSince(dailyAll, "searches")
                ? <EmptyState icon="✓" title="No empty searches" description="Every recorded search found something." />
                : NOT_YET("Empty searches"))
            : (
              <ul className="rp-list" aria-label="Searches with no results">
                {missed.map(s => <StatRow key={s.key} label={s.key} value={<StatusBadge tone="warning">{s.count}×</StatusBadge>}
                  details={<DrillList label={`Empty searches for ${s.key} by day`} items={countsByDay(dailyCurrent, "noResults", s.key, "search")} />} />)}
              </ul>
            )}
        </SectionCard>}

        {show("viewed") && <SectionCard flush title="Most viewed books" description="Product-page views beside copies sold in this period">
          {interest.rows.length === 0 ? NOT_YET("Book views") : (
            <ul className="rp-list" aria-label="Most viewed books">
              {interest.rows.slice(0, 8).map(r => (
                <StatRow key={r.id} label={r.title}
                  hint={`${r.views.toLocaleString()} views · ${r.sold} sold${r.viewToSale !== null ? ` · ${percent(r.viewToSale)} of viewers bought` : ""}`}
                  value={interest.watch.some(w => w.id === r.id) ? <StatusBadge tone="warning">looked at, not bought</StatusBadge> : <StatusBadge tone={r.sold > 0 ? "success" : "neutral"}>{r.sold > 0 ? "selling" : "quiet"}</StatusBadge>}
                  details={<>
                    <strong style={{ display: "block", marginBottom: 6 }}>Views by day</strong>
                    <DrillList label={`Views of ${r.title} by day`} items={countsByDay(dailyCurrent, "bookViews", r.id, "view")} />
                    <strong style={{ display: "block", margin: "12px 0 6px" }}>Orders with this book</strong>
                    <OrdersDrill label={`Orders with ${r.title}`} books={false} orders={ordersWithBook(current, r.id)} empty="Nobody bought it in this period."
                      extra={o => `${copiesOf(o, r.id)} cop${copiesOf(o, r.id) === 1 ? "y" : "ies"} of this title`} />
                  </>} />
              ))}
            </ul>
          )}
        </SectionCard>}

        {show("speed") && <PageSpeedCard dailyCurrent={dailyCurrent} />}

        {(!only || only in GOOGLE_PARTS) && <FoundOnGoogleCard range={range} setActiveTab={setActiveTab} part={only ? GOOGLE_PARTS[only] : undefined} />}

        {show("counter") && <SectionCard title="The shop's own counter"
          description="A simple first-party count of visits, bag adds, checkouts, searches, sources and book views, kept even without Google Analytics."
          actions={<SecondaryButton size="sm" onClick={reset} disabled={resetting}>{resetting ? "Resetting…" : "Start traffic counts again"}</SecondaryButton>}>
          <p className="rp-hint" style={{ margin: 0 }}>
            {lastReset ? `Counting since ${new Date(lastReset.at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} (reset by you; ${lastReset.removedDays} earlier day${lastReset.removedDays === 1 ? "" : "s"} cleared).`
              : firstDay ? `Counting since ${since(firstDay)}.` : "Nothing counted yet."}
            {" "}Reset it once after launch to drop test visits. Orders and revenue are never affected.
          </p>
        </SectionCard>}
      </div>}
      {confirmNode}
    </>
  );
}


/** How people find you, drawn: one bar split by channel, then each channel ranked with visitors and engagement; the table folds away. */
function ChannelsViz({ rows, table }: { rows: Row[]; table: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  const name = (r: Row) => String(r.sessionDefaultChannelGroup || "(other)");
  const sorted = [...rows].sort((a, b) => num(b.sessions) - num(a.sessions));
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, r) => s + num(r.sessions), 0);
  const parts = [...top.map(r => ({ key: name(r), label: name(r), value: num(r.sessions) })), ...(rest > 0 ? [{ key: "__rest", label: "Everything else", value: rest }] : [])];
  return (
    <>
      <Stack label="Share of visits by channel" caption="Share of visits" parts={parts} unit={n => `${n.toLocaleString()} visits`} />
      <RankBars label="Channels by visits" rows={sorted.slice(0, 8).map(r => ({
        key: name(r), label: name(r), value: num(r.sessions), valueText: `${num(r.sessions).toLocaleString()} visits`,
        sub: `${num(r.activeUsers).toLocaleString()} visitors · ${percent(num(r.engagementRate) * 100, 0)} engaged`, tone: "info" as const,
      }))} />
      <div style={{ padding: "4px 20px 12px" }}>
        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-expanded={showTable} onClick={() => setShowTable(v => !v)} style={{ paddingLeft: 0 }}>
          <span aria-hidden="true" className="rp-ov-drill-mark">{showTable ? "▾" : "▸"}</span>{showTable ? "Hide the table" : "Show the table"}
        </button>
      </div>
      {showTable && table}
    </>
  );
}
