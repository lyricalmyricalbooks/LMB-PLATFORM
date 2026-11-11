// Stockroom › one book › Break-even: the old stockroom's dashboard block (renderBreakEvenBlock), worked out by its own
// rule (breakeven.js): the production cost against the revenue taken so far, and the copies still to sell. Book shops only.
import { calculateBreakEven } from "@stockroom/breakeven.js";

import { MetricCard, SectionCard } from "../riso/components";
import { money, type ItemStock } from "./stock";

type Row = Record<string, any>;

/** The figures the card shows, or null when the book has no production cost set. */
export function breakEvenOf(item: Pick<ItemStock, "revenue" | "sold" | "onHand" | "currency">, book: Row | null) {
  const cost = Number(book?.productionCost) || 0;
  if (!(cost > 0)) return null;
  return { cost, ...calculateBreakEven({ cost, recognizedRev: item.revenue, listPrice: Number(book?.listPrice) || 0, sold: item.sold, stock: item.onHand, currency: item.currency }) };
}

export function BreakEvenCard({ item, book }: { item: ItemStock; book: Row | null }) {
  const be = breakEvenOf(item, book);
  if (!be) return null;
  return (
    <SectionCard title={be.broken ? "Broken even" : "Break-even"}>
      <div className="rp-stock-metrics">
        <MetricCard label="Still to recover" value={be.broken ? "Done" : money(be.remaining, item.currency)} tone={be.broken ? "gold" : undefined} footer={`of ${money(be.cost, item.currency)} production cost`} />
        <MetricCard label="Recovered" value={`${Math.round(be.pctBe)}%`} footer={`${money(item.revenue, item.currency)} taken so far`} />
      </div>
      <div role="progressbar" aria-label="Production cost recovered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(be.pctBe)} className="rp-stock-bar"><span style={{ width: `${be.pctBe}%` }} /></div>
      <p className="rp-stock-note">{be.primaryExplanation}</p>
      {!be.broken && be.paceNote && <p className="rp-stock-note">{be.paceNote}</p>}
      {!be.broken && be.stockNote && <p className="rp-stock-note">{be.stockNote}</p>}
    </SectionCard>
  );
}
