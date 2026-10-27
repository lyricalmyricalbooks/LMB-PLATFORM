// Orders table view: the one filter behind both the rows and the tab counts, so a tab's
// number always matches the list you get when you open it. Pure, tested.
import { queueOf, WORK_QUEUES } from "./fulfillment";
import { orderMatches, type CatalogSearchIndex } from "./orderSearch";
import { isArchived, orderTime } from "./orderListHelpers";

export type OrderTypeFilter = "production" | "test" | "all";
export type TableFilters = { orderType: OrderTypeFilter; range: string; query: string; catalog?: CatalogSearchIndex | null; now?: number };

/** Everything the table filters by except the tab itself (type, date range, search, archive). */
export function baseOrders(orders: any[], f: TableFilters, tab: string): any[] {
  const now = f.now ?? Date.now();
  return (orders || []).filter((o) => {
    if (!o) return false;
    if (isArchived(o) && tab !== "All orders") return false;
    if (f.orderType === "test" && o.isTest !== true) return false;
    if (f.orderType === "production" && o.isTest === true) return false;
    if (f.range !== "all" && now - orderTime(o) > Number(f.range) * 86400000) return false;
    return orderMatches(o, f.query, f.catalog);
  });
}

export function tabOrders(orders: any[], f: TableFilters, tab: string): any[] {
  return baseOrders(orders, f, tab).filter((o) => tab === "All orders" || queueOf(o) === tab);
}

/** Per-tab counts under the same filters as the rows. */
export function tabCountsFor(orders: any[], f: TableFilters): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tab of WORK_QUEUES) counts[tab] = tabOrders(orders, f, tab).length;
  return counts;
}
