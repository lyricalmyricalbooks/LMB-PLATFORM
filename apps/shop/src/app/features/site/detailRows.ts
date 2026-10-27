// The rows of a book page's Details tab (BookDetail › renderSpecs), in the owner's order.
// Books › edit › Publishing details › "Details tab rows" saves `book.detailRows`:
//   built-in rows  { key: "specFormat", label?, value?, hidden? } — label/value override the
//                  Text & labels word and the book's own field; blank = the default
//   own rows       { key: "custom:<id>", label, value, hidden? }
// No `detailRows` = the original order, then the older `extraDetails` rows.

import { metricWeight } from "./metricWeight";

export type DetailRow = { key: string; label?: string; value?: string; hidden?: boolean };
export type ShownRow = { key: string; label: string; value: string; builtin: boolean };

/** Built-in rows in their original order; `edition` rows follow Studio's "Show edition details". */
export const BUILTIN_DETAILS: { key: string; name: string; edition?: boolean }[] = [
  { key: "specEdition", name: "Edition", edition: true },
  { key: "specPages", name: "Pages", edition: true },
  { key: "specPublisher", name: "Publisher", edition: true },
  { key: "specPublished", name: "Publication date", edition: true },
  { key: "specFormat", name: "Format" },
  { key: "specLanguage", name: "Language" },
  { key: "specDimensions", name: "Dimensions" },
  { key: "specIsbn", name: "ISBN" },
  { key: "specWeight", name: "Weight" },
];
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
  if (saved.length) {
    const seen = new Set(saved.map((r) => r.key));
    return [...saved, ...BUILTIN_DETAILS.filter((b) => !seen.has(b.key)).map((b) => ({ key: b.key, label: "", value: "", hidden: false }))];
  }
  const extras = Array.isArray(book?.extraDetails) ? book.extraDetails : [];
  return [
    ...BUILTIN_DETAILS.map((b) => ({ key: b.key, label: "", value: "", hidden: false })),
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
