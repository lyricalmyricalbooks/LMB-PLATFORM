// Studio › Style › Shop page heading & filters › Book order › "Keep the shopper's search, sort and filters in the
// page address" (`catalogStateInUrl`, off by default). Like Shopify collection URLs (?sort_by=…&filter…): Back from
// a book returns to the same view, and a filtered shop can be bookmarked or shared. Pure helpers; MainSite reads the
// address once and then rewrites it in place (never a new history entry).
import { MAX_SEARCH_QUERY } from "./searchResultsLink";
import { EMPTY_FILTERS, FORMAT_ORDER, SORT_OPTIONS, type CatalogFilterState, type FormatKey, type SortKey } from "./CatalogControls";

export function catalogStateInUrlOn(design: any): boolean {
  return design?.catalogStateInUrl === true;
}

export type CatalogUrlState = { query: string; sort: SortKey; inStockOnly: boolean; filters: CatalogFilterState };

export const DEFAULT_SORT: SortKey = "featured";
/** Every parameter this feature owns; anything else in the address (discount links, campaign tags…) is left alone. */
const OWN_KEYS = ["q", "sort", "stock", "sale", "format", "min", "max"];
const PRICE_RE = /^\d{1,7}(\.\d{1,2})?$/;

const cleanPrice = (value: string | null): string => {
  const text = String(value ?? "").trim();
  return PRICE_RE.test(text) ? text : "";
};

/** What the address asks for; unknown or malformed values fall back to the defaults. */
export function readCatalogUrl(search: string): CatalogUrlState {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { params = new URLSearchParams(); }
  const sortParam = params.get("sort") || "";
  const sort = SORT_OPTIONS.some(o => o.key === sortParam) ? (sortParam as SortKey) : DEFAULT_SORT;
  const formats = (params.get("format") || "").split(",").map(s => s.trim()).filter((key): key is FormatKey => FORMAT_ORDER.includes(key as FormatKey));
  return {
    query: (params.get("q") || "").trim().slice(0, MAX_SEARCH_QUERY),
    sort,
    inStockOnly: params.get("stock") === "1",
    filters: {
      ...EMPTY_FILTERS,
      formats: FORMAT_ORDER.filter(key => formats.includes(key)),
      minPrice: cleanPrice(params.get("min")),
      maxPrice: cleanPrice(params.get("max")),
      onSale: params.get("sale") === "1",
    },
  };
}

/**
 * The address's query string for this state: this feature's parameters replaced (defaults left out), every other
 * parameter kept in place. Returns "" or "?…".
 */
export function catalogUrlSearch(currentSearch: string, state: CatalogUrlState): string {
  let params: URLSearchParams;
  try { params = new URLSearchParams(currentSearch); } catch { params = new URLSearchParams(); }
  for (const key of OWN_KEYS) params.delete(key);
  const query = state.query.trim().slice(0, MAX_SEARCH_QUERY);
  if (query) params.set("q", query);
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort);
  if (state.inStockOnly) params.set("stock", "1");
  if (state.filters.onSale) params.set("sale", "1");
  const formats = FORMAT_ORDER.filter(key => state.filters.formats.includes(key));
  if (formats.length) params.set("format", formats.join(","));
  const min = cleanPrice(state.filters.minPrice);
  const max = cleanPrice(state.filters.maxPrice);
  if (min) params.set("min", min);
  if (max) params.set("max", max);
  const text = params.toString().replace(/%2C/gi, ",");
  return text ? `?${text}` : "";
}
