import { getCopy } from "../../storeCopy";

// Style › Book page · photos & layout › Tax & shipping note (showPdpTaxNote, off by default): Shopify's
// "Taxes and shipping calculated at checkout." line under the price. Which sentence depends on the book:
// printed copies mention shipping, gift cards are never taxed, and Settings › Taxes › Collect sales tax
// switched off drops the tax part. Words in [brackets] link to the shipping policy when it has text.

export type TaxNotePart = { text: string; link: boolean };

/** The Text & labels key for this book, or null when there is nothing to say (an untaxed digital item). */
export function taxNoteKey({ physical, taxed }: { physical: boolean; taxed: boolean }): string | null {
  if (physical && taxed) return "pdpTaxNote";
  if (physical) return "pdpTaxNoteShippingOnly";
  if (taxed) return "pdpTaxNoteTaxOnly";
  return null;
}

/** Splits the sentence around its first [bracketed] words; brackets are dropped when there is no page to link to. */
export function taxNoteParts(text: string, canLink: boolean): TaxNotePart[] {
  const m = /\[([^\]]+)\]/.exec(text);
  if (!m) return text.trim() ? [{ text, link: false }] : [];
  const parts: TaxNotePart[] = [
    { text: text.slice(0, m.index), link: false },
    { text: m[1], link: canLink },
    { text: text.slice(m.index + m[0].length).replace(/\[([^\]]+)\]/g, "$1"), link: false },
  ];
  return parts.filter((p) => p.text !== "");
}

export function taxNoteText(design: any, opts: { physical: boolean; taxed: boolean }): string {
  const key = taxNoteKey(opts);
  return key ? String(getCopy(design, key) ?? "") : "";
}
