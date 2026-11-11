// Till › Till-only items: the old register's "POS-only books" (features/pos-books.js). Kept in the catalogue under
// `_posExtra` with their own price and a running tally (sold, revenue); never in stock, the ledger or the money pages.
// Pure `mutate`s for updateSetting("catalog").

type Row = Record<string, any>;

export type ExtraForm = { title: string; author: string; price: string; currency: string };

export const blankExtra = (currency: string): ExtraForm => ({ title: "", author: "", price: "", currency });

export function extraProblem(f: ExtraForm): string | null {
  if (!f.title.trim()) return "Give it a name.";
  if (!(Number(f.price) > 0)) return "Set a price above 0.";
  return null;
}

/** The old register's id: `pos-<title>`, never one the catalogue or another extra already uses. */
export function extraId(title: string, catalog: Row, editing?: string): string {
  const base = "pos-" + (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "book");
  const extra = (catalog._posExtra || {}) as Row;
  let id = base;
  for (let n = 2; catalog[id] || (extra[id] && id !== editing); n++) id = `${base}-${n}`;
  return id;
}

/** Add an item, or change one (`editing`), keeping its tally and every field the form doesn't list. */
export function withExtra(f: ExtraForm, editing?: string) {
  return (current: unknown) => {
    const problem = extraProblem(f);
    if (problem) throw new Error(problem);
    const catalog = { ...((current as Row) || {}) };
    const extras = { ...((catalog._posExtra as Row) || {}) };
    const id = editing && extras[editing] ? editing : extraId(f.title.trim(), catalog);
    const old = (extras[id] || {}) as Row;
    extras[id] = {
      ...old, id, title: f.title.trim(), author: f.author.trim(), isbn: old.isbn || "—", listPrice: Math.round(Number(f.price) * 100) / 100,
      currency: f.currency, maxPrint: 999999, threshold: 0, posOnly: true, sold: old.sold || 0, revenue: old.revenue || 0,
    };
    catalog._posExtra = extras;
    return catalog;
  };
}

export function withoutExtra(id: string) {
  return (current: unknown) => {
    const catalog = { ...((current as Row) || {}) };
    const extras = { ...((catalog._posExtra as Row) || {}) };
    delete extras[id];
    catalog._posExtra = extras;
    return catalog;
  };
}

/**
 * Add one till line to its item's tally, as the old register did after a sale. The line's id is kept (the newest 200),
 * so a retry after a dropped connection counts it once. An item removed meanwhile is left alone.
 */
export function withExtraSale(id: string, rowId: string, qty: number, price: number) {
  return (current: unknown) => {
    const catalog = { ...((current as Row) || {}) };
    const extras = { ...((catalog._posExtra as Row) || {}) };
    const item = extras[id] as Row | undefined;
    if (!item) return catalog;
    const seen: string[] = Array.isArray(item.tillRows) ? item.tillRows : [];
    if (seen.includes(rowId)) return catalog;
    extras[id] = {
      ...item, sold: (Number(item.sold) || 0) + qty, revenue: Math.round(((Number(item.revenue) || 0) + qty * price) * 100) / 100,
      tillRows: [rowId, ...seen].slice(0, 200),
    };
    catalog._posExtra = extras;
    return catalog;
  };
}
