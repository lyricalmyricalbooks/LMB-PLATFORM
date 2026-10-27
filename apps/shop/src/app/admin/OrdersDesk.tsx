import { useEffect, useMemo, useRef, useState } from "react";
import { OrderDetail } from "./OrderDetail";
import { Orders, loadOrderBooks, loadOrderSearchCatalog, patchOrdersCache, refreshOrdersCache } from "./Orders";
import { EmptyState, LoadingState, MetricCard, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusBadge, Tabs, Toggle } from "./riso/components";
import { NEEDS_ME_QUEUES, nextToOpen, rowBooks, rowCover, rowStatus, refundState, stepOrder, deskQueue } from "./ordersDesk";
import { badgeText, gridCounts, gridOrders, itemCount, outsideQueue, paymentChip, shipsTo, stationQueue, stationStats, stationStep, type GridSort, type GridTab } from "./shipStation";
import { listDate, orderMoney, waitedText } from "./orderListHelpers";
import { printOrders } from "./orderPrint";
import { queueOf } from "./fulfillment";
import type { CatalogSearchIndex } from "./orderSearch";

const REFRESH_MS = 60 * 1000;
const PAGE = 40;
type Layout = "desk" | "grid" | "table";
/** Phones (≤767px) get one list with four tabs: the ship queue, then the covers page's three lists. */
type PhoneTab = "ship" | GridTab;
const PHONE_MQ = "(max-width: 767px)";
/** Covers page, narrowed from the station's "Not in this queue" links. */
type Only = "" | "Awaiting release" | "Unpaid" | "In transit";
const ONLY_LABEL: Record<Exclude<Only, "">, string> = { "Awaiting release": "Pre-orders waiting for release", Unpaid: "Waiting on payment", "In transit": "On the way" };
// Keys typed into a field or inside a dialog are never desk shortcuts.
const typingIn = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']");
};

// Orders, design A: the Ship station (the numbered queue on the left, the selected order on the right,
// one order at a time) and the All orders covers page (Open / Completed / All orders). The right side of
// the station IS the full order page (OrderDetail), so payment sync with Stripe, refunds, disputes,
// labels and dispatch all work exactly as before, and finishing an order moves straight to the next one.
export function OrdersDesk({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [orders, setOrders] = useState<any[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Orders always opens on All orders › Open, newest first, as covers (owner's choice, 18 October 2026);
  // a link to one order (/admin#orders/<id>) opens it in the Ship station.
  const [layout, setLayout] = useState<Layout>(() => (selectedId ? "desk" : "grid"));
  const [query, setQuery] = useState("");
  const [gridQuery, setGridQuery] = useState("");
  const [tab, setTab] = useState<GridTab>("open");
  const [only, setOnly] = useState<Only>("");
  const [sort, setSort] = useState<GridSort>("newest");
  const [shown, setShown] = useState(PAGE);
  const [showTest, setShowTest] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches);
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(PHONE_MQ).matches);
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("ship");
  const refreshing = useRef<Promise<void> | null>(null);
  const lastRefresh = useRef(0);
  // The owner pressed "Back to orders": don't pop the next order straight back open.
  const [closedByOwner, setClosedByOwner] = useState(false);
  const [catalog, setCatalog] = useState<CatalogSearchIndex | null>(null);
  // Book covers for the queue and the covers page; until (or unless) the catalog loads, they use the photo saved on the order.
  const [booksById, setBooksById] = useState<Map<string, any> | null>(null);
  useEffect(() => {
    let alive = true;
    loadOrderBooks().then((books) => { if (alive && books) setBooksById(new Map(books.map((b: any) => [String(b.id), b]))); });
    return () => { alive = false; };
  }, []);

  const refresh = () => {
    if (refreshing.current) return refreshing.current;
    lastRefresh.current = Date.now();
    refreshing.current = refreshOrdersCache({ incremental: true })
      .then((data) => { setOrders(data); setFailed(false); })
      .catch(() => setFailed(true))
      .finally(() => { refreshing.current = null; });
    return refreshing.current;
  };

  useEffect(() => {
    refresh();
    // Every minute while the tab is visible; a hidden tab reads nothing and catches up on return.
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden && Date.now() - lastRefresh.current > REFRESH_MS / 2) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const mq = window.matchMedia?.("(max-width: 900px)");
    const onMq = () => setNarrow(!!mq?.matches);
    mq?.addEventListener?.("change", onMq);
    const pq = window.matchMedia?.(PHONE_MQ);
    const onPq = () => setPhone(!!pq?.matches);
    pq?.addEventListener?.("change", onPq);
    return () => {
      window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible);
      mq?.removeEventListener?.("change", onMq); pq?.removeEventListener?.("change", onPq);
    };
  }, []);

  // ISBNs / SKUs live on the catalog: read it once, the first time someone searches.
  useEffect(() => {
    if (!(query.trim() || gridQuery.trim()) || catalog) return;
    let alive = true;
    loadOrderSearchCatalog().then((c) => { if (alive && c) setCatalog(c); });
    return () => { alive = false; };
  }, [query, gridQuery, catalog]);

  const list = useMemo(() => stationQueue(orders || [], query, showTest, catalog), [orders, query, showTest, catalog]);
  const stats = useMemo(() => stationStats(orders || [], Date.now(), showTest), [orders, showTest]);
  const outside = useMemo(() => outsideQueue(orders || [], showTest), [orders, showTest]);
  const ids = useMemo(() => list.map((o) => o.id), [list]);
  const grid = useMemo(() => {
    const rows = gridOrders(orders || [], only ? "open" : phone && phoneTab !== "ship" ? phoneTab : tab, gridQuery, sort, showTest, catalog);
    return only ? rows.filter((o) => (only === "Unpaid" ? deskQueue(o) === "Unpaid" : queueOf(o) === only)) : rows;
  }, [orders, tab, phone, phoneTab, only, gridQuery, sort, showTest, catalog]);
  const counts = useMemo(() => gridCounts(orders || [], showTest), [orders, showTest]);
  useEffect(() => setShown(PAGE), [tab, phoneTab, only, gridQuery, sort, showTest]);

  // Desktop: have an order open — the oldest one that needs you — unless the owner closed it.
  useEffect(() => {
    if (narrow || !orders || layout !== "desk" || closedByOwner) return;
    if (!selectedId) {
      const next = nextToOpen(list, null);
      if (next) onSelect(next);
    }
  }, [orders, list, selectedId, narrow, layout, closedByOwner]);

  const open = (id: string | null) => { if (id) setClosedByOwner(false); onSelect(id); };
  // Phones: an order opened from elsewhere (top-bar search, an alert) opens full screen in the station.
  useEffect(() => { if (phone && selectedId && layout !== "desk") setLayout("desk"); }, [phone, selectedId, layout]);

  // Keyboard: j / k next / previous order, "/" search, Escape clears the search.
  const keys = useRef({ ids, selectedId, query });
  keys.current = { ids, selectedId, query };
  useEffect(() => {
    if (layout !== "desk") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const search = document.querySelector<HTMLInputElement>(".od-list-head input[type=search]");
      if (e.key === "Escape" && e.target === search && keys.current.query) { setQuery(""); search?.blur(); return; }
      if (typingIn(e.target) || document.querySelector("[role='dialog']")) return;
      if (e.key === "/") { e.preventDefault(); search?.focus(); return; }
      if (e.key === "Escape" && keys.current.query) { setQuery(""); return; }
      const key = String(e.key || "").toLowerCase();
      if (key === "j" || key === "k") {
        const next = stepOrder(keys.current.ids, keys.current.selectedId, key === "j" ? 1 : -1);
        if (next && next !== keys.current.selectedId) { e.preventDefault(); open(next); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout]);

  const pickLayout = (l: Layout) => setLayout(l);
  const pickTab = (t: GridTab) => { setTab(t); setOnly(""); };
  const showOnly = (o: Exclude<Only, "">) => { setOnly(o); setGridQuery(""); pickLayout("grid"); };
  // From the covers page: open the order in the station (it stays open even when it isn't in the queue).
  const openInStation = (id: string) => { pickLayout("desk"); open(id); };
  // The pick list covers every order still to pack, whatever the search box holds.
  const toPack = useMemo(() => stationQueue(orders || [], "", showTest).filter((o) => deskQueue(o) === "Ready to pack"), [orders, showTest]);
  const printPickList = () => { if (toPack.length) printOrders(toPack, true); };

  const testToggle = <Toggle label="Show test orders" checked={showTest} onChange={setShowTest} />;
  const loadProblem = failed && orders ? (
    <p className="rp-hint" role="status" style={{ margin: 0, padding: "10px 14px", borderBottom: "1px solid var(--rp-border)" }}>
      Couldn't refresh orders. Showing the last loaded list.{" "}
      <button type="button" className="od-link" onClick={() => refresh()}>Try again</button>
    </p>
  ) : null;
  const notLoaded = failed && !orders ? (
    <div style={{ padding: 20 }}><EmptyState title="Orders didn't load" description="Check the connection and try again." action={<SecondaryButton size="sm" onClick={refresh}>Try again</SecondaryButton>} /></div>
  ) : !orders ? <LoadingState label="Loading orders…" /> : null;

  const header = (
    <header className="rp-stack" style={{ gap: 12 }}>
      <div className="rp-kpi-grid od-figures" aria-label="Ship station today">
        <MetricCard label="To ship" value={orders ? stats.toShip : "–"} footer="Paid, not sent yet" />
        <MetricCard label="Labels today" value={orders ? stats.labelsToday : "–"} footer="Bought since midnight" />
        <MetricCard label="Oldest" value={orders && stats.toShip ? `${stats.oldestDays}d` : "–"} tone={orders && stats.oldestDays > 3 ? "warn" : undefined} footer="Waiting longest" />
      </div>
    </header>
  );

  // Phones, concept A "Pocket Pressroom": four tabs, the three figures, one search, a flat sheet of rows, and
  // Start shipping / Pick list pinned to the bottom. An open order fills the screen (its own Back returns here).
  if (phone && !selectedId) {
    const shipping = phoneTab === "ship" && !only;
    const rows = shipping ? list : grid.slice(0, shown);
    const total = shipping ? list.length : grid.length;
    const search = shipping ? query : gridQuery;
    // The station draws an open order full screen on phones (and its Back returns to this list).
    const openOnPhone = (id: string) => { pickLayout("desk"); open(id); };
    const pickPhoneTab = (t: PhoneTab) => { setPhoneTab(t); setOnly(""); if (t !== "ship") setTab(t); };
    return (
      <div className="rp-stack od-phone" style={{ gap: 16 }}>
        <style>{DESK_CSS}</style>
        <Tabs
          variant="page"
          label="Order lists"
          idPrefix="od-"
          value={only ? "open" : phoneTab}
          onChange={pickPhoneTab}
          tabs={[
            { id: "ship", label: "To ship", count: orders ? stats.toShip : undefined },
            { id: "open", label: "Open" },
            { id: "completed", label: "Done" },
            { id: "all", label: "All" },
          ]}
        />
        {header}
        <SearchField label="Find an order" placeholder="Name, order or book" value={search}
          onChange={(e) => (shipping ? setQuery(e.target.value) : setGridQuery(e.target.value))} />
        {only ? (
          <p className="od-only" role="status">
            Showing: <strong>{ONLY_LABEL[only]}</strong> <button type="button" className="od-link" onClick={() => setOnly("")}>Show every open order</button>
          </p>
        ) : null}
        {loadProblem}
        {notLoaded || (rows.length === 0 ? (
          <EmptyState
            title={search ? "No orders match" : shipping ? "All caught up" : "Nothing here"}
            description={search ? "Try a name, email or order number." : shipping ? "Nothing to pack or ship." : "Orders show up here once customers check out."}
          />
        ) : (
          <ul className="od-sheet" aria-label="Orders">
            {rows.map((o) => {
              const badge = shipping || NEEDS_ME_QUEUES.includes(deskQueue(o)) ? stationStep(o) : rowStatus(o);
              const m = orderMoney(o);
              const cover = rowCover(o, booksById);
              const refund = refundState(o);
              const when = shipping ? waitedText(o.paidAt || o.createdAt) : listDate(o.paidAt || o.createdAt);
              const meta = [o.orderId || o.id, itemCount(o), when].filter(Boolean).join(" · ");
              return (
                <li key={o.id}>
                  <button type="button" className={`od-sheet-row${refund ? ` is-refunded is-refunded-${refund}` : ""}`} onClick={() => openOnPhone(o.id)}
                    aria-label={`${o.customer?.name || "No name"}, order ${o.orderId || o.id}, ${m.text}, ${badgeText(badge.text)}`}>
                    <span className="od-sheet-cover" aria-hidden="true">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}</span>
                    <span className="od-sheet-body">
                      <span className="od-sheet-name">{o.customer?.name || "—"}{o.isTest ? <span className="rp-hint"> · test</span> : null}</span>
                      <span className="od-sheet-meta rp-mono">{meta}</span>
                    </span>
                    <span className="od-sheet-end">
                      <span className="od-sheet-amount rp-mono">{m.text.replace(/^CA\$/, "$")}</span>
                      <StatusBadge tone={badge.tone}>{badgeText(badge.text)}</StatusBadge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
        {orders && (
          <div className="od-phone-foot">
            {!shipping && shown < total && <SecondaryButton onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, total - shown)} more</SecondaryButton>}
            {shipping && ([
              ["Awaiting release", outside.preorders, `pre-order${outside.preorders === 1 ? "" : "s"} waiting`],
              ["Unpaid", outside.waitingPayment, "waiting on payment"],
              ["In transit", outside.inTransit, "on the way"],
            ] as const).filter(([, n]) => n > 0).map(([key, n, words]) => (
              <button key={key} type="button" className="od-link" onClick={() => { setPhoneTab("open"); setTab("open"); showOnly(key); }}>{n} {words}</button>
            ))}
            {testToggle}
          </div>
        )}
        <div className="od-phone-bar">
          <PrimaryButton disabled={!list.length} onClick={() => { const next = nextToOpen(list, null); if (next) openOnPhone(next); }}>Start shipping</PrimaryButton>
          <SecondaryButton disabled={!toPack.length} onClick={printPickList}>Pick list</SecondaryButton>
        </div>
      </div>
    );
  }

  if (layout === "table") {
    return (
      <div className="rp-stack" style={{ gap: 12 }}>
        <style>{DESK_CSS}</style>
        <header className="od-head">
          <h2 className="od-title">Table</h2>
          <div className="od-head-actions">
            <SecondaryButton onClick={() => pickLayout("grid")}>← All orders</SecondaryButton>
            <SecondaryButton onClick={() => pickLayout("desk")}>Ship station</SecondaryButton>
          </div>
        </header>
        <Orders onSelectOrder={(order) => openInStation(order.id)} />
      </div>
    );
  }

  if (layout === "grid") {
    const page = grid.slice(0, shown);
    return (
      <div className="rp-stack od-grid-page" style={{ gap: 18 }}>
        <style>{DESK_CSS}</style>
        <div className="od-grid-bar">
          <Tabs
            variant="page"
            label="Order lists"
            value={only ? "open" : tab}
            onChange={pickTab}
            tabs={[{ id: "open", label: "Open", count: counts.open }, { id: "completed", label: "Completed", count: counts.completed }, { id: "all", label: "All orders", count: counts.all }]}
          />
          <div className="od-grid-tools">
            <SearchField label="Find an order" placeholder="Order, name, email, book or ISBN" value={gridQuery} onChange={(e) => setGridQuery(e.target.value)} />
            <SelectField label="Sort" hideLabel value={sort} onChange={(e) => setSort(e.target.value === "oldest" ? "oldest" : "newest")}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </SelectField>
            <div role="group" aria-label="Show as" className="od-switch od-switch-inline">
              <button type="button" aria-pressed="true" className="is-on">Covers</button>
              <button type="button" aria-pressed="false" onClick={() => pickLayout("table")}>Table</button>
            </div>
            <div className="od-head-actions od-grid-actions">
              <PrimaryButton onClick={() => pickLayout("desk")}>Ship station · {stats.toShip} to ship →</PrimaryButton>
              <SecondaryButton onClick={() => pickLayout("table")}>Export orders</SecondaryButton>
            </div>
          </div>
        </div>
        {only ? (
          <p className="od-only" role="status">
            Showing: <strong>{ONLY_LABEL[only]}</strong> <button type="button" className="od-link" onClick={() => setOnly("")}>Show every open order</button>
          </p>
        ) : null}
        {loadProblem}
        {notLoaded || (grid.length === 0 ? (
          <EmptyState
            title={gridQuery ? "No orders match" : tab === "open" ? "Nothing open" : "No orders here yet"}
            description={gridQuery ? "Try a different name, email or order number." : tab === "open" ? "Every order has been sent. New paid orders appear here and in the Ship station." : "Orders show up here as soon as customers check out."}
          />
        ) : (
          <ul className="od-cards" aria-label="Orders">
            {page.map((o) => {
              const s = rowStatus(o);
              const pay = paymentChip(o);
              const m = orderMoney(o);
              const cover = rowCover(o, booksById);
              const refund = refundState(o);
              const titles = rowBooks(o);
              return (
                <li key={o.id}>
                  <button type="button" className={`od-card${refund ? ` is-refunded is-refunded-${refund}` : ""}`} onClick={() => openInStation(o.id)} aria-label={`Order ${o.orderId || o.id}, ${o.customer?.name || "no name"}, ${badgeText(s.text)}, ${pay.text}`}>
                    <span className="od-card-cover" aria-hidden="true">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span className="od-card-blank">{titles || "No books"}</span>}</span>
                    <span className="od-card-body">
                      <span className="od-row-top"><strong className="rp-mono">{o.orderId || o.id}</strong><span className="rp-hint rp-mono">{listDate(o.paidAt || o.createdAt)}</span></span>
                      <span className="od-card-who"><span><strong>{o.customer?.name || "—"}</strong> · {itemCount(o)}</span><span className="rp-mono od-row-amount" title={m.paid ? `Paid ${m.paid}` : undefined}>{m.text}</span></span>
                      {/* Without a cover the titles are already written in the cover box. */}
                      {titles && cover ? <span className="od-row-title" title={titles}>{titles}</span> : null}
                      <span className="od-card-chips"><StatusBadge tone={s.tone}>{badgeText(s.text)}</StatusBadge><StatusBadge tone={pay.tone}>{pay.text}</StatusBadge>{o.isTest ? <StatusBadge tone="danger">Test</StatusBadge> : null}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
        {orders && grid.length > 0 && (
          <div className="od-grid-foot">
            <span className="rp-hint">Showing {page.length} of {grid.length} orders · {sort === "oldest" ? "oldest" : "newest"} first</span>
            {shown < grid.length && <SecondaryButton onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, grid.length - shown)} more</SecondaryButton>}
            {testToggle}
          </div>
        )}
      </div>
    );
  }

  const listPane = (
    <aside aria-label="Ship queue" className="od-list">
      <div className="od-list-head">
        <SearchField label="Find an order" placeholder="Order, name, email, phone, postcode, book or ISBN" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="od-head-actions" style={{ gap: 8 }}>
          <SecondaryButton size="sm" disabled={!toPack.length} onClick={printPickList} title={toPack.length ? `Every book for the ${toPack.length} order${toPack.length === 1 ? "" : "s"} still to pack` : "Nothing to pack right now"}>
            Print pick list
          </SecondaryButton>
          <SecondaryButton size="sm" onClick={() => pickLayout("grid")}>All orders</SecondaryButton>
        </div>
        <p className="rp-label" style={{ margin: 0 }}>Up next · problems, packing, then labels</p>
      </div>
      {loadProblem}
      {notLoaded || (list.length === 0 ? (
        <div style={{ padding: 20 }}>
          <EmptyState
            title={query ? "No orders match" : "All caught up"}
            description={query ? "Try a different name, email or order number, or search All orders." : "Nothing to pack or ship right now. New paid orders appear here first."}
          />
        </div>
      ) : (
        <ol className="od-rows">
          {list.map((o, i) => {
            const step = stationStep(o);
            const books = (o.items || []).reduce((n: number, it: any) => n + (Number(it.quantity) || 0), 0);
            const where = shipsTo(o);
            const titles = rowBooks(o);
            const cover = rowCover(o, booksById);
            return (
              <li key={o.id}>
                <button type="button" className={`od-row${o.id === selectedId ? " is-on" : ""}`} aria-current={o.id === selectedId ? "true" : undefined} onClick={() => open(o.id)}>
                  <span className="od-num rp-mono" aria-hidden="true">{i + 1}</span>
                  <span className="od-cover" aria-hidden="true">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}</span>
                  <span className="od-row-body">
                    <span className="od-row-top"><strong>{o.customer?.name || "—"}</strong><StatusBadge tone={step.tone}>{step.text}</StatusBadge></span>
                    <span className="od-row-mid">{titles || `${books} book${books === 1 ? "" : "s"}`}{where ? ` · ${where}` : ""}</span>
                    <span className="od-row-bot"><span className="rp-mono rp-hint">{o.orderId || o.id}</span><span className="rp-hint">{listDate(o.paidAt || o.createdAt)}{o.isTest ? " · test" : ""}</span></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ))}
      <div className="od-list-foot">
        <p className="rp-label" style={{ margin: 0 }}>Not in this queue</p>
        {/* A list with nothing in it isn't a link: it reads as plain text so the ones with orders stand out. */}
        {([
          ["Awaiting release", outside.preorders, `pre-order${outside.preorders === 1 ? "" : "s"} waiting for release`],
          ["Unpaid", outside.waitingPayment, "waiting on an e-Transfer or cash payment"],
          ["In transit", outside.inTransit, "on the way"],
        ] as const).map(([key, n, words]) => n > 0
          ? <button key={key} type="button" className="od-link" onClick={() => showOnly(key)}>{n} {words}</button>
          : <span key={key} className="rp-hint">{n} {words}</span>)}
        {testToggle}
        {narrow ? null : <p className="rp-hint" style={{ margin: 0 }} aria-label="Keyboard shortcuts">
          Shortcuts: <kbd>J</kbd> / <kbd>K</kbd> next · previous order, <kbd>/</kbd> search, <kbd>Esc</kbd> clear search
        </p>}
      </div>
    </aside>
  );

  // onChanged: the order page just read this order, so drop it into the list instead of reloading every order.
  const detailPane = selectedId ? (
    <section aria-label="Selected order" className="od-detail">
      <OrderDetail
        key={selectedId}
        orderId={selectedId}
        onClose={() => { setClosedByOwner(true); onSelect(null); }}
        queueIds={ids.includes(selectedId) ? ids : [selectedId, ...ids]}
        onNavigate={(id) => open(id)}
        onChanged={(order) => { if (order?.id) setOrders(patchOrdersCache(order)); }}
      />
    </section>
  ) : (
    <section className="od-detail od-empty"><EmptyState title="All caught up" description="Pick an order in the queue, or open All orders." /></section>
  );


  return (
    <div className="rp-stack" style={{ gap: 18 }}>
      <style>{DESK_CSS}</style>
      {narrow && selectedId ? null : header}
      <div className="od-desk">
        {narrow ? (selectedId ? detailPane : listPane) : (<>{listPane}{detailPane}</>)}
      </div>
    </div>
  );
}

const DESK_CSS = `
.od-head{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between}
.od-title{margin:0;font:400 20px/1.05 var(--rp-font-display);text-transform:uppercase;letter-spacing:.01em}
.od-head-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.od-stats{display:flex;gap:18px;margin:0;padding:8px 0;border:0;border-top:2px solid var(--rp-rule,var(--rp-text));border-bottom:1px solid var(--rp-border);background:transparent}
.od-stats div{display:flex;flex-direction:column}
.od-stats dd{margin:0;font-size:20px;font-weight:500}
.od-desk{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);gap:24px;align-items:start}
@media (max-width:900px){.od-desk{grid-template-columns:minmax(0,1fr)}}
.od-list{position:sticky;top:16px;display:flex;flex-direction:column;border:var(--rp-hair) solid var(--rp-border);box-shadow:var(--rp-shadow);background:var(--rp-surface);max-height:calc(100vh - 140px);min-height:420px}
@media (max-width:900px){.od-list{position:static;max-height:none}}
.od-list-head{display:flex;flex-direction:column;gap:12px;padding:14px;border-bottom:1px solid var(--rp-border)}
.od-switch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--rp-border)}
.od-switch button{min-height:36px;padding:0 14px;border:0;border-left:1px solid var(--rp-border);background:transparent;color:var(--rp-text);font:400 13px var(--rp-font-body);cursor:pointer}
.od-switch button:first-child{border-left:0}
.od-switch button.is-on{background:var(--rp-text);color:var(--rp-canvas)}
.od-switch button:focus-visible,.od-row:focus-visible,.od-card:focus-visible{outline:2px solid var(--rp-focus);outline-offset:2px}
.od-rows{list-style:none;margin:0;padding:0;overflow:auto;flex:1}
.od-row{display:flex;flex-direction:row;align-items:flex-start;gap:10px;width:100%;text-align:left;padding:12px 14px;border:0;border-bottom:1px solid var(--rp-border);border-left:6px solid transparent;background:transparent;color:var(--rp-text);cursor:pointer;font:inherit}
.od-row:hover{background:var(--rp-surface-sunken)}
.od-row.is-on{background:var(--rp-surface-sunken);border-left-color:var(--rp-primary)}
.od-num{flex:none;width:22px;padding-top:2px;color:var(--rp-text-subtle);font-size:13px;text-align:right}
.od-row.is-on .od-num{color:var(--rp-text);font-weight:700}
.od-row-body{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0}
.od-cover{flex:none;width:36px;aspect-ratio:2/3;border:1px solid var(--rp-border-strong);background:var(--rp-surface-sunken);overflow:hidden}
.od-cover img{display:block;width:100%;height:100%;object-fit:cover}
.od-row-title{font-size:13px;font-weight:700;color:var(--rp-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.od-row-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:14px}
.od-row-mid{font-size:13px;color:var(--rp-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.od-row-bot{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px}
.od-list-foot{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:12px 14px;border-top:1px solid var(--rp-border)}
.od-link{border:0;background:none;padding:0;color:var(--rp-primary-text);text-decoration:underline;cursor:pointer;font:inherit;text-align:left}
.od-detail{min-width:0}
.od-empty{padding:40px 0}
.od-grid-bar{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;justify-content:space-between}
.od-grid-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;width:100%}
.od-grid-actions{margin-left:auto}
.od-grid-tools .rp-field{min-width:150px}
.od-switch-inline{display:inline-grid}
.od-only{margin:0;font-size:14px}
.od-cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
.od-card{display:flex;flex-direction:column;width:100%;height:100%;padding:0;text-align:left;border:1px solid var(--rp-border);border-top:2px solid var(--rp-rule,var(--rp-text));background:var(--rp-surface);color:var(--rp-text);box-shadow:none;cursor:pointer;font:inherit}
.od-card:hover{border-color:var(--rp-text)}
.od-card-cover{display:block;height:150px;border-bottom:1px solid var(--rp-divider);background:var(--rp-surface-sunken);overflow:hidden}
.od-card-cover img{display:block;width:100%;height:100%;object-fit:cover}
.od-card-blank{display:flex;height:100%;align-items:center;justify-content:center;padding:12px;text-align:center;font:400 18px/1.1 var(--rp-font-display);text-transform:uppercase;color:var(--rp-text-subtle)}
.od-card-body{display:flex;flex-direction:column;gap:7px;padding:12px 14px 14px;min-width:0}
.od-card-who{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;color:var(--rp-text-muted)}
.od-card-who>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.od-card-who .od-row-amount{flex:none;color:var(--rp-text)}
.od-card-who strong{color:var(--rp-text)}
.od-card-chips{display:flex;flex-wrap:wrap;gap:6px}
.od-card.is-refunded{background:var(--rp-danger-tint)}
.od-card.is-refunded-full .od-row-amount{text-decoration:line-through;color:var(--rp-danger)}
.od-card.is-refunded .od-card-cover{opacity:.55}
@media (max-width:640px){
.od-grid-tools{width:100%}
.od-grid-tools>*{flex:1 1 140px}
.od-grid-tools>:first-child,.od-grid-tools>[role=group]{flex:1 1 100%}
.od-card-chips .rp-badge{height:auto;min-height:24px;padding:3px 8px;white-space:normal;line-height:1.2;max-width:100%}
.od-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.od-card-cover{height:110px}
.od-card-blank{font-size:14px;padding:8px}
.od-card-body{padding:10px 10px 12px;gap:6px}
.od-card-who{flex-direction:column;gap:2px}
}
.od-phone{padding-bottom:84px}
.rp .od-phone .od-figures.rp-kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.rp .od-phone .od-figures .rp-metric-foot{display:none}
.rp .od-phone .od-figures.rp-kpi-grid>.rp-metric:nth-child(n+2){padding-left:12px}
.od-sheet{list-style:none;margin:0;padding:0;border:1px solid var(--rp-border);border-top:2px solid var(--rp-rule,var(--rp-text));background:var(--rp-surface)}
.od-sheet li+li{border-top:1px solid var(--rp-divider)}
.od-sheet-row{display:flex;align-items:center;gap:12px;width:100%;min-height:72px;padding:10px 12px;border:0;background:transparent;color:var(--rp-text);text-align:left;font:inherit;cursor:pointer}
.od-sheet-row:active{background:var(--rp-surface-sunken)}
.od-sheet-row:focus-visible{outline:2px solid var(--rp-focus);outline-offset:-2px}
.od-sheet-row.is-refunded{background:var(--rp-danger-tint)}
.od-sheet-row.is-refunded-full .od-sheet-amount{text-decoration:line-through;color:var(--rp-danger)}
.od-sheet-cover{flex:none;width:40px;height:52px;border:1px solid var(--rp-border-strong);background:var(--rp-surface-sunken);overflow:hidden}
.od-sheet-cover img{display:block;width:100%;height:100%;object-fit:cover}
.od-sheet-body{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.od-sheet-name{font-size:15px;font-weight:600;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.od-sheet-meta{font-size:11px;line-height:1.3;color:var(--rp-text-subtle);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.od-sheet-end{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.od-sheet-amount{font-size:15px}
.od-phone-foot{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.od-phone-bar{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;gap:8px;padding:12px 20px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--rp-text);background:var(--rp-canvas)}
.od-phone-bar .rp-btn{min-height:48px}
.od-phone-bar .rp-btn-primary{flex:1}
.od-grid-foot{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;border-top:1px solid var(--rp-border);padding-top:14px}
`;
