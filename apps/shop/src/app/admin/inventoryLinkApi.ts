// The stockroom link's server calls (createStripeCheckoutSession action "inventoryLink", admin only) and reads of
// its saved state (admin-read systemStatus/inventoryLink). The server keeps the link running by itself; the admin
// only matches one book from its Stock and sales tab and reads the links for the stock guards.
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { hasStockroom } from "../../lib/shopProfile";
import type { InventoryAppBook, InventoryLinks } from "./inventoryLink";

type LinkOp = "catalog" | "linkNewBook";

async function call<T>(op: LinkOp, payload: Record<string, unknown> = {}): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in as admin.");
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: "inventoryLink", op, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The stockroom didn't answer. Try again in a minute.");
  return result as T;
}

export const inventoryLinkApi = {
  /** The stockroom's books with their counts (Books shows what's on hand). */
  catalog: () => call<{ books: InventoryAppBook[] }>("catalog"),
  /** Match a website book (or one edition) to its stockroom book. */
  linkNewBook: (bookId: string, inventoryBookId: string, variantId: string | null = null) =>
    call<{ links: InventoryLinks; already: boolean }>("linkNewBook", { bookId, inventoryBookId, ...(variantId ? { variantId } : {}) }),
  /** The links alone, for the stock guards (Inventory page, book editor). {} when not set up, or with no stockroom. */
  links: async (): Promise<InventoryLinks> => {
    // A website-only press keeps all its stock here, whatever an old link left behind.
    if (!hasStockroom()) return {};
    const snap = await getDoc(doc(db, "systemStatus", "inventoryLink"));
    return (snap.exists() && (snap.data() as any).links) || {};
  },
  /** The whole saved state (label alerts, the order page and the admin search read it). */
  state: async (): Promise<any> => {
    if (!hasStockroom()) return {};
    const snap = await getDoc(doc(db, "systemStatus", "inventoryLink"));
    return snap.exists() ? snap.data() : {};
  },
};
