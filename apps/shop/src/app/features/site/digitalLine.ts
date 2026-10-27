// Same rule as the server's downloadDigitalAsset: only an order line for the digital edition
// unlocks the e-book. A paperback of a book that also sells an e-book does not.
/** Downloads allowed per book and edition on one order (functions/digitalDelivery.js keeps the same number). */
export const DOWNLOAD_LIMIT = 10;

const DIGITAL_FORMAT = /digital|ebook|e-book|epub|pdf|audiobook/i;

/**
 * Stand-in for a book shoppers can no longer read (archived or drafted after they bought it: the catalog only serves
 * published books). The order line's recorded format still says "e-book", and the server decides on download.
 */
export const UNREADABLE_BOOK = { digitalFileName: "(not readable)" };

/** A file is set for this edition (its own, else the book's): the same pick the server makes. */
export function hasDigitalFile(book: any, variantId?: string): boolean {
  const variant = variantId ? (book?.variants || []).find((v: any) => v?.id === variantId) : null;
  return !!(variant?.digitalFileName || book?.digitalFileName);
}

export function lineIsDigital(line: any, book: any): boolean {
  // Gift cards are digital but have nothing to download: their code is emailed.
  if (!line || line.giftCard === true || book?.productType === "giftCard" || !hasDigitalFile(book, line.variantId)) return false;
  const recorded = line.digital !== undefined || line.isDigital !== undefined || line.format !== undefined;
  if (recorded) return line.digital === true || line.isDigital === true || DIGITAL_FORMAT.test(String(line.format || ""));
  // Older orders saved no format: check the edition in the catalog.
  const variant = line.variantId ? (book.variants || []).find((v: any) => v.id === line.variantId) : null;
  return variant ? variant.digital === true || variant.isDigital === true : book.digital === true || book.isDigital === true;
}

export interface DigitalEntry {
  itemId: string;
  variantId: string;
  title: string;
}

/**
 * Every download an order offers, one per book + edition: its digital lines, and the digital parts of box sets
 * (a part's book id is a valid download id on the server). `booksById` holds the catalog books (or UNREADABLE_BOOK).
 */
export function digitalEntries(order: any, booksById: Record<string, any>): DigitalEntry[] {
  const out: DigitalEntry[] = [];
  const seen = new Set<string>();
  const add = (itemId: string, variantId: string, title: string) => {
    const key = `${itemId}|${variantId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ itemId, variantId, title });
  };
  for (const item of order?.items || []) {
    if (lineIsDigital(item, booksById[item.id])) add(item.id, item.variantId || "", item.title);
    if (item?.bundle === true && Array.isArray(item.components)) {
      for (const part of item.components) {
        // A part has no recorded format, so the catalog edition decides.
        if (part?.id && lineIsDigital({ id: part.id, variantId: part.variantId }, booksById[part.id])) add(part.id, part.variantId || "", part.title || item.title);
      }
    }
  }
  return out;
}

/** The ids of every book an order's downloads could come from (lines and box-set parts). */
export function downloadBookIds(order: any): string[] {
  const ids = new Set<string>();
  for (const item of order?.items || []) {
    if (item?.id) ids.add(item.id);
    if (item?.bundle === true) for (const part of item.components || []) if (part?.id) ids.add(part.id);
  }
  return [...ids];
}
