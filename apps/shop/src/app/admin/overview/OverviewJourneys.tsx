import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, SecondaryButton } from "../riso/components";
import { RankBars, type RankRow } from "./OverviewViz";
import { Frame, NotConnected, NotYet } from "./OverviewVisitors";
import type { Book } from "./overviewInsights";
import {
  exitRows, exitsHeadline, fetchJourneys, journeyFoot, journeyRows, journeysHeadline, journeyWindow, pathWords, type JourneyAnswer,
} from "../bigQueryJourneys";
import "./overviewVisitors.css";

// Overview › Traffic: "Visitor journeys" (the commonest first-4-page paths) and "Last page before leaving", from Google
// Analytics' daily BigQuery export (functions/bigQueryJourneys.js). Each widget asks the shop's server only while it is
// mounted (a folded widget mounts nothing, so it reads nothing); BigQuery's own cache makes a repeat read free.

export type JourneyWidget = "journeys" | "exitPages";
export const JOURNEY_WIDGETS: JourneyWidget[] = ["journeys", "exitPages"];

type Load = { status: "loading" } | { status: "ready"; answer: JourneyAnswer } | { status: "error" };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const more = (n: number, full: boolean, cap: number) => (!full && n > cap ? <span className="rp-vw-more">+{(n - cap).toLocaleString()} more in full view</span> : null);

export function OverviewJourneys({ only, books, range, full, setActiveTab }: {
  only: JourneyWidget; books: Book[];
  /** The Overview's range (Toronto day keys) and its words, e.g. "the last 90 days". Cut to its last 31 days here. */
  range: { startKey: string; endKey: string; phrase: string };
  full?: boolean; setActiveTab?: (tab: string) => void;
}) {
  const w = journeyWindow(range);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoad({ status: "loading" });
    fetchJourneys({ startDate: w.startDate, endDate: w.endDate })
      .then(answer => { if (alive) setLoad({ status: "ready", answer }); })
      .catch(() => { if (alive) setLoad({ status: "error" }); });
    return () => { alive = false; };
  }, [w.startDate, w.endDate, attempt]);

  if (load.status === "loading") return <LoadingState label="Reading the BigQuery export…" />;
  if (load.status === "error") return <ErrorState title="Journeys unavailable" description="The shop's server couldn't read BigQuery just now." onRetry={retry} />;
  const answer = load.answer;
  if (!answer.connected) return <NotLinked answer={answer} setActiveTab={setActiveTab} onRetry={retry} />;
  if (answer.code === "still_running") return <EmptyState icon="⏳" title="BigQuery is still counting" description={answer.error} action={<SecondaryButton size="sm" onClick={retry}>Try again</SecondaryButton>} />;

  const foot = journeyFoot(w, range.phrase);
  if (only === "journeys") {
    const rows = journeyRows(answer, books);
    if (!rows) return <NotYet note="Paths show here once visits of two or more pages reach the export." />;
    const cap = full ? 25 : 6;
    return (
      <Frame headline={journeysHeadline(rows, answer.totals)} foot={`${foot} · first 4 pages of each visit`}>
        <RankBars label="Most common paths through the shop" rows={rows.slice(0, cap).map((r): RankRow => ({
          key: r.key,
          label: <span title={r.paths.join(" → ")}>{pathWords(r.labels)}</span>,
          value: r.sessions, valueText: plural(r.sessions, "visit"), tone: "info",
          sub: r.purchases > 0 ? `${plural(r.purchases, "ended in a purchase", "ended in a purchase")} (${pct(r.buyShare)})` : "No purchases on this path",
        }))} />
        {more(rows.length, !!full, cap)}
      </Frame>
    );
  }

  const rows = exitRows(answer, books);
  if (!rows) return <NotYet />;
  const cap = full ? 25 : 6;
  return (
    <Frame headline={exitsHeadline(rows)} foot={`${foot} · “in the bag” = added a book during that visit`}>
      <RankBars label="Last page before leaving" rows={rows.slice(0, cap).map((r): RankRow => ({
        key: r.key, label: <span title={r.path}>{r.label}</span>,
        value: r.sessions, valueText: plural(r.sessions, "exit"), tone: "ink",
        sub: [
          r.share ? `${pct(r.share)} of visits` : null,
          r.hadBag > 0 ? `${pct(r.bagShare)} had something in the bag` : "nothing in the bag",
          r.purchases > 0 ? `${plural(r.purchases, "bought", "bought")}` : null,
        ].filter(Boolean).join(" · "),
      }))} />
      {more(rows.length, !!full, cap)}
    </Frame>
  );
}

/** Not linked yet / no access / API off: the server's fixed sentence plus what to do. */
function NotLinked({ answer, setActiveTab, onRetry }: { answer: JourneyAnswer; setActiveTab?: (tab: string) => void; onRetry: () => void }) {
  if (answer.code === "no_property") return <NotConnected setActiveTab={setActiveTab} />;
  const setup = setActiveTab ? <SecondaryButton size="sm" onClick={() => setActiveTab("general")}>Open Google Analytics settings</SecondaryButton> : null;
  return (
    <div>
      <EmptyState icon="◌" title={answer.code === "not_linked" ? "The BigQuery export isn't linked yet" : "BigQuery can't be read yet"}
        description={answer.error || "Link Google Analytics to BigQuery in Settings › General › Google Analytics."}
        action={<span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{setup}<SecondaryButton size="sm" onClick={onRetry}>Check again</SecondaryButton></span>} />
      {answer.serviceAccount && answer.code === "no_access" && (
        <p className="rp-hint" style={{ margin: "0 16px 12px", overflowWrap: "anywhere" }}>
          Service account: <span className="rp-mono" style={{ userSelect: "all" }}>{answer.serviceAccount}</span>
        </p>
      )}
      {answer.code === "api_disabled" && answer.enableApiUrl && (
        <p className="rp-hint" style={{ margin: "0 16px 12px" }}><a href={answer.enableApiUrl} target="_blank" rel="noopener noreferrer">Switch on the BigQuery API</a></p>
      )}
    </div>
  );
}
