// Licence keys waiting for a product, in the admin-only `licenceKeys/{bookId}` (functions/licenceKeys.js hands them out).
import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db, firestore } from "../../lib/firebase";
import { addKeys } from "./licenceKeys";

export type KeyPool = { waiting: number; given: number };

const ref = (bookId: string) => doc(db, "licenceKeys", bookId);
const countOf = (data: any): KeyPool => ({ waiting: Array.isArray(data?.available) ? data.available.length : 0, given: Number(data?.givenCount) || 0 });

export const licenceKeysStore = {
  async load(bookId: string): Promise<KeyPool> {
    const snap = await getDoc(ref(bookId));
    return countOf(snap.exists() ? snap.data() : null);
  },
  /** Adds keys inside a transaction, so a sale taking a key meanwhile is never undone. */
  async add(bookId: string, keys: string[]): Promise<KeyPool & { added: number; skipped: number }> {
    return runTransaction(firestore, async (tx) => {
      const snap = await tx.get(ref(bookId));
      const data: any = snap.exists() ? snap.data() : {};
      const { available, added, skipped } = addKeys(Array.isArray(data.available) ? data.available : [], keys);
      tx.set(ref(bookId), { available, givenCount: Number(data.givenCount) || 0, updatedAt: new Date().toISOString() });
      return { ...countOf({ available, givenCount: data.givenCount }), added, skipped };
    });
  },
};
