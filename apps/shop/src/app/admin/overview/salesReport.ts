// Overview › "Download sales report (CSV)": the selected period's paid, non-test orders, day by day,
// then the period's best sellers. CAD, net of partial refunds. Pure and CSV-injection safe.
import { bestSellers, orderDay, refundedAmount, type Order } from "./overviewInsights";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
const row = (vals: unknown[]) => vals.map(cell).join(",");
const m = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const DAY = 86_400_000;

export function salesReportCsv(current: Order[], startKey: string, endKey: string): string {
  const days = new Map<string, { gross: number; refunded: number; orders: number; tax: number; shipping: number; discounts: number; copies: number }>();
  for (let t = Date.parse(`${startKey}T00:00:00Z`); t <= Date.parse(`${endKey}T00:00:00Z`); t += DAY) {
    days.set(new Date(t).toISOString().slice(0, 10), { gross: 0, refunded: 0, orders: 0, tax: 0, shipping: 0, discounts: 0, copies: 0 });
  }
  for (const o of current) {
    const d = days.get(orderDay(o.createdAt));
    if (!d) continue;
    d.orders += 1;
    d.gross += Number(o.total) || 0;
    d.refunded += refundedAmount(o);
    d.tax += Number(o.tax) || 0;
    d.shipping += Number(o.shipping) || 0;
    d.discounts += Number(o.discount) || 0;
    d.copies += (o.items || []).reduce((n: number, i: any) => n + (Number(i?.quantity) || 0), 0);
  }
  const lines = [row([`Sales report ${startKey} to ${endKey} (CAD, paid orders, test orders excluded)`]),
    row(["Date", "Orders", "Copies", "Gross revenue", "Refunded", "Net revenue", "Tax collected", "Shipping collected", "Discounts"])];
  const tot = { gross: 0, refunded: 0, orders: 0, tax: 0, shipping: 0, discounts: 0, copies: 0 };
  for (const [date, d] of days) {
    lines.push(row([date, d.orders, d.copies, m(d.gross), m(d.refunded), m(d.gross - d.refunded), m(d.tax), m(d.shipping), m(d.discounts)]));
    (Object.keys(tot) as Array<keyof typeof tot>).forEach((k) => { tot[k] += d[k]; });
  }
  lines.push(row(["Total", tot.orders, tot.copies, m(tot.gross), m(tot.refunded), m(tot.gross - tot.refunded), m(tot.tax), m(tot.shipping), m(tot.discounts)]));
  lines.push("", row(["Best sellers"]), row(["Title", "Copies", "Revenue (before order discounts)", "Share"]));
  for (const b of bestSellers(current, 50)) lines.push(row([b.title, b.units, m(b.revenue), `${b.share.toFixed(1)}%`]));
  return lines.join("\n");
}
