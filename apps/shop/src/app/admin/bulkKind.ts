// Bulk edit › "Change what these are" (plan 12.17): re-label many products at once, e.g. books to clothing.
// Mirrors the editor's own kind switch (BookEditor setKind) so one product changed here ends up exactly as if it had
// been changed there: a book keeps no `kind`, anything else stores it, and the book format is dropped / restored.
import { PRODUCT_KINDS, isBookKind, productKind, type ProductKind } from "../../shared/productOptions";

export const KIND_CHOICES: { kind: ProductKind; label: string }[] = [
  { kind: "book", label: "Book" }, { kind: "ebook", label: "E-book" }, { kind: "clothing", label: "Clothing" },
  { kind: "shoes", label: "Shoes" }, { kind: "jewelry", label: "Jewellery" }, { kind: "art", label: "Art" },
  { kind: "music", label: "Music" }, { kind: "other", label: "Something else" },
];

export function isProductKind(value: string): value is ProductKind {
  return (PRODUCT_KINDS as readonly string[]).includes(value);
}

/** The whole record after the change (the caller saves it with removeMissing so a dropped `kind` is deleted). */
export function withKind(book: any, kind: ProductKind): any {
  const next = { ...book };
  if (kind === "book") {
    delete next.kind;
    if (!next.format) next.format = "Paperback";
  } else {
    next.kind = kind;
    if (isBookKind(productKind(book)) && !isBookKind(kind)) next.format = "";
  }
  return next;
}

/** What a kind change would touch: the products that change, and how many were already that kind. */
export function planKindChange(books: any[], kind: ProductKind) {
  const changes: { book: any; next: any }[] = [];
  let already = 0;
  for (const book of books) {
    if (productKind(book) === kind) { already++; continue; }
    changes.push({ book, next: withKind(book, kind) });
  }
  return { changes, already };
}
