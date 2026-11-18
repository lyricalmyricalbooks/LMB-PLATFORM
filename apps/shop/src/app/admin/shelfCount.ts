// Fix stock from the product page (simpler admin, change 11): the owner counts the copies on their own shelf and the
// stockroom's records follow, written the stockroom's own way so it stays the one true count. Pure and tested.
import { recordInventoryDisposal } from "@stockroom/inventory.js";

import type { StockroomBook } from "./stockroomBridge";

export type ShelfPlan =
  | { kind: "same" }
  /** Fewer than the records say: the missing copies are written off (an Inventory Disposal, reason "Shelf count"). */
  | { kind: "writeOff"; qty: number }
  /** An item with no print run keeps a plain count: it moves by `delta`. */
  | { kind: "setCount"; delta: number }
  /** More than a print run allows: the print run is the stockroom's to change. */
  | { kind: "more"; extra: number };

/** What a count of the owner's own copies means for the records. */
export function shelfCountPlan(book: Pick<StockroomBook, "publisher" | "hasPrintRun">, counted: number): ShelfPlan {
  const delta = Math.round(counted) - book.publisher;
  if (delta === 0) return { kind: "same" };
  if (!book.hasPrintRun) return { kind: "setCount", delta };
  return delta < 0 ? { kind: "writeOff", qty: -delta } : { kind: "more", extra: delta };
}

/** The change to the item's records for a plan, or null when the stockroom has to make it. */
export function applyShelfCount(plan: ShelfPlan, today: string, id: string) {
  if (plan.kind === "writeOff") return (s: any) => { recordInventoryDisposal(s, { id, date: today, qty: plan.qty, reason: "Shelf count", notes: "Counted on the product page" }); return s; };
  if (plan.kind === "setCount") return (s: any) => { s.stock = Math.max(0, (Number(s.stock) || 0) + plan.delta); return s; };
  return null;
}

/** The sentence under the count box before saving. */
export function shelfCountWords(plan: ShelfPlan, copies: (n: number) => string): string {
  switch (plan.kind) {
    case "same": return "That matches the stockroom.";
    case "writeOff": return `${copies(plan.qty)} will be written off as missing, so the stockroom shows what's on your shelf.`;
    case "setCount": return plan.delta > 0 ? `${copies(plan.delta)} will be added to the stockroom's count.` : `${copies(-plan.delta)} will come off the stockroom's count.`;
    case "more": return `That's ${copies(plan.extra)} more than the print run allows. Change the print run in the stockroom.`;
  }
}
