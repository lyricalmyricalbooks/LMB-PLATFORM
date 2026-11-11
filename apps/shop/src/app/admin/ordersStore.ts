// The admin's shared copy of every order and the catalog the Orders desk reads, with no screen code, so the admin shell
// (the Orders badge) can load it without pulling in a page. OrdersDesk, OrderDetail and Home read and refresh it here.
import { adminApi } from "./api";
import { queueOf } from "./fulfillment";
import { mergeNewestPage, mergeOrder } from "./ordersDesk";
import { noteLoadedOrders, patchCachedOrder } from "./ordersCache";
import { buildCatalogSearchIndex, type CatalogSearchIndex } from "./orderSearch";

// Orders waiting on the publisher (the nav badge).
export const ACTION_QUEUES = ["Needs attention", "Ready to pack", "Ready to ship", "Ready for pickup", "Ready for local delivery"];
export const ordersNeedingWork = (orders: any[]) => orders.filter((o) => o.isTest !== true && !o.archivedAt && ACTION_QUEUES.includes(queueOf(o))).length;

// Loads every order (with fulfillment records) and remembers it. Minute-by-minute refreshes read only the newest page
// of orders; every FULL_REFRESH_MS (and on first load, after a failure, or when asked) the whole collection is read
// again to catch changes to older orders.
export const FULL_REFRESH_MS = 10 * 60 * 1000;
let remembered: any[] | null = null;
let lastFullLoadAt = 0;
export async function refreshOrdersCache({ incremental = false }: { incremental?: boolean } = {}) {
  let data: any[];
  if (incremental && remembered && Date.now() - lastFullLoadAt < FULL_REFRESH_MS) {
    data = mergeNewestPage(remembered, await adminApi.getRecentFulfillmentOrders());
  } else {
    data = await adminApi.getFulfillmentOrders();
    lastFullLoadAt = Date.now();
  }
  remembered = data;
  // The Orders desk refreshes through here every minute: the shell's badge check and the other screens reuse it.
  noteLoadedOrders(data);
  return data;
}

// One order just reloaded on its own page: keep the remembered list in step without a full reload.
export function patchOrdersCache(order: any) {
  remembered = mergeOrder(remembered, order);
  patchCachedOrder(order);
  return remembered;
}

// The catalog (public fields only), read once per session and shared by order search and the
// Orders desk covers. A failed read is forgotten so the next caller tries again.
let orderBooks: Promise<any[] | null> | null = null;
export function loadOrderBooks(): Promise<any[] | null> {
  if (!orderBooks) {
    orderBooks = adminApi.getAllBooks({ includePrivate: false })
      .catch(() => { orderBooks = null; return null; });
  }
  return orderBooks;
}

// Catalog ISBNs/SKUs/edition names for order search, read once per session the first time someone searches.
let catalogIndex: Promise<CatalogSearchIndex | null> | null = null;
export function loadOrderSearchCatalog(): Promise<CatalogSearchIndex | null> {
  if (!catalogIndex) {
    catalogIndex = loadOrderBooks()
      .then((books) => { if (!books) { catalogIndex = null; return null; } return buildCatalogSearchIndex(books); });
  }
  return catalogIndex;
}
