// Reads and writes for fair helpers, in the stockroom's own folder (the paths and rules the old stockroom app used):
//   fairTill/menu       the till's menu for helpers, written by the owner's admin
//   fairSales/<saleId>  one sale a helper rang up; the owner's admin marks it `imported`, the helper may mark it `cancelled`
// Tests and the admin fixture stand in for these.
import {
  collection, doc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where, type Unsubscribe,
} from "firebase/firestore";
import type { FairMenu, HelperSale } from "@stockroom/fair-helper.js";

import { stockroomHome } from "./stockroomData";

const DAY_MS = 24 * 60 * 60 * 1000;

const menuRef = () => doc(stockroomHome(), "fairTill", "menu");
const saleRef = (id: string) => doc(stockroomHome(), "fairSales", String(id));

export const fairStore = {
  // ── The owner's side ──
  /** The last fortnight of helper sales: the ones not yet brought in are in there, and the list stays short. */
  watchSales(cb: (sales: HelperSale[]) => void, onError: (e: unknown) => void = () => {}, now = Date.now()): Unsubscribe {
    const recent = query(collection(stockroomHome(), "fairSales"), where("at", ">=", new Date(now - 14 * DAY_MS)));
    return onSnapshot(recent, (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<HelperSale, "id">), id: d.id }))), onError);
  },
  /** Marks one sale brought in, on the server: false when it is gone, undone or already brought in. */
  claim(saleId: string): Promise<boolean> {
    const ref = saleRef(saleId);
    return runTransaction(ref.firestore, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? (snap.data() || {}) : null;
      if (!data || data.imported || data.cancelled) return false;
      tx.update(ref, { imported: { at: new Date().toISOString(), device: "admin" } });
      return true;
    });
  },
  /** The till's menu, replaced whole. */
  writeMenu: (menu: FairMenu) => setDoc(menuRef(), { books: menu.books, at: String(menu.at) }),

  // ── The helper's side ──
  watchMenu(cb: (menu: FairMenu | null) => void, onError: (e: unknown) => void = () => {}): Unsubscribe {
    return onSnapshot(menuRef(), (snap) => cb(snap.exists() ? (snap.data() as FairMenu) : null), onError);
  },
  /** This helper's own sales; `pending` while a sale is only on this device. */
  watchMine(email: string, cb: (sales: HelperSale[]) => void, onError: (e: unknown) => void = () => {}): Unsubscribe {
    const mine = query(collection(stockroomHome(), "fairSales"), where("by", "==", email.toLowerCase()));
    return onSnapshot(mine, { includeMetadataChanges: true }, (snap) => cb(snap.docs.map((d) => ({
      ...(d.data({ serverTimestamps: "estimate" }) as Omit<HelperSale, "id">), id: d.id, pending: d.metadata.hasPendingWrites,
    }))), onError);
  },
  /** One sale into the inbox, stamped by the server's clock. Offline it waits and goes when the signal is back. */
  addSale: (id: string, sale: Record<string, unknown>) => setDoc(saleRef(id), { ...sale, at: serverTimestamp() }),
  /** The helper's Undo: marks their own sale cancelled (allowed within the hour, until it is in the records). */
  cancelSale: (id: string) => setDoc(saleRef(id), { cancelled: true }, { merge: true }),
};
