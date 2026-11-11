// Stockroom › Stock › one item › Edit details: the old stockroom's Edit book form (main.js saveBookFromModal), for the
// fields it keeps on the catalogue: title, author, print run, list price, low-stock level and production cost. The
// catalogue is merged key by key (updateSetting), so another device's books are kept.
type Row = Record<string, any>;
export type DetailsForm = { title: string; author: string; maxPrint: string; listPrice: string; threshold: string; productionCost: string };

export function detailsFormOf(book: Row): DetailsForm {
  return {
    title: String(book.title || ""), author: String(book.author || ""), maxPrint: String(book.maxPrint ?? ""),
    listPrice: String(book.listPrice ?? ""), threshold: String(book.threshold ?? 10), productionCost: String(book.productionCost ?? 0),
  };
}

/** The first problem with the form, or "". */
export function detailsProblem(f: DetailsForm, catalog: Row, id: string): string {
  const title = f.title.trim();
  if (!title) return "Give it a title.";
  const twin = Object.values(catalog || {}).find((b: any) => b && b.id !== id && String(b.title || "").trim().toLowerCase() === title.toLowerCase());
  if (twin) return `“${(twin as Row).title}” already has this title. Add something to tell them apart.`;
  if (f.maxPrint.trim() && !(Number.isInteger(Number(f.maxPrint)) && Number(f.maxPrint) >= 0)) return "The print run is a whole number.";
  if (f.listPrice.trim() && !(Number(f.listPrice) >= 0)) return "The price is a number, 0 or more.";
  if (!(Number(f.productionCost || 0) >= 0)) return "The production cost is a number, 0 or more.";
  return "";
}

/** A `mutate` for updateSetting("catalog"): writes the form onto the stored item, keeping every field it doesn't list. */
export function withDetails(id: string, f: DetailsForm) {
  return (current: unknown) => {
    const catalog = { ...((current as Row) || {}) };
    const book = catalog[id];
    if (!book) throw new Error("This item is no longer in the stockroom.");
    const problem = detailsProblem(f, catalog, id);
    if (problem) throw new Error(problem);
    const threshold = parseInt(f.threshold, 10);
    catalog[id] = {
      ...book,
      title: f.title.trim(),
      author: f.author.trim(),
      maxPrint: f.maxPrint.trim() ? parseInt(f.maxPrint, 10) : book.maxPrint,
      listPrice: f.listPrice.trim() ? parseFloat(f.listPrice) : book.listPrice,
      threshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : 10,
      productionCost: parseFloat(f.productionCost) || 0,
    };
    return catalog;
  };
}

/** A safe item id from a title, as the old form made it: lowercase letters, digits and dashes, never one already used. */
export function newItemId(title: string, catalog: Row): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  let id = base;
  for (let n = 2; catalog[id]; n++) id = `${base}-${n}`;
  return id;
}

/** A `mutate` for updateSetting("catalog") that adds a new item with the old form's defaults. */
export function withNewItem(f: DetailsForm, currency: string) {
  return (current: unknown) => {
    const catalog = { ...((current as Row) || {}) };
    const id = newItemId(f.title.trim(), catalog);
    catalog[id] = { id, urlParam: id, isbn: "—", currency, maxPrint: 100, listPrice: 40, threshold: 10, productionCost: 0, profitTiers: [], acceptedMethods: ["stripe", "paypal", "interac", "cash_card"], useGlobalMethods: true };
    return withDetails(id, f)(catalog);
  };
}
