import { openFirstActionQueue, openOrdersQueue } from "../Orders";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { adminApi } from "../api";
import { inventoryApi } from "../inventoryApi";
import { getOrdersCached, peekOrders } from "../ordersCache";
import { salesReportCsv } from "./salesReport";
import { launchReadiness } from "../launchReadiness";
import toast from "react-hot-toast";
import {
  EmptyState, ErrorState, LoadingState, SecondaryButton, SectionCard,
} from "../riso/components";
import {
  bestSellers, customerMix, dormantStock, newestSales, newsletterSummary, orderTodos, reprintWatch, reviewSummary,
  splitRange, stockValue, titleStock, toFulfil, totals, REORDER_COVER_DAYS,
} from "./overviewInsights";
import { recordedSince, sumMap } from "./overviewTraffic";
import { PRESETS, resolveRange, trafficShift, trafficWindow, type CompareMode, type Preset } from "./overviewRange";
import { monthPace } from "./overviewSeries";
import { mergeNewestPage } from "../ordersDesk";
import { pickTraffic, shopRowsIn, shopTraffic } from "./overviewSources";
import { whatChanged } from "./overviewChanges";
import { profitSummary, titlePerformance } from "./overviewProfit";
import { forgetReports, googleAnalyticsApi } from "../googleAnalytics";
import { shopDayKey } from "../../lib/shopDay";
import { isOwnOrder } from "../../lib/ownerDevice";
import { ChangeList, Figure, ReadinessStrip, RunList, RunRow, Trend, money, moneyFigure, percent } from "./OverviewParts";
import { readinessSummary } from "../launchReadiness";
import { leadStory } from "./overviewStory";
import { OverviewSales } from "./OverviewSales";
import { GOOGLE_PARTS, OverviewMarketing, type GaState } from "./OverviewMarketing";
import { FoundOnGoogleCard } from "./OverviewMarketingExtras";
import { OverviewCustomers } from "./OverviewCustomers";
import { OverviewStock } from "./OverviewStock";
import { OverviewTitles } from "./OverviewTitles";
import { OverviewChart } from "./OverviewChart";
import { OverviewNewSales, type NewSalesWidget } from "./OverviewNewSales";
import { figureSeries, figureSpark, NewestOrdersList } from "./OverviewFiguresViz";
import { OverviewNewLive, type NewLiveWidget } from "./OverviewNewLive";
import { OverviewBoard, useBoardStore, type BoardHeader, type RenderWidget } from "./OverviewBoard";
import { DEFAULT_FIGURES, FIGURES, widgetMeta, type BoardView, type FigureId } from "./overviewBoard";
import { clearShared } from "./overviewShared";
import { OverviewVisitors, type VisitorWidget } from "./OverviewVisitors";
import { OverviewVisitorPath, type PathWidget } from "./OverviewVisitorPath";
import { OverviewNavigation, type NavigationWidget } from "./OverviewNavigation";
import { OverviewVisitorEvents, type VisitorEventWidget } from "./OverviewVisitorEvents";
import { OverviewJourneys, type JourneyWidget } from "./OverviewJourneys";
import { OverviewClarity } from "./OverviewClarity";

const PREFS_KEY = "lm:overview-view";
type Prefs = { preset?: Preset; compare?: CompareMode; from?: string; to?: string };
const readPrefs = (): Prefs => { try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { return {}; } };
const writePrefs = (p: Prefs) => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* per-browser convenience only */ } };
/** How often the board quietly re-reads the newest orders, the to-do counts and today's visits while it is on screen. */
export const AUTO_REFRESH_MS = 5 * 60_000;
/** The period buttons, in the B4 board's short words; `title` says each in full. `phone` = the word on the four
 *  buttons a phone shows (Pocket Pressroom); the others sit in its "More" list. */
const PERIOD_BUTTONS: Array<{ id: Preset; label: string; title: string; phone?: string }> = [
  { id: "today", label: "Today", title: "Today", phone: "Today" }, { id: "7d", label: "7d", title: "The last 7 days", phone: "7 days" }, { id: "30d", label: "30d", title: "The last 30 days", phone: "30 days" },
  { id: "90d", label: "90d", title: "The last 90 days" }, { id: "mtd", label: "MTD", title: "This month so far" }, { id: "lastMonth", label: "Last month", title: "Last calendar month" },
  { id: "ytd", label: "YTD", title: "This year so far", phone: "Year" }, { id: "365d", label: "12m", title: "The last 12 months" }, { id: "custom", label: "Custom", title: "Pick your own dates" },
];
export function AnalyticsDashboard({ setActiveTab, onEditBook }: { setActiveTab?: (tab: string) => void; onEditBook?: (book: any) => void }) {
  const saved = useMemo(readPrefs, []);
  const [preset, setPreset] = useState<Preset>(saved.preset && PRESETS.some(p => p.id === saved.preset) ? saved.preset : "30d");
  const [compareMode, setCompareMode] = useState<CompareMode>(saved.compare === "lastYear" ? "lastYear" : "previous");
  const [custom, setCustom] = useState({ from: saved.from || "", to: saved.to || "" });
  const boards = useBoardStore();
  const [fetchingBookId, setFetchingBookId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Every source loads on its own so one failure never blanks the page.
  const [daily, setDaily] = useState<{ rows: any[] | null; error: boolean }>({ rows: null, error: false });
  const [allOrders, setAllOrders] = useState<{ orders: any[] | null; error: boolean }>({ orders: null, error: false });
  const [stock, setStock] = useState<{ books: any[] | null; error: boolean }>({ books: null, error: false });
  const [audience, setAudience] = useState<{ data: { reviews: any[]; subscribers: any[]; pendingSubscribers?: any[]; pendingReviews?: number | null; approvedReviews?: { count: number; average: number | null } | null } | null; error: boolean }>({ data: null, error: false });
  const [counts, setCounts] = useState<{ pendingReviews?: number | null; unreadMessages: number | null; openPrivacyRequests: number | null } | null>(null);
  const [launch, setLaunch] = useState<{ parts: any | null; error: boolean }>({ parts: null, error: false });
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [ga, setGa] = useState<GaState>({ status: "loading" });
  const [lastReset, setLastReset] = useState<{ at: string; removedDays: number } | null>(null);
  const [firstTrafficDay, setFirstTrafficDay] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const range = useMemo(() => resolveRange(preset, { custom, compare: compareMode }), [preset, custom, compareMode, reloadKey, tick]);
  useEffect(() => { writePrefs({ preset, compare: compareMode, from: custom.from, to: custom.to }); }, [preset, compareMode, custom]);

  // Every daily traffic doc of the range AND its comparison window, however long ago (a year-on-year view needs ~2 years).
  const { fromKey: trafficFrom, toKey: trafficTo } = trafficWindow(range);
  const loadDaily = useCallback(() => {
    setDaily(d => ({ rows: d.rows, error: false }));
    adminApi.getDailyAnalyticsBetween(trafficFrom, trafficTo).then((rows: any[]) => setDaily({ rows, error: false }))
      .catch((err: unknown) => { console.error(err); setDaily({ rows: null, error: true }); toast.error("Traffic figures could not be loaded"); });
  }, [trafficFrom, trafficTo]);
  useEffect(() => { loadDaily(); }, [reloadKey, loadDaily]);

  // Google Analytics for exactly this range (and its comparison window), read by the shop's server.
  useEffect(() => {
    let live = true;
    setGa(g => ({ status: "loading", answer: g.answer }));
    googleAnalyticsApi.report({ startDate: range.startKey, endDate: range.endKey, prevStartDate: range.prevStartKey, prevEndDate: range.prevEndKey })
      .then(answer => { if (live) setGa(answer.connected ? { status: "connected", answer } : answer.code === "no_property" ? { status: "off", answer } : { status: "error", answer, message: answer.error }); })
      .catch((err: any) => { if (live) setGa({ status: "error", message: err?.message || "Google Analytics couldn't be read." }); });
    return () => { live = false; };
  }, [range.startKey, range.endKey, range.prevStartKey, range.prevEndKey, reloadKey]);

  useEffect(() => {
    Promise.all([
      adminApi.getSettings(),
      adminApi.getShippingProfiles(),
      adminApi.getRecentEmailLog(5),
    ]).then(([settings, shippingProfiles, emailLog]) => setLaunch({ parts: { settings, shippingProfiles, emailLog }, error: false }))
      .catch(() => setLaunch({ parts: null, error: true }));
    // The whole catalogue and every order, so 1-year and year-on-year figures are never cut off.
    getOrdersCached({ force: reloadKey > 0 }).then((o: any[]) => { seenShared.current = o; setAllOrders({ orders: o, error: false }); setLoadedAt(new Date()); })
      .catch(() => setAllOrders({ orders: null, error: true }));
    adminApi.getAllBooks().then((b: any[]) => setStock({ books: b, error: false }))
      .catch(() => setStock({ books: null, error: true }));
    adminApi.getAudienceSnapshot().then((d: any) => setAudience({ data: d, error: false }))
      .catch(() => setAudience({ data: null, error: true }));
    adminApi.getAdminBadgeCounts().then(setCounts).catch(() => setCounts({ unreadMessages: null, openPrivacyRequests: null }));
    // Cost prices are admin-only (Inventory); without them profit says "add cost prices", never a guess.
    inventoryApi.costs().then(setCosts).catch(() => setCosts({}));
    googleAnalyticsApi.lastReset().then(setLastReset).catch(() => setLastReset(null));
    adminApi.getFirstAnalyticsDay().then(setFirstTrafficDay).catch(() => setFirstTrafficDay(null));
  }, [reloadKey]);

  // Every 5 minutes while the Overview is on screen (and on coming back to the tab after that long): the newest
  // 50 orders, the to-do counts and the last two days of visits. Cheap reads only; Refresh reads everything again.
  // The admin shell's own 5-minute check (and the Orders desk) refresh the shared orders copy: when it is newer than
  // the one this board last took, the board takes it and reads no orders itself.
  const quiet = useRef({ busy: false, at: Date.now() });
  const seenShared = useRef<any[] | null>(null);
  const quietRefresh = useCallback(() => {
    if (quiet.current.busy) return;
    quiet.current = { busy: true, at: Date.now() };
    const utcToday = new Date().toISOString().slice(0, 10);
    const utcYesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    Promise.allSettled([
      (() => {
        const shared = peekOrders();
        if (!shared || shared === seenShared.current) return null;
        seenShared.current = shared;
        setAllOrders(a => (a.orders ? { orders: mergeNewestPage(a.orders, shared), error: false } : a));
        setLoadedAt(new Date());
        return Promise.resolve();
      })() ?? adminApi.getOrders(50).then((page: any[]) => {
        const clean = page.map(({ _lastDoc, ...o }: any) => o);
        setAllOrders(a => (a.orders ? { orders: mergeNewestPage(a.orders, clean), error: false } : a));
        setLoadedAt(new Date());
      }),
      adminApi.getAdminBadgeCounts().then(setCounts),
      adminApi.getDailyAnalyticsBetween(utcYesterday, utcToday).then((fresh: any[]) => setDaily(d => {
        if (!d.rows) return d;
        const ids = new Set(fresh.map(r => r.id));
        return { rows: [...d.rows.filter(r => !ids.has(r.id)), ...fresh].sort((a, b) => String(a.date).localeCompare(String(b.date))), error: false };
      })),
    ]).finally(() => { quiet.current.busy = false; setTick(t => t + 1); });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") quietRefresh(); }, AUTO_REFRESH_MS);
    const back = () => { if (document.visibilityState === "visible" && Date.now() - quiet.current.at >= AUTO_REFRESH_MS) quietRefresh(); };
    document.addEventListener("visibilitychange", back);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [quietRefresh]);

  const refresh = () => {
    setAllOrders({ orders: null, error: false }); setStock({ books: null, error: false });
    setAudience({ data: null, error: false }); setLaunch({ parts: null, error: false }); setDaily({ rows: null, error: false });
    // Panels that load their own extra data (carts, stock sign-ups, Search Console) remount via their key and read again.
    clearShared(); forgetReports();
    setReloadKey(k => k + 1);
  };

  // Only the latest Edit click may open the editor: a slower earlier read is ignored.
  const editRequest = useRef(0);
  const handleEditClick = async (id: string) => {
    if (!onEditBook) return;
    const request = ++editRequest.current;
    setFetchingBookId(id);
    try {
      const book = await adminApi.getBook(id);
      if (request !== editRequest.current) return;
      if (book) onEditBook(book); else toast.error("Could not find book records");
    } catch {
      if (request === editRequest.current) toast.error("Failed to load book records");
    } finally {
      if (request === editRequest.current) setFetchingBookId(null);
    }
  };

  const books = stock.books || [];

  // Everything sales-related comes from paid, real orders — one source of truth for revenue, orders and conversion.
  // Orders the owner placed themselves (with the shop's own email) stay in Orders and
  // in today's to-dos, but are left out of every figure below so they never look like customers.
  const shopOrders = useMemo(() => (allOrders.orders ? allOrders.orders.filter(o => !isOwnOrder(o)) : null), [allOrders.orders]);
  const periods = useMemo(() => (shopOrders ? splitRange(shopOrders, range) : null), [shopOrders, range]);
  const ownOrderCount = useMemo(() => splitRange((allOrders.orders || []).filter(o => isOwnOrder(o)), range).current.length, [allOrders.orders, range]);
  const insights = useMemo(() => {
    if (!periods || !allOrders.orders) return null;
    const rows = titleStock(periods.paid, books);
    return {
      top: bestSellers(periods.current, 1)[0] ?? null,
      cur: totals(periods.current), prev: totals(periods.previous),
      mix: customerMix(periods.paid, periods.current, periods.start),
      shelf: stockValue(books), stockRows: rows, reprint: reprintWatch(rows), dormant: dormantStock(rows).slice(0, 5),
      fulfil: toFulfil(allOrders.orders),
      profit: profitSummary(periods.current, books, costs),
      pace: monthPace(periods.paid, shopDayKey(Date.now())),
    };
  }, [periods, allOrders.orders, books, costs]);

  const readiness = useMemo(() => {
    if (!launch.parts || !allOrders.orders || !stock.books) return null;
    return launchReadiness({ ...launch.parts, books: stock.books, orders: allOrders.orders });
  }, [launch.parts, allOrders.orders, stock.books]);

  // Traffic: Google Analytics when connected, else the shop's own counters (UTC-keyed, shifted onto shop days).
  const shift = trafficShift(range);
  const gaReport = ga.status === "connected" ? ga.answer?.report : undefined;
  const shopTag = launch.parts?.settings?.analytics?.ga4MeasurementId;
  // Google's figures, unless Google recorded nobody for these days while the shop's own counter did (then the counter,
  // with a note); a property that doesn't hold the storefront's tag is flagged either way.
  const { traffic, gap: trafficGap } = useMemo(
    () => pickTraffic(gaReport, daily.rows ? shopTraffic(daily.rows, range, shift) : null, { streamIds: ga.answer?.streamIds, shopTag }),
    [gaReport, daily.rows, range, shift, ga.answer?.streamIds, shopTag]);
  // Google's answer waits for the shop's counter too, so a silent Google can fall back to it.
  const trafficReady = ga.status !== "loading" && traffic !== null && !(gaReport && !daily.rows && !daily.error);
  const trafficFailed = !gaReport && daily.error;
  const dailyCurrent = useMemo(() => shopRowsIn(daily.rows || [], range.startKey, range.endKey, shift), [daily.rows, range, shift]);
  const dailyPrevious = useMemo(() => shopRowsIn(daily.rows || [], range.prevStartKey, range.prevEndKey, shift), [daily.rows, range, shift]);
  const visits = traffic ? traffic.visitors : { cur: 0, prev: 0 };
  const lines = useMemo(() => (periods ? figureSeries(periods.paid, range, traffic?.visitsOn) : null), [periods, range, traffic]);
  const conv = insights && trafficReady ? { cur: visits.cur > 0 ? (insights.cur.orders / visits.cur) * 100 : 0, prev: visits.prev > 0 ? (insights.prev.orders / visits.prev) * 100 : 0 } : null;
  const funnel = traffic?.funnel;
  const sourceName = traffic?.source === "google" ? "Google Analytics" : "shop counter";

  const reviews = useMemo(() => {
    if (!audience.data) return null;
    const s = reviewSummary(audience.data.reviews);
    // The to-do counts are re-read every 5 minutes, so their pending-review count is the freshest.
    const pending = typeof counts?.pendingReviews === "number" ? counts.pendingReviews : audience.data.pendingReviews;
    const server = {
      ...(typeof pending === "number" ? { pending } : {}),
      ...(audience.data.approvedReviews ? { approved: audience.data.approvedReviews.count, average: audience.data.approvedReviews.average } : {}),
    };
    return { ...s, ...server };
  }, [audience.data, counts?.pendingReviews]);
  const todos = useMemo(() => (allOrders.orders ? orderTodos(allOrders.orders) : null), [allOrders.orders]);
  const subs = audience.data && periods ? newsletterSummary(audience.data.subscribers, periods.start) : null;

  const changes = useMemo(() => (insights && periods ? whatChanged({
    cur: insights.cur, prev: insights.prev, current: periods.current, previous: periods.previous,
    visits: trafficReady ? visits : null, before: range.before, money,
  }) : null), [insights, periods, trafficReady, visits.cur, visits.prev, range.before]);

  const titleRows = useMemo(() => (periods ? titlePerformance({
    current: periods.current, previous: periods.previous, books, costs,
    viewsById: recordedSince(daily.rows || [], "bookViews") ? sumMap(dailyCurrent, "bookViews") : null,
    addsById: recordedSince(daily.rows || [], "bookAdds") ? sumMap(dailyCurrent, "bookAdds") : null,
    stock: insights?.stockRows || [],
  }) : []), [periods, books, costs, daily.rows, dailyCurrent, insights]);

  // Real sales only: abandoned/unpaid card attempts and test orders are not orders to look at here.
  const recentOrders = useMemo(() => newestSales(allOrders.orders || []), [allOrders.orders]);

  const downloadReport = () => {
    if (!periods) return;
    const csv = salesReportCsv(periods.current, periods.startKey, periods.endKey);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `sales-report-${periods.startKey}-to-${periods.endKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const resetTraffic = async () => {
    const result = await googleAnalyticsApi.resetTraffic();
    setLastReset({ at: result.at, removedDays: result.removedDays });
    setFirstTrafficDay(null);
    toast.success(`Traffic counts reset — ${result.removedDays} day${result.removedDays === 1 ? "" : "s"} cleared. Counting starts now.`);
    loadDaily();
  };

  const ordersLoading = !insights && !allOrders.error;
  const stockLoading = stock.books === null && !stock.error;
  const KPI_WAIT = "Loading…";
  const trafficFooter = (text: string) => (trafficFailed ? "Traffic unavailable" : !trafficReady ? KPI_WAIT : text);
  const refreshLabel = loadedAt ? `Updated ${loadedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · auto every 5 min` : "Loading…";

  const story = insights ? leadStory({ cur: insights.cur, prev: insights.prev, top: insights.top, days: range.preset === "today" ? 1 : Math.max(2, range.days), phrase: range.phrase, money, before: range.before }) : null;
  const openTodos = insights && reviews && todos ? insights.fulfil.length + reviews.pending + insights.reprint.length + insights.shelf.soldOut
    + todos.requests.length + todos.giftCardsMissing.length + todos.awaitingRelease.length
    + (counts?.unreadMessages || 0) + (counts?.openPrivacyRequests || 0) : null;
  const cartStep = funnel && funnel.add_to_cart > 0 ? (funnel.checkout_start / funnel.add_to_cart) * 100 : null;
  const profit = insights?.profit;

  const viewsRecorded = !!recordedSince(daily.rows || [], "bookViews");
  const addsRecorded = !!recordedSince(daily.rows || [], "bookAdds");
  const discountRate = insights && insights.cur.subtotal > 0 ? (insights.cur.discounts / insights.cur.subtotal) * 100 : 0;
  const prevDiscountRate = insights && insights.prev.subtotal > 0 ? (insights.prev.discounts / insights.prev.subtotal) * 100 : 0;

  // Every number a "Key figures" widget can show, worked out once for all of them.
  const figure = (id: FigureId) => {
    const wait = { value: "…", foot: KPI_WAIT };
    switch (id) {
      case "revenue": return insights ? { spark: figureSpark(lines?.revenue, insights.cur.net, insights.prev.net), value: moneyFigure(insights.cur.net), foot: <><Trend now={insights.cur.net} before={insights.prev.net} /> after refunds</> } : wait;
      case "orders": return insights ? { spark: figureSpark(lines?.orders, insights.cur.orders, insights.prev.orders), value: insights.cur.orders.toLocaleString(), foot: <><Trend now={insights.cur.orders} before={insights.prev.orders} /> paid orders</> } : wait;
      case "units": return insights ? { spark: figureSpark(lines?.units, insights.cur.units, insights.prev.units), value: insights.cur.units.toLocaleString(), foot: <><Trend now={insights.cur.units} before={insights.prev.units} /> copies</> } : wait;
      case "aov": return insights ? { spark: figureSpark(lines?.aov, insights.cur.aov, insights.prev.aov), value: moneyFigure(insights.cur.aov), foot: <><Trend now={insights.cur.aov} before={insights.prev.aov} /> per paid order</> } : wait;
      case "visitors": return trafficReady ? { spark: figureSpark(lines?.visitors, visits.cur, visits.prev), value: visits.cur.toLocaleString(), foot: <><Trend now={visits.cur} before={visits.prev} /> {sourceName}</> } : { value: trafficFailed ? "—" : "…", foot: trafficFooter(KPI_WAIT) };
      case "conversion": return conv ? { spark: figureSpark(lines?.conversion, conv.cur, conv.prev), value: percent(conv.cur), foot: <><Trend now={conv.cur} before={conv.prev} /> paid orders ÷ visitors</> } : { value: trafficFailed ? "—" : "…", foot: trafficFooter(KPI_WAIT) };
      case "cartStep": return trafficReady
        ? { value: cartStep !== null ? percent(cartStep, 0) : "—", foot: funnel && funnel.add_to_cart > 0 ? `${funnel.checkout_start.toLocaleString()} checkouts from ${funnel.add_to_cart.toLocaleString()} bag adds` : "no bag adds recorded yet" }
        : { value: "…", foot: trafficFooter(KPI_WAIT) };
      case "profit": return profit
        ? { value: profit.costedUnits > 0 ? moneyFigure(profit.profit) : "—", foot: profit.costedUnits > 0 ? `${profit.margin === null ? "—" : percent(profit.margin, 0)} margin · cost known for ${percent(profit.coverage, 0)} of copies` : "add cost prices in Inventory to see profit" }
        : wait;
      case "returning": return insights ? { value: percent(insights.mix.returningRate, 0), foot: `${insights.mix.returning} returning · ${insights.mix.fresh} new` } : wait;
      case "refunds": return insights ? { value: moneyFigure(insights.cur.refunded + insights.cur.discounts), foot: `${money(insights.cur.refunded)} refunded · ${money(insights.cur.discounts)} in codes`, tone: insights.cur.refunded > 0 ? "warn" as const : undefined } : wait;
      case "shipping": return insights ? { value: moneyFigure(insights.cur.shipping), foot: <><Trend now={insights.cur.shipping} before={insights.prev.shipping} goodWhen="neutral" /> charged to customers</> } : wait;
      case "discounts": return insights ? { value: percent(discountRate), foot: `${percent(prevDiscountRate)} before · share of list price given in codes` } : wait;
    }
  };

  const ordersGate = (content: () => React.ReactNode) => (
    allOrders.error ? <ErrorState title="Figures unavailable" description="Orders could not be loaded, so this can't be calculated." onRetry={refresh} />
      : !insights || !periods ? <LoadingState label="Calculating…" /> : content()
  );
  const marketing = (only: string) => (only in GOOGLE_PARTS
    // Search Console needs neither orders nor the shop's traffic, so a failure there never holds these up.
    ? <FoundOnGoogleCard range={{ startDate: range.startKey, endDate: range.endKey, prevStartDate: range.prevStartKey, prevEndDate: range.prevEndKey }}
        setActiveTab={setActiveTab} part={GOOGLE_PARTS[only]} />
    : ordersGate(() => (
    trafficFailed && ga.status !== "loading" && !only.startsWith("google") ? <ErrorState title="Traffic unavailable" description="Visits, searches and sources could not be loaded." onRetry={loadDaily} />
      : !traffic ? <LoadingState label="Loading traffic…" />
      : <OverviewMarketing only={only} ga={ga} traffic={traffic} dailyCurrent={dailyCurrent} dailyAll={daily.rows || []} current={periods!.current} paidAll={periods!.paid} books={books}
          range={{ startDate: range.startKey, endDate: range.endKey, prevStartDate: range.prevStartKey, prevEndDate: range.prevEndKey }}
          lastReset={lastReset} firstDay={firstTrafficDay} onReset={resetTraffic} setActiveTab={setActiveTab} />
  )));

  const runSheet = (
    <aside className="rp-ov-run" aria-label="Needs you">
      <div className="rp-ov-eyebrow">Live — not tied to the period</div>
      <div className="rp-ov-run-total" aria-hidden="true">{openTodos === null ? "…" : openTodos}</div>
      <p className="rp-ov-run-sub">{openTodos === null ? "Counting…" : openTodos === 0 ? "Nothing needs you right now." : `${openTodos} thing${openTodos === 1 ? "" : "s"} need${openTodos === 1 ? "s" : ""} you`}</p>
      {gaReport && gaReport.activeNow !== null && (
        <p className="rp-ov-run-sub"><strong style={{ color: "var(--rp-primary-hover)" }}>{gaReport.activeNow}</strong> {gaReport.activeNow === 1 ? "person is" : "people are"} on the site now (Google Analytics)</p>
      )}
      <RunList>
        <RunRow label="paid orders waiting to ship" one="paid order waiting to ship" count={insights ? insights.fulfil.length : null} loading={ordersLoading}
          detail={insights && insights.fulfil[0] ? `Oldest has waited ${insights.fulfil[0].ageDays} day${insights.fulfil[0].ageDays === 1 ? "" : "s"}` : ""}
          onOpen={() => { openFirstActionQueue(); setActiveTab?.("orders"); }} openLabel="Ship orders" />
        <RunRow label="reviews to moderate" one="review to moderate" count={reviews ? reviews.pending : null} loading={!audience.data && !audience.error}
          detail="Readers are waiting to see these" detailOne="A reader is waiting to see it" onOpen={() => setActiveTab?.("reviews")} openLabel="Moderate" />
        <RunRow label="titles to reprint soon" one="title to reprint soon" count={insights ? insights.reprint.length : null} loading={ordersLoading || stockLoading}
          detail={`On course to sell out within ${REORDER_COVER_DAYS} days`} onOpen={() => setActiveTab?.("inventory")} openLabel="Open inventory" />
        <RunRow label="print books or editions sold out" one="print book or edition sold out" count={insights ? insights.shelf.soldOut : null} loading={ordersLoading || stockLoading}
          detail="Customers can't buy these right now" detailOne="Customers can't buy it right now" onOpen={() => setActiveTab?.("inventory")} openLabel="Open inventory" />
        <RunRow label="cancel or return requests" one="cancel or return request" count={todos ? todos.requests.length : null} loading={ordersLoading}
          detail="Customers asked from their order page" onOpen={() => { openOrdersQueue("Needs attention"); setActiveTab?.("orders"); }} openLabel="Answer requests" />
        <RunRow label="gift cards not issued" one="gift card not issued" count={todos ? todos.giftCardsMissing.length : null} loading={ordersLoading}
          detail="Paid, but the buyer has no code yet" onOpen={() => setActiveTab?.("giftCards")} openLabel="Open gift cards" />
        <RunRow label="pre-orders awaiting release" one="pre-order awaiting release" count={todos ? todos.awaitingRelease.length : null} loading={ordersLoading}
          detail="Press Ready to ship now on each order when the books arrive" onOpen={() => { openOrdersQueue("Awaiting release"); setActiveTab?.("orders"); }} openLabel="Open pre-orders" />
        <RunRow label="unread messages" one="unread message" count={counts ? counts.unreadMessages : null} loading={!counts}
          detail="From the contact form on your website" onOpen={() => setActiveTab?.("messages")} openLabel="Read messages" />
        <RunRow label="privacy requests" one="privacy request" count={counts ? counts.openPrivacyRequests : null} loading={!counts}
          detail="Customers asked for a copy or deletion of their data" onOpen={() => setActiveTab?.("general")} openLabel="Open privacy requests" />
      </RunList>
      {(allOrders.error || audience.error || stock.error) && (
        <p className="rp-ov-run-sub">
          {[allOrders.error && "orders", audience.error && "reviews", stock.error && "books"].filter(Boolean).join(", ")} could not be loaded, so some counts are missing.
        </p>
      )}
    </aside>
  );

  const renderWidget: RenderWidget = (w, { full, setConfig }) => {
    const band = widgetMeta(w.type).band;
    switch (w.type) {
      case "needs": return runSheet;
      case "readiness":
        return launch.error ? <ErrorState title="Launch checks unavailable" description="Settings, shipping or email records could not be loaded. Readiness is unknown until these checks refresh." onRetry={refresh} />
          : !readiness ? <LoadingState label="Checking…" />
          : readinessSummary(readiness) === "ok" ? <EmptyState icon="✓" title="Ready to sell" description="Every launch check passes." />
          : <ReadinessStrip items={readiness} onOpen={tab => setActiveTab?.(tab)} />;
      case "changes":
        return (
          <SectionCard flush title="What changed" description={`The biggest moves compared with ${range.before}`}>
            {allOrders.error ? <ErrorState title="Changes unavailable" description="Orders could not be loaded." onRetry={refresh} />
              : !changes ? <LoadingState label="Comparing…" />
              : changes.length === 0 ? <EmptyState icon="≈" title="Nothing moved much" description={`Sales, titles and traffic are close to ${range.before}.`} />
              : (
                <ChangeList changes={changes} />
              )}
          </SectionCard>
        );
      case "newest":
        return (
          <SectionCard flush title="Newest orders" description="The latest real sales" actions={<SecondaryButton size="sm" onClick={() => setActiveTab?.("orders")}>All orders</SecondaryButton>}>
            {allOrders.error ? <ErrorState title="Orders unavailable" description="Recent orders could not be loaded." />
              : !allOrders.orders ? <LoadingState label="Loading orders…" />
              : recentOrders.length === 0 ? <EmptyState title="No orders yet" description="New orders appear here as soon as customers check out." />
              : <NewestOrdersList orders={full ? newestSales(allOrders.orders, 25) : recentOrders} books={books} />}
          </SectionCard>
        );
      case "story":
        return (
          <article className="rp-ov-lead" aria-label="Headline">
            <div className="rp-ov-eyebrow">Lead story · {range.phrase}</div>
            <p className="rp-ov-headline" style={{ fontSize: full ? undefined : "clamp(22px, 2.4vw, 32px)" }}>
              {allOrders.error ? "Sales figures unavailable" : story ? story.headline : "Counting this period's sales…"}
            </p>
            <p className="rp-ov-dek">
              {allOrders.error ? "Orders could not be loaded, so revenue can't be calculated." : story ? story.dek : "Paid orders are loading."}
              {insights && insights.cur.refunded > 0 && ` After ${money(insights.cur.refunded)} refunded.`}
            </p>
            {insights?.pace && insights.pace.soFar > 0 && (
              <p className="rp-ov-dek">
                This month: {money(insights.pace.soFar)} in {insights.pace.daysIn} days — on pace for about <strong>{money(Math.round(insights.pace.projected))}</strong> by month end (a projection at this month's daily average).
              </p>
            )}
          </article>
        );
      case "chart":
        return (
          <OverviewChart widgetId={w.id} paid={periods ? periods.paid : null} range={range} compareMode={compareMode} traffic={traffic}
            trafficReady={trafficReady} trafficFailed={trafficFailed} ordersError={allOrders.error} sourceName={sourceName} trafficGap={trafficGap}
            onOpenTrafficSettings={setActiveTab ? () => setActiveTab("general") : undefined}
            config={w.config || {}} onConfig={setConfig} onRetry={refresh} onRetryTraffic={loadDaily} full={full} />
        );
      case "figures": {
        if (allOrders.error) return <ErrorState title="Figures unavailable" description="Orders could not be loaded." onRetry={refresh} />;
        const ids = (w.config?.figures?.length ? w.config.figures : DEFAULT_FIGURES) as FigureId[];
        return (
          <section className="rp-ov-figures" aria-label="Key figures">
            {ids.map(id => { const f = figure(id); return <Figure key={id} label={FIGURES.find(x => x.id === id)!.label} value={f.value} foot={f.foot} tone={(f as any).tone} spark={(f as any).spark} />; })}
          </section>
        );
      }
      case "titles":
        return ordersGate(() => (
          <OverviewTitles rows={titleRows} startKey={range.startKey} endKey={range.endKey} viewsRecorded={viewsRecorded} addsRecorded={addsRecorded}
            costsKnown={!!profit && profit.costedUnits > 0} onEditBook={handleEditClick} fetchingBookId={fetchingBookId} />
        ));
      case "viewed": return marketing("viewed");
      case "calendar": case "goal": case "shipDays": case "launches": case "bookOfWeek": case "signed":
        return ordersGate(() => (
          <OverviewNewSales only={w.type as NewSalesWidget} paid={periods!.paid} current={periods!.current} previous={periods!.previous} books={books} range={range}
            config={w.config || {}} onConfig={setConfig} full={full} onEditBook={handleEditClick} />
        ));
      case "live": case "notes": case "preorders": case "map": case "giftOwed": case "soldOut":
        return ordersGate(() => (
          <OverviewNewLive only={w.type as NewLiveWidget} paid={periods!.paid} allOrders={allOrders.orders || []} current={periods!.current} books={books} range={range}
            activeNow={gaReport ? gaReport.activeNow ?? null : null} config={w.config || {}} onConfig={setConfig} full={full} setActiveTab={setActiveTab} />
        ));
      case "livePages": case "pageTime": case "visitHours": case "actions": case "outbound": case "newReturning":
        return <OverviewVisitors only={w.type as VisitorWidget} ga={ga} books={books} dailyCurrent={dailyCurrent} dailyPrevious={dailyPrevious}
          config={w.config || {}} onConfig={setConfig} full={full} setActiveTab={setActiveTab} periodLabel={range.phrase} />;
      case "moves": case "firstPage": case "sectionClicks": case "deviceSteps":
        return <OverviewNavigation only={w.type as NavigationWidget} ga={ga} books={books} config={w.config || {}} onConfig={setConfig}
          full={full} setActiveTab={setActiveTab} periodLabel={range.phrase} />;
      case "navLinks": case "bookPage": case "notFound": case "filters": case "bagPeek": case "readDepth":
        return <OverviewVisitorEvents only={w.type as VisitorEventWidget} ga={ga} books={books} full={full} setActiveTab={setActiveTab} periodLabel={range.phrase} />;
      case "journeys": case "exitPages":
        return <OverviewJourneys only={w.type as JourneyWidget} books={books} range={range} full={full} setActiveTab={setActiveTab} />;
      case "clarity":
        return <OverviewClarity settings={launch.parts ? launch.parts.settings : launch.error ? null : undefined} setActiveTab={setActiveTab} />;
      case "dropOff": case "lookNoBuy":
        return <OverviewVisitorPath only={w.type as PathWidget} dailyCurrent={dailyCurrent} dailyPrevious={dailyPrevious} dailyAll={daily.rows || []}
          books={books} config={w.config || {}} onConfig={setConfig} onEditBook={handleEditClick} phrase={range.phrase} />;
      default: break;
    }
    if (band === "sales") {
      return ordersGate(() => (
        <OverviewSales only={w.type} current={periods!.current} previous={periods!.previous} books={books} dailyCurrent={dailyCurrent}
          categoriesSetting={launch.parts?.settings?.design?.categories} onEditBook={handleEditClick} fetchingBookId={fetchingBookId} />
      ));
    }
    if (band === "traffic" || band === "search") return marketing(w.type);
    if (band === "customers") {
      return ordersGate(() => (
        <OverviewCustomers key={reloadKey} only={w.type === "custKpis" ? "kpis" : w.type} paid={periods!.paid} current={periods!.current} startKey={periods!.startKey} mix={insights!.mix} startMs={periods!.start}
          reviews={reviews} subs={subs} audienceFailed={audience.error} setActiveTab={setActiveTab}
          newsletter={audience.data ? { subscribers: audience.data.subscribers, pending: audience.data.pendingSubscribers || [] } : null} />
      ));
    }
    if (band === "stock") {
      return stock.error ? <ErrorState title="Stock unavailable" description="Books could not be loaded." onRetry={refresh} />
        : !insights ? (allOrders.error ? <ErrorState title="Stock insights unavailable" description="Orders could not be loaded, so sales pace can't be calculated." onRetry={refresh} /> : <LoadingState label="Calculating…" />)
        : <OverviewStock key={reloadKey} only={w.type === "stockKpis" ? "kpis" : w.type} books={books} paid={periods?.paid} shelf={insights.shelf} reprint={insights.reprint} dormant={insights.dormant} setActiveTab={setActiveTab}
            dailyCurrent={dailyCurrent} dailyAll={daily.rows || []} />;
    }
    return null;
  };

  // The board's header (design B4): the period buttons and comparison every figure follows. The board adds the
  // title, layout picker, Edit board and the hint line around it.
  const view: BoardView = { preset, compare: compareMode, ...(preset === "custom" ? { from: custom.from, to: custom.to } : {}) };
  const applyView = (v: BoardView) => {
    setPreset(v.preset); setCompareMode(v.compare);
    if (v.preset === "custom" && v.from && v.to) setCustom({ from: v.from, to: v.to });
  };
  const header: BoardHeader = {
    updated: <>{refreshLabel}{traffic ? ` · traffic from ${sourceName}` : ""}</>,
    period: (
      <>
        <div className="rp-wb-seg" role="group" aria-label="Period">
          {PERIOD_BUTTONS.map(p => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} title={p.title} data-phone={p.phone ? "" : undefined} onClick={() => setPreset(p.id)}>
              {p.phone ? <><span className="rp-wb-seg-long">{p.label}</span><span className="rp-wb-seg-phone">{p.phone}</span></> : p.label}
            </button>
          ))}
        </div>
        {/* Phones: the four common periods are buttons; every other period is one pick away here. */}
        <select className="rp-wb-select rp-wb-more" aria-label="More periods" data-on={PERIOD_BUTTONS.some(p => p.id === preset && !p.phone) || undefined}
          value={PERIOD_BUTTONS.some(p => p.id === preset && !p.phone) ? preset : ""} onChange={e => { if (e.target.value) setPreset(e.target.value as Preset); }}>
          <option value="">More</option>
          {PERIOD_BUTTONS.filter(p => !p.phone).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {preset === "custom" && (
          <span className="rp-wb-dates">
            <label className="rp-wb-lbl" htmlFor="wb-from">From</label>
            <input id="wb-from" className="rp-wb-select" type="date" value={custom.from} max={custom.to || shopDayKey(Date.now())} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
            <label className="rp-wb-lbl" htmlFor="wb-to">To</label>
            <input id="wb-to" className="rp-wb-select" type="date" value={custom.to} min={custom.from || undefined} max={shopDayKey(Date.now())} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
          </span>
        )}
        <label className="rp-wb-vs" htmlFor="wb-compare">vs</label>
        <select id="wb-compare" className="rp-wb-select rp-wb-compare" title={`${range.phrase} against ${range.before}`} value={compareMode} onChange={e => setCompareMode(e.target.value as CompareMode)}>
          <option value="previous">Period before</option>
          <option value="lastYear">Same days last year</option>
        </select>
      </>
    ),
    // Only a note worth reading: the dates are in the buttons and the strip, so no sentence repeats them.
    summary: preset === "custom" && range.preset !== "custom" ? "Pick both dates to use your own range."
      : ownOrderCount > 0 ? `${ownOrderCount} ${ownOrderCount === 1 ? "order" : "orders"} you placed yourself ${ownOrderCount === 1 ? "is" : "are"} left out.` : null,
    figures: (
      <section className="rp-ov-figures rp-wb-strip" aria-label="Headline figures">
        {(["revenue", "orders", "visitors", "conversion"] as FigureId[]).map(id => { const f = figure(id); return <Figure key={id} label={FIGURES.find(x => x.id === id)!.label} value={f.value} foot={f.foot} tone={(f as any).tone} />; })}
      </section>
    ),
    viewName: range.phrase,
    view, onApplyView: applyView,
    onExport: downloadReport, exportReady: !!periods,
    onRefresh: refresh, refreshing: ordersLoading,
  };

  return (
    <OverviewBoard store={boards.store} setStore={boards.setStore} saveState={boards.saveState} saveError={boards.saveError}
      onRetrySave={boards.retrySave} renderWidget={renderWidget} header={header} />
  );
}
