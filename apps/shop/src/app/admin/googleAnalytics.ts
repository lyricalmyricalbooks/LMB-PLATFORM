import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { cleanMeasurementId } from "../lib/ga4";
import { forgetDailyTraffic } from "./dailyTrafficCache";
import { clearShared } from "./overview/overviewShared";
import { cleanBigQueryDataset, type JourneyAnswer } from "./bigQueryJourneys";

// Google Analytics 4 for the admin. The measurement ID ("G-…") is public (shoppers' browsers load it from
// settings/website.analytics); the property ID lives in admin-only adminSecrets/googleAnalytics. Reports are read by
// the createStripeCheckoutSession `ga4Report` action with the Functions' own service account (functions/googleAnalytics.js).

export { cleanMeasurementId };

/** Mirrors functions/googleAnalytics.js cleanPropertyId: the number, "properties/123…" or a pasted Analytics URL. */
export function cleanPropertyId(value: unknown): string {
  const m = String(value ?? "").trim().match(/(?:^|properties\/|\bp)(\d{6,15})(?:\/|$|\b)/);
  return m ? m[1] : "";
}

export interface Ga4Range { startDate: string; endDate: string; prevStartDate: string; prevEndDate: string }
type Row = Record<string, any>;
export interface Ga4Report {
  totals: { current: Row; previous: Row };
  byDate: { current: Row[]; previous: Row[] };
  channels: Row[]; sources: Row[]; landing: Row[]; countries: Row[]; devices: Row[]; pages: Row[]; visitorType: Row[];
  /** Sessions per tagged campaign (utm_campaign); missing on reports from before 18 October 2026. */
  campaigns?: Row[];
  events: { current: Record<string, number>; previous: Record<string, number> };
  activeNow: number | null;
  // Batches 4–7 below (optional): a key is missing (undefined) on a report from an older server, and null when Google
  // refused or didn't answer that report this time (the rest of the Overview still loads; Refresh asks again).
  // Visitor widgets (19 October 2026, 4th batch + realtime).
  /** Per page: views, people and summed engagement seconds (÷ views = time per view). */
  pageTime?: Array<{ pagePath: string; screenPageViews: number; activeUsers: number; userEngagementDuration: number }> | null;
  /** Visitors by weekday ("0" = Sunday … "6") × hour ("00"…"23"), in the GA property's time zone. */
  when?: Array<{ dayOfWeek: string; hour: string; activeUsers: number; sessions: number }> | null;
  /** What visitors do (scroll, click, search…), both windows. */
  actions?: { current: Record<string, { eventCount: number; activeUsers: number }>; previous: Record<string, { eventCount: number; activeUsers: number }> } | null;
  /** scroll / add_to_cart / view_item counts per page. */
  pageActions?: Array<{ pagePath: string; eventName: string; eventCount: number }> | null;
  /** Outbound link clicks per domain. */
  outbound?: Array<{ linkDomain: string; eventCount: number; activeUsers: number }> | null;
  /** Realtime (last 30 minutes): pages open, by page title; null when that call failed. */
  realtimePages?: Array<{ unifiedScreenName: string; activeUsers: number; screenPageViews: number }> | null;
  /** Realtime: people per minute, minutesAgo 0..29 ascending, missing minutes = 0; null when that call failed. */
  realtimeMinutes?: Array<{ minutesAgo: number; activeUsers: number }> | null;
  // How visitors move (20 October 2026, 5th batch).
  /** Page views by the page they came from (full referrer URL, "" for none) and the page shown. */
  moves?: Array<{ pageReferrer: string; pagePath: string; screenPageViews: number }> | null;
  /** Visits per first page and channel: how far they went and whether they bought. */
  landingPaths?: Array<{ landingPage: string; sessionDefaultChannelGroup: string; sessions: number; engagedSessions: number; screenPageViews: number; ecommercePurchases: number }> | null;
  /** Book-card lists (Studio sections): cards seen and opened. */
  lists?: Array<{ itemListName: string; itemsViewedInList: number; itemsClickedInList: number }> | null;
  /** People per device who reached each step (session_start, view_item, add_to_cart, begin_checkout, purchase). */
  deviceSteps?: Array<{ deviceCategory: string; eventName: string; activeUsers: number }> | null;
  // The shop's own events (20 October 2026). 6th batch, standard dimensions only.
  /** How often each shop event fired (nav_click, pdp_interact, page_not_found, filter_use, view_cart, scroll_depth…). */
  newEvents?: Array<{ eventName: string; eventCount: number }> | null;
  /** page_not_found per address, with the page (full URL, "" for none) that sent people there. */
  notFound?: Array<{ pagePath: string; pageReferrer: string; eventCount: number }> | null;
  /** view_cart and begin_checkout per page. */
  bagPeeks?: Array<{ pagePath: string; eventName: string; eventCount: number }> | null;
  // 7th batch, the events' own parameters (custom dimensions). Google refuses a report (400) until its parameters are
  // registered in Admin › Custom definitions: that key is null and named in `refusedReports`.
  navClicks?: Array<{ "customEvent:menu": string; "customEvent:link_text": string; eventCount: number }> | null;
  pdpActions?: Array<{ "customEvent:action": string; pagePath: string; eventCount: number }> | null;
  pdpTabs?: Array<{ "customEvent:tab": string; eventCount: number }> | null;
  filters?: Array<{ "customEvent:filter": string; "customEvent:value": string; eventCount: number }> | null;
  scrollDepth?: Array<{ "customEvent:percent": string; pagePath: string; eventCount: number }> | null;
  /** Report keys of batches 4–7 Google refused with a request error (400) when asked one by one. */
  refusedReports?: string[];
}
export interface Ga4Answer {
  connected: boolean; code?: string; error?: string; serviceAccount?: string; propertyId?: string; enableApiUrl?: string;
  activeNow?: number; report?: Ga4Report;
  /** The property's web tags ("G-…"), from the Analytics Admin API; null when Google didn't say, missing on older servers. */
  streamIds?: string[] | null;
}

/** Google Search Console (functions/searchConsole.js): searches and pages that showed the shop on Google. */
export interface SearchRow { key: string; clicks: number; impressions: number; ctr: number; position: number }
export interface SearchTotals { clicks: number; impressions: number; ctr: number; position: number }
export interface SearchConsoleAnswer {
  connected: boolean; code?: string; error?: string; serviceAccount?: string; enableApiUrl?: string;
  sites?: Array<{ siteUrl: string; permissionLevel: string }>; site?: string;
  report?: { totals: { current: SearchTotals; previous: SearchTotals }; queries: SearchRow[]; pages: SearchRow[] };
  /** op "inspect": one answer per page asked about (Books › Google indexing). */
  results?: import("./googleIndex").Inspection[]; sitemapsUrl?: string;
}

async function call(payload: Record<string, unknown>): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `The shop's server answered ${res.status}. Check that Cloud Functions are deployed.`);
  return data;
}

// The GA4 report for one range, kept for REPORT_MAX_AGE_MS: leaving the Overview and coming back, or switching
// between two ranges, asks Google (through a Cloud Function call) only once. Overview › Refresh forgets them.
export const REPORT_MAX_AGE_MS = 5 * 60_000;
const reports = new Map<string, { p: Promise<Ga4Answer>; at: number }>();
export const forgetReports = () => reports.clear();
function cachedReport(range: Ga4Range, now = Date.now()): Promise<Ga4Answer> {
  const key = [range.startDate, range.endDate, range.prevStartDate, range.prevEndDate].join("|");
  const hit = reports.get(key);
  if (hit && now - hit.at < REPORT_MAX_AGE_MS) return hit.p;
  const entry = { p: call({ action: "ga4Report", op: "report", range }) as Promise<Ga4Answer>, at: now };
  reports.set(key, entry);
  // Only a connected answer is kept; "no property set", an error answer or a failure asks again next time.
  entry.p.then(
    (answer) => { if (!answer?.connected && reports.get(key) === entry) reports.delete(key); },
    () => { if (reports.get(key) === entry) reports.delete(key); },
  );
  return entry.p;
}

export const googleAnalyticsApi = {
  /** What is saved: the public measurement ID and the private property ID. */
  load: async (): Promise<{ measurementId: string; propertyId: string; bigQueryDataset: string }> => {
    const [pub, priv] = await Promise.all([getDoc(doc(db, "settings", "website")), getDoc(doc(db, "adminSecrets", "googleAnalytics"))]);
    return {
      measurementId: String((pub.exists() && pub.data()?.analytics?.ga4MeasurementId) || ""),
      propertyId: String((priv.exists() && priv.data()?.propertyId) || ""),
      bigQueryDataset: String((priv.exists() && priv.data()?.bigQueryDataset) || ""),
    };
  },
  /** Saves both IDs (an empty value switches that part off). Only `analytics.ga4MeasurementId` is touched in public settings. */
  save: async (measurementId: string, propertyId: string) => {
    await setDoc(doc(db, "settings", "website"), { analytics: { ga4MeasurementId: cleanMeasurementId(measurementId) } }, { mergeFields: ["analytics.ga4MeasurementId"] });
    await setDoc(doc(db, "adminSecrets", "googleAnalytics"), { propertyId: cleanPropertyId(propertyId), updatedAt: serverTimestamp() }, { merge: true });
    // The Overview asks Google again for the newly saved property.
    forgetReports(); clearShared();
  },
  status: (): Promise<Ga4Answer> => call({ action: "ga4Report", op: "status" }),
  report: (range: Ga4Range, now?: number): Promise<Ga4Answer> => cachedReport(range, now),
  searchConsoleStatus: (): Promise<SearchConsoleAnswer> => call({ action: "searchConsole", op: "status" }),
  searchConsoleReport: (range: Ga4Range): Promise<SearchConsoleAnswer> => call({ action: "searchConsole", op: "report", range }),
  /** Books › Google indexing: is each page in Google's index? (up to 30 addresses on the shop's own domain) */
  searchConsoleInspect: (urls: string[]): Promise<SearchConsoleAnswer> => call({ action: "searchConsole", op: "inspect", urls }),
  /** The Search Console property to read ("sc-domain:…" or "https://…/"), in admin-only adminSecrets/googleAnalytics. */
  saveSearchConsoleSite: async (site: string) => {
    await setDoc(doc(db, "adminSecrets", "googleAnalytics"), { searchConsoleSite: String(site || "").trim(), updatedAt: serverTimestamp() }, { merge: true });
    // The Overview's Search Console widgets read the newly chosen property.
    clearShared();
  },
  /** The GA4 BigQuery export dataset ("project.dataset" or "dataset"; "" = automatic analytics_<property id>), admin-only. */
  saveBigQueryDataset: (dataset: string) =>
    setDoc(doc(db, "adminSecrets", "googleAnalytics"), { bigQueryDataset: cleanBigQueryDataset(dataset), updatedAt: serverTimestamp() }, { merge: true }),
  /** Dry-runs the journeys query over the last 7 days (reads nothing, costs nothing): is the export linked and readable? */
  bigQueryStatus: (): Promise<JourneyAnswer> => call({ action: "bigQueryJourneys", op: "status" }),
  /** Overview › Visitor journeys / Last page before leaving: at most 31 days (YYYY-MM-DD, inclusive). */
  bigQueryJourneys: (startDate: string, endDate: string): Promise<JourneyAnswer> => call({ action: "bigQueryJourneys", op: "report", startDate, endDate }),
  /** Overview › Start traffic counts again: deletes the shop's own daily traffic counters (never orders). */
  resetTraffic: (): Promise<{ ok: boolean; at: string; removedDays: number }> =>
    call({ action: "resetTraffic", confirm: "RESET" }).finally(forgetDailyTraffic),
  /** When the shop's own counters were last reset (admin-read systemStatus/trafficReset), or null. */
  lastReset: async (): Promise<{ at: string; removedDays: number } | null> => {
    const snap = await getDoc(doc(db, "systemStatus", "trafficReset"));
    return snap.exists() ? (snap.data() as any) : null;
  },
};

/** Where the setup lives, for messages that point at it. */
export const GA_SETTINGS_PATH = "Settings › General › Google Analytics";
