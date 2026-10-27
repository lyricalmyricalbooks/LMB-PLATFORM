import { designNumber } from "./designNumber";

// Shop grid "Show more books" (Shopify-style paging). Studio › Style › Shop page heading & filters ›
// `catalogPageSize`: 0 (the default) shows every book, as before.
export const MAX_CATALOG_PAGE_SIZE = 96;

export function catalogPageSize(design: any): number {
  const n = Math.floor(designNumber(design, "catalogPageSize", 0));
  return n > 0 ? Math.min(n, MAX_CATALOG_PAGE_SIZE) : 0;
}

/** How many books to draw: everything when paging is off, else the shown count (at least one page). */
export function visibleCount(total: number, pageSize: number, shown: number): number {
  if (pageSize <= 0) return total;
  return Math.min(total, Math.max(pageSize, shown));
}

/** The next count after pressing Show more. */
export function nextShown(total: number, pageSize: number, shown: number): number {
  return Math.min(total, visibleCount(total, pageSize, shown) + pageSize);
}

// Studio › Style › Shop page heading & filters › Show more button › `catalogAutoLoad` (off by default):
// the next books load by themselves when the shopper scrolls near the Show more button. After
// AUTO_LOAD_ROUNDS automatic loads the button takes over again, so the footer stays reachable.
export const AUTO_LOAD_ROUNDS = 4;

export function catalogAutoLoadOn(design: any): boolean {
  return design?.catalogAutoLoad === true && catalogPageSize(design) > 0;
}

/** Whether reaching the Show more button should load the next books by itself. */
export function shouldAutoLoad(on: boolean, autoRounds: number): boolean {
  return on && autoRounds < AUTO_LOAD_ROUNDS;
}
