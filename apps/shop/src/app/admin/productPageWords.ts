// Adding products, round 3 (plan https://claude.ai/artifact/MEmMDYot4WY3S1c8cRDRaL): words on the product page that
// follow what is being sold, so a ring never asks "why this book matters". Pure, so the tests can read every group.
import type { ProductType, TypeGroupId } from "../../shared/productTypes";

const DESCRIPTION: Record<TypeGroupId, string> = {
  clothing: "What it's made of, how it fits, how to wash it…",
  shoes: "What they're made of, how they fit, how to look after them…",
  bags: "What it's made of, its size, what fits inside…",
  jewelry: "What it's made of, how it feels to wear, how you make it…",
  art: "The medium, the size, the paper, what inspired it…",
  books: "Why this book matters, what readers will discover, notes on the edition…",
  music: "The tracks, the format, the pressing, who made it…",
  home: "What it's made of, its size, how to look after it…",
  beauty: "What it does, how to use it, what's in it…",
  food: "How it tastes, how it's made, how to enjoy it…",
  kids: "Who it's for, what's in the box, how to play…",
  plants: "How big it is, how much light and water it likes…",
  craft: "What's in it, how much, what you can make with it…",
  pets: "Who it's for, what it's made of, which size to pick…",
  tech: "What it fits, what's in the box, how it works…",
  "not-parcel": "What they get, how it reaches them, how to use it…",
};

/** The description box's hint: the book wording for books, else the type's group, else a general one. */
export function descriptionHint(type: Pick<ProductType, "group"> | null | undefined, bookKind: boolean): string {
  if (bookKind) return DESCRIPTION.books;
  return (type && DESCRIPTION[type.group]) || "What it is, what it's made of, why people love it…";
}

/** The photos card's line. Books keep asking for the cover and inside pages. */
export function photosHint(bookKind: boolean): string {
  return bookKind
    ? "Use genuine cover and interior photographs. Drag the ⠿ handle to reorder; the first image is the cover shown in the shop and search."
    : "A clear photo on a plain background first, then a few in use. Drag the ⠿ handle to reorder; the first photo is the one shown in the shop and search.";
}

const money = (n: unknown) => Number(n) || 0;

/** What the folded Other prices row holds, in a few words ("Cost $12.00 · wholesale $40.00"). */
export function otherPricesLine(form: Record<string, any>): string {
  const parts: string[] = [];
  if (money(form.costPrice) > 0) parts.push(`Cost $${money(form.costPrice).toFixed(2)}`);
  if (money(form.wholesalePrice) > 0) parts.push(`wholesale $${money(form.wholesalePrice).toFixed(2)}`);
  if (form.manualCurrencyOverrides) parts.push("your own USD and EUR prices");
  if (!parts.length) return "Cost to you, wholesale, USD and EUR prices";
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** "a photo", "a photo and a price", "a photo, a price and a description". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What the checklist's labels read as in a sentence ("Price above $0" → "a price"). */
export function missingWord(label: string): string {
  const known: Record<string, string> = { Title: "a name", Photo: "a photo", "Price above $0": "a price", Description: "a description" };
  return known[label] || label.charAt(0).toLowerCase() + label.slice(1);
}

export type SaveBarWords = { tone: "good" | "warn"; text: string; short?: string };

/**
 * Round 3, change 7: the save bar says what's missing, in the same words as the Ready to publish list. A draft saves
 * once it has a name; publishing needs everything on the list. A live product just says whether it's saved.
 */
export function saveBarWords(o: { named: boolean; missing: string[]; live: boolean; dirty: boolean; isNew: boolean }): SaveBarWords {
  if (!o.named) return { tone: "warn", text: "Give it a name to save a draft", short: "Name it to save" };
  if (o.live) return o.dirty ? { tone: "warn", text: "Unsaved changes" } : { tone: "good", text: "All saved" };
  // "a photo, price and description": one article is enough, and it keeps the bar to one line.
  if (o.missing.length) return { tone: "warn", text: `To publish, add ${joinWords(o.missing.map(missingWord).map((m, i) => (i ? m.replace(/^an? /, "") : m)))}`, short: o.missing.length === 1 ? "1 thing to add" : `${o.missing.length} things to add` };
  if (o.isNew || o.dirty) return { tone: "good", text: "Ready to publish" };
  return { tone: "good", text: "Saved as a draft · ready to publish" };
}
