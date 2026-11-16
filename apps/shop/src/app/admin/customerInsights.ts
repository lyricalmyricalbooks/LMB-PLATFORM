// Builds a customer directory from paid, non-test orders. Read-only: nothing here
// writes to Firestore or affects charging. Lifetime value is net of refunds: a partial
// refund comes off (refundedAmount), and a fully refunded order counts as 0 but keeps the
// customer listed with that order in their history.
import { refundedAmount } from "./overview/overviewInsights";
import type { Booking } from "./bookingsApi";

/** "moved": brought over from the old shop, with no order here yet (plan 23.10). "booked": booked a time, no order yet. */
export type CustomerSegment = "vip" | "vip-lapsed" | "returning" | "new" | "at-risk" | "moved" | "booked";

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
  /** Their bookings (Bookings beta), newest first; only filled when the shop has Bookings. */
  bookings?: Booking[];
}

export const VIP_SPEND = 250;
export const AT_RISK_DAYS = 180;

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  vip: "VIP", "vip-lapsed": "VIP · lapsed", returning: "Returning", new: "New", "at-risk": "At risk", moved: "Not ordered here yet", booked: "Booked, no order yet",
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

/** Starts the note Bring customers over writes (shopMove.ts planCustomerNotes). */
export const MOVED_MARK = "Brought over from your old shop";

/**
 * Adds the customers brought over from the old shop who haven't ordered here yet (plan 23.10), from their private notes
 * (`customerNotes`, where Bring customers over keeps their email, name and place). They count in no figure:
 * customerStats counts buyers only.
 */
export function withMovedCustomers(rows: CustomerRow[], notes: { email?: string; name?: string; place?: string; note?: string }[]): CustomerRow[] {
  const known = new Set(rows.map((c) => c.key));
  const added: CustomerRow[] = [];
  for (const n of notes) {
    const email = String(n.email || "").trim();
    const key = email.toLowerCase();
    if (!key || known.has(key) || !String(n.note || "").includes(MOVED_MARK)) continue;
    known.add(key);
    added.push({
      key, email, name: String(n.name || ""), orderCount: 0, totalSpent: 0, avgOrder: 0, firstOrderAt: 0, lastOrderAt: 0,
      daysSinceLast: 0, segment: "moved", city: String(n.place || ""), country: "", orders: [],
    });
  }
  return added.length ? [...rows, ...added] : rows;
}

/**
 * Puts each person's bookings on their customer row (matched by email, any case), and adds the people who booked but
 * haven't ordered as "booked" customers. Like the moved customers, they count in no money figure.
 */
export function withBookings(rows: CustomerRow[], bookings: readonly Booking[]): CustomerRow[] {
  const byEmail = new Map<string, Booking[]>();
  for (const b of bookings) {
    const key = String(b.customer?.email || "").trim().toLowerCase();
    if (!key) continue;
    byEmail.set(key, [...(byEmail.get(key) || []), b]);
  }
  if (!byEmail.size) return rows;
  const newestFirst = (list: Booking[]) => [...list].sort((a, b) => b.start.localeCompare(a.start));
  const out = rows.map((c) => (byEmail.has(c.key) ? { ...c, bookings: newestFirst(byEmail.get(c.key)!) } : c));
  const known = new Set(rows.map((c) => c.key));
  for (const [key, list] of byEmail) {
    if (known.has(key)) continue;
    const sorted = newestFirst(list);
    // The name they gave on their latest booking.
    out.push({
      key, email: String(sorted[0].customer.email).trim(), name: sorted[0].customer.name || "", orderCount: 0, totalSpent: 0, avgOrder: 0,
      firstOrderAt: 0, lastOrderAt: 0, daysSinceLast: 0, segment: "booked", city: "", country: "", orders: [], bookings: sorted,
    });
  }
  return out;
}

/** A customer's bookings in plain words: "3 bookings · next Fri 21 Nov" or "2 bookings · last 4 Nov", "" without any. */
export function bookingsLine(bookings: readonly Booking[] | undefined, nowMs: number, dayText: (iso: string) => string): string {
  const kept = (bookings || []).filter((b) => b.status !== "cancelled");
  if (!kept.length) return "";
  const count = `${kept.length} booking${kept.length === 1 ? "" : "s"}`;
  const next = kept.filter((b) => Date.parse(b.end) > nowMs).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (next) return `${count} · next ${dayText(next.start)}`;
  const last = [...kept].sort((a, b) => b.start.localeCompare(a.start))[0];
  return `${count} · last ${dayText(last.start)}`;
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
