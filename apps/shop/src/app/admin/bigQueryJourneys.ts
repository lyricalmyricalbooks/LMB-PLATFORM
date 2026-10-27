// Overview › Visitor journeys and Last page before leaving: real paths through the shop from Google Analytics 4's daily
// BigQuery export, read by the createStripeCheckoutSession `bigQueryJourneys` action (functions/bigQueryJourneys.js, one
// read-only query with the Functions' own service account). Pure helpers here; the request goes through the same admin
// call as Google Analytics and Search Console (googleAnalyticsApi), loaded only when a widget asks.
import { addDays } from "../lib/shopDay";
import { rangeWords } from "./overview/overviewRange";
import { pageLabel } from "./overview/overviewVisitors";
import type { BookRecord } from "../../shared/records";

type Book = BookRecord;

/** The server reads at most this many days per request (functions/bigQueryJourneys.js MAX_DAYS). */
export const JOURNEY_MAX_DAYS = 31;

// ------------------------------------------------------------------------------------------------- dataset name
// Mirrors functions/bigQueryJourneys.js (src/app/admin/bigQueryJourneys.test.ts): project ids are 6–30 lower-case letters,
// digits and hyphens starting with a letter; dataset ids are letters, digits and underscores.
const PROJECT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DATASET_RE = /^[A-Za-z0-9_]{1,1024}$/;

/** "project.dataset", "project:dataset" or "dataset" → the saved form; "" when it isn't a BigQuery name. */
export function cleanBigQueryDataset(value: unknown): string {
  const s = String(value ?? "").trim().replace(/^`([^`]*)`$/, "$1");
  if (!s) return "";
  const parts = s.split(/[.:]/);
  if (parts.length === 1) return DATASET_RE.test(parts[0]) ? parts[0] : "";
  if (parts.length === 2 && PROJECT_RE.test(parts[0]) && DATASET_RE.test(parts[1])) return `${parts[0]}.${parts[1]}`;
  return "";
}

/** Plain-English refusal for the settings box, or "" (empty is fine: the automatic `analytics_<property id>` is used). */
export function bigQueryDatasetProblem(value: unknown): string {
  if (!String(value ?? "").trim()) return "";
  return cleanBigQueryDataset(value) ? "" : "That isn't a BigQuery dataset name. Write project.dataset (for example my-project.analytics_123456789) or just the dataset (letters, numbers and _).";
}

// ------------------------------------------------------------------------------------------------- the answer

export interface Journey { steps: string[]; sessions: number; purchases: number }
export interface ExitPage { path: string; sessions: number; hadBag: number; purchases?: number }
export interface JourneyAnswer {
  connected: boolean; code?: string; error?: string; serviceAccount?: string; dataset?: string; enableApiUrl?: string;
  /** op "status": what the last 7 days would read (a dry run costs nothing). */
  bytesEstimate?: number;
  range?: { startDate: string; endDate: string };
  journeys?: Journey[]; exits?: ExitPage[];
  /** All visits in the window, visits that saw one page only, visits with a purchase. */
  totals?: { sessions: number; onePage: number; purchases: number };
  bytesProcessed?: number; cacheHit?: boolean;
}

/** Requests through the shop's admin call (lazy, so this module stays free of Firebase for tests). */
// Both journey widgets ask for the same window at once: share one request (each BigQuery query is billed), and keep
// answers for a few minutes so switching ranges back and forth doesn't run the query again.
const answers = new Map<string, { at: number; promise: Promise<JourneyAnswer> }>();
const KEEP_MS = 5 * 60_000;

export function fetchJourneys(window: { startDate: string; endDate: string }): Promise<JourneyAnswer> {
  const key = `${window.startDate}|${window.endDate}`;
  const held = answers.get(key);
  if (held && Date.now() - held.at < KEEP_MS) return held.promise;
  const promise = import("./googleAnalytics").then(({ googleAnalyticsApi }) => googleAnalyticsApi.bigQueryJourneys(window.startDate, window.endDate));
  answers.set(key, { at: Date.now(), promise });
  // Only an answer with data is kept: after a setup step (linking the export, a role) the next look asks again.
  promise.then(a => { if (!a.connected) answers.delete(key); }, () => answers.delete(key));
  return promise;
}

/** Test hook. */
export function __forgetJourneys() { answers.clear(); }

// ------------------------------------------------------------------------------------------------- the window

export interface JourneyWindow { startDate: string; endDate: string; clamped: boolean; days: number; words: string }

/** The Overview's range, cut to its last 31 days (the server's limit). `clamped` says the start moved. */
export function journeyWindow(range: { startKey: string; endKey: string }): JourneyWindow {
  const earliest = addDays(range.endKey, -(JOURNEY_MAX_DAYS - 1));
  const startDate = range.startKey < earliest ? earliest : range.startKey;
  const days = Math.round((Date.parse(`${range.endKey}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  return { startDate, endDate: range.endKey, clamped: startDate !== range.startKey, days, words: rangeWords(startDate, range.endKey) };
}

// ------------------------------------------------------------------------------------------------- rows to draw

export interface JourneyRow { key: string; labels: string[]; paths: string[]; sessions: number; purchases: number; buyShare: number }
export interface ExitRow { key: string; path: string; label: string; sessions: number; share: number; hadBag: number; bagShare: number; purchases: number }

/** Journeys with readable page names ("/books/salt" → the book's title), most visits first. Null when none. */
export function journeyRows(answer: JourneyAnswer | null | undefined, books: Book[] | null | undefined): JourneyRow[] | null {
  const list = Array.isArray(answer?.journeys) ? answer!.journeys! : [];
  const rows = list
    .filter(j => Array.isArray(j.steps) && j.steps.length >= 2 && j.sessions > 0)
    .map(j => ({
      key: j.steps.join("\n"), paths: j.steps.slice(), labels: j.steps.map(p => pageLabel(p, books)),
      sessions: j.sessions, purchases: Math.min(j.purchases || 0, j.sessions), buyShare: j.sessions ? Math.min(j.purchases || 0, j.sessions) / j.sessions : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.purchases - a.purchases);
  return rows.length ? rows : null;
}

/** Last pages before leaving, most exits first, with the share of those visits that had something in the bag. */
export function exitRows(answer: JourneyAnswer | null | undefined, books: Book[] | null | undefined): ExitRow[] | null {
  const list = Array.isArray(answer?.exits) ? answer!.exits! : [];
  const all = answer?.totals?.sessions || list.reduce((s, e) => s + (e.sessions || 0), 0);
  const rows = list
    .filter(e => e && e.path && e.sessions > 0)
    .map(e => {
      const hadBag = Math.min(e.hadBag || 0, e.sessions);
      return {
        key: e.path, path: e.path, label: pageLabel(e.path, books), sessions: e.sessions, share: all ? e.sessions / all : 0,
        hadBag, bagShare: hadBag / e.sessions, purchases: Math.min(e.purchases || 0, e.sessions),
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
  return rows.length ? rows : null;
}

// ------------------------------------------------------------------------------------------------- words

const pct = (x: number) => `${Math.round(x * 100)}%`;
const visits = (n: number) => `${n.toLocaleString()} ${n === 1 ? "visit" : "visits"}`;
export const pathWords = (labels: string[]) => labels.join(" → ");

export function journeysHeadline(rows: JourneyRow[], totals?: JourneyAnswer["totals"]): string {
  const top = rows[0];
  const lead = `The most common path is ${pathWords(top.labels)} (${visits(top.sessions)}).`;
  if (totals && totals.sessions > 0 && totals.onePage > 0) return `${lead} ${pct(totals.onePage / totals.sessions)} of visits saw only one page.`;
  return lead;
}

export function exitsHeadline(rows: ExitRow[]): string {
  const top = rows[0];
  const bag = top.hadBag > 0 ? `, ${pct(top.bagShare)} of them with something in the bag` : "";
  return `Most visits end on ${top.label}: ${visits(top.sessions)}${top.share ? ` (${pct(top.share)} of all)` : ""}${bag}.`;
}

/** The source line: export, window, and a note when the Overview's range was cut to 31 days. */
export function journeyFoot(w: JourneyWindow, phrase: string): string {
  const cut = w.clamped ? ` · the last ${JOURNEY_MAX_DAYS} days of ${phrase} (BigQuery reads at most ${JOURNEY_MAX_DAYS} days at a time)` : "";
  return `Google Analytics BigQuery export · ${w.words}${cut} · the export runs about a day behind`;
}
