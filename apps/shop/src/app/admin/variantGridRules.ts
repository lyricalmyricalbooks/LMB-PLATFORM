// Every combination at a glance (11 November 2026): the product editor's grid for a product sold in options (size,
// colour…). Pure: the figures over the grid and "same for every row". Only variants made from the options are here;
// a books shop's plain editions never reach it (BookEditor shows the grid only when `usesOptionPicker`).

export type GridVariant = { id: string; price?: unknown; stock?: unknown; stockLevel?: unknown; [key: string]: any };

/** A variant's stock read the way the server does: stockLevel first, then stock. */
export const gridStock = (v: GridVariant): number => {
  const n = Math.floor(Number(v?.stockLevel !== undefined && v?.stockLevel !== "" ? v.stockLevel : v?.stock));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const okPrice = (p: number) => Number.isFinite(p) && p >= 0;

export type GridSummary = { count: number; units: number; soldOut: number; low: number; minPrice: number | null; maxPrice: number | null };

/** The figures over the grid: combinations, units on hand, how many are sold out or low, and the price range. */
export function gridSummary(variants: GridVariant[], lowLine: number): GridSummary {
  const list = Array.isArray(variants) ? variants.filter((v) => v && v.id) : [];
  const prices = list.filter((v) => v.price !== "" && v.price != null).map((v) => Number(v.price)).filter((p) => okPrice(p));
  const stocks = list.map(gridStock);
  return {
    count: list.length,
    units: stocks.reduce((a, b) => a + b, 0),
    soldOut: stocks.filter((n) => n <= 0).length,
    low: stocks.filter((n) => n > 0 && n <= lowLine).length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
  };
}

/**
 * "Same for every row": one price or one stock count written on every combination. Stock counted in the stockroom
 * (`locked`) is left alone, as the editor's own stock box is. A value that isn't a whole, non-negative number (stock)
 * or a non-negative amount (price) changes nothing: the editor keeps the button off until it is one.
 */
export function fillEvery(variants: GridVariant[], field: "price" | "stock", raw: string, locked: (id: string) => boolean = () => false): GridVariant[] {
  const value = parseFill(field, raw);
  if (value === null) return variants;
  return (variants || []).map((v) => {
    if (!v?.id) return v;
    if (field === "price") return { ...v, price: value };
    if (locked(v.id)) return v;
    return { ...v, stock: value, stockLevel: value };
  });
}

/** The typed "same for every row" value, or null when it can't be used. */
export function parseFill(field: "price" | "stock", raw: string): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  if (field === "stock") return Number.isInteger(n) && n <= 1_000_000 ? n : null;
  return Math.round(n * 100) / 100;
}

/** The option that holds sizes ("Size", "Ring size", "Shoe size"), or null when the product has none. */
export function sizeOptionOf(options: { name: string; values: string[] }[]): { name: string; values: string[] } | null {
  return options.find((o) => /size/i.test(o.name) && o.values.length > 1) || null;
}

/**
 * Adding products round 3, "a price bump for bigger sizes": every combination gets `base`, and those whose size is
 * `from` or bigger (later in the size list) get `base + extra`. Running it again gives the same prices, never stacked.
 * Rows whose size isn't on the list keep their price.
 */
export function bumpBySize(variants: GridVariant[], size: { name: string; values: string[] }, from: string, base: number, extra: number): GridVariant[] {
  const start = size.values.indexOf(from);
  if (start < 0 || !okPrice(base) || !okPrice(extra)) return variants;
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  return (variants || []).map((v) => {
    if (!v?.id) return v;
    const at = size.values.findIndex((s) => norm(s) === norm(v.options?.[size.name]));
    if (at < 0) return v;
    return { ...v, price: Math.round((base + (at >= start ? extra : 0)) * 100) / 100 };
  });
}
