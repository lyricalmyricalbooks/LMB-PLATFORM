import { useMemo, type ReactNode } from "react";
import { EmptyState, GhostButton } from "../riso/components";
import type { Book } from "./overviewInsights";
import { recordedSince, type Daily } from "./overviewTraffic";
import { smallPhotoUrl } from "../../features/site/photoSources";
import { Funnel, RankBars, type RankRow } from "./OverviewViz";
import { DEFAULT_MIN_VIEWS, LOW_ADD_RATE, dropOffPath, lookedNotAdded } from "./overviewVisitorPath";
import "./overviewVisitorPath.css";

export type PathWidget = "dropOff" | "lookNoBuy";

const dayWords = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const pct = (n: number) => `${n < 10 && n > 0 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)}%`;
const MIN_VIEW_CHOICES = [3, 5, 10, 25, 50];

const notYet = (what: string) => (
  <EmptyState inline icon="⏳" title="Not recorded yet" description={`${what} start counting once shoppers use the updated storefront. Until then there is nothing to show — not even zero.`} />
);

/**
 * Two Overview widgets from the shop's own counter (19 October 2026): "Where visitors drop off" and "Looked at but not
 * added". They draw only the daily `analytics/<date>` rows the board already loaded; the maths is in overviewVisitorPath.ts.
 * `dailyAll` is every loaded day (to tell "never recorded" from "nothing this period"); `phrase` is the range's own words.
 */
export function OverviewVisitorPath({ only, dailyCurrent, dailyPrevious = [], dailyAll, books, config = {}, onConfig, onEditBook, phrase }: {
  only: PathWidget; dailyCurrent: Daily[]; dailyPrevious?: Daily[]; dailyAll: Daily[]; books: Book[];
  config?: { minViews?: number }; onConfig?: (patch: { minViews?: number }) => void; onEditBook?: (id: string) => void;
  /** e.g. "the last 30 days" (Range.phrase). */ phrase?: string;
}) {
  return only === "dropOff"
    ? <DropOffWidget cur={dailyCurrent} prev={dailyPrevious} all={dailyAll} phrase={phrase} />
    : <LookNoBuyWidget cur={dailyCurrent} all={dailyAll} books={books} minViews={config.minViews ?? DEFAULT_MIN_VIEWS} onConfig={onConfig} onEditBook={onEditBook} phrase={phrase} />;
}

function Source({ phrase, children }: { phrase?: string; children?: ReactNode }) {
  return <p className="rp-hint rp-vp-foot">The shop's own counter{phrase ? ` · ${phrase}` : ""}.{children ? <> {children}</> : null}</p>;
}

function DropOffWidget({ cur, prev, all, phrase }: { cur: Daily[]; prev: Daily[]; all: Daily[]; phrase?: string }) {
  const checkoutSince = useMemo(() => recordedSince(all, "checkout"), [all]);
  const path = useMemo(() => dropOffPath(cur, prev, { checkoutSince }), [cur, prev, checkoutSince]);
  if (!path) {
    const ever = all.some(d => Number(d?.visits) > 0) || recordedSince(all, "funnel") !== null;
    return ever
      ? <EmptyState inline icon="–" title="No visits counted in this period" description="Pick a longer period at the top of the board to see where visitors stop." />
      : notYet("Visits and shopping steps");
  }
  const w = path.worst >= 0 ? path.steps[path.worst] : null;
  const steps = path.steps.map(s => ({
    key: s.key, label: s.label, count: s.count,
    details: s.prevCount !== null || s.lost > 0 ? (
      <p className="rp-vp-drill">
        {s.lost > 0 && <>{s.lost.toLocaleString()} {s.lost === 1 ? "person" : "people"} went no further than the step before. </>}
        {s.prevCount !== null && <>The period before: {s.prevCount.toLocaleString()}.</>}
      </p>
    ) : undefined,
  }));
  return (
    <div className="rp-vp">
      <p className="rp-vp-headline">{path.headline ? `${path.headline}.` : "Visitors who start the path mostly finish it."}</p>
      {w && w.stopShare !== null && (
        <p className="rp-vp-sub">
          <span className="rp-vp-flag" aria-hidden="true">!</span> {pct(w.stopShare)} go no further
          {w.prevStopShare !== null && <> · was {pct(w.prevStopShare)} the period before</>}
          {w.lost > 0 && <> · {w.lost.toLocaleString()} {w.lost === 1 ? "person" : "people"}</>}
        </p>
      )}
      <Funnel label="Where visitors drop off, from a visit to a paid order" steps={steps} />
      <Source phrase={phrase}>
        Visits are counted once per visit; book pages and bag adds each time they happen, so a step can count more than the one before.
        {!path.checkoutSteps && " The checkout steps (email to Pay) are not recorded yet."}
        {path.checkoutSince && ` Checkout steps counted since ${dayWords(path.checkoutSince)}.`}
      </Source>
    </div>
  );
}

function LookNoBuyWidget({ cur, all, books, minViews, onConfig, onEditBook, phrase }: {
  cur: Daily[]; all: Daily[]; books: Book[]; minViews: number; onConfig?: (patch: { minViews?: number }) => void; onEditBook?: (id: string) => void; phrase?: string;
}) {
  const addsSince = useMemo(() => recordedSince(all, "bookAdds"), [all]);
  const viewsSince = useMemo(() => recordedSince(all, "bookViews"), [all]);
  const data = useMemo(() => lookedNotAdded(cur, books, minViews, { addsSince }), [cur, books, minViews, addsSince]);
  const choices = MIN_VIEW_CHOICES.includes(minViews) ? MIN_VIEW_CHOICES : [...MIN_VIEW_CHOICES, minViews].sort((a, b) => a - b);
  const picker = onConfig && (
    <label className="rp-vp-pick">
      <span>Books opened at least</span>
      <select className="rp-select" value={minViews} onChange={e => onConfig({ minViews: Number(e.target.value) })}>
        {choices.map(n => <option key={n} value={n}>{n} times</option>)}
      </select>
    </label>
  );
  if (!data) {
    if (addsSince === null || viewsSince === null) return notYet("Book page visits and bag adds");
    return <EmptyState inline icon="–" title="No book pages opened in this period" description="Pick a longer period at the top of the board." />;
  }
  if (data.rows.length === 0) {
    return (
      <div className="rp-vp">
        {picker}
        <EmptyState inline icon="–" title={`No book was opened ${minViews} times or more`} description={data.viewedBooks ? `${data.viewedBooks} book${data.viewedBooks === 1 ? " was" : "s were"} opened fewer times. Lower the number above, or pick a longer period.` : "Pick a longer period at the top of the board."} />
      </div>
    );
  }
  const top = data.rows[0];
  const lows = data.rows.filter(r => r.low).length;
  const headline = top.low
    ? top.adds === 0
      ? `${top.title} was opened ${top.views.toLocaleString()} times but never put in the bag.`
      : `${top.title} was opened ${top.views.toLocaleString()} times but put in the bag only ${top.adds === 1 ? "once" : `${top.adds.toLocaleString()} times`}.`
    : "Most books people open also go in the bag.";
  const rows: RankRow[] = data.rows.slice(0, 8).map(r => ({
    key: r.id,
    label: r.title,
    value: r.views,
    valueText: `${r.views.toLocaleString()} view${r.views === 1 ? "" : "s"}`,
    cover: r.book ? smallPhotoUrl(r.book.photos?.[0], 64) || null : null,
    coverText: r.title,
    tone: r.low ? "flare" : "ink",
    sub: <>{r.low && <span className="rp-vp-low">! Hardly added · </span>}{r.adds.toLocaleString()} added · {pct(r.addRate)}</>,
    details: onEditBook && r.book ? (
      <div className="rp-vp-drill">
        <p>{(r.views - r.adds).toLocaleString()} visits to this book's page ended without a bag add. Check its price, photos and description.</p>
        <GhostButton type="button" onClick={() => onEditBook(r.id)}>Edit this book</GhostButton>
      </div>
    ) : undefined,
  }));
  return (
    <div className="rp-vp">
      <p className="rp-vp-headline">{headline}</p>
      {lows > 0 && <p className="rp-vp-sub"><span className="rp-vp-flag" aria-hidden="true">!</span> {lows} book{lows === 1 ? "" : "s"} put in the bag by fewer than {LOW_ADD_RATE}% of visitors</p>}
      {picker}
      <RankBars label="Books opened most, with how often they went in the bag" rows={rows} />
      <Source phrase={phrase}>
        Each book counted once per visit.{data.addsSince && ` Bag adds counted since ${dayWords(data.addsSince)}, so earlier visits are left out.`}
      </Source>
    </div>
  );
}
