// A product's type facts (product types plan, change 7): burn time for a candle, fibre for yarn, ingredients for soap.
// They are saved as rows of the Details tab (`detailRows`, key `fact:<key>`), so the product page shows them with no
// change there and the owner can still rename, reorder or hide each one under "Rows on the book page's Details tab".
// Facts that already have their own box (material, care, dimensions) edit that box instead. The type's safety line is
// the row `fact:safety`, labelled Safety.

import { editorDetailRows, type DetailRow } from "../features/site/detailRows";
import type { ProductType, TypeFact } from "../../shared/productTypes";

/** Facts that are the product's own fields already. */
export const FIELD_FACTS: Record<string, string> = { material: "material", care: "care", dimensions: "dimensions" };
export const SAFETY_KEY = "fact:safety";
export const SAFETY_LABEL = "Safety";

const rowKey = (key: string) => `fact:${key}`;

/** What a fact says now. */
export function factValue(form: any, key: string): string {
  if (FIELD_FACTS[key]) return String(form?.[FIELD_FACTS[key]] ?? "");
  const row = (Array.isArray(form?.detailRows) ? form.detailRows : []).find((r: DetailRow) => r?.key === rowKey(key));
  return String(row?.value ?? "");
}

function putRow(form: any, key: string, label: string, value: string): DetailRow[] {
  const rows = editorDetailRows(form);
  const at = rows.findIndex((r) => r.key === key);
  if (at >= 0) return rows.map((r, i) => (i === at ? { ...r, label: r.label || label, value } : r));
  return [...rows, { key, label, value, hidden: false }];
}

/** The change to the form for one fact. */
export function withFact(form: any, fact: TypeFact, value: string): Record<string, any> {
  if (FIELD_FACTS[fact.key]) return { [FIELD_FACTS[fact.key]]: value };
  return { detailRows: putRow(form, rowKey(fact.key), fact.label, value) };
}

/** The safety line shown now ("" for none). */
export function safetyLine(form: any): string {
  const row = (Array.isArray(form?.detailRows) ? form.detailRows : []).find((r: DetailRow) => r?.key === SAFETY_KEY);
  return row && !row.hidden ? String(row.value ?? "") : "";
}

/** The change to the form for the safety line; "" removes it. */
export function withSafety(form: any, text: string): Record<string, any> {
  if (!text.trim()) return { detailRows: editorDetailRows(form).filter((r) => r.key !== SAFETY_KEY) };
  return { detailRows: putRow(form, SAFETY_KEY, SAFETY_LABEL, text) };
}

/** A new type's safety line replaces the old one's (a type with none takes it away). */
export function safetyForType(form: any, type: ProductType): Record<string, any> {
  const before = safetyLine(form);
  if (!type.traits.safety && !before) return {};
  return withSafety(form, type.traits.safety ?? "");
}

/** The facts the law asks for that are still empty. */
export function missingLawFacts(form: any, type: ProductType | null): TypeFact[] {
  return (type?.facts ?? []).filter((f) => f.law && !factValue(form, f.key).trim());
}
