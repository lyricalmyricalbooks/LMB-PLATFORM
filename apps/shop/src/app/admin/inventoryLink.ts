// Which website books the stockroom counts (docs/INVENTORY_LINK.md). Links live in admin-read
// `systemStatus/inventoryLink.links`: { [websiteBookId]: { "_" | variantId: stockroomBookId } }.
// The server keeps them and moves sales and stock between the two sides; the admin only reads them,
// so a matched book's stock stays read-only on the website.

export type InventoryLinks = Record<string, Record<string, string>>;

/** A book in the stockroom, as the link's catalog lists it. */
export interface InventoryAppBook {
  id: string; title: string; author: string; isbn: string; currency: string;
  maxPrint: number | null; onHand: number | null; feedAt: string | null;
}

/** The stockroom book a website book/edition is linked to, or null. */
export function linkedTo(links: InventoryLinks | null | undefined, bookId: string, variantId: string | null): string | null {
  const id = links?.[bookId]?.[variantId || "_"];
  return typeof id === "string" && id ? id : null;
}

/** Is this book (or one of its editions, when variantId is omitted) counted by the stockroom? */
export function isStockLinked(links: InventoryLinks | null | undefined, bookId: string, variantId?: string | null): boolean {
  const entry = links?.[bookId];
  if (!entry) return false;
  if (variantId === undefined) return Object.values(entry).some((v) => typeof v === "string" && !!v);
  return !!linkedTo(links, bookId, variantId);
}
