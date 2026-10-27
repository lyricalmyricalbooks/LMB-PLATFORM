// The maths behind six Overview widgets (19 October 2026): On the site right now, Sales with your notes, Pre-order
// tracker, Order map, Gift card money owed and Sold-out countdown. Pure: every figure comes from orders, books, carts
// and gift cards the board already loads; nothing here reads Firestore. The React side is OverviewNewLive.tsx.
import { orderDay, refundedAmount, isRealPaidOrder, addDays, type Book, type Order } from "./overviewInsights";
import { trackedStockRows, stockRowLabel } from "../stockRules";
import { linePreorderOpen, preorderActive, releaseDateOf } from "../../features/site/preorder";
import { isOwnOrder } from "../../lib/ownerDevice";
import { shopDayKey } from "../../lib/shopDay";

const MIN = 60_000;
const DAY = 86_400_000;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ts = (v: unknown) => { const t = new Date(v as any).getTime(); return Number.isNaN(t) ? 0 : t; };
const net = (o: Order) => Math.max(0, num(o.total) - refundedAmount(o));
const copies = (i: any) => Math.max(0, num(i?.quantity));

// ── On the site right now ─────────────────────────────────────────────────────────────────────────────────────────

/** A card or PayPal checkout started but not paid (not cancelled, not a test, not the owner trying the shop). */
export function isOpenCheckout(o: Order): boolean {
  if (!o || o.isTest === true || o.sandboxPayment === true || isOwnOrder(o)) return false;
  if (o.paymentStatus === "paid" || o.paymentStatus === "refunded") return false;
  const status = String(o.status || "").toLowerCase();
  if (status === "cancelled" || status === "canceled" || status === "abandoned") return false;
  const method = String(o.paymentMethod || o.paymentProvider || "").toLowerCase();
  return /stripe|card|paypal/.test(method);
}

export interface LiveNow { bags: number; checkout: number; bought: number; boughtTotal: number; lastBag: string | null }

/**
 * What is happening on the shop now. Bags = saved carts (with an email) changed in the last 30 minutes and not yet
 * bought; checkout = card/PayPal checkouts started in the last 30 minutes and not paid; bought = real paid orders in
 * the last `boughtMinutes` (an hour unless the caller asks for the same 30 minutes as the rest).
 */
export function liveNow(allOrders: Order[], carts: Array<Record<string, any>> | null, now = Date.now(), boughtMinutes = 60): LiveNow {
  const recentCarts = (carts || []).filter(c => c && c.recovered !== true && now - ts(c.updatedAt || c.createdAt) <= 30 * MIN && ts(c.updatedAt || c.createdAt) <= now + MIN);
  recentCarts.sort((a, b) => ts(b.updatedAt || b.createdAt) - ts(a.updatedAt || a.createdAt));
  const firstItem = recentCarts[0]?.items?.[0];
  const checkout = (allOrders || []).filter(o => isOpenCheckout(o) && now - ts(o.createdAt) <= 30 * MIN).length;
  const bought = (allOrders || []).filter(o => isRealPaidOrder(o) && !isOwnOrder(o) && now - ts(o.paidAt || o.createdAt) <= boughtMinutes * MIN);
  return {
    bags: recentCarts.length, checkout, bought: bought.length,
    boughtTotal: bought.reduce((s, o) => s + net(o), 0),
    lastBag: firstItem ? String(firstItem.title || firstItem.name || "").slice(0, 80) || null : null,
  };
}

// ── Sales with your notes ─────────────────────────────────────────────────────────────────────────────────────────

export interface SalesNote { id: string; day: string; text: string }
export const MAX_NOTES = 200;
export const MAX_NOTE_TEXT = 80;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Keeps only well-formed notes, trimmed, oldest day first, at most MAX_NOTES (the newest days win). */
export function cleanNotes(raw: unknown): SalesNote[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SalesNote[] = [];
  for (const n of raw) {
    if (!n || typeof n !== "object") continue;
    const id = String((n as any).id || "").slice(0, 40);
    const day = String((n as any).day || "");
    const text = String((n as any).text || "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_TEXT);
    if (!id || seen.has(id) || !DAY_KEY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || !text) continue;
    seen.add(id);
    out.push({ id, day, text });
  }
  out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id < b.id ? -1 : 1));
  return out.slice(Math.max(0, out.length - MAX_NOTES));
}

export const newNoteId = (now = Date.now(), rand = Math.random()) => `n${now.toString(36)}${Math.floor(rand * 1e6).toString(36)}`;

/** Net revenue per shop day, every day from start to end included (empty days are 0). */
export function dailyRevenue(paid: Order[], startKey: string, endKey: string): Array<{ day: string; revenue: number }> {
  const by = new Map<string, number>();
  for (const o of paid || []) { const k = orderDay(o.createdAt); if (k) by.set(k, (by.get(k) || 0) + net(o)); }
  const out: Array<{ day: string; revenue: number }> = [];
  for (let k = startKey, guard = 0; k <= endKey && guard < 800; k = addDays(k, 1), guard++) out.push({ day: k, revenue: by.get(k) || 0 });
  return out;
}

/**
 * What a noted day was followed by: revenue on that day and the 2 after it, against a usual 3 days (the average day
 * over the 28 days before the note, times 3). `complete` is false while those 3 days haven't all happened yet.
 */
export function noteEffect(paid: Order[], day: string, todayKey: string): { next3: number; usual: number; complete: boolean } {
  const by = new Map<string, number>();
  for (const o of paid || []) { const k = orderDay(o.createdAt); if (k) by.set(k, (by.get(k) || 0) + net(o)); }
  let next3 = 0, before = 0;
  for (let i = 0; i < 3; i++) next3 += by.get(addDays(day, i)) || 0;
  for (let i = 1; i <= 28; i++) before += by.get(addDays(day, -i)) || 0;
  return { next3, usual: (before / 28) * 3, complete: addDays(day, 2) <= todayKey };
}

// ── Pre-order tracker ─────────────────────────────────────────────────────────────────────────────────────────────

export interface PreorderRow { bookId: string; title: string; promised: number; run: number | null; release: string; full: boolean; left: number | null }

/**
 * Each book taking pre-orders now: copies promised (paid pre-order lines not yet released) against the copies it can
 * promise in all (stock left + promised, when stock is counted). `full` = 90% or more of those are promised.
 */
export function preorderRows(paid: Order[], books: Book[], now = new Date()): PreorderRow[] {
  const promised = new Map<string, number>();
  for (const o of paid || []) {
    for (const i of o.items || []) {
      if (!i || !i.preorder || !linePreorderOpen(i, now)) continue;
      promised.set(String(i.id), (promised.get(String(i.id)) || 0) + copies(i));
    }
  }
  return (books || [])
    .filter(b => b && b.status !== "draft" && b.status !== "archived" && preorderActive(b, now))
    .map(b => {
      const p = promised.get(String(b.id)) || 0;
      const rows = trackedStockRows([b]);
      const stock = rows.reduce((s, r) => s + r.stock, 0);
      const counted = b.trackInventory === true && rows.length > 0 && b.allowBackorder !== true;
      const run = counted ? stock + p : null;
      return { bookId: String(b.id), title: String(b.title || "Untitled"), promised: p, run, release: releaseDateOf(b), full: run !== null && run > 0 && p / run >= 0.9, left: counted ? stock : null };
    })
    .sort((a, b) => (a.release || "9999") < (b.release || "9999") ? -1 : (a.release || "9999") > (b.release || "9999") ? 1 : b.promised - a.promised);
}

// ── Order map ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** [lat, lon] of common Canadian and US cities, by lower-case name (+ "|" + province/state when names repeat). */
export const CITY_COORDS: Record<string, [number, number]> = {
  toronto: [43.65, -79.38], montreal: [45.5, -73.57], "montréal": [45.5, -73.57], vancouver: [49.28, -123.12], ottawa: [45.42, -75.7],
  calgary: [51.05, -114.07], edmonton: [53.55, -113.49], winnipeg: [49.9, -97.14], "quebec city": [46.81, -71.21], "québec": [46.81, -71.21], quebec: [46.81, -71.21],
  hamilton: [43.26, -79.87], halifax: [44.65, -63.58], victoria: [48.43, -123.37], saskatoon: [52.13, -106.67], regina: [50.45, -104.62],
  "st. john's": [47.56, -52.71], "st johns": [47.56, -52.71], "st. john’s": [47.56, -52.71], kitchener: [43.45, -80.49], waterloo: [43.46, -80.52], london: [42.98, -81.25],
  mississauga: [43.59, -79.64], brampton: [43.73, -79.76], markham: [43.86, -79.34], oakville: [43.47, -79.69], guelph: [43.55, -80.25],
  kingston: [44.23, -76.49], windsor: [42.31, -83.04], "thunder bay": [48.38, -89.25], sudbury: [46.49, -80.99], "greater sudbury": [46.49, -80.99],
  peterborough: [44.3, -78.32], barrie: [44.39, -79.69], "st. catharines": [43.16, -79.25], gatineau: [45.48, -75.7], sherbrooke: [45.4, -71.89],
  fredericton: [45.96, -66.64], moncton: [46.09, -64.78], "saint john": [45.27, -66.06], charlottetown: [46.24, -63.13], whitehorse: [60.72, -135.06],
  yellowknife: [62.45, -114.37], kelowna: [49.89, -119.5], burnaby: [49.25, -122.98], surrey: [49.19, -122.85], richmond: [49.17, -123.14], "north vancouver": [49.32, -123.07],
  "new york": [40.71, -74.01], "new york city": [40.71, -74.01], brooklyn: [40.68, -73.94], "los angeles": [34.05, -118.24], chicago: [41.88, -87.63],
  "san francisco": [37.77, -122.42], seattle: [47.61, -122.33], portland: [45.52, -122.68], boston: [42.36, -71.06], philadelphia: [39.95, -75.17],
  washington: [38.91, -77.04], "washington dc": [38.91, -77.04], baltimore: [39.29, -76.61], detroit: [42.33, -83.05], cleveland: [41.5, -81.69],
  pittsburgh: [40.44, -80.0], buffalo: [42.89, -78.88], minneapolis: [44.98, -93.27], denver: [39.74, -104.99], austin: [30.27, -97.74],
  houston: [29.76, -95.37], dallas: [32.78, -96.8], atlanta: [33.75, -84.39], miami: [25.76, -80.19], "new orleans": [29.95, -90.07],
  nashville: [36.16, -86.78], phoenix: [33.45, -112.07], "san diego": [32.72, -117.16], oakland: [37.8, -122.27], "salt lake city": [40.76, -111.89],
  "st. louis": [38.63, -90.2], "kansas city": [39.1, -94.58], providence: [41.82, -71.41], "new haven": [41.31, -72.92], burlington: [44.48, -73.21],
  "ann arbor": [42.28, -83.74], madison: [43.07, -89.4], milwaukee: [43.04, -87.91], columbus: [39.96, -83.0], cincinnati: [39.1, -84.51],
  indianapolis: [39.77, -86.16], richmond_va: [37.54, -77.44], "chapel hill": [35.91, -79.06], albuquerque: [35.08, -106.65], "las vegas": [36.17, -115.14],
};
/** Same-name cities in the other country (Richmond BC vs Virginia, London ON vs England is handled by country). */
const US_ONLY_ALIAS: Record<string, string> = { richmond: "richmond_va" };

export type CountryCode = "CA" | "US" | "other";
export function countryCode(country: unknown): CountryCode {
  const c = String(country || "").trim().toLowerCase().replace(/\./g, "");
  if (c === "ca" || c === "can" || c === "canada") return "CA";
  if (c === "us" || c === "usa" || c === "united states" || c === "united states of america" || c === "america") return "US";
  return "other";
}

/** The map box: longitude −130…−60, latitude 24…60, as 0–100 across and down. */
export const MAP_BOX = { west: -130, east: -60, south: 24, north: 60 };
export function project(lat: number, lon: number): { x: number; y: number } | null {
  if (lon < MAP_BOX.west || lon > MAP_BOX.east || lat < MAP_BOX.south || lat > MAP_BOX.north) return null;
  return { x: ((lon - MAP_BOX.west) / (MAP_BOX.east - MAP_BOX.west)) * 100, y: ((MAP_BOX.north - lat) / (MAP_BOX.north - MAP_BOX.south)) * 100 };
}

export interface CityPoint { key: string; city: string; region: string; country: CountryCode; orders: number; revenue: number; x: number | null; y: number | null }

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-'.])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

/** Paid orders grouped by city (city, province/state, country only; never the street). */
export function cityMap(orders: Order[]): { cities: CityPoint[]; elsewhere: Array<{ country: string; orders: number }>; unknown: number } {
  const cities = new Map<string, CityPoint>();
  const elsewhere = new Map<string, number>();
  let unknown = 0;
  for (const o of orders || []) {
    const a = o?.customer?.address || {};
    const cc = countryCode(a.country);
    const city = String(a.city || "").replace(/\s+/g, " ").trim();
    if (cc === "other") {
      const name = String(a.country || "").trim();
      if (!name) { unknown++; continue; }
      elsewhere.set(name, (elsewhere.get(name) || 0) + 1);
      continue;
    }
    if (!city) { unknown++; continue; }
    const region = String(a.state || a.province || "").trim().toUpperCase().slice(0, 20);
    const key = `${city.toLowerCase()}|${region}|${cc}`;
    let p = cities.get(key);
    if (!p) {
      const name = city.toLowerCase();
      const coords = CITY_COORDS[cc === "US" && US_ONLY_ALIAS[name] ? US_ONLY_ALIAS[name] : name];
      const at = coords ? project(coords[0], coords[1]) : null;
      p = { key, city: titleCase(city), region, country: cc, orders: 0, revenue: 0, x: at ? at.x : null, y: at ? at.y : null };
      cities.set(key, p);
    }
    p.orders += 1; p.revenue += net(o);
  }
  return {
    cities: [...cities.values()].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue),
    elsewhere: [...elsewhere.entries()].map(([country, n]) => ({ country, orders: n })).sort((a, b) => b.orders - a.orders),
    unknown,
  };
}

// ── Gift card money owed ──────────────────────────────────────────────────────────────────────────────────────────

export interface GiftOwed { owedMinor: number; cards: number; soldYearMinor: number; spentMinor: number; staleCards: number; staleMinor: number; total: number }

/**
 * Money still sitting on gift cards (in CAD cents): enabled, not test, not expired cards with a balance. "Sold this
 * year" = the starting value of cards issued this calendar year (Toronto). "Spent so far" = starting value minus what
 * is left, on every real card. "Never used" = cards still at their starting value after 6 months.
 */
export function giftOwed(cards: Array<Record<string, any>>, now = Date.now()): GiftOwed {
  const today = shopDayKey(now);
  const year = today.slice(0, 4);
  const out: GiftOwed = { owedMinor: 0, cards: 0, soldYearMinor: 0, spentMinor: 0, staleCards: 0, staleMinor: 0, total: 0 };
  for (const c of cards || []) {
    if (!c || c.isTest === true) continue;
    out.total += 1;
    const initial = Math.max(0, Math.floor(num(c.initialMinor)));
    const balance = Math.max(0, Math.floor(num(c.balanceMinor)));
    const created = ts(c.createdAt);
    if (created && shopDayKey(created).slice(0, 4) === year) out.soldYearMinor += initial;
    out.spentMinor += Math.max(0, initial - balance);
    const expired = typeof c.expiresOn === "string" && DAY_KEY.test(c.expiresOn) && c.expiresOn < today;
    if (c.enabled === false || expired || balance <= 0) continue;
    out.owedMinor += balance; out.cards += 1;
    if (balance >= initial && created && now - created > 182 * DAY) { out.staleCards += 1; out.staleMinor += balance; }
  }
  return out;
}

// ── Sold-out countdown ────────────────────────────────────────────────────────────────────────────────────────────

export const DEFAULT_LEAD_DAYS = 35;
export const cleanLeadDays = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 365 ? n : DEFAULT_LEAD_DAYS; };

export interface CountdownRow { key: string; bookId: string; label: string; stock: number; sold30: number; perDay: number; days: number; outOn: string; beforeReprint: boolean }

/**
 * Tracked print books and editions that sold in the last 30 days: days until the shelf is empty at that pace, the
 * day that falls on, and whether it is sooner than a reprint takes (`leadDays`). Soonest first.
 */
export function soldOutCountdown(paid: Order[], books: Book[], leadDays = DEFAULT_LEAD_DAYS, now = Date.now(), limit = 10): CountdownRow[] {
  const rows = trackedStockRows(books).filter(r => r.stock > 0 && !r.backorder);
  const sold = new Map<string, number>();
  const rowKey = (bookId: string, variantId: string | null) => `${bookId}|${variantId ?? ""}`;
  const hasEditions = new Set(rows.filter(r => r.variantId !== null).map(r => r.bookId));
  for (const o of paid || []) {
    const t = ts(o.createdAt);
    if (!t || now - t > 30 * DAY || t > now + DAY) continue;
    for (const i of o.items || []) {
      if (!i || i.digital === true || i.isDigital === true) continue;
      const id = String(i.id || "");
      const k = rowKey(id, hasEditions.has(id) ? (i.variantId != null ? String(i.variantId) : null) : null);
      sold.set(k, (sold.get(k) || 0) + copies(i));
    }
  }
  const today = shopDayKey(now);
  return rows
    .map(r => {
      const s30 = sold.get(rowKey(r.bookId, r.variantId)) || 0;
      const perDay = s30 / 30;
      const days = perDay > 0 ? r.stock / perDay : Infinity;
      return { key: rowKey(r.bookId, r.variantId), bookId: r.bookId, label: stockRowLabel(r), stock: r.stock, sold30: s30, perDay, days, outOn: Number.isFinite(days) ? addDays(today, Math.floor(days)) : "", beforeReprint: days <= leadDays };
    })
    .filter(r => r.sold30 > 0)
    .sort((a, b) => a.days - b.days || b.sold30 - a.sold30)
    .slice(0, limit);
}

/**
 * One set of words for "when should I reprint?", shared by Sold-out countdown and Running low: within a reprint's
 * wait = reprint now; within 1.5× the wait = plan one; later = fine; no recent sales = can't tell.
 */
export type ReprintState = "now" | "soon" | "fine" | "none";
export const reprintState = (days: number | null, leadDays: number): ReprintState =>
  days === null || !Number.isFinite(days) ? "none" : days <= leadDays ? "now" : days <= leadDays * 1.5 ? "soon" : "fine";
export const REPRINT_WORDS: Record<ReprintState, { glyph: string; word: string }> = {
  now: { glyph: "!", word: "Reprint now" }, soon: { glyph: "◐", word: "Plan a reprint" }, fine: { glyph: "✓", word: "Fine" }, none: { glyph: "–", word: "No recent sales" },
};

/** A typed number of reprint days: the number, or a sentence saying what's wrong (never silently clamped). */
export function readLeadDays(text: string): { days: number } | { error: string } {
  const t = String(text).trim();
  if (!/^\d+$/.test(t)) return { error: "Type a number of days from 1 to 365." };
  const n = Number(t);
  return n >= 1 && n <= 365 ? { days: n } : { error: "Type a number of days from 1 to 365." };
}

/** "Nov 23" for a shop day key. */
export const shortDay = (key: string) => (DAY_KEY.test(key) ? new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : "");
