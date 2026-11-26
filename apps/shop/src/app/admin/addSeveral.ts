// Adding products round 3 (plan https://claude.ai/artifact/MEmMDYot4WY3S1c8cRDRaL), "Add several at once": a short
// table of photo, name, type, price and stock. Blank cells copy the row above (never the name or photo), every row is
// checked before anything is saved, and each row becomes a draft the owner finishes later. Pure, for the test.
import { typeById, typeStart, type OwnType, type ProductType } from "../../shared/productTypes";
import { NEW_BOOK_DEFAULTS } from "./catalogImport";

export type SeveralRow = { key: string; name: string; typeId: string; price: string; stock: string; photo?: File | null };

export const blankRow = (n: number): SeveralRow => ({ key: `row-${n}-${Math.random().toString(36).slice(2, 7)}`, name: "", typeId: "", price: "", stock: "" });

/**
 * The Type menu's Something else (Julian, 26 November 2026: "always have the other option"): the row becomes a plain
 * draft with no type, and the owner picks or names one on its page. A shop's own type is offered as `own:<id>`.
 */
export const OTHER_TYPE = "other";
const OWN = "own:";
export const ownTypeValue = (o: OwnType) => `${OWN}${o.id}`;

/** What a Type menu value stands for: one of our types, the shop's own type (built on one of ours), or Something else (type null). */
export function rowType(typeId: string, own: readonly OwnType[] = []): { type: ProductType | null; own?: OwnType } | null {
  if (typeId === OTHER_TYPE) return { type: null };
  if (typeId.startsWith(OWN)) {
    const o = own.find((x) => x.id === typeId.slice(OWN.length));
    const type = o ? typeById(o.base) : undefined;
    return o && type ? { type, own: o } : null;
  }
  const type = typeById(typeId);
  return type ? { type } : null;
}

/** The Type menu's name for a value ("Same: Mugs"). */
export const rowTypeName = (typeId: string, own: readonly OwnType[] = []): string => {
  const picked = rowType(typeId, own);
  return !picked ? "" : picked.own ? picked.own.name : picked.type ? picked.type.name : "Something else";
};

const empty = (r: SeveralRow) => !r.name.trim() && !r.typeId && !r.price.trim() && !r.stock.trim() && !r.photo;

/** The rows as they'll be saved: empty rows left out, blank type, price and stock taken from the row above. */
export function filledRows(rows: SeveralRow[]): SeveralRow[] {
  const out: SeveralRow[] = [];
  let above: SeveralRow | null = null;
  for (const row of rows) {
    if (empty(row)) continue;
    const filled: SeveralRow = { ...row, typeId: row.typeId || above?.typeId || "", price: row.price.trim() || above?.price || "", stock: row.stock.trim() || above?.stock || "" };
    out.push(filled);
    above = filled;
  }
  return out;
}

/** What each row still needs, by its key. A row with nothing in it needs nothing. */
export function rowProblems(rows: SeveralRow[], own: readonly OwnType[] = []): Record<string, string[]> {
  const problems: Record<string, string[]> = {};
  for (const row of filledRows(rows)) {
    const list: string[] = [];
    if (!row.name.trim()) list.push("Add a name");
    if (row.name.trim().length > 200) list.push("Shorten the name");
    if (!rowType(row.typeId, own)) list.push("Pick a type");
    if (row.price) { const p = Number(row.price); if (!Number.isFinite(p) || p < 0) list.push("Price must be a number, 0 or more"); }
    if (row.stock) { const s = Number(row.stock); if (!Number.isInteger(s) || s < 0) list.push("Stock must be a whole number, 0 or more"); }
    if (list.length) problems[row.key] = list;
  }
  return problems;
}

/** One row as a new draft product, with what its type starts with (Something else: a plain draft with no type). */
export function rowProduct(row: SeveralRow, pick: ProductType | { type: ProductType | null; own?: OwnType }): Record<string, any> {
  const { type, own } = "type" in pick && !("kind" in pick) ? pick : { type: pick as ProductType, own: undefined };
  const price = row.price ? Math.round(Number(row.price) * 100) / 100 : 0;
  const stock = row.stock ? Number(row.stock) : 0;
  return {
    ...NEW_BOOK_DEFAULTS,
    ...(!type ? { kind: "other", format: "" } : type.kind !== "book" ? { format: "" } : {}),
    ...(type ? typeStart(type, own) : {}),
    title: row.name.trim(),
    retailPrice: price,
    stockLevel: stock,
    status: "draft",
  };
}
/** "3 drafts", "1 draft". */
export const draftsWord = (n: number) => `${n} draft${n === 1 ? "" : "s"}`;
