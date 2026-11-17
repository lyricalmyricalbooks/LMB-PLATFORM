// Same rule as the server's downloadDigitalAsset: only an order line for the digital edition
// unlocks the e-book. A paperback of a book that also sells an e-book does not.
import { fileLabel, filesFor } from "../../../shared/digitalFiles";

/** Default downloads per book and edition on one order (functions/digitalDelivery.js keeps the same number; the shop can change it in Settings). */
export const DOWNLOAD_LIMIT = 10;

const DIGITAL_FORMAT = /digital|ebook|e-book|epub|pdf|audiobook/i;

/**
 * Stand-in for a book shoppers can no longer read (archived or drafted after they bought it: the catalog only serves
 * published books). The order line's recorded format still says "e-book", and the server decides on download.
 */
export const UNREADABLE_BOOK = { digitalFileName: "(not readable)" };

/** A file is set for this edition (its own, else the book's): the same pick the server makes. */
export function hasDigitalFile(book: any, variantId?: string): boolean {
  return filesFor(book, variantId).length > 0;
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
  /** Which of the edition's files (Digital D1): 0 is the first, and the only one on most products. */
  file: number;
}

/**
 * Every download an order offers, one per file of each book + edition: its digital lines, and the digital parts of box sets
 * (a part's book id is a valid download id on the server). `booksById` holds the catalog books (or UNREADABLE_BOOK).
 */
export function digitalEntries(order: any, booksById: Record<string, any>): DigitalEntry[] {
  const out: DigitalEntry[] = [];
  const seen = new Set<string>();
  // One entry per file: a product with several files lists each by the name the owner gave it.
  const add = (itemId: string, variantId: string, title: string) => {
    const key = `${itemId}|${variantId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const files = filesFor(booksById[itemId], variantId);
    if (files.length > 1) files.forEach((f, file) => out.push({ itemId, variantId, title: `${title}: ${fileLabel(f)}`, file }));
    else out.push({ itemId, variantId, title, file: 0 });
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

export interface LibraryEntry extends DigitalEntry {
  /** The order the download runs through: the newest paid one that holds this file. */
  order: any;
}

/**
 * The account's Library (Digital D1b): every download across the shopper's paid orders, one row per product, edition and
 * file. Bought twice, it is listed once, through the newest order (`orders` comes newest first, like the order history).
 */
export function libraryEntries(orders: any[], entriesByOrder: Record<string, DigitalEntry[]>): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  const seen = new Set<string>();
  for (const order of orders || []) {
    if (order?.paymentStatus !== "paid") continue;
    for (const entry of entriesByOrder[order.id] || []) {
      const key = `${entry.itemId}|${entry.variantId}|${entry.file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...entry, order });
    }
  }
  return out;
}
