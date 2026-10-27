import { useRef } from "react";
import { Search, X } from "lucide-react";
import { ga4FilterUse, priceFilterValue } from "../../lib/ga4";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";
import { displayPrice, showsSale } from "./displayPrice";
import { quickAddChoice } from "./buyable";
import { matchesSearch } from "./bookSearch";
import { compareShopOrder } from "./shopOrder";
import { comingSoonActive } from "./comingSoon";

export type SortKey = "featured" | "newest" | "oldest" | "price_asc" | "price_desc" | "title_az" | "title_za";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "price_asc", label: "Price ↑" },
  { key: "price_desc", label: "Price ↓" },
  { key: "title_az", label: "A → Z" },
  { key: "title_za", label: "Z → A" },
];

// ⚡ Bolt: Cache the search strings per item to prevent repeated allocations
// and `.toLowerCase()` calls during active typing or sorting.
// Measured impact: reduces search loop time by ~85% on subsequent renders.

// ── Shop filters (format · price · in stock), Shopify-style ────────────────
export type FormatKey = "paperback" | "hardcover" | "ebook" | "audiobook" | "other";
export const FORMAT_ORDER: FormatKey[] = ["paperback", "hardcover", "ebook", "audiobook", "other"];

/** Which format bucket a catalog format / edition name belongs to (null when blank). */
export function formatKey(value: unknown): FormatKey | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/audio/i.test(text)) return "audiobook";
  if (/e-?book|epub|pdf|digital|kindle|mobi/i.test(text)) return "ebook";
  if (/hard ?cover|hardback|cloth/i.test(text)) return "hardcover";
  if (/paper ?back|soft ?cover|trade paper|perfect.?bound|zine|chapbook|pamphlet/i.test(text)) return "paperback";
  return "other";
}

/** Every format a book can be bought in: its own format plus each edition's. */
export function bookFormats(book: any): FormatKey[] {
  const keys = new Set<FormatKey>();
  const variants = Array.isArray(book?.variants) ? book.variants : [];
  for (const variant of variants) {
    const key = formatKey(variant?.format) || formatKey(variant?.name);
    if (key) keys.add(key);
  }
  const own = book?.isDigital === true || book?.digital === true ? "ebook" : formatKey(book?.format);
  if (own && (!variants.length || !keys.size)) keys.add(own);
  return FORMAT_ORDER.filter(key => keys.has(key));
}

/** Formats present in a list, in display order (the chips only appear when there are two or more). */
export function formatsIn(items: any[]): FormatKey[] {
  const keys = new Set(items.flatMap(bookFormats));
  return FORMAT_ORDER.filter(key => keys.has(key));
}

/** In stock the way the bag sees it: an edition that can be bought, or backorders allowed. */
export function bookInStock(book: any): boolean {
  if (book?.trackInventory && book?.allowBackorder) return true;
  return quickAddChoice(book).inStock;
}

/**
 * Studio › Style › Shop page heading & filters › Book order › "Put sold-out books last"
 * (`soldOutLast`, off by default). Coming soon books aren't sold out: they keep their place.
 */
export function soldOutLastOn(design: any): boolean {
  return design?.soldOutLast === true;
}

export function bookSoldOut(book: any): boolean {
  return !comingSoonActive(book) && !bookInStock(book);
}

/** Moves sold-out books to the end, keeping the chosen order inside each group. */
export function soldOutToEnd<T>(items: T[]): T[] {
  const soldOut = items.filter(bookSoldOut);
  if (!soldOut.length || soldOut.length === items.length) return items;
  return [...items.filter(item => !bookSoldOut(item)), ...soldOut];
}

export type CatalogFilterState = { formats: FormatKey[]; minPrice: string; maxPrice: string; onSale?: boolean };
export const EMPTY_FILTERS: CatalogFilterState = { formats: [], minPrice: "", maxPrice: "", onSale: false };

/**
 * The CAD price range for the shopper's Min/Max boxes, which they type in the currency they
 * see. `rate` = displayed units per CAD (CurrencyContext.convertPrice(1)).
 */
export function priceRangeFor(filters: CatalogFilterState, rate = 1): [number, number] {
  const bound = (value: string, fallback: number) => {
    const n = Number(String(value).replace(",", "."));
    return String(value).trim() && Number.isFinite(n) && n >= 0 ? n / (rate > 0 ? rate : 1) : fallback;
  };
  // A cent of slack so a book shown at exactly the typed price is never filtered out by rounding.
  return [Math.max(0, bound(filters.minPrice, 0) - 0.005), bound(filters.maxPrice, Infinity) + 0.005];
}

/** Which filters the current view offers: format chips need two formats, a price filter two prices. */
export function filterView(items: any[]): { availableFormats: FormatKey[]; showPrice: boolean; hasSale: boolean } {
  return { availableFormats: formatsIn(items), showPrice: new Set(items.map(item => displayPrice(item))).size >= 2, hasSale: items.some(item => showsSale(item)) };
}

/**
 * The filters that actually apply: a format chip or price box that isn't on screen (another
 * category has no such format, or one price) never hides books the shopper can't un-hide.
 */
export function appliedFilters(filters: CatalogFilterState, view: { availableFormats: FormatKey[]; showPrice: boolean; hasSale?: boolean }, rate = 1): { formats: FormatKey[]; priceRange: [number, number]; onSale: boolean } {
  const formats = view.availableFormats.length >= 2 ? filters.formats.filter(key => view.availableFormats.includes(key)) : [];
  return { formats, priceRange: view.showPrice ? priceRangeFor(filters, rate) : [0, Infinity], onSale: Boolean(filters.onSale && view.hasSale) };
}

/** Whether anything narrows the list. With `view`, only filters on screen count (see appliedFilters). */
export function filtersActive(filters: CatalogFilterState, query = "", inStockOnly = false, view?: { availableFormats: FormatKey[]; showPrice: boolean; hasSale?: boolean }): boolean {
  const formats = view ? appliedFilters(filters, view).formats : filters.formats;
  const onSale = Boolean(filters.onSale && (!view || view.hasSale));
  const price = (!view || view.showPrice) && Boolean(filters.minPrice.trim() || filters.maxPrice.trim());
  return Boolean(query.trim() || inStockOnly || formats.length || price || onSale);
}

export function applyCatalogControls(
  items: any[],
  query: string,
  sort: SortKey,
  inStockOnly: boolean,
  priceRange: [number, number],
  formats: FormatKey[] = [],
  onSale = false,
  soldOutLast = false,
) {
  const q = query.trim().toLowerCase();

  const filtered = items.filter(item => {
    if (q) {
      if (!matchesSearch(item, q)) return false;
    }
    // Editions count: a book sold out in paperback but available as an e-book is in stock.
    if (inStockOnly && !bookInStock(item)) return false;
    if (onSale && !showsSale(item)) return false;
    const price = displayPrice(item);
    if (price < priceRange[0] || price > priceRange[1]) return false;
    if (formats.length) {
      const own = bookFormats(item);
      if (!formats.some(key => own.includes(key))) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    // Books sold only in editions sort by their cheapest edition, as their card shows.
    const pa = displayPrice(a);
    const pb = displayPrice(b);
    switch (sort) {
      case "price_asc": return pa - pb;
      case "price_desc": return pb - pa;
      case "title_az": return (a.title || "").localeCompare(b.title || "");
      case "title_za": return (b.title || "").localeCompare(a.title || "");
      // The publisher's arrangement (Admin › Books › Shop order); unarranged books follow, newest first.
      case "featured": return compareShopOrder(a, b) || (b.createdAt || "").localeCompare(a.createdAt || "");
      case "oldest": return (a.createdAt || "").localeCompare(b.createdAt || "");
      case "newest":
      default:
        return (b.createdAt || "").localeCompare(a.createdAt || "");
    }
  });

  return soldOutLast ? soldOutToEnd(sorted) : sorted;
}

export function CatalogControls({
  query,
  setQuery,
  sort,
  setSort,
  inStockOnly,
  setInStockOnly,
  resultCount,
  design,
  filters = EMPTY_FILTERS,
  setFilters,
  availableFormats = [],
  showPrice = false,
  hasSale = false,
}: {
  query: string;
  setQuery: (v: string) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  inStockOnly: boolean;
  setInStockOnly: (v: boolean) => void;
  resultCount: number;
  design?: any;
  filters?: CatalogFilterState;
  setFilters?: (next: CatalogFilterState) => void;
  /** Formats in the current view; the chips show only when there are two or more. */
  availableFormats?: FormatKey[];
  /** Whether the current view has more than one price (otherwise a price filter is noise). */
  showPrice?: boolean;
  /** Whether any book in the current view is on sale (otherwise the On sale chip is noise). */
  hasSale?: boolean;
}) {
  const c = (key: string, vars?: Record<string, string | number>) => getCopy(design, key, vars);
  const showFormats = !!setFilters && availableFormats.length >= 2;
  const showPriceBoxes = !!setFilters && showPrice;
  const showSale = !!setFilters && hasSale;
  const toggleFormat = (key: FormatKey) => {
    if (!filters.formats.includes(key)) ga4FilterUse("format", key);
    setFilters?.({ ...filters, formats: filters.formats.includes(key) ? filters.formats.filter(k => k !== key) : [...filters.formats, key] });
  };
  // Google Analytics hears about the price boxes when the shopper leaves one with a new value, never per keystroke,
  // and only which boxes are filled (never the amounts).
  const sentPrice = useRef(`${filters.minPrice}|${filters.maxPrice}`);
  const priceDone = () => {
    const key = `${filters.minPrice}|${filters.maxPrice}`;
    if (key === sentPrice.current) return;
    sentPrice.current = key;
    const which = priceFilterValue(filters.minPrice, filters.maxPrice);
    if (which) ga4FilterUse("price", which);
  };
  const clearAll = () => { setQuery(""); setInStockOnly(false); setFilters?.(EMPTY_FILTERS); };
  const chip = (active: boolean) => `px-4 py-3 rounded-full text-[10px] tracking-widest uppercase border transition-colors ${
    active ? "fm-active border-white" : "bg-white/[0.04] text-white/60 border-white/10 hover:border-white/30"
  }`;
  return (
    <div className="mb-10 space-y-4" data-studio-target="style:catalog|copy:Search & filters" data-studio-label="Search, sort & stock bar">
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div {...regionProps("catalogSearch")} className="relative flex-1">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={c("filterSearchPlaceholder")}
            aria-label={c("filterSearchAria")}
            className="w-full bg-white/[0.04] border border-white/10 rounded-full py-3 pl-11 pr-10 text-xs text-white placeholder:text-[var(--muted)] outline-none focus:border-white/30 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 max-md:before:absolute max-md:before:-inset-2.5 max-md:before:content-[''] rounded-full hover:bg-white/10"
              aria-label={c("filterClearAria")}
            >
              <X size={12} className="text-white/40" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select {...regionProps("catalogSort")}
            value={sort}
            onChange={e => { setSort(e.target.value as SortKey); ga4FilterUse("sort", e.target.value); }}
            aria-label={c("filterSortAria")}
            className="bg-white/[0.04] border border-white/10 rounded-full py-3 px-5 text-[10px] tracking-widest uppercase text-white/70 outline-none focus:border-white/30 cursor-pointer"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key} className="fm-surface-2">
                {c("sort_" + o.key)}
              </option>
            ))}
          </select>
        <button {...regionProps("catalogStock")}
            type="button"
            aria-pressed={inStockOnly}
            onClick={() => { ga4FilterUse("in_stock", inStockOnly ? "off" : "on"); setInStockOnly(!inStockOnly); }}
            className={chip(inStockOnly)}
          >
            {c("filterInStock")}
          </button>
          {showSale && (
            <button {...regionProps("catalogSale")}
              type="button"
              aria-pressed={!!filters.onSale}
              onClick={() => { ga4FilterUse("on_sale", filters.onSale ? "off" : "on"); setFilters?.({ ...filters, onSale: !filters.onSale }); }}
              className={chip(!!filters.onSale)}
            >
              {c("filterOnSale")}
            </button>
          )}
        </div>
      </div>
      {(showFormats || showPriceBoxes) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {showFormats && (
            <div {...regionProps("catalogFormat")} role="group" aria-label={c("filterFormatLabel")} className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] tracking-widest uppercase text-white/30 mr-1" aria-hidden="true">{c("filterFormatLabel")}</span>
              {availableFormats.map(key => (
                <button key={key} type="button" aria-pressed={filters.formats.includes(key)} onClick={() => toggleFormat(key)} className={chip(filters.formats.includes(key))}>
                  {c("filterFormat_" + key)}
                </button>
              ))}
            </div>
          )}
          {showPriceBoxes && (
            <div {...regionProps("catalogPrice")} role="group" aria-label={c("filterPriceLabel")} className="flex items-center gap-2">
              <span className="text-[10px] tracking-widest uppercase text-white/30 mr-1" aria-hidden="true">{c("filterPriceLabel")}</span>
              {(["minPrice", "maxPrice"] as const).map(field => (
                <input
                  key={field}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={filters[field]}
                  onChange={e => setFilters?.({ ...filters, [field]: e.target.value })}
                  onBlur={priceDone}
                  placeholder={c(field === "minPrice" ? "filterPriceMin" : "filterPriceMax")}
                  aria-label={`${c("filterPriceLabel")} ${c(field === "minPrice" ? "filterPriceMin" : "filterPriceMax")}`}
                  className="w-24 bg-white/[0.04] border border-white/10 rounded-full py-3 px-4 text-xs text-white placeholder:text-[var(--muted)] outline-none focus:border-white/30 transition-all"
                />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <p {...regionProps("catalogResults")} className="text-[10px] tracking-widest uppercase text-white/30" aria-live="polite">{c("filterResults", { count: resultCount })}</p>
        {filtersActive(filters, query, inStockOnly, { availableFormats: showFormats ? availableFormats : [], showPrice: showPriceBoxes, hasSale: showSale }) && (
          <button {...regionProps("catalogClear")} type="button" onClick={clearAll} className="relative max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-3 max-md:before:content-[''] text-[10px] tracking-widest uppercase text-white/60 underline underline-offset-4 hover:text-white transition-colors">
            {c("filterClear")}
          </button>
        )}
      </div>
    </div>
  );
}
