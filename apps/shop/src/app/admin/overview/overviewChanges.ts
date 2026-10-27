// Overview › "What changed": the few movements worth knowing about between the period and the one it is compared
// with, biggest first. Every line is computed from recorded orders/visits — no guesses. Pure; money is formatted by
// the caller so currency stays in one place.
import { bestSellers, change, refundedAmount, type Order, type PeriodTotals } from "./overviewInsights";
import { countryCode, countryName } from "../shippingCountries";

export interface Change { id: string; tone: "up" | "down" | "info" | "warn"; title: string; detail: string; weight: number }

const num = (v: unknown) => Number(v) || 0;
const pct = (n: number) => `${Math.abs(n).toFixed(0)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function titleRevenue(orders: Order[]): Map<string, { title: string; revenue: number; units: number }> {
  const m = new Map<string, { title: string; revenue: number; units: number }>();
  bestSellers(orders, 10_000).forEach(b => m.set(b.id, { title: b.title, revenue: b.revenue, units: b.units }));
  return m;
}

/** Orders store a country as a code ("CA") or a name ("Canada"); both count as one destination, keyed by its code. */
function countryRevenue(orders: Order[]): Map<string, number> {
  const m = new Map<string, number>();
  orders.forEach(o => {
    const raw = String(o.customer?.address?.country || o.shippingAddress?.country || "").trim();
    const c = raw ? countryCode(raw) || raw : "";
    if (c) m.set(c, (m.get(c) || 0) + Math.max(0, num(o.total) - refundedAmount(o)));
  });
  return m;
}

export function whatChanged(input: {
  cur: PeriodTotals; prev: PeriodTotals; current: Order[]; previous: Order[];
  visits?: { cur: number; prev: number } | null; before: string; money: (n: number) => string;
}): Change[] {
  const { cur, prev, current, previous, visits, before, money } = input;
  const out: Change[] = [];

  // 1 · Revenue, and what drove it (more orders or bigger baskets).
  const rev = change(cur.net, prev.net);
  if (rev !== null && prev.net > 0 && Math.abs(rev) >= 5) {
    const ordersMove = change(cur.orders, prev.orders) ?? 0;
    const aovMove = change(cur.aov, prev.aov) ?? 0;
    const driver = Math.abs(ordersMove) >= Math.abs(aovMove)
      ? `${ordersMove >= 0 ? "more" : "fewer"} orders (${plural(cur.orders, "order")} now, ${prev.orders.toLocaleString()} before)`
      : `${aovMove >= 0 ? "bigger" : "smaller"} baskets (${money(cur.aov)} an order now, ${money(prev.aov)} before)`;
    out.push({ id: "revenue", tone: rev > 0 ? "up" : "down", weight: Math.abs(cur.net - prev.net) + 1e6,
      title: `Revenue ${rev > 0 ? "rose" : "fell"} by ${pct(rev)}`,
      detail: `${money(cur.net)} now, ${money(prev.net)} in ${before}, mostly from ${driver}.` });
  } else if (prev.net === 0 && cur.net > 0) {
    out.push({ id: "revenue", tone: "up", weight: cur.net + 1e6, title: `Revenue of ${money(cur.net)}, none in ${before}`, detail: `${plural(cur.orders, "paid order")} now, none in ${before}.` });
  }

  // 2 · Titles: the biggest riser, the biggest faller, a new arrival.
  const now = titleRevenue(current), then = titleRevenue(previous);
  const ids = new Set([...now.keys(), ...then.keys()]);
  let riser: { id: string; d: number } | null = null, faller: { id: string; d: number } | null = null, fresh: { id: string; r: number } | null = null;
  ids.forEach(id => {
    const a = now.get(id)?.revenue || 0, b = then.get(id)?.revenue || 0, d = a - b;
    if (b === 0 && a > 0) { if (!fresh || a > fresh.r) fresh = { id, r: a }; return; }
    if (d > 0 && (!riser || d > riser.d)) riser = { id, d };
    if (d < 0 && (!faller || d < faller.d)) faller = { id, d };
  });
  const name = (id: string) => now.get(id)?.title || then.get(id)?.title || "A title";
  const titleMove = (id: string, d: number, kind: string) => {
    const a = now.get(id), b = then.get(id);
    return {
      title: `Sales of ${name(id)} ${d > 0 ? "rose" : "fell"} by ${money(Math.abs(d))}`,
      detail: `${money(a?.revenue || 0)} from ${plural(a?.units || 0, "copy", "copies")} now, ${money(b?.revenue || 0)} from ${(b?.units || 0).toLocaleString()} in ${before}. The biggest ${kind} among your titles.`,
    };
  };
  if (riser) { const r = riser as { id: string; d: number }; out.push({ id: `rise-${r.id}`, tone: "up", weight: r.d, ...titleMove(r.id, r.d, "rise") }); }
  if (faller) { const f = faller as { id: string; d: number }; out.push({ id: `fall-${f.id}`, tone: "down", weight: -f.d, ...titleMove(f.id, f.d, "drop") }); }
  if (fresh) { const n = fresh as { id: string; r: number }; out.push({ id: `new-${n.id}`, tone: "info", weight: n.r, title: `${name(n.id)} started selling`, detail: `${money(n.r)} from ${plural(now.get(n.id)?.units || 0, "copy", "copies")}, with no sales in ${before}.` }); }

  // 3 · Where it came from: the country that moved most.
  const cNow = countryRevenue(current), cThen = countryRevenue(previous);
  let country: { c: string; d: number } | null = null;
  new Set([...cNow.keys(), ...cThen.keys()]).forEach(c => { const d = (cNow.get(c) || 0) - (cThen.get(c) || 0); if (!country || Math.abs(d) > Math.abs(country.d)) country = { c, d }; });
  if (country && Math.abs((country as { c: string; d: number }).d) > 0 && cThen.size > 0) {
    const k = country as { c: string; d: number };
    out.push({ id: `country-${k.c}`, tone: k.d > 0 ? "up" : "down", weight: Math.abs(k.d) * 0.8, title: `Sales to ${countryName(k.c)} ${k.d > 0 ? "rose" : "fell"} by ${money(Math.abs(k.d))}`, detail: `${money(cNow.get(k.c) || 0)} now, ${money(cThen.get(k.c) || 0)} in ${before}. The biggest move by destination.` });
  }

  // 4 · Traffic and how well it converts.
  if (visits && visits.prev > 0 && visits.cur > 0) {
    const v = change(visits.cur, visits.prev) ?? 0;
    const convNow = (cur.orders / visits.cur) * 100, convThen = (prev.orders / visits.prev) * 100;
    if (Math.abs(v) >= 10) out.push({ id: "visits", tone: v > 0 ? "up" : "down", weight: Math.abs(v) * 10, title: `Visitors ${v > 0 ? "rose" : "fell"} by ${pct(v)}`, detail: `${plural(visits.cur, "visitor")} now, ${visits.prev.toLocaleString()} in ${before}.` });
    if (Math.abs(convNow - convThen) >= 0.5) out.push({ id: "conversion", tone: convNow > convThen ? "up" : "down", weight: Math.abs(convNow - convThen) * 200, title: `${convNow.toFixed(1)}% of visitors bought, ${convNow > convThen ? "up" : "down"} from ${convThen.toFixed(1)}%`, detail: `${plural(cur.orders, "paid order")} from ${plural(visits.cur, "visitor")} now; ${prev.orders.toLocaleString()} from ${visits.prev.toLocaleString()} in ${before}.` });
  }

  // 5 · Warnings: discounts eating into price, refunds.
  if (cur.subtotal > 0 && cur.discountRate - prev.discountRate >= 5) {
    out.push({ id: "discounts", tone: "warn", weight: cur.discounts, title: `Discounts took ${cur.discountRate.toFixed(0)}% off list price, up from ${prev.discountRate.toFixed(0)}%`,
      detail: `${money(cur.discounts)} off in codes and offers now, ${money(prev.discounts)} in ${before}.` });
  }
  if (cur.revenue > 0 && cur.refunded / cur.revenue >= 0.05) {
    out.push({ id: "refunds", tone: "warn", weight: cur.refunded * 2, title: `${money(cur.refunded)} refunded`,
      detail: `${((cur.refunded / cur.revenue) * 100).toFixed(0)}% of what customers paid now; ${money(prev.refunded)} refunded in ${before}.` });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 6);
}
