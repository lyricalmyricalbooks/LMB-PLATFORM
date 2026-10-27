import type { ReactNode } from "react";
import { EmptyState, LoadingState, SecondaryButton } from "../riso/components";
import { Columns, RankBars, Stack, HeatGrid, type RankRow } from "./OverviewViz";
import type { GaState } from "./OverviewMarketing";
import type { Book } from "./overviewInsights";
import type { Daily } from "./overviewTraffic";
import type { WidgetConfig } from "./overviewBoard";
import { actionRows, liveMinutes, livePagesOf, outboundRows, pageTimeRows, visitHeat, visitorMix } from "./overviewVisitors";
import { actionsHeadline, clock, shortPageTitle, liveHeadline, mixHeadline, outboundHeadline, pageTimeHeadline, visitHoursHeadline } from "./overviewVisitorsCopy";
import "./overviewVisitors.css";
import { shopProfile } from "../../../lib/shopProfile";

// Overview › Traffic: six visitor widgets read from Google Analytics (the 4th GA4 batch + realtime pages/minutes, maths in
// overviewVisitors.ts). Each one is a headline sentence that answers its question, the chart, and a quiet source line.
// "What visitors do" falls back to the shop's own counters without Google. Nothing recorded = "Not recorded yet", never 0.

export type VisitorWidget = "livePages" | "pageTime" | "visitHours" | "actions" | "outbound" | "newReturning";
export const VISITOR_WIDGETS: VisitorWidget[] = ["livePages", "pageTime", "visitHours", "actions", "outbound", "newReturning"];

/** The shop's own addresses (shop profile): a click to one of them is not a visitor leaving. */
export const OWN_HOSTS = [...new Set([new URL(shopProfile.siteUrl).hostname, `${shopProfile.firebase.projectId}.web.app`, `${shopProfile.firebase.projectId}.firebaseapp.com`])];

export function OverviewVisitors({ only, ga, books, dailyCurrent, dailyPrevious, config, onConfig, full, setActiveTab, periodLabel = "this period" }: {
  only: VisitorWidget; ga: GaState; books: Book[];
  /** Shop counters (analytics/<day>) for the chosen period and the one before: "What visitors do" without Google. */
  dailyCurrent?: Daily[]; dailyPrevious?: Daily[];
  config?: WidgetConfig; onConfig?: (patch: WidgetConfig) => void; full?: boolean;
  setActiveTab?: (tab: string) => void;
  /** Words for the period in the source line, e.g. "last 30 days". */
  periodLabel?: string;
}) {
  const report = ga.status === "connected" ? ga.answer?.report : undefined;
  const source = `Google Analytics · ${periodLabel}`;

  // "What visitors do" works without Google (shop counters), so it decides its own empty states.
  if (only === "actions") {
    if (ga.status === "loading") return <LoadingState label="Reading Google Analytics…" />;
    const res = actionRows(report, dailyCurrent, dailyPrevious);
    if (!res) return ga.status !== "connected" ? <NotConnected setActiveTab={setActiveTab} /> : report?.actions === null ? <NotAnswered /> : <NotYet />;
    return <Actions res={res} visitors={report ? Number(report.totals?.current?.activeUsers) || null : null}
      foot={res.source === "google" ? source : `Shop counter · ${periodLabel}${ga.status === "connected" ? "" : " · connect Google Analytics for scrolls, links and downloads"}`} full={!!full} />;
  }

  if (ga.status === "loading") return <LoadingState label="Reading Google Analytics…" />;
  if (ga.status !== "connected" || !report) return <NotConnected setActiveTab={setActiveTab} />;

  if (only === "newReturning") {
    const mix = visitorMix(report);
    return mix ? <NewReturning mix={mix} foot={source} /> : <NotYet />;
  }
  // Reports from a server older than the 4th batch have none of the new keys (a key Google didn't answer is null).
  if (report.pageTime === undefined) return <NeedsUpdate />;

  switch (only) {
    case "livePages": {
      if (report.realtimePages === undefined) return <NeedsUpdate />;
      const minutes = liveMinutes(report), pages = livePagesOf(report);
      if (!minutes && !pages) return <EmptyState icon="⏳" title="Live figures couldn't be read just now" description="Google's live view didn't answer. The rest of the report is up to date; refresh to try again." />;
      return <LivePages minutes={minutes} pages={pages} nowCount={report.activeNow ?? (minutes ? minutes[29] : null)} full={!!full} />;
    }
    case "pageTime": {
      if (report.pageTime === null) return <NotAnswered />;
      const sort = config?.sort === "views" ? "views" : "time";
      const res = pageTimeRows(report, books, sort);
      return res ? <PageTime res={res} onSort={s => onConfig?.({ sort: s })} foot={source} full={!!full} /> : <NotYet note="Pages show here once one has at least 10 views." />;
    }
    case "visitHours": {
      if (report.when === null) return <NotAnswered />;
      const heat = visitHeat(report);
      return heat ? <VisitHours heat={heat} foot={`${source} · hours in the Google Analytics property's time zone`} /> : <NotYet />;
    }
    case "outbound": {
      if (report.outbound === null) return <NotAnswered />;
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const rows = outboundRows(report, [...OWN_HOSTS, host]);
      return rows ? <Outbound rows={rows} foot={source} full={!!full} /> : <NotYet />;
    }
  }
  return null;
}

// --------------------------------------------------------------------------------------------- shared pieces

export function Frame({ headline, tools, children, foot }: { headline: ReactNode; tools?: ReactNode; children: ReactNode; foot: ReactNode }) {
  return (
    <div className="rp-vw">
      <div className="rp-vw-top">
        <p className="rp-vw-headline">{headline}</p>
        {tools}
      </div>
      <div className="rp-vw-chart">{children}</div>
      <p className="rp-vw-foot">{foot}</p>
    </div>
  );
}

export function NotConnected({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  return <EmptyState icon="◌" title="Google Analytics isn't connected" description="Connect Google Analytics in Settings › General to see this."
    action={setActiveTab ? <SecondaryButton size="sm" onClick={() => setActiveTab("general")}>Open Google Analytics settings</SecondaryButton> : undefined} />;
}
export const NeedsUpdate = () => <EmptyState icon="⏳" title="Needs the latest server update" description="This view needs the newest Google Analytics report from the shop's server. It appears after the next server update." />;
/** A report key that is null: Google refused or didn't answer that one report this time (undefined = NeedsUpdate). */
export const NotAnswered = () => <EmptyState icon="↻" title="Google didn't answer this report." description="Try Refresh." />;
export const NotYet = ({ note }: { note?: string }) => <EmptyState icon="⏳" title="Not recorded yet in this period." description={note} />;

const more = (n: number, full: boolean, cap: number) => (!full && n > cap ? <span className="rp-vw-more">+{(n - cap).toLocaleString()} more in full view</span> : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// --------------------------------------------------------------------------------------------- 1. Being read right now

function LivePages({ minutes, pages, nowCount, full }: { minutes: number[] | null; pages: ReturnType<typeof livePagesOf>; nowCount: number | null; full: boolean }) {
  const top = pages?.[0] ? { label: shortPageTitle(pages[0].label), people: pages[0].people } : null;
  const cap = full ? 10 : 5;
  const peak = minutes ? Math.max(...minutes) : 0;
  return (
    <Frame headline={liveHeadline(nowCount, top)} foot="Google Analytics · live, last 30 minutes">
      {minutes && (
        <div className="rp-vw-minutes">
          <div className="rp-viz-eyebrow">People on the site, minute by minute</div>
          {peak > 0
            ? <Columns label="People on the site in the last 30 minutes, oldest first" items={minutes.map((n, i) => ({ key: String(i), label: "", value: n, title: `${29 - i === 0 ? "This minute" : `${29 - i} min ago`}: ${plural(n, "person", "people")}` }))} />
            : <p className="rp-vw-quiet">Nobody in the last 30 minutes.</p>}
          {peak > 0 && <div className="rp-vw-axis" aria-hidden="true"><span>30 min ago</span><span>now</span></div>}
        </div>
      )}
      {pages && (
        <>
          <div className="rp-viz-eyebrow rp-vw-gap">Pages open now</div>
          <RankBars label="Pages open in the last 30 minutes" rows={pages.slice(0, cap).map((p): RankRow => ({
            key: p.key, label: shortPageTitle(p.label), value: p.people, valueText: plural(p.people, "person", "people"),
            sub: p.views ? plural(p.views, "view") : undefined, tone: "info",
          }))} />
          {more(pages.length, full, cap)}
        </>
      )}
    </Frame>
  );
}

// --------------------------------------------------------------------------------------------- 3. Pages people actually read

function PageTime({ res, onSort, foot, full }: { res: NonNullable<ReturnType<typeof pageTimeRows>>; onSort: (s: "time" | "views") => void; foot: string; full: boolean }) {
  const cap = full ? 25 : 8;
  const top = res.rows[0];
  const read = (r: (typeof res.rows)[number]) => (res.hasScroll && r.readShare ? ` · ${Math.round(r.readShare * 100)}% read to the end` : "");
  const tools = (
    <div className="rp-vw-seg" role="group" aria-label="Sort pages by">
      <span className="rp-vw-seg-label" aria-hidden="true">Sort</span>
      {(["time", "views"] as const).map(s => <button key={s} type="button" aria-pressed={res.sort === s} onClick={() => onSort(s)}>{s === "time" ? "Time" : "Views"}</button>)}
    </div>
  );
  return (
    <Frame headline={pageTimeHeadline({ label: top.label, seconds: top.seconds, views: top.views }, res.sort)} tools={tools}
      foot={`${foot} · pages with at least 10 views · time = engaged time per view${res.hasScroll ? "" : " · “read to the end” needs scroll tracking on in Google Analytics"}`}>
      <RankBars label={`Pages by ${res.sort === "time" ? "time per view" : "views"}`} rows={res.rows.slice(0, cap).map((r): RankRow => ({
        key: r.key, label: r.label, cover: r.cover, coverText: r.label,
        value: res.sort === "time" ? r.seconds : r.views,
        valueText: res.sort === "time" ? `${clock(r.seconds)} a view` : plural(r.views, "view"),
        sub: res.sort === "time" ? `${plural(r.views, "view")}${read(r)}` : `${clock(r.seconds)} a view${read(r)}`,
      }))} />
      {more(res.rows.length, full, cap)}
    </Frame>
  );
}

// --------------------------------------------------------------------------------------------- 4. When visitors come

function VisitHours({ heat, foot }: { heat: NonNullable<ReturnType<typeof visitHeat>>; foot: string }) {
  return (
    <Frame headline={visitHoursHeadline({ day: heat.busiest.day, hour: heat.busiest.hour, value: heat.busiest.visitors })} foot={foot}>
      <div className="rp-vw-heat">
        <HeatGrid label="Visitors by weekday and hour" rows={heat.rows} max={heat.max} unit="visitor" />
      </div>
    </Frame>
  );
}

// --------------------------------------------------------------------------------------------- 5. What visitors do

function Actions({ res, visitors, foot, full }: { res: NonNullable<ReturnType<typeof actionRows>>; visitors: number | null; foot: string; full: boolean }) {
  const cap = full ? 12 : 7;
  const top = res.rows[0];
  const change = (cur: number, prev: number | null) => {
    if (prev === null) return null;
    if (prev === 0) return cur > 0 ? "new this period" : null;
    const pct = Math.round(((cur - prev) / prev) * 100);
    return pct === 0 ? "same as before" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs before`;
  };
  const unit = res.source === "google" ? (n: number) => plural(n, "person", "people") : (n: number) => plural(n, "visit");
  return (
    <Frame headline={actionsHeadline({ label: top.label, people: top.people }, visitors)} foot={foot}>
      <RankBars label="What visitors do" rows={res.rows.slice(0, cap).map((r): RankRow => ({
        key: r.key, label: r.label, value: r.people, prev: r.prev ?? undefined, valueText: unit(r.people),
        sub: [r.times !== null ? plural(r.times, "time") : null, change(r.people, r.prev)].filter(Boolean).join(" · ") || undefined,
      }))} />
      {res.rows.some(r => r.prev !== null) && <p className="rp-vw-key"><span className="rp-vw-key-prev" aria-hidden="true" /> Hatched = the period before</p>}
      {more(res.rows.length, full, cap)}
    </Frame>
  );
}

// --------------------------------------------------------------------------------------------- 6. Links visitors follow away

function Outbound({ rows, foot, full }: { rows: NonNullable<ReturnType<typeof outboundRows>>; foot: string; full: boolean }) {
  const cap = full ? 15 : 5;
  const total = rows.reduce((s, r) => s + r.clicks, 0);
  return (
    <Frame headline={outboundHeadline({ label: rows[0].label, clicks: rows[0].clicks }, total)} foot={`${foot} · links out of the shop`}>
      <RankBars label="Sites visitors went to from the shop" rows={rows.slice(0, cap).map((r): RankRow => ({
        key: r.key, label: r.label, value: r.clicks, valueText: plural(r.clicks, "click"), sub: plural(r.people, "person", "people"), tone: "ink",
      }))} />
      {more(rows.length, full, cap)}
    </Frame>
  );
}

// --------------------------------------------------------------------------------------------- 7. New and returning visitors

function NewReturning({ mix, foot }: { mix: NonNullable<ReturnType<typeof visitorMix>>; foot: string }) {
  const parts = (m: { newVisitors: number; returning: number }) => [
    { key: "new", label: "New", value: m.newVisitors },
    { key: "returning", label: "Returning", value: m.returning },
  ];
  const eng = mix.engagement;
  const engLine = eng.newVisitors !== null && eng.returning !== null
    ? `Returning visitors are engaged on ${Math.round(eng.returning * 100)}% of visits, new visitors on ${Math.round(eng.newVisitors * 100)}%.`
    : null;
  return (
    <Frame headline={mixHeadline(mix.current.newVisitors, mix.current.returning, mix.previous?.newVisitors ?? null, mix.previous?.returning ?? null)}
      foot={`${foot} · “engaged” = stayed 10 seconds, saw two pages or bought`}>
      <Stack label="New and returning visitors" parts={parts(mix.current)} prev={mix.previous ? parts(mix.previous) : undefined}
        unit={n => plural(n, "visitor")} />
      {engLine && <p className="rp-vw-note">{engLine}</p>}
    </Frame>
  );
}
