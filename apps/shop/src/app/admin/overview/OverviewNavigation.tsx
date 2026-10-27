import { EmptyState, LoadingState } from "../riso/components";
import { Funnel, RankBars, type RankRow } from "./OverviewViz";
import type { GaState } from "./OverviewMarketing";
import type { Book } from "./overviewInsights";
import type { WidgetConfig } from "./overviewBoard";
import { Frame, NeedsUpdate, NotAnswered, NotConnected, NotYet, OWN_HOSTS } from "./OverviewVisitors";
import { deviceSteps, followPage, landingJourneys, listClicks, pageMoves, type PageLink } from "./overviewNavigation";

// Overview › Visitors › how visitors move (20 October 2026): four widgets from the Google Analytics report's 5th batch
// (maths in overviewNavigation.ts). Same frame as the other visitor widgets: a headline that answers the question, the
// chart, and a quiet source line. Nothing recorded = "Not recorded yet", never 0.

export type NavigationWidget = "moves" | "firstPage" | "sectionClicks" | "deviceSteps";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const more = (n: number, full: boolean, cap: number) => (!full && n > cap ? <span className="rp-vw-more">+{(n - cap).toLocaleString()} more in full view</span> : null);

export function OverviewNavigation({ only, ga, books, config, onConfig, full, setActiveTab, periodLabel = "this period" }: {
  only: NavigationWidget; ga: GaState; books: Book[];
  config?: WidgetConfig; onConfig?: (patch: WidgetConfig) => void; full?: boolean;
  setActiveTab?: (tab: string) => void; periodLabel?: string;
}) {
  if (ga.status === "loading") return <LoadingState label="Reading Google Analytics…" />;
  const report = ga.status === "connected" ? ga.answer?.report : undefined;
  if (!report) return <NotConnected setActiveTab={setActiveTab} />;
  // Reports from a server older than the navigation batch have none of its keys.
  if (report.moves === undefined && report.landingPaths === undefined && report.lists === undefined && report.deviceSteps === undefined) return <NeedsUpdate />;
  // A report Google refused or didn't answer this time is null; the other widgets still draw.
  const reportKey = ({ moves: "moves", firstPage: "landingPaths", sectionClicks: "lists", deviceSteps: "deviceSteps" } as const)[only];
  if (report[reportKey] === null) return <NotAnswered />;
  const source = `Google Analytics · ${periodLabel}`;
  const isFull = !!full;

  switch (only) {
    case "moves": {
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const res = pageMoves(report, books, [...OWN_HOSTS, host]);
      if (!res) return <NotYet note="Moves between pages are counted from 20 October 2026, once visitors open a second page." />;
      const top = res.moves[0];
      const cap = isFull ? 15 : 6, pageCap = isFull ? 12 : 4;
      const links = (rows: PageLink[], empty: string) => rows.length
        ? <RankBars label={empty} rows={rows.slice(0, 8).map((r): RankRow => ({ key: r.path, label: r.label, value: r.count, valueText: plural(r.count, "time"), tone: "ink" }))} />
        : <p className="rp-vw-quiet">{empty}</p>;
      return (
        <Frame headline={`The most common move is ${top.fromLabel} → ${top.toLabel} (${plural(top.count, "time")}).`}
          foot={`${source} · ${plural(res.total, "move")} between the shop's own pages · a page opened from another site is in Sources`}>
          <div className="rp-viz-eyebrow">Most common moves</div>
          <RankBars label="Moves from one page to the next" rows={res.moves.slice(0, cap).map((m): RankRow => ({
            key: m.key, label: <>{m.fromLabel} <span aria-hidden="true">→</span><span className="rp-sr-only"> then </span> {m.toLabel}</>,
            value: m.count, valueText: plural(m.count, "time"), tone: "info",
          }))} />
          {more(res.moves.length, isFull, cap)}
          <div className="rp-viz-eyebrow rp-vw-gap">Follow one page · press it to see where people came from and went next</div>
          <RankBars label="Pages, with where people came from and went next" rows={res.pages.slice(0, pageCap).map((p): RankRow => {
            const f = followPage(res, p.path);
            return {
              key: p.path, label: p.label, value: p.count, valueText: plural(p.count, "move"),
              sub: `${plural(f.cameFrom.reduce((s, x) => s + x.count, 0), "arrival")} · ${plural(f.wentTo.reduce((s, x) => s + x.count, 0), "move")} on`,
              details: (
                <div className="rp-nav-follow">
                  <div><div className="rp-viz-eyebrow">Came from</div>{links(f.cameFrom, "Nobody came here from another page of the shop.")}</div>
                  <div><div className="rp-viz-eyebrow">Went next</div>{links(f.wentTo, "Nobody went on from here to another page.")}</div>
                </div>
              ),
            };
          })} />
          {more(res.pages.length, isFull, pageCap)}
        </Frame>
      );
    }
    case "firstPage": {
      const res = landingJourneys(report, books, config?.channel || null);
      if (!res) return <NotYet note="First pages show here once one has at least 5 visits." />;
      const cap = isFull ? 20 : 6;
      const best = [...res.rows].filter(r => r.visits >= 20).sort((a, b) => b.buyShare - a.buyShare || b.engagedShare - a.engagedShare)[0];
      const top = res.rows[0];
      const headline = best && best.purchases > 0
        ? `Visits that start on ${best.label} buy most often: ${pct(best.buyShare)} of ${plural(best.visits, "visit")}.`
        : `Most visits start on ${top.label}, and ${pct(top.engagedShare)} of them keep going.`;
      const tools = res.channels.length > 1 ? (
        <label className="rp-nav-pick">
          <span className="rp-vw-seg-label">Came from</span>
          <select className="rp-select" value={res.channel || ""} onChange={e => onConfig?.({ channel: e.target.value || undefined })}>
            <option value="">Everywhere</option>
            {res.channels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      ) : undefined;
      return (
        <Frame headline={headline} tools={tools}
          foot={`${source} · first pages with at least 5 visits · “kept going” = stayed 10 seconds, saw a second page or bought`}>
          <RankBars label="First pages, with how far visits went" rows={res.rows.slice(0, cap).map((r): RankRow => ({
            key: r.key, label: r.label, value: r.visits, valueText: plural(r.visits, "visit"), tone: "info",
            sub: `${r.pagesPerVisit.toFixed(1)} pages a visit · ${pct(r.engagedShare)} kept going · ${plural(r.purchases, "purchase")}`,
            details: r.channels.length ? (
              <RankBars label={`Where visits to ${r.label} came from`} rows={r.channels.slice(0, 6).map((c): RankRow => ({
                key: c.channel, label: c.channel, value: c.visits, valueText: plural(c.visits, "visit"), sub: c.purchases ? plural(c.purchases, "purchase") : undefined, tone: "ink",
              }))} />
            ) : undefined,
          }))} />
          {more(res.rows.length, isFull, cap)}
        </Frame>
      );
    }
    case "sectionClicks": {
      const rows = listClicks(report);
      if (!rows) return <NotYet note="Counted for every list of book cards: the shop grid, search results, related books, recently viewed and Studio sections." />;
      const rated = rows.filter(r => r.rate !== null).sort((a, b) => (b.rate || 0) - (a.rate || 0));
      const headline = rated.length
        ? `${rated[0].label} gets the most clicks: ${pct(rated[0].rate!)} of the books seen there were opened.`
        : `${rows[0].label} is seen most: ${plural(rows[0].seen, "book card")} shown.`;
      const cap = isFull ? 20 : 6;
      return (
        <Frame headline={headline} foot={`${source} · every list of book cards · click rate shown once a list's cards were seen 20 times`}>
          <RankBars label="Book lists by share of books opened" rows={rows.slice(0, cap).map((r): RankRow => ({
            key: r.key, label: r.label, value: r.rate === null ? 0 : r.rate * 100,
            valueText: r.rate === null ? "too few views" : `${pct(r.rate)} opened`,
            sub: `${plural(r.seen, "card")} seen · ${plural(r.opened, "book")} opened`,
          }))} scaleMax={Math.max(1, ...rows.map(r => (r.rate || 0) * 100))} />
          {more(rows.length, isFull, cap)}
        </Frame>
      );
    }
    case "deviceSteps": {
      const res = deviceSteps(report);
      if (!res) return <NotYet />;
      const headline = res.gap
        ? `Phones fall behind most at “${res.gap.step}”: ${pct(res.gap.phone)} go on, against ${pct(res.gap.computer)} on computers.`
        : `Phones and computers move through the shop at about the same pace.`;
      return (
        <Frame headline={headline} foot={`${source} · people who reached each step, per device`}>
          <div className="rp-nav-devices">
            {res.devices.map(d => (
              <div key={d.key}>
                <div className="rp-viz-eyebrow">{d.label}</div>
                <Funnel label={`${d.label}: visit to purchase`} steps={d.steps.map(s => ({ key: s.key, label: s.label, count: s.people }))} />
              </div>
            ))}
          </div>
        </Frame>
      );
    }
  }
  return <EmptyState icon="◌" title="Nothing to show" />;
}
