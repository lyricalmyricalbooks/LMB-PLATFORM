// Per-code performance from paid, non-test orders. Read-only.
// Revenue follows the Overview rule (overviewInsights.ts): the CAD order total, less partial refunds.
import { isRealPaidOrder, refundedAmount } from "./overview/overviewInsights";
export interface CodePerformance { orders: number; revenue: number; discountGiven: number; avgOrder: number; /** What to show: the code, or an automatic offer's title (its key is an opaque id). */ label: string }

export function discountPerformance(orders: any[]): Map<string, CodePerformance> {
  const map = new Map<string, CodePerformance>();
  for (const o of orders) {
    if (!isRealPaidOrder(o)) continue;
    // Automatic offers have no code: they are counted under "#<discount id>" (see perfKey).
    const applied = o.appliedDiscount || {};
    const code = applied.automatic && applied.id ? `#${applied.id}` : String(applied.code || "").trim().toUpperCase();
    if (!code) continue;
    const p = map.get(code) || { orders: 0, revenue: 0, discountGiven: 0, avgOrder: 0, label: applied.automatic ? String(applied.title || "").trim() || "Automatic offer" : code };
    p.orders += 1;
    p.revenue += Math.max(0, (Number(o.total) || 0) - refundedAmount(o));
    p.discountGiven += Number(o.discount) || 0;
    map.set(code, p);
  }
  map.forEach((p) => { p.avgOrder = p.orders ? p.revenue / p.orders : 0; });
  return map;
}

/** Where discountPerformance files a discount's results. */
export const perfKey = (d: any) => (d?.method === "automatic" ? `#${d.id}` : String(d?.code || "").toUpperCase());

/** Copy of a discount for "Duplicate": new unique-looking code, inactive, no usage, no id. */
export function duplicateDiscount(d: any, existingCodes: string[]) {
  const { id: _id, usageCount: _u, createdAt: _c, updatedAt: _up, _lastDoc: _l, ...copy } = d;
  // Automatic offers have no code to make unique; the copy gets its own title instead.
  // The copy starts without an expiry: an old end date would make it unusable (and unsaveable).
  if (d.method === "automatic") return { ...copy, code: "", title: `${d.title || "Automatic offer"} (copy)`, isActive: false, expiryDate: "" };
  const taken = new Set(existingCodes.map((c) => String(c).toUpperCase()));
  const base = String(d.code || "CODE").toUpperCase().replace(/-COPY\d*$/, "");
  let code = `${base}-COPY`;
  for (let i = 2; taken.has(code); i++) code = `${base}-COPY${i}`;
  const { id, usageCount, createdAt, updatedAt, _lastDoc, ...rest } = d;
  return { ...rest, code, isActive: false, expiryDate: "" };
}
