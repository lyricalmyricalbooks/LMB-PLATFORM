// Inventory › Inventory app link: calls to the server (createStripeCheckoutSession action "inventoryLink",
// admin only) and a read of the link's settings (admin-read systemStatus/inventoryLink).
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import type { DetailDiff, InventoryAppBook, InventoryLinks, StockRow } from "./inventoryLink";

export type LinkOp = "status" | "check" | "catalog" | "saveLinks" | "acceptMatches" | "ignoreMatches" | "setOptions" | "startSales" | "preview" | "apply" | "syncNow"
  | "linkNewBook" | "ignoreAppBooks" | "unignoreAppBooks" | "checkDetails" | "applyDetail" | "keepDetail";

export interface LinkStatus {
  state: any; undelivered: number | null; unlinkedOrders: number | null; earliestPaidDay: string | null;
  serviceAccount: string; busy: boolean; today: string;
}
export interface StockPreview { hash: string; rows: StockRow[]; changed?: boolean; notReady?: boolean; catchingUp?: boolean; applied?: Array<StockRow & { result: string }> }

async function call<T>(op: LinkOp, payload: Record<string, unknown> = {}): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "inventoryLink", op, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The inventory app link didn't answer. Try again in a minute.");
  return result as T;
}

export const inventoryLinkApi = {
  status: () => call<LinkStatus>("status"),
  check: () => call<{ connection: any }>("check"),
  catalog: () => call<{ books: InventoryAppBook[] }>("catalog"),
  acceptMatches: (keys: string[]) => call<{ links: InventoryLinks; errors: Array<{ bookId: string; variantId: string | null; reason: string }>; added: number }>("acceptMatches", { keys }),
  ignoreMatches: (matches: Array<{ key: string; inventoryBookId: string }>) => call<{ ok?: boolean }>("ignoreMatches", { matches }),
  saveLinks: (links: InventoryLinks) => call<{ links: InventoryLinks; errors: Array<{ bookId: string; variantId: string | null; reason: string }> }>("saveLinks", { links }),
  setOptions: (options: { autoSync?: boolean; rehearsal?: boolean }) => call<{ saved: any }>("setOptions", options),
  startSales: (startDay: string) => call<{ startDay: string; run: any }>("startSales", { startDay }),
  preview: () => call<{ run: any; stock: StockPreview | null }>("preview"),
  apply: (confirmHash: string) => call<{ run: any; stock: StockPreview | null }>("apply", { confirmHash }),
  syncNow: () => call<{ run: any; stock: StockPreview | null }>("syncNow"),
  /** "Add to the shop": match a just-saved website book to the inventory app book it was made from. */
  linkNewBook: (bookId: string, inventoryBookId: string, variantId: string | null = null) =>
    call<{ links: InventoryLinks; already: boolean }>("linkNewBook", { bookId, inventoryBookId, ...(variantId ? { variantId } : {}) }),
  ignoreAppBooks: (ids: string[]) => call<{ ignoredAppBooks: Record<string, string> }>("ignoreAppBooks", { ids }),
  unignoreAppBooks: (ids: string[]) => call<{ ignoredAppBooks: Record<string, string> }>("unignoreAppBooks", { ids }),
  /** Book details that differ from the app: check again now, copy the app's value here, or leave one as is. */
  checkDetails: () => call<{ detailDiffs: { at: string; items: DetailDiff[] } }>("checkDetails"),
  applyDetail: (id: string, signature: string) => call<{ applied: DetailDiff; detailDiffs: { at: string; items: DetailDiff[] } }>("applyDetail", { id, signature }),
  keepDetail: (id: string, signature: string) => call<{ keptDetails: Record<string, string> }>("keepDetail", { id, signature }),
  /** The links alone, for the stock guards (Inventory page, book editor). {} when not set up. */
  links: async (): Promise<InventoryLinks> => {
    const snap = await getDoc(doc(db, "systemStatus", "inventoryLink"));
    return (snap.exists() && (snap.data() as any).links) || {};
  },
  /** The whole saved state (admin alerts read it). */
  state: async (): Promise<any> => {
    const snap = await getDoc(doc(db, "systemStatus", "inventoryLink"));
    return snap.exists() ? snap.data() : {};
  },
};
