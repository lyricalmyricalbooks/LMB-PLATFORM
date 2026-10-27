import { EmptyState, LoadingState, SecondaryButton } from "../riso/components";
import { Funnel, RankBars, type RankRow } from "./OverviewViz";
import type { GaState } from "./OverviewMarketing";
import type { Book } from "./overviewInsights";
import { Frame, NeedsUpdate, NotAnswered, NotConnected, NotYet, OWN_HOSTS } from "./OverviewVisitors";
import {
  bagPeeks, bookPageActions, brokenInside, eventCount, filtersUsed, missingDefinitions, missingPages, navLinks, readDepth, sourceState,
  type CustomKey, type StandardKey,
} from "./overviewVisitorEvents";

// Overview › Visitors › the shop's own events (20 October 2026): six widgets from the Google Analytics report's 6th and 7th
// batches (maths in overviewVisitorEvents.ts). Same frame as the other visitor widgets: a headline that answers the
// question, the chart, a quiet source line. A report Google refuses because its event parameters aren't registered yet shows
// what to add in Google Analytics, not an error; one Google didn't answer says so (Try Refresh). Nothing recorded = "Not
// recorded yet", never 0.

export type VisitorEventWidget = "navLinks" | "bookPage" | "notFound" | "filters" | "bagPeek" | "readDepth";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const more = (n: number, full: boolean, cap: number) => (!full && n > cap ? <span className="rp-vw-more">+{(n - cap).toLocaleString()} more in full view</span> : null);
const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** The report keys each widget reads, and the shop event it counts (for "Google has counted N so far"). */
const NEEDS: Record<VisitorEventWidget, { key: CustomKey | StandardKey; event: string; what: string }> = {
  navLinks: { key: "navClicks", event: "nav_click", what: "menu click" },
  bookPage: { key: "pdpActions", event: "pdp_interact", what: "book-page action" },
  notFound: { key: "notFound", event: "page_not_found", what: "missing page" },
  filters: { key: "filters", event: "filter_use", what: "filter use" },
  bagPeek: { key: "bagPeeks", event: "view_cart", what: "bag opening" },
  readDepth: { key: "scrollDepth", event: "scroll_depth", what: "scroll mark" },
};

/** Google refused the report because these event parameters aren't registered yet: say exactly what to add. */
function Register({ params, recorded, what }: { params: string[]; recorded: number | null; what: string }) {
  return (
    <div className="rp-state rp-ve-register">
      <div className="rp-state-icon" aria-hidden="true">✎</div>
      <h3 className="rp-state-title">One setting in Google Analytics first</h3>
      <p className="rp-state-desc">
        Google keeps these details only once it is told about them. In Google Analytics open <strong>Admin › Custom definitions</strong>,
        press <strong>Create custom dimension</strong> and add {params.length === 1 ? "this one" : `each of these ${params.length}`} with
        Scope <strong>Event</strong>, using the word below as both the name and the event parameter:
      </p>
      <ul className="rp-ve-defs" aria-label="Custom dimensions to add">
        {params.map(p => <li key={p}><code>{p}</code></li>)}
      </ul>
      <p className="rp-state-desc">
        Figures start from the day they are added.
        {recorded ? ` Google has already counted ${plural(recorded, what)} in this period; it names them from then on.` : ""}
      </p>
    </div>
  );
}

export function OverviewVisitorEvents({ only, ga, books, full, setActiveTab, periodLabel = "this period" }: {
  only: VisitorEventWidget; ga: GaState; books: Book[]; full?: boolean;
  setActiveTab?: (tab: string) => void; periodLabel?: string;
}) {
  if (ga.status === "loading") return <LoadingState label="Reading Google Analytics…" />;
  const report = ga.status === "connected" ? ga.answer?.report : undefined;
  if (!report) return <NotConnected setActiveTab={setActiveTab} />;
  const need = NEEDS[only];
  const state = sourceState(report, need.key);
  const recorded = eventCount(report, need.event);
  if (state === "needsUpdate") return <NeedsUpdate />;
  if (state === "notAnswered") return <NotAnswered />;
  if (state === "notRegistered") {
    const keys: CustomKey[] = only === "bookPage" ? ["pdpActions", "pdpTabs"] : [need.key as CustomKey];
    return <Register params={missingDefinitions(report, keys)} recorded={recorded} what={need.what} />;
  }
  // Counted by Google, but every row is "(not set)": sent before the parameters were registered.
  const unnamed = (note: string) => <NotYet note={recorded ? `Google counted ${plural(recorded, need.what)} before the details were set up in Custom definitions; it names them from then on.` : note} />;
  const source = `Google Analytics · ${periodLabel}`;
  const isFull = !!full;

  switch (only) {
    case "navLinks": {
      const res = navLinks(report);
      if (!res) return unnamed("Counted from 20 October 2026, when visitors use the header, footer or phone menu.");
      const links = res.menus.flatMap(m => m.links.map(l => ({ ...l, menu: m.label, key: `${m.key}::${l.key}` }))).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
      const cap = isFull ? 20 : 6;
      return (
        <Frame headline={`The link used most is “${res.top.label}” in the ${lower(res.top.menu)}: ${plural(res.top.count, "click")}.`}
          foot={`${source} · ${plural(res.total, "menu click")}`}>
          <div className="rp-viz-eyebrow">Most clicked links</div>
          <RankBars label="Menu links by clicks" rows={links.slice(0, cap).map((l): RankRow => ({
            key: l.key, label: l.label, sub: l.menu, value: l.count, valueText: plural(l.count, "click"), tone: "info",
          }))} />
          {more(links.length, isFull, cap)}
          {res.menus.length > 1 && <>
            <div className="rp-viz-eyebrow rp-vw-gap">By menu · press one to see its links</div>
            <RankBars label="Clicks per menu" rows={res.menus.map((m): RankRow => ({
              key: m.key, label: m.label, value: m.count, valueText: plural(m.count, "click"), sub: plural(m.links.length, "link"), tone: "ink",
              details: <RankBars label={`Links in the ${lower(m.label)}`} rows={m.links.slice(0, 12).map((l): RankRow => ({ key: l.key, label: l.label, value: l.count, valueText: plural(l.count, "click"), tone: "ink" }))} />,
            }))} />
          </>}
        </Frame>
      );
    }
    case "bookPage": {
      const res = bookPageActions(report, books);
      if (!res) return unnamed("Counted from 20 October 2026, when visitors open a tab, look through photos, pick an edition or share a book.");
      const top = res.actions[0];
      const tabNote = res.tabs ? ` The tab opened most is ${res.tabs[0].label}.` : "";
      const tabsMissing = !res.tabs && sourceState(report, "pdpTabs") === "notRegistered";
      const cap = isFull ? 15 : 6;
      return (
        <Frame headline={`On book pages, people most often ${lower(top.label)} (${plural(top.count, "time")}).${tabNote}`}
          foot={`${source} · ${plural(res.total, "action")} on ${plural(res.books.length, "book page")}`}>
          <RankBars label="What people do on book pages" rows={res.actions.slice(0, cap).map((a): RankRow => ({
            key: a.key, label: a.label, value: a.count, valueText: plural(a.count, "time"), tone: "info",
            sub: a.books[0] ? `most on ${a.books[0].label}` : undefined,
            details: <RankBars label={`Books where people ${lower(a.label)}`} rows={a.books.slice(0, 8).map((b): RankRow => ({ key: b.path, label: b.label, value: b.count, valueText: plural(b.count, "time"), tone: "ink" }))} />,
          }))} />
          {more(res.actions.length, isFull, cap)}
          {res.tabs && <>
            <div className="rp-viz-eyebrow rp-vw-gap">Tabs opened</div>
            <RankBars label="Book-page tabs opened" rows={res.tabs.map((t): RankRow => ({ key: t.key, label: t.label, value: t.count, valueText: plural(t.count, "time"), tone: "ink" }))} />
          </>}
          {tabsMissing && <p className="rp-vw-quiet">To see which tab people open, add <code>tab</code> in Google Analytics › Admin › Custom definitions (Scope: Event).</p>}
        </Frame>
      );
    }
    case "notFound": {
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const res = missingPages(report, books, [...OWN_HOSTS, host]);
      if (!res) return <NotYet note="No visitor reached a missing page in this period (counted from 20 October 2026)." />;
      const inside = brokenInside(res);
      const top = res.pages[0];
      const headline = inside > 0
        ? `${plural(inside, "visit")} reached a missing page from a link inside the shop: fix those links first.`
        : `${top.path} is the missing address people reach most (${plural(top.count, "time")}).`;
      const cap = isFull ? 20 : 6;
      const tools = setActiveTab ? <SecondaryButton size="sm" onClick={() => setActiveTab("general")}>Set up a redirect</SecondaryButton> : undefined;
      return (
        <Frame headline={headline} tools={tools}
          foot={`${source} · ${plural(res.total, "visit")} to ${plural(res.pages.length, "missing address", "missing addresses")} · send an old address somewhere in Settings › General › URL redirects`}>
          <RankBars label="Missing addresses, with where visitors came from" rows={res.pages.slice(0, cap).map((p): RankRow => ({
            key: p.path, label: <code className="rp-ve-path">{p.path}</code>, value: p.count, valueText: plural(p.count, "visit"),
            tone: p.from.some(f => f.kind === "shop") ? "flare" : "info",
            sub: `from ${p.from[0].label}${p.from.length > 1 ? ` and ${plural(p.from.length - 1, "other place")}` : ""}`,
            details: <RankBars label={`Where visits to ${p.path} came from`} rows={p.from.slice(0, 8).map((f): RankRow => ({
              key: f.key || "none", label: f.kind === "shop" ? `${f.label} (a page of the shop)` : f.label, value: f.count, valueText: plural(f.count, "visit"), tone: "ink",
            }))} />,
          }))} />
          {more(res.pages.length, isFull, cap)}
        </Frame>
      );
    }
    case "filters": {
      const res = filtersUsed(report);
      if (!res) return unnamed("Counted from 20 October 2026, when shoppers use the format, price or in-stock filters.");
      const top = res.filters[0];
      const pick = top.values[0];
      return (
        <Frame headline={`${top.label} is the filter used most (${plural(top.count, "time")})${pick ? `, most often for “${pick.label}”` : ""}.`}
          foot={`${source} · ${plural(res.total, "filter choice")} in the shop`}>
          <RankBars label="Filters used" rows={res.filters.map((f): RankRow => ({
            key: f.key, label: f.label, value: f.count, valueText: plural(f.count, "time"), tone: "info",
            sub: f.values.length ? f.values.slice(0, 3).map(v => v.label).join(" · ") : undefined,
            details: f.values.length ? <RankBars label={`Choices for ${f.label}`} rows={f.values.slice(0, 12).map((v): RankRow => ({ key: v.key, label: v.label, value: v.count, valueText: plural(v.count, "time"), tone: "ink" }))} /> : undefined,
          }))} />
        </Frame>
      );
    }
    case "bagPeek": {
      const res = bagPeeks(report, books);
      if (!res) return <NotYet note="Counted from 20 October 2026, each time a visitor opens the bag." />;
      const headline = res.rate !== null
        ? `People opened the bag ${plural(res.peeks, "time")}; ${pct(res.rate)} as many checkouts were started.`
        : `People opened the bag ${plural(res.peeks, "time")} and started checkout ${plural(res.checkouts, "time")}.`;
      const cap = isFull ? 15 : 6;
      return (
        <Frame headline={headline}
          foot={`${source} · bag opened (view_cart) and checkout started (begin_checkout)${res.perPage ? "" : " · checkout starts are counted on the checkout page, so pages show bag openings only"}`}>
          {res.checkouts <= res.peeks && (
            <Funnel label="Bag opened to checkout started" scale="linear" steps={[
              { key: "peek", label: "Opened the bag", count: res.peeks },
              { key: "checkout", label: "Started checkout", count: res.checkouts },
            ]} />
          )}
          <div className="rp-viz-eyebrow rp-vw-gap">Where the bag was opened</div>
          <RankBars label="Pages where the bag was opened" rows={res.rows.slice(0, cap).map((r): RankRow => ({
            key: r.path, label: r.label, value: r.peeks, valueText: plural(r.peeks, "opening"), tone: "info",
            sub: res.perPage ? (r.rate !== null ? `${pct(r.rate)} went to checkout` : `${plural(r.checkouts, "checkout")} started`) : undefined,
          }))} />
          {more(res.rows.length, isFull, cap)}
        </Frame>
      );
    }
    case "readDepth": {
      const res = readDepth(report, books);
      if (!res) return unnamed("Counted from 20 October 2026, once a page has 10 visits that scrolled.");
      const top = res.rows[0];
      const end = top.reached[100], half = top.reached[50];
      const headline = end !== null
        ? `${pct(end)} of visits to ${top.label} reach the end${half !== null ? `; ${pct(half)} get halfway` : ""}.`
        : `${pct(half ?? top.reached[75] ?? 0)} of visits to ${top.label} get ${half !== null ? "halfway" : "three quarters down"}.`;
      const cap = isFull ? 20 : 6;
      const mark = (v: number | null) => (v === null ? "–" : pct(v));
      return (
        <Frame headline={headline}
          foot={`${source} · share of ${res.fromViews ? "page views" : "visits that scrolled"} reaching each mark · pages with at least 10`}>
          <RankBars label="Pages by share read to the end" scaleMax={100} rows={res.rows.slice(0, cap).map((r): RankRow => ({
            key: r.path, label: r.label, value: (r.reached[100] ?? 0) * 100,
            valueText: r.reached[100] === null ? "end not recorded" : `${pct(r.reached[100])} to the end`,
            sub: `halfway ${mark(r.reached[50])} · three quarters ${mark(r.reached[75])} · ${plural(r.base, res.fromViews ? "view" : "visit")}`,
          }))} />
          {more(res.rows.length, isFull, cap)}
        </Frame>
      );
    }
  }
  return <EmptyState icon="◌" title="Nothing to show" />;
}
