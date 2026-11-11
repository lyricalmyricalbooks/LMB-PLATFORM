// Home, drawn to Julian's "Shop Admin Redesign" mockup (11 November 2026): a greeting with the two till buttons, the
// To do tiles (website and stockroom together, most urgent first), then Today: the day's takings with a bar per day,
// what the till is selling, the latest orders and this week's best sellers. The full figures board (periods, widgets)
// moved to Analytics (the analytics page). Nothing here reads Firestore: the figures come from HomePage.
import { useContext, type ReactNode } from "react";
import { PageAlertsSlot, PrimaryButton, SecondaryButton, StatusBadge, type BadgeTone } from "../riso/components";
import { bestSellers, isRealPaidOrder, newestSales, orderStatusWords, totals, type Order } from "./overviewInsights";
import { money, orderHref } from "./OverviewParts";
import { SHOP_TZ, addDays, orderDay, shopDayKey } from "../../lib/shopDay";
import { fairWorthShowing, lowText, totalsText } from "../FairToday";
import type { StockroomFair } from "../stockroomBridge";
import { useShopWords } from "../shopWords";
import "./home.css";

/** Bars on the takings tile: the last 12 days, today last. */
const BAR_DAYS = 12;

const when = (now: number, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { timeZone: SHOP_TZ, ...opts }).format(now);

/** "Good morning, Julian" by the shop's clock; no name when the sign-in has none. */
export function greeting(name: string, now = Date.now()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: SHOP_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const first = name.trim().split(/\s+/)[0];
  return `Good ${part}${first && !first.includes("@") ? `, ${first}` : ""}`;
}

/** The fair's takings in the shop's own currency (the till can take others; those stay in its own tile). */
const fairCad = (fair: StockroomFair | null) => (fairWorthShowing(fair) ? fair.totals.filter((t) => t.cur === "CAD").reduce((s, t) => s + t.amount, 0) : 0);

/** Today's website takings and sales, a bar per day for the last 12 days, and the till's part of today. Pure. */
export function todayFigures(orders: Order[], fair: StockroomFair | null, now = Date.now()) {
  const paid = orders.filter(isRealPaidOrder);
  const today = shopDayKey(now);
  const byDay = (key: string) => totals(paid.filter((o) => orderDay(o.createdAt) === key)).net;
  const site = paid.filter((o) => orderDay(o.createdAt) === today);
  const till = fairWorthShowing(fair) ? fair.sales : 0;
  const bars = Array.from({ length: BAR_DAYS }, (_, i) => addDays(today, i - BAR_DAYS + 1)).map((key) => byDay(key) + (key === today ? fairCad(fair) : 0));
  return { total: totals(site).net + fairCad(fair), siteSales: site.length, tillSales: till, bars };
}

/** The order pill, in the mockup's words: waiting to go out is green, a refund amber, a problem red. */
const PILL: Record<string, { tone: BadgeTone; word: string }> = {
  "Paid · to send": { tone: "success", word: "Unfulfilled" },
  Shipped: { tone: "success", word: "Shipped" },
  Completed: { tone: "neutral", word: "Completed" },
  "Pre-order": { tone: "info", word: "Pre-order" },
  Refunded: { tone: "warning", word: "Refunded" },
  "Partly refunded": { tone: "warning", word: "Partly refunded" },
  "Needs attention": { tone: "danger", word: "Needs you" },
};

const initials = (title: string) => title.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w) && !/^(the|a|an|of|and)$/i.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "•";

export function HomeToday({ ownerName, orders, ordersFailed, fair, combined, todo, onOpen, onOpenTill, onRecordSale, onRetry }: {
  ownerName: string;
  /** The shop's orders (the owner's own test orders left out); null while loading. */
  orders: Order[] | null;
  ordersFailed: boolean;
  fair: StockroomFair | null;
  /** Shop + stockroom: the till buttons and the Selling today tile show. */
  combined: boolean;
  /** The To do tiles (HomePage's RunTiles). */
  todo: ReactNode;
  onOpen: (tab: string) => void;
  onOpenTill: () => void;
  onRecordSale: () => void;
  onRetry: () => void;
}) {
  const w = useShopWords();
  // The admin's alerts and the one-time tour invitation sit under the greeting, as on every page's header.
  const alerts = useContext(PageAlertsSlot);
  const now = Date.now();
  const figures = orders ? todayFigures(orders, fair, now) : null;
  const max = figures ? Math.max(...figures.bars, 0) : 0;
  const latest = orders ? newestSales(orders, 4) : [];
  const weekStart = addDays(shopDayKey(now), -6);
  const best = orders ? bestSellers(orders.filter((o) => isRealPaidOrder(o) && orderDay(o.createdAt) >= weekStart), 4) : [];
  const fairOn = fairWorthShowing(fair);
  const wait = ordersFailed ? "—" : "…";

  return (
    <div className="rp-home">
      <header className="rp-home-head">
        <div>
          <h1 className="rp-home-title">{greeting(ownerName, now)}</h1>
          <p className="rp-home-sub">{when(now, { weekday: "long", day: "numeric", month: "long" })} · your to-do list and today at a glance</p>
        </div>
        {combined && (
          <div className="rp-home-actions">
            <SecondaryButton onClick={onRecordSale}>Record a sale</SecondaryButton>
            <PrimaryButton onClick={onOpenTill}>Open till</PrimaryButton>
          </div>
        )}
      </header>
      {alerts}

      <section aria-labelledby="home-todo">
        <h2 className="rp-home-h2" id="home-todo">To do <small>{combined ? "Website and stockroom, most urgent first" : "Most urgent first"}</small></h2>
        {todo}
      </section>

      <section aria-labelledby="home-today">
        <h2 className="rp-home-h2" id="home-today">Today <button type="button" className="rp-home-link" onClick={() => onOpen("analytics")}>Analytics →</button></h2>
        {ordersFailed && (
          <p className="rp-hint">Orders could not be loaded. <button type="button" className="rp-home-link" onClick={onRetry}>Try again</button></p>
        )}
        <div className="rp-home-grid">
          <article className="rp-home-tile" data-tone="mint" aria-label="Today's takings">
            <span className="rp-home-kicker">Today · {when(now, { weekday: "short", day: "numeric", month: "short" })}</span>
            <strong className="rp-home-big">{figures ? money(figures.total) : wait}</strong>
            <span className="rp-home-line">
              {figures ? `${figures.siteSales + figures.tillSales} ${figures.siteSales + figures.tillSales === 1 ? "sale" : "sales"}${figures.tillSales ? ` · ${figures.siteSales} website, ${figures.tillSales} ${fair?.fair ? `at ${fair.fair}` : "at the till"}` : ""}` : "Counting…"}
            </span>
            {figures && (
              <div className="rp-home-bars" role="img" aria-label={`Takings for the last ${BAR_DAYS} days, today last`}>
                {figures.bars.map((v, i) => (
                  <span key={i} style={{ height: `${max > 0 ? Math.max(8, (v / max) * 100) : 8}%` }} data-today={i === figures.bars.length - 1 || undefined} />
                ))}
              </div>
            )}
          </article>

          {combined && (
            <article className="rp-home-tile" data-tone="sky" aria-label="Selling today">
              <h3 className="rp-home-h3">Selling today</h3>
              {fairOn ? (
                <>
                  <span className="rp-home-line">{[fair.fair, fair.upload.text].filter(Boolean).join(" · ")}</span>
                  <strong className="rp-home-mid">{totalsText(fair.totals)}</strong>
                  <span className="rp-home-line">{fair.sales} {fair.sales === 1 ? "sale" : "sales"} · {fair.units} {w(fair.units === 1 ? "book" : "books")}</span>
                  {lowText(fair.low) && <span className="rp-home-line rp-home-foot"><strong>Running low:</strong> {lowText(fair.low)}</span>}
                </>
              ) : (
                <>
                  <span className="rp-home-line">Nothing rung up at the till today.</span>
                  <span className="rp-home-foot"><button type="button" className="rp-todo-go" onClick={onOpenTill}>Open till</button></span>
                </>
              )}
            </article>
          )}

          <article className="rp-home-card" aria-labelledby="home-latest">
            <div className="rp-home-card-head">
              <h3 className="rp-home-h3" id="home-latest">Latest orders</h3>
              <button type="button" className="rp-home-link" onClick={() => onOpen("orders")}>All orders →</button>
            </div>
            {!orders ? <p className="rp-home-empty">{ordersFailed ? "Couldn't load orders." : "Loading…"}</p>
              : !latest.length ? <p className="rp-home-empty">No orders yet.</p>
              : (
                <ul className="rp-home-rows">
                  {latest.map((o) => {
                    const pill = PILL[orderStatusWords(o)] || { tone: "neutral" as BadgeTone, word: orderStatusWords(o) };
                    return (
                      <li key={o.id} className="rp-home-order">
                        <a className="rp-mono" href={orderHref(o.id)}>{o.orderId ? `#${String(o.orderId).replace(/^#/, "")}` : "Order"}</a>
                        <span className="rp-home-name">{o.customer?.name || o.customer?.email || "Customer"}</span>
                        <span className="rp-home-money">{money(o.total ?? 0)}</span>
                        <StatusBadge tone={pill.tone} glyph={false}>{pill.word}</StatusBadge>
                      </li>
                    );
                  })}
                </ul>
              )}
          </article>

          <article className="rp-home-card" aria-labelledby="home-best">
            <h3 className="rp-home-h3" id="home-best">Best sellers this week</h3>
            {!orders ? <p className="rp-home-empty">{ordersFailed ? "Couldn't load orders." : "Loading…"}</p>
              : !best.length ? <p className="rp-home-empty">No website sales this week yet.</p>
              : (
                <ul className="rp-home-rows">
                  {best.map((b, i) => (
                    <li key={b.id} className="rp-home-best">
                      <span className="rp-home-initials" data-tone={i % 4} aria-hidden="true">{initials(b.title)}</span>
                      <span className="rp-home-name">{b.title}</span>
                      <span className="rp-mono rp-home-sold">{b.units} sold</span>
                    </li>
                  ))}
                </ul>
              )}
          </article>
        </div>
      </section>
    </div>
  );
}
