// Builds a customer directory from paid, non-test orders. Read-only: nothing here
// writes to Firestore or affects charging. Lifetime value is net of refunds: a partial
// refund comes off (refundedAmount), and a fully refunded order counts as 0 but keeps the
// customer listed with that order in their history.
import { refundedAmount } from "./overview/overviewInsights";

export type CustomerSegment = "vip" | "vip-lapsed" | "returning" | "new" | "at-risk";

export interface CustomerRow {
  key: string; // lowercased email
  email: string;
  name: string;
  /** Paid orders (fully refunded ones are listed but not counted). */
  orderCount: number;
  /** Net spend after refunds (CAD). */
  totalSpent: number;
  avgOrder: number;
  firstOrderAt: number;
  lastOrderAt: number;
  daysSinceLast: number;
  segment: CustomerSegment;
  city: string;
  country: string;
  orders: any[];
}

export const VIP_SPEND = 250;
export const AT_RISK_DAYS = 180;

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  vip: "VIP", "vip-lapsed": "VIP · lapsed", returning: "Returning", new: "New", "at-risk": "At risk",
};

/** Lapsed big spenders are flagged ("VIP · lapsed") rather than hidden under VIP. */
export function segmentOf(orderCount: number, totalSpent: number, daysSinceLast: number): CustomerSegment {
  const vip = totalSpent >= VIP_SPEND || orderCount >= 5;
  const lapsed = daysSinceLast > AT_RISK_DAYS;
  if (vip) return lapsed ? "vip-lapsed" : "vip";
  if (lapsed) return "at-risk";
  return orderCount >= 2 ? "returning" : "new";
}

/** Copies on an order (lines × quantity). */
export const copiesOf = (o: any) => (o?.items || []).reduce((n: number, i: any) => n + (Number(i?.quantity) || 0), 0);

export function buildCustomers(orders: any[], now = Date.now()): CustomerRow[] {
  const map = new Map<string, CustomerRow>();
  for (const o of orders) {
    if (o?.isTest === true) continue;
    const paid = o?.paymentStatus === "paid";
    if (!paid && o?.paymentStatus !== "refunded") continue;
    const email = String(o.customer?.email || "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    const at = new Date(o.createdAt).getTime() || 0;
    const addr = o.shippingAddress || o.customer?.address || {};
    let c = map.get(key);
    if (!c) {
      c = {
        key, email, name: o.customer?.name || "", orderCount: 0, totalSpent: 0, avgOrder: 0,
        firstOrderAt: at, lastOrderAt: 0, daysSinceLast: 0, segment: "new",
        city: addr.city || "", country: addr.country || "", orders: [],
      };
      map.set(key, c);
    }
    c.orders.push(o);
    if (!paid) continue;
    c.orderCount += 1;
    c.totalSpent += Math.max(0, (Number(o.total) || 0) - refundedAmount(o));
    if (at && (!c.firstOrderAt || at < c.firstOrderAt)) c.firstOrderAt = at;
    if (at >= c.lastOrderAt) {
      c.lastOrderAt = at;
      if (o.customer?.name) c.name = o.customer.name;
      if (addr.city) c.city = addr.city;
      if (addr.country) c.country = addr.country;
    }
  }
  const rows = Array.from(map.values());
  for (const c of rows) {
    if (!c.lastOrderAt) c.lastOrderAt = Math.max(0, ...c.orders.map((o) => new Date(o.createdAt).getTime() || 0));
    c.avgOrder = c.orderCount ? c.totalSpent / c.orderCount : 0;
    c.daysSinceLast = c.lastOrderAt ? Math.max(0, Math.floor((now - c.lastOrderAt) / 86400000)) : 0;
    c.segment = segmentOf(c.orderCount, c.totalSpent, c.daysSinceLast);
    c.orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return rows;
}

export function customerStats(rows: CustomerRow[]) {
  const buyers = rows.filter((c) => c.orderCount > 0);
  const total = buyers.length;
  const repeat = buyers.filter((c) => c.orderCount >= 2).length;
  const revenue = buyers.reduce((s, c) => s + c.totalSpent, 0);
  return {
    total,
    repeat,
    repeatRate: total ? repeat / total : 0,
    avgLtv: total ? revenue / total : 0,
    revenue,
  };
}

/** Marketing consent: on the newsletter list and not opted out. "unknown" when opt-outs can't be read. */
export type Consent = "subscribed" | "opted-out" | "none";
export function consentOf(email: string, subscribed: Set<string>, optedOut: Set<string> | null, emailHash?: string): Consent {
  if (optedOut && emailHash && optedOut.has(emailHash)) return "opted-out";
  return subscribed.has(String(email || "").trim().toLowerCase()) ? "subscribed" : "none";
}
export const CONSENT_LABELS: Record<Consent, string> = { subscribed: "Subscribed", "opted-out": "Opted out", none: "Not subscribed" };

/** Tags typed as "a, b , a" → ["a", "b"] (trimmed, de-duplicated, max 20 of 40 chars). */
export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of String(input || "").split(",")) {
    const t = raw.trim().slice(0, 40);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 20);
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;

export function customersToCsv(rows: CustomerRow[], consent?: (c: CustomerRow) => Consent, tags?: (c: CustomerRow) => string[]): string {
  const head = ["Email", "Name", "Segment", "Orders", "Total spent (net)", "Avg order", "First order", "Last order", "City", "Country", "Consented to marketing", "Tags"];
  const lines = rows.map((c) => [
    c.email, c.name, SEGMENT_LABELS[c.segment], c.orderCount, c.totalSpent.toFixed(2), c.avgOrder.toFixed(2),
    c.firstOrderAt ? new Date(c.firstOrderAt).toISOString().slice(0, 10) : "",
    c.lastOrderAt ? new Date(c.lastOrderAt).toISOString().slice(0, 10) : "", c.city, c.country,
    consent ? (consent(c) === "subscribed" ? "Yes" : "No") : "", tags ? tags(c).join("; ") : "",
  ].map(csvCell).join(","));
  return [head.map(csvCell).join(","), ...lines].join("\n");
}

/** Distinct countries across customers, most customers first. */
export function customerCountries(rows: CustomerRow[]): { country: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of rows) if (c.country) m.set(c.country, (m.get(c.country) || 0) + 1);
  return Array.from(m, ([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}
