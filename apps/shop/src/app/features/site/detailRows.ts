// The rows of a book page's Details tab (BookDetail › renderSpecs), in the owner's order.
// Books › edit › Publishing details › "Details tab rows" saves `book.detailRows`:
//   built-in rows  { key: "specFormat", label?, value?, hidden? } — label/value override the
//                  Text & labels word and the book's own field; blank = the default
//   own rows       { key: "custom:<id>", label, value, hidden? }
// No `detailRows` = the original order, then the older `extraDetails` rows.

import { metricWeight } from "./metricWeight";
import { isBookKind, productKind } from "../../../shared/productOptions";

export type DetailRow = { key: string; label?: string; value?: string; hidden?: boolean };
export type ShownRow = { key: string; label: string; value: string; builtin: boolean };

/**
 * Built-in rows in their original order; `edition` rows follow Studio's "Show edition details". `books` rows belong to
 * books (plan 10.3) and `goods` rows to everything else (a shirt's brand, material and care), so a books shop's list is
 * unchanged and a shirt never shows an ISBN or page count.
 */
export const BUILTIN_DETAILS: { key: string; name: string; edition?: boolean; books?: boolean; goods?: boolean }[] = [
  { key: "specEdition", name: "Edition", edition: true, books: true },
  { key: "specPages", name: "Pages", edition: true, books: true },
  { key: "specPublisher", name: "Publisher", edition: true, books: true },
  { key: "specPublished", name: "Publication date", edition: true, books: true },
  { key: "specFormat", name: "Format", books: true },
  { key: "specLanguage", name: "Language" },
  { key: "specDimensions", name: "Dimensions" },
  { key: "specIsbn", name: "ISBN", books: true },
  { key: "specWeight", name: "Weight" },
  { key: "specBrand", name: "Brand or maker", goods: true },
  { key: "specMaterial", name: "Material", goods: true },
  { key: "specCare", name: "Care", goods: true },
];

/** The built-in rows that fit this product's kind. */
export function builtinDetailsFor(book: any) {
  const books = isBookKind(productKind(book));
  return BUILTIN_DETAILS.filter((b) => (books ? !b.goods : !b.books));
}
const fits = (book: any, key: string) => builtinDetailsFor(book).some((b) => b.key === key);
const BUILTIN = new Set(BUILTIN_DETAILS.map((b) => b.key));
export const isBuiltinDetail = (key: string) => BUILTIN.has(key);

const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

/** The book's own value for a built-in row (`edition` = the chosen edition's name, when one is picked). */
export function builtinDetailValue(book: any, key: string, edition?: string): string {
  const b = book || {};
  switch (key) {
    case "specEdition": return text(edition) || text(b.edition);
    case "specPages": return Number(b.pageCount) > 0 ? String(b.pageCount) : "";
    case "specPublisher": return text(b.publisher);
    case "specPublished": return text(b.publishDate);
    case "specFormat": return text(b.format);
    case "specLanguage": return text(b.language);
    case "specDimensions": return text(b.dimensions);
    case "specIsbn": return text(b.isbn);
    case "specWeight": return metricWeight(text(b.weight));
    case "specBrand": return text(b.brand) || text(b.subtitle);
    case "specMaterial": return text(b.material);
    case "specCare": return text(b.care);
    default: return "";
  }
}

function cleanRows(raw: unknown): DetailRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === "object" && typeof r.key === "string" && r.key)
    .map((r: any) => ({ key: r.key, label: typeof r.label === "string" ? r.label : "", value: typeof r.value === "string" ? r.value : "", hidden: r.hidden === true }));
}

/** The list the book editor shows: the saved list, plus any built-in row it doesn't mention yet. */
export function editorDetailRows(book: any): DetailRow[] {
  const saved = cleanRows(book?.detailRows);
  const builtins = builtinDetailsFor(book);
  if (saved.length) {
    const seen = new Set(saved.map((r) => r.key));
    return [...saved.filter((r) => !isBuiltinDetail(r.key) || fits(book, r.key)), ...builtins.filter((b) => !seen.has(b.key)).map((b) => ({ key: b.key, label: "", value: "", hidden: false }))];
  }
  const extras = Array.isArray(book?.extraDetails) ? book.extraDetails : [];
  return [
    ...builtins.map((b) => ({ key: b.key, label: "", value: "", hidden: false })),
    ...extras.filter((r: any) => r && (r.label || r.value)).map((r: any, i: number) => ({ key: `custom:${i + 1}`, label: String(r.label || ""), value: String(r.value || ""), hidden: false })),
  ];
}

/** What the Details tab shows, in order. Empty rows (no value) and hidden rows are left out. */
export function shownDetailRows(book: any, labelFor: (key: string) => string, opts: { showEditionFacts?: boolean; edition?: string } = {}): ShownRow[] {
  const showEdition = opts.showEditionFacts !== false;
  const rows = editorDetailRows(book);
  const out: ShownRow[] = [];
  for (const r of rows) {
    if (r.hidden) continue;
    if (isBuiltinDetail(r.key)) {
      if (!showEdition && BUILTIN_DETAILS.find((b) => b.key === r.key)?.edition) continue;
      const value = text(r.value) || builtinDetailValue(book, r.key, opts.edition);
      if (value) out.push({ key: r.key, label: text(r.label) || labelFor(r.key), value, builtin: true });
    } else {
      const label = text(r.label), value = text(r.value);
      if (label && value) out.push({ key: r.key, label, value, builtin: false });
    }
  }
  return out;
}
