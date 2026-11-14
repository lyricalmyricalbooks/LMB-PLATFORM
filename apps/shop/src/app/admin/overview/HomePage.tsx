// Home (the menu's first item): Get started for a new shop, the Connect Google prompt, then HomeToday (greeting, To do
// tiles, today's figures). It reads only what those need: settings for the launch checks, every order, every book and the
// server's to-do counts. The figures board, Google Analytics and the traffic counters belong to Analytics and are not
// loaded here, so Home opens without their code or their reads (they used to come with AnalyticsDashboard).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../api";
import { getOrdersCached, peekOrders } from "../ordersCache";
import { readSignIn } from "../launchCheck";
import { launchReadiness } from "../launchReadiness";
import { platformCardsProvider } from "../../../lib/shopProfile";
import { mergeNewestPage } from "../ordersDesk";
import { isOwnOrder } from "../../lib/ownerDevice";
import { combinedAdmin } from "../combined";
import { useShopWords } from "../shopWords";
import { useFairToday } from "../FairToday";
import { stockroomBridge } from "../stockroomBridge";
import { ConnectGoogleCard } from "../ConnectGoogleCard";
import { SetupStart } from "./SetupStart";
import { ClosingTile } from "./ClosingTile";
import { HomeToday } from "./HomeToday";
import { RunRow, RunTiles } from "./OverviewParts";
import { stockroomRunRows, useStockroomTodos } from "./StockroomTodos";
import { moneyText } from "../stockroom/stockists";
import { REORDER_TAB } from "../combined";
import { REORDER_COVER_DAYS, isRealPaidOrder, orderTodos, reprintWatch, stockValue, titleStock, toFulfil } from "./overviewInsights";

/** A press with both apps: Home also lists the stockroom's to-dos and the till buttons. */
const COMBINED = combinedAdmin();
/** How often Home quietly re-reads the newest orders and the to-do counts while it is on screen. */
export const HOME_REFRESH_MS = 5 * 60_000;

type Counts = { pendingReviews?: number | null; unreadMessages: number | null; openPrivacyRequests: number | null };

/** The figures behind Home's To do tiles (pure). Reprint pace leaves out the owner's own orders, like every figure. */
export function homeTodoCounts(orders: any[] | null, books: any[] | null, now = Date.now()) {
  if (!orders) return null;
  const todos = orderTodos(orders, now);
  const stock = books ? titleStock(orders.filter(o => isRealPaidOrder(o) && !isOwnOrder(o)), books, now) : null;
  return {
    fulfil: toFulfil(orders, now),
    requests: todos.requests.length,
    giftCardsMissing: todos.giftCardsMissing.length,
    awaitingRelease: todos.awaitingRelease.length,
    reprint: stock ? reprintWatch(stock).length : null,
    soldOut: books ? stockValue(books).soldOut : null,
  };
}

export function HomePage({ setActiveTab, onSetWall, ownerName = "" }: {
  setActiveTab?: (tab: string) => void;
  onSetWall?: (on: boolean) => Promise<boolean>;
  /** The signed-in person's name, for the greeting. */
  ownerName?: string;
}) {
  const w = useShopWords();
  const [reloadKey, setReloadKey] = useState(0);
  // Every source loads on its own so one failure never blanks the page.
  const [allOrders, setAllOrders] = useState<{ orders: any[] | null; error: boolean }>({ orders: null, error: false });
  const [stock, setStock] = useState<{ books: any[] | null; error: boolean }>({ books: null, error: false });
  const [counts, setCounts] = useState<Counts | null>(null);
  const [launch, setLaunch] = useState<{ parts: any | null; error: boolean }>({ parts: null, error: false });
  const stockroomTodos = useStockroomTodos(COMBINED);
  const fair = useFairToday(COMBINED);
  const seenShared = useRef<any[] | null>(null);

  useEffect(() => {
    Promise.all([
      adminApi.getSettings(),
      adminApi.getShippingProfiles(),
      adminApi.getRecentEmailLog(5),
      // A shop whose cards go through Colophon: is the press's card account connected? (plan 2.10; null if unknown)
      platformCardsProvider() ? adminApi.platformPayments("status").catch(() => null) : Promise.resolve(undefined),
      // Two-step sign-in and backup codes, recommended before going live (never fails the other checks).
      readSignIn(),
    ]).then(([settings, shippingProfiles, emailLog, platformAccount, signIn]) => setLaunch({ parts: { settings, shippingProfiles, emailLog, platformAccount, signIn }, error: false }))
      .catch(() => setLaunch({ parts: null, error: true }));
    getOrdersCached({ force: reloadKey > 0 }).then((o: any[]) => { seenShared.current = o; setAllOrders({ orders: o, error: false }); })
      .catch(() => setAllOrders({ orders: null, error: true }));
    adminApi.getAllBooks().then((b: any[]) => setStock({ books: b, error: false }))
      .catch(() => setStock({ books: null, error: true }));
    adminApi.getAdminBadgeCounts().then(setCounts).catch(() => setCounts({ pendingReviews: null, unreadMessages: null, openPrivacyRequests: null }));
  }, [reloadKey]);

  // Every 5 minutes while Home is on screen (and on coming back to the tab after that long): the newest orders and the
  // to-do counts. The admin shell's own check refreshes the shared orders copy; when it is newer, Home takes it.
  const quiet = useRef({ busy: false, at: Date.now() });
  const quietRefresh = useCallback(() => {
    if (quiet.current.busy) return;
    quiet.current = { busy: true, at: Date.now() };
    const shared = peekOrders();
    const orders = shared && shared !== seenShared.current
      ? Promise.resolve(shared).then((o) => { seenShared.current = o; setAllOrders(a => (a.orders ? { orders: mergeNewestPage(a.orders, o), error: false } : a)); })
      : adminApi.getOrders(50).then((page: any[]) => {
        const clean = page.map(({ _lastDoc, ...o }: any) => o);
        setAllOrders(a => (a.orders ? { orders: mergeNewestPage(a.orders, clean), error: false } : a));
      });
    Promise.allSettled([orders, adminApi.getAdminBadgeCounts().then(setCounts)]).finally(() => { quiet.current.busy = false; });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") quietRefresh(); }, HOME_REFRESH_MS);
    const back = () => { if (document.visibilityState === "visible" && Date.now() - quiet.current.at >= HOME_REFRESH_MS) quietRefresh(); };
    document.addEventListener("visibilitychange", back);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [quietRefresh]);

  const refresh = () => {
    setAllOrders({ orders: null, error: false }); setStock({ books: null, error: false });
    setLaunch({ parts: null, error: false }); setCounts(null);
    setReloadKey(k => k + 1);
  };

  // Orders the owner placed themselves stay in the to-dos but are left out of the figures (as on every figure).
  const shopOrders = useMemo(() => (allOrders.orders ? allOrders.orders.filter(o => !isOwnOrder(o)) : null), [allOrders.orders]);
  const todo = useMemo(() => homeTodoCounts(allOrders.orders, stock.books), [allOrders.orders, stock.books]);
  const readiness = useMemo(() => {
    if (!launch.parts || !allOrders.orders || !stock.books) return null;
    return launchReadiness({ ...launch.parts, books: stock.books, orders: allOrders.orders });
  }, [launch.parts, allOrders.orders, stock.books]);

  const ordersLoading = !todo && !allOrders.error;
  const stockLoading = stock.books === null && !stock.error;
  const go = (tab: string) => setActiveTab?.(tab);
  const stockroomRun = COMBINED ? stockroomRunRows(stockroomTodos, w) : null;
  const failed = [allOrders.error && "orders", counts && counts.pendingReviews === null && "reviews", stock.error && w("books"),
    stockroomTodos.failed && "the stockroom's to-dos"].filter(Boolean);

  const todoRow = (
    <section className="rp-todo-row" aria-label="To do">
      <RunTiles>
        <RunRow kind="Orders" label="paid orders waiting to ship" one="paid order waiting to ship" count={todo ? todo.fulfil.length : null} loading={ordersLoading}
          detail={todo && todo.fulfil[0] ? (todo.fulfil[0].ageDays < 1 ? "Oldest was ordered today" : `Oldest has waited ${todo.fulfil[0].ageDays} day${todo.fulfil[0].ageDays === 1 ? "" : "s"}`) : ""}
          onOpen={() => go("orders")} openLabel="Ship orders" />
        <RunRow kind="Reviews" label="reviews to moderate" one="review to moderate" count={counts ? counts.pendingReviews ?? null : null} loading={!counts}
          detail="Readers are waiting to see these" detailOne="A reader is waiting to see it" onOpen={() => go("reviews")} openLabel="Moderate" />
        <RunRow kind="Stock" label={w("book") === "book" ? "titles to reprint soon" : "products to restock soon"} one={w("book") === "book" ? "title to reprint soon" : "product to restock soon"} count={todo ? todo.reprint : null} loading={ordersLoading || stockLoading}
          detail={`On course to sell out within ${REORDER_COVER_DAYS} days`} onOpen={() => go("inventory")} openLabel="Open inventory" />
        <RunRow kind="Stock" label={w("book") === "book" ? "print books or editions sold out" : "products sold out"} one={w("book") === "book" ? "print book or edition sold out" : "product sold out"} count={todo ? todo.soldOut : null} loading={ordersLoading || stockLoading}
          detail="Customers can't buy these right now" detailOne="Customers can't buy it right now" onOpen={() => go("inventory")} openLabel="Open inventory" />
        <RunRow kind="Orders" label="cancel or return requests" one="cancel or return request" count={todo ? todo.requests : null} loading={ordersLoading}
          detail="Customers asked from their order page" onOpen={() => go("orders")} openLabel="Answer requests" />
        <RunRow kind="Gift cards" label="gift cards not issued" one="gift card not issued" count={todo ? todo.giftCardsMissing : null} loading={ordersLoading}
          detail="Paid, but the buyer has no code yet" onOpen={() => go("giftCards")} openLabel="Open gift cards" />
        <RunRow kind="Pre-orders" label="pre-orders awaiting release" one="pre-order awaiting release" count={todo ? todo.awaitingRelease : null} loading={ordersLoading}
          detail={`Press Ready to ship now on each order when the ${w("books")} arrive`} onOpen={() => go("orders")} openLabel="Open pre-orders" />
        <RunRow kind="Messages" label="unread messages" one="unread message" count={counts ? counts.unreadMessages : null} loading={!counts}
          detail="From the contact form on your website" onOpen={() => go("messages")} openLabel="Read messages" />
        <RunRow kind="Privacy" label="privacy requests" one="privacy request" count={counts ? counts.openPrivacyRequests : null} loading={!counts}
          detail="Customers asked for a copy or deletion of their data" onOpen={() => go("general")} openLabel="Open privacy requests" />
        {stockroomRun?.rows}
      </RunTiles>
      {failed.length > 0 && <p className="rp-hint">{failed.join(", ")} could not be loaded, so some counts are missing.</p>}
    </section>
  );

  // Shop + stockroom (v4 mockup): one figure from each side, each opening its page.
  const sr = stockroomTodos.glance;
  const srWait = stockroomTodos.loading ? "…" : "—";
  const glance = COMBINED ? (
    <ul className="rp-glance" aria-label="Both sides at a glance">
      <GlanceTile side="Website" tone="mint" value={todo ? String(todo.fulfil.length) : allOrders.error ? "—" : "…"}
        label={todo && todo.fulfil.length === 1 ? "order to pack" : "orders to pack"} onOpen={() => go("orders")} />
      <GlanceTile side="Stockroom" tone="apricot" value={sr ? String(sr.restock) : srWait}
        label={w(sr && sr.restock === 1 ? "book low or out of stock" : "books low or out of stock")} onOpen={() => go(REORDER_TAB)} />
      <GlanceTile side="Stockroom" tone="sky" value={sr ? moneyText(sr.owed) || "Nothing" : srWait}
        label="owed to you by stockists" onOpen={() => stockroomBridge.openPage("consignment")} />
    </ul>
  ) : null;

  return (
    <>
      {/* A cancelled plan: the day the shop closes, with the download and Keep my plan (ClosingTile.tsx). */}
      <ClosingTile />
      {/* Plans 6.3 and 6.9: only a shop whose setup wrote the sign-up answers shows Choose your look, then the guide. */}
      <SetupStart books={stock.books} orders={allOrders.orders} readiness={readiness}
        settings={launch.parts ? launch.parts.settings : launch.error ? null : undefined}
        onOpen={go} onSetWall={onSetWall} onRetrySettings={refresh} />
      {/* Plan 6.17: Connect Google, on a shop run by Colophon, until it is connected. */}
      <ConnectGoogleCard variant="prompt" />
      <HomeToday ownerName={ownerName} orders={shopOrders} ordersFailed={allOrders.error} fair={fair} combined={COMBINED} todo={todoRow} glance={glance}
        onOpen={go} onOpenTill={() => stockroomBridge.openPage("pos")} onRetry={refresh} />
    </>
  );
}

/** One of Home's "Both sides at a glance" tiles: which side, one figure, what it counts; the whole tile opens its page. */
export function GlanceTile({ side, tone, value, label, onOpen }: { side: string; tone: "mint" | "apricot" | "sky"; value: string; label: string; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="rp-glance-tile" data-tone={tone} onClick={onOpen}>
        <span className="rp-glance-side">{side}</span>
        <strong className="rp-glance-value">{value}</strong>
        <span>{label}</span>
      </button>
    </li>
  );
}
