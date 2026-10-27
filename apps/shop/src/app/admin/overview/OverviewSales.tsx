import { useMemo, useState, type ReactNode } from "react";
import { EmptyState, GhostButton, SectionCard } from "../riso/components";
import { bestSellers, formatMix, topCountries, totals, unitsById, type Book, type Order } from "./overviewInsights";
import { categoryBreakdown, categoryNames, weekdayMix, type Daily } from "./overviewTraffic";
import { discountPerformance } from "../discountPerformance";
import { hourHeatmap, operations } from "./overviewCohorts";
import { OrdersDrill } from "./OverviewDrill";
import {
  copiesOf, discountedOrders, ordersInCategory, giftCardOrders, hoursToShip, ordersInCurrency, ordersOnWeekday, ordersPaidBy, ordersToCountry, ordersWithBook,
  ordersWithCode, ordersWithFormat, refundedOrders, shipTimeText, shippedSlowestFirst,
} from "./overviewDrill";
import { SPLIT, StatRow, money, percent } from "./OverviewParts";
import { Columns, HeatGrid, RankBars, Stack, Waterfall, type FallStep } from "./OverviewViz";
import { smallPhotoUrl } from "../../features/site/photoSources";

/** Overview › Dig deeper › Sales: what is selling, in which format, where, when and at what discount. */
export function OverviewSales({ current, previous, books, categoriesSetting, dailyCurrent, onEditBook, fetchingBookId, only }: {
  /** Show just one panel (an Overview board widget): best, money, formats, countries, categories, weekdays, hours, fulfilment or codes. */
  only?: string;
  current: Order[]; previous: Order[]; books: Book[]; categoriesSetting: unknown; dailyCurrent: Daily[];
  onEditBook: (id: string) => void; fetchingBookId: string | null;
}) {
  const cur = useMemo(() => totals(current), [current]);
  const best = useMemo(() => bestSellers(current, 5), [current]);
  const prevUnits = useMemo(() => unitsById(previous), [previous]);
  // The period before, for the hatched bars and the rank movement.
  const prevBest = useMemo(() => bestSellers(previous, 1000), [previous]);
  const formats = useMemo(() => formatMix(current, books), [current, books]);
  const prevFormats = useMemo(() => formatMix(previous, books), [previous, books]);
  const countries = useMemo(() => topCountries(current), [current]);
  const prevCountries = useMemo(() => new Map(topCountries(previous, 1000).map(c => [c.country, c.revenue])), [previous]);
  const prevWeekdays = useMemo(() => weekdayMix(previous), [previous]);
  const bookById = useMemo(() => new Map(books.map(b => [b.id, b])), [books]);
  const fall = useMemo(() => moneySteps(cur), [cur]);
  const categories = useMemo(() => categoryBreakdown(current, books, categoryNames(categoriesSetting), dailyCurrent), [current, books, categoriesSetting, dailyCurrent]);
  const weekdays = useMemo(() => weekdayMix(current), [current]);
  const codes = useMemo(() => [...discountPerformance(current).entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5), [current]);
  const heat = useMemo(() => hourHeatmap(current), [current]);
  const ops = useMemo(() => operations(current), [current]);
  const show = (id: string) => !only || only === id;
  const hoursText = (h: number | null) => (h === null ? "—" : h < 48 ? `${Math.round(h)} hours` : `${(h / 24).toFixed(1)} days`);

  return (
    <div className="rp-split" style={SPLIT}>
      {show("best") && <SectionCard flush title="Best sellers" description="Top titles by revenue, with units against the period before">
        {best.length === 0 ? <EmptyState title="No sales in this period" description="Your top titles appear once paid orders arrive." /> : (
          <RankBars label="Best selling titles by revenue, the period before hatched" rows={best.map((b, i) => {
            const before = prevBest.findIndex(p => p.id === b.id);
            const unitsBefore = prevUnits.get(b.id) || 0;
            const book = bookById.get(b.id);
            return {
              key: b.id, label: <><span className="rp-mono">{i + 1}. </span>{b.title}</>,
              value: b.revenue, prev: before >= 0 ? prevBest[before].revenue : 0,
              valueText: `${money(b.revenue)} · ${b.units} sold`,
              sub: `${b.share.toFixed(0)}% of revenue · ${unitsBefore === 0 ? "none sold before" : `${unitsBefore} sold the period before`}`,
              cover: book ? smallPhotoUrl(book.photos?.[0], 64) || null : null, coverText: b.title,
              move: before < 0 ? "new" as const : before - i,
              details: (
                <>
                  <GhostButton size="sm" onClick={() => onEditBook(b.id)} disabled={fetchingBookId === b.id} aria-label={`Edit ${b.title}`} style={{ paddingLeft: 0 }}>Edit book</GhostButton>
                  <OrdersDrill label={b.title} books={false} orders={ordersWithBook(current, b.id)} extra={o => `${copiesOf(o, b.id)} cop${copiesOf(o, b.id) === 1 ? "y" : "ies"} of this title`} />
                </>
              ),
            };
          })} />
        )}
      </SectionCard>}

      {show("money") && <SectionCard flush title="Where the money goes" description="What customers paid, broken down">
        {cur.orders === 0 ? <EmptyState title="No sales in this period" description="The breakdown appears once paid orders arrive." /> : (
          <>
          <Waterfall label="From books sold to what you received" format={money} steps={fall} />
          <p className="rp-hint" style={{ margin: "0 20px 12px" }}>
            Customers paid {money(cur.revenue)}{cur.refunded > 0 ? `; after ${money(cur.refunded)} refunded` : ""}, so you received <strong>{money(cur.net)}</strong>. Of that, {money(cur.tax)} is sales tax owed to the tax office and {money(cur.shipping)} pays for postage.
          </p>
          <Fold label="the lines">
          <ul className="rp-list" aria-label="Revenue breakdown">
            <StatRow label="Books" hint="before discounts" value={money(cur.subtotal)} details={<OrdersDrill label="Orders in this period" orders={current} />} />
            <StatRow label="Discounts" hint={`${percent(cur.discountRate)} of list price`} value={`− ${money(cur.discounts)}`} details={<OrdersDrill label="Orders with a discount" orders={discountedOrders(current)} extra={discountName} empty="No order had a discount in this period." />} />
            <StatRow label="Shipping charged" value={money(cur.shipping)} />
            <StatRow label="Sales tax collected" hint="owed to the tax office; included in what customers paid" value={money(cur.tax)} />
            {cur.giftCards > 0 && <StatRow label="Paid with gift cards" hint="not in the card/PayPal total below" value={`− ${money(cur.giftCards)}`} details={<OrdersDrill label="Orders paid with gift cards" orders={giftCardOrders(current)} extra={o => `${money(Number(o.giftCardAmount) || 0)} on gift cards`} />} />}
            <StatRow label="Paid by customers" hint="card, PayPal and other payments, with tax and shipping" value={money(cur.revenue)} />
            <StatRow label="Refunded" hint="partial refunds" value={cur.refunded > 0 ? `− ${money(cur.refunded)}` : money(0)} tone={cur.refunded > 0 ? "danger" : "muted"} details={cur.refunded > 0 ? <OrdersDrill label="Partly refunded orders" orders={refundedOrders(current)} /> : undefined} />
            <StatRow label="Net received" hint="after refunds; the revenue figures on this page" value={<strong>{money(cur.net)}</strong>} />
            <StatRow label="Net received without sales tax" hint="approximate: refunds are not split into tax" value={money(Math.max(0, cur.net - cur.tax))} />
            {cur.giftCardsSold > 0 && <StatRow label="Gift cards sold" hint="counted above, but not earned until the card is spent" value={money(cur.giftCardsSold)} tone="muted" />}
          </ul>
          </Fold>
          </>
        )}
      </SectionCard>}

      {show("formats") && <SectionCard flush title="Format mix"
        description={formats.total > 0 ? `${formats.printShare.toFixed(0)}% print · ${formats.digitalShare.toFixed(0)}% digital` : "Revenue by book format"}>
        {formats.formats.length === 0 ? <EmptyState title="No sales in this period" description="Print vs digital revenue shows here once books sell." /> : (
          <>
            <Stack label="Revenue by format, this period and the period before" unit={money}
              parts={formats.formats.map(f => ({ key: f.format, label: f.format, value: f.revenue }))}
              prev={prevFormats.formats.map(f => ({ key: f.format, label: f.format, value: f.revenue }))} />
            <Fold label="orders by format">
              <ul className="rp-list" aria-label="Revenue by format">
                {formats.formats.map(f => (
                  <StatRow key={f.format} label={f.format} hint={`${f.units} sold`} value={money(f.revenue)}
                    details={<OrdersDrill label={`${f.format} orders`} orders={ordersWithFormat(current, books, f.format)} />} />
                ))}
              </ul>
            </Fold>
          </>
        )}
      </SectionCard>}

      {show("countries") && <SectionCard flush title="Where readers are" description="Top destinations by revenue">
        {countries.length === 0 ? <EmptyState title="No orders in this period" description="Countries appear once paid orders arrive." /> : (
          <RankBars label="Top countries by revenue, the period before hatched" rows={countries.map(c => ({
            key: c.country, label: c.country, value: c.revenue, prev: prevCountries.get(c.country) || 0, tone: "info" as const,
            valueText: money(c.revenue),
            sub: `${c.orders} order${c.orders === 1 ? "" : "s"} · ${cur.revenue > 0 ? Math.round((c.revenue / cur.revenue) * 100) : 0}% of sales`,
            details: <OrdersDrill label={`Orders to ${c.country}`} orders={ordersToCountry(current, c.country)} />,
          }))} />
        )}
      </SectionCard>}

      {show("categories") && <SectionCard flush title="Categories" description="Sales and recorded visits in this period">
        {categories.every(c => c.sold === 0 && c.views === 0) ? <EmptyState title="Nothing in this period" description="Categories with visits or sales will be listed here." /> : (
          <ul className="rp-list" aria-label="Categories">
            {categories.map(cat => (
              <StatRow key={cat.name} label={cat.name} hint={`${cat.views.toLocaleString()} visits`}
                value={<span style={{ display: "block", textAlign: "right" }}>{money(cat.revenue)}<span className="rp-hint" style={{ display: "block" }}>{cat.sold} sold</span></span>}
                details={cat.sold > 0 ? <OrdersDrill label={`${cat.name} orders`} orders={ordersInCategory(current, books, cat.name)} /> : undefined} />
            ))}
          </ul>
        )}
      </SectionCard>}

      {show("weekdays") && <SectionCard flush title="Busiest days" description="Orders by day of the week (Toronto time)">
        {cur.orders === 0 ? <EmptyState title="No orders in this period" description="Weekdays fill in as orders arrive." /> : (
          <>
            <Columns label="Orders by day of the week" items={weekdays.map(d => ({
              key: d.day, label: d.day, value: d.orders, prev: prevWeekdays.find(p => p.day === d.day)?.orders || 0,
              title: `${d.day}: ${d.orders} order${d.orders === 1 ? "" : "s"} · ${money(d.revenue)}`,
            }))} />
            <p className="rp-hint" style={{ margin: "0 20px 12px" }}>Solid = this period (the busiest day darkest) · hatched = the period before.</p>
            <Fold label="orders by day">
              <ul className="rp-list" aria-label="Orders by weekday">
                {weekdays.map(d => <StatRow key={d.day} label={d.day} hint={money(d.revenue)} value={`${d.orders} order${d.orders === 1 ? "" : "s"}`}
                  details={d.orders > 0 ? <OrdersDrill label={`${d.day} orders`} orders={ordersOnWeekday(current, d.day)} /> : undefined} />)}
              </ul>
            </Fold>
          </>
        )}
      </SectionCard>}

      {show("hours") && <SectionCard title="Busiest hours" description="Orders by weekday and hour (Toronto time) — when to post, send newsletters or launch">
        {cur.orders === 0 ? <EmptyState title="No orders in this period" description="The grid fills in as orders arrive." /> : (
          <HeatGrid label="Orders by weekday and hour, Toronto time" rows={heat.grid} max={heat.max} />
        )}
      </SectionCard>}

      {show("fulfilment") && <SectionCard flush title="Fulfilment & payments" description="How fast paid orders ship, and how customers pay">
        {cur.orders === 0 ? <EmptyState title="No orders in this period" description="Shipping speed and payment methods appear once orders arrive." /> : (
          <ul className="rp-list" aria-label="Fulfilment and payments">
            <StatRow label="Typical time to ship" hint={ops.shipped ? `median from payment to dispatch, ${ops.shipped} shipped order${ops.shipped === 1 ? "" : "s"}` : "no order shipped yet in this period"} value={hoursText(ops.medianHoursToShip)}
              details={ops.shipped ? <OrdersDrill label="Shipped orders, slowest first" books={false} orders={shippedSlowestFirst(current)} extra={o => shipTimeText(hoursToShip(o) as number)} /> : undefined} />
            <StatRow label="Shipped within 2 days" value={ops.within2DaysRate === null ? "—" : percent(ops.within2DaysRate, 0)} />
            {ops.payments.map(p => <StatRow key={p.key} label={`Paid by ${p.key}`} hint={`${p.orders} order${p.orders === 1 ? "" : "s"}`} value={money(p.revenue)} details={<OrdersDrill label={`Paid by ${p.key}`} orders={ordersPaidBy(current, p.key)} />} />)}
            {ops.currencies.length > 1 && ops.currencies.map(c => <StatRow key={c.key} label={`Checked out in ${c.key}`} hint={`${c.orders} order${c.orders === 1 ? "" : "s"} · shown in CA$`} value={money(c.revenue)} tone="muted" details={<OrdersDrill label={`Checked out in ${c.key}`} orders={ordersInCurrency(current, c.key)} />} />)}
            {ops.partlyRefunded > 0 && <StatRow label="Partly refunded orders" value={ops.partlyRefunded} tone="danger" details={<OrdersDrill label="Partly refunded orders" orders={current.filter(o => Number(o.refundedAmountMinor) > 0)} />} />}
          </ul>
        )}
      </SectionCard>}

      {show("codes") && <SectionCard flush title="Discount codes" description="Orders that used a code in this period">
        {codes.length === 0 ? <EmptyState title="No codes used" description="Codes customers apply at checkout are ranked here." /> : (
          <ul className="rp-list" aria-label="Discount code results">
            {codes.map(([code, p]) => (
              <StatRow key={code} label={code.startsWith("#") ? <span>{p.label}</span> : <span className="rp-mono">{p.label}</span>}
                hint={`${p.orders} order${p.orders === 1 ? "" : "s"} · avg ${money(p.avgOrder)} · ${money(p.discountGiven)} given away`} value={money(p.revenue)}
                details={<OrdersDrill label={`Orders with ${p.label}`} orders={ordersWithCode(current, code)} />} />
            ))}
          </ul>
        )}
      </SectionCard>}
    </div>
  );
}

const discountName = (o: { appliedDiscount?: any }) => {
  const a = o.appliedDiscount || {};
  return a.automatic ? String(a.title || "automatic offer") : a.code ? `code ${String(a.code).toUpperCase()}` : undefined;
};

/** A "Show …" button that folds away the plain lines (and their order drills) under a chart. */
function Fold({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--rp-divider)" }}>
      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" aria-expanded={open} onClick={() => setOpen(v => !v)} style={{ margin: "6px 14px" }}>
        <span aria-hidden="true" className="rp-ov-drill-mark">{open ? "▾" : "▸"}</span>{open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open && children}
    </div>
  );
}

/**
 * Where the money goes as steps: books at list price, less codes, plus shipping and tax, less gift cards (= what
 * customers paid by card/PayPal), less refunds = net received. Anything the order totals don't explain (rounding,
 * older orders saved without a breakdown) is its own "Rounding & adjustments" step, so the last column always equals the net figure.
 */
export function moneySteps(cur: { subtotal: number; discounts: number; shipping: number; tax: number; giftCards: number; revenue: number; refunded: number; net: number }): FallStep[] {
  const steps: FallStep[] = [{ key: "books", label: "Books", hint: "list price", value: cur.subtotal, kind: "total" }];
  if (cur.discounts > 0) steps.push({ key: "codes", label: "Codes", hint: "discounts", value: cur.discounts, kind: "minus" });
  if (cur.shipping > 0) steps.push({ key: "ship", label: "Shipping", hint: "postage charged", value: cur.shipping, kind: "plus", passThrough: true });
  if (cur.tax > 0) steps.push({ key: "tax", label: "Tax", hint: "sales tax collected", value: cur.tax, kind: "plus", passThrough: true });
  if (cur.giftCards > 0) steps.push({ key: "gift", label: "Gift cards", hint: "paid by gift card", value: cur.giftCards, kind: "minus" });
  const other = Math.round((cur.revenue - (cur.subtotal - cur.discounts + cur.shipping + cur.tax - cur.giftCards)) * 100) / 100;
  if (Math.abs(other) >= 0.01) steps.push({ key: "other", label: "Rounding & adjustments", hint: "cents, older orders", value: Math.abs(other), kind: other > 0 ? "plus" : "minus" });
  if (cur.refunded > 0) steps.push({ key: "refunds", label: "Refunds", hint: "partial", value: cur.refunded, kind: "minus" });
  steps.push({ key: "net", label: "Received", hint: "after refunds", value: cur.net, kind: "total" });
  return steps;
}
