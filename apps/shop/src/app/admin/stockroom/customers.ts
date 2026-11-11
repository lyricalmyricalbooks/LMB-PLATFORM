// Stockroom › Customers: the buyers the stockroom's sales records name, grouped by email by the stockroom's own rule
// (`customer-list.js`, the one the old Customers tab uses), so a buyer is counted the same everywhere. Pure.
// Only recorded sales are read here. The old tab also folds in website orders it had scanned but not yet recorded and a
// pulled Stripe list; neither is stored in the shop's records, so neither appears here.
import { applyCustomerFilter, buildCustomerList, type Customer, type CustomerFilters } from "@stockroom/customer-list.js";
import { fmt } from "@stockroom/money.js";

import type { StockroomRecords } from "./stockroomData";

export type { Customer, CustomerFilters };
export const NO_CUSTOMER_FILTER: Required<CustomerFilters> = { search: "", bookId: "", channel: "", spend: "", orders: "" };

export function buildCustomers(records: StockroomRecords): { customers: Customer[]; noEmail: number } {
  const list = buildCustomerList({ books: Object.fromEntries(records.books.map((b) => [b.id, b])), states: records.states });
  return { customers: list, noEmail: list._noEmail };
}

export const filterCustomers = applyCustomerFilter;

/** "CA$60.00 · US$25.00": spend per currency, never added across currencies. */
export function spendLine(spend: Record<string, number>): string {
  return Object.keys(spend).sort().map((code) => fmt(spend[code], code)).join(" · ") || "—";
}

/** Sales per buyer as a plain sentence for the summary under the filters. */
export function customerSummary(total: number, shown: number, noEmail: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(total, "customer")} with an email${shown !== total ? `, ${shown} shown` : ""}${noEmail ? `. ${plural(noEmail, "sale")} had no email` : ""}`;
}
