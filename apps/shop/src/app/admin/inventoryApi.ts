// Firestore calls for the admin Inventory page. Stock changes run in a transaction against the
// live book (planStockChange), write only the stock field(s) + updatedAt, and add an admin-only
// `inventoryLog` row in the same transaction, so a sale made while the page was open is never
// undone and every adjustment has a reason.
import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, setDoc, where,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { planStockChange, type AdjustReason, type StockChange, type StockPlan } from "./inventoryInsights";
import { isStockLinked } from "./inventoryLink";

/** What a stock change did: the plan it saved, or why nothing was saved (a linked book is counted in the inventory app). */
export type StockResult = StockPlan | { ok: false; reason: "linked"; live?: number };

export interface InventoryLogEntry {
  id: string; bookId: string; variantId: string | null; title: string; edition: string;
  from: number; to: number; delta: number; reason: string; note?: string; at: string; by: string;
}

export const inventoryApi = {
  /** Apply one change to a book or edition. Returns the plan (ok:false = nothing written). */
  adjustStock: async (
    bookId: string, variantId: string | null, change: StockChange,
    meta: { reason: AdjustReason; note?: string; title?: string; edition?: string; force?: boolean },
  ): Promise<StockResult> => {
    const ref = doc(db, "books", bookId);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      // A book matched to the inventory app is counted there; the link sets its stock (docs/INVENTORY_LINK.md).
      const link = await tx.get(doc(db, "systemStatus", "inventoryLink"));
      if (isStockLinked(link.exists() ? (link.data() as any).links : null, bookId, variantId)) return { ok: false, reason: "linked" } as StockResult;
      const plan = planStockChange(snap.exists() ? snap.data() : null, variantId, change, { force: meta.force });
      if (!plan.ok || plan.from === plan.to) return plan;
      const at = new Date().toISOString();
      tx.update(ref, { ...plan.patch, updatedAt: at });
      tx.set(doc(collection(db, "inventoryLog")), {
        bookId, variantId: variantId || null, title: String(meta.title || "").slice(0, 300), edition: String(meta.edition || "").slice(0, 120),
        from: plan.from, to: plan.to, delta: plan.to - plan.from, reason: meta.reason, note: String(meta.note || "").slice(0, 500),
        at, by: auth.currentUser?.email || "",
      });
      return plan;
    });
  },

  /** Adjustment history for one title, newest first. */
  history: async (bookId: string, max = 100): Promise<InventoryLogEntry[]> => {
    const snap = await getDocs(query(collection(db, "inventoryLog"), where("bookId", "==", bookId), orderBy("at", "desc"), limit(max)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  },

  /** Back-in-stock sign-ups for one book (admin-only collection). */
  stockAlerts: async (bookId: string): Promise<any[]> => {
    const snap = await getDocs(query(collection(db, "stockAlerts"), where("bookId", "==", bookId), limit(1000)));
    return snap.docs.map((d) => d.data());
  },

  /** Cost prices live in admin-only `inventoryCosts/{bookId}` — books are public, costs are not. */
  costs: async (): Promise<Record<string, number>> => {
    const snap = await getDocs(collection(db, "inventoryCosts"));
    const out: Record<string, number> = {};
    snap.docs.forEach((d) => { const n = Number(d.data().costPrice); if (Number.isFinite(n) && n > 0) out[d.id] = n; });
    return out;
  },
  setCost: async (bookId: string, costPrice: number | null) => {
    await setDoc(doc(db, "inventoryCosts", bookId), { costPrice, currency: "CAD", updatedAt: new Date().toISOString() });
  },

  /** Low-stock line in public settings/website `inventory.lowStockThreshold` (not secret; other fields kept). */
  lowStockSetting: async (): Promise<any> => {
    const snap = await getDoc(doc(db, "settings", "website"));
    return snap.exists() ? snap.data() : {};
  },
  setLowStockThreshold: async (n: number) => {
    await setDoc(doc(db, "settings", "website"), { inventory: { lowStockThreshold: n } }, { mergeFields: ["inventory.lowStockThreshold"] });
  },
};
