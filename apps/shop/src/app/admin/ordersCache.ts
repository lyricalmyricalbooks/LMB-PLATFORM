// One shared copy of every order (with its private fulfillment record) for the admin screens that only
// read orders: Overview, Customers, global search and the nav badge refresh. Loading the whole paginated
// orders collection is the heaviest read in the admin, so it happens once and is reused for a minute.
// A load already on its way is shared, never started twice. Call invalidateOrders() after changing an order.
import { adminApi } from "./api";
import { mergeOrder } from "./ordersDesk";

export const ORDERS_CACHE_MS = 60_000;

type Loader = () => Promise<any[]>;
const defaultLoader: Loader = () => adminApi.getFulfillmentOrders();

let loader: Loader = defaultLoader;
let cached: { orders: any[]; at: number } | null = null;
let inFlight: Promise<any[]> | null = null;
let generation = 0;

/**
 * Every order, newest first. Reuses a copy younger than `maxAgeMs` (default ORDERS_CACHE_MS) unless `force` is set;
 * `maxAgeMs: 0` reads again like `force`.
 */
export function getOrdersCached({ force = false, maxAgeMs = ORDERS_CACHE_MS, now = Date.now() }: { force?: boolean; maxAgeMs?: number; now?: number } = {}): Promise<any[]> {
  if (maxAgeMs <= 0) force = true;
  if (!force && cached && now - cached.at < maxAgeMs) return Promise.resolve(cached.orders);
  if (!force && inFlight) return inFlight;
  const gen = ++generation;
  const p = loader().then((orders) => {
    // A later load (forced, or after invalidate) wins; an older answer never overwrites it.
    if (gen === generation) cached = { orders, at: Date.now() };
    return orders;
  }).finally(() => { if (inFlight === p) inFlight = null; });
  inFlight = p;
  return p;
}

/** Forget the copy so the next read loads fresh orders (call after any order change). */
export function invalidateOrders() {
  cached = null;
  inFlight = null;
  generation++;
}

/** One order just reloaded on its own page: keep the shared copy in step, so nothing re-reads every order. */
export function patchCachedOrder(order: any) {
  if (cached && order?.id) cached = { ...cached, orders: mergeOrder(cached.orders, order) || cached.orders };
}

/** Orders just loaded outside this module (the Orders desk's refresh): they become the shared copy, so the shell and
 *  the other screens reuse them instead of reading every order again. */
export function noteLoadedOrders(orders: any[], now = Date.now()) {
  if (Array.isArray(orders)) cached = { orders, at: now };
}

/** The copy on hand right now, without loading (null when none). */
export function peekOrders(): any[] | null {
  return cached ? cached.orders : null;
}

/** Use a different loader (the shell routes loads through the Orders list memory). Tests reset with no argument. */
export function setOrdersLoader(next?: Loader) {
  loader = next || defaultLoader;
  invalidateOrders();
}
