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
