// Messages' reads and writes of the admin-only `contactMessages` records (and the orders lookup beside a message), in
// one object so the admin fixture (src/adminFixture/main.ts) can swap in sample messages. Replies go through the
// server (Messages.tsx `replyCall`), never here.
import {
  collection, deleteDoc, doc, getCountFromServer, getDocs, limit, orderBy, query, startAfter, updateDoc, where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { ContactMessage } from "./Messages";

/** Where the next page starts: opaque to the page. */
export type MessagesCursor = unknown;
export interface MessagesPage { messages: ContactMessage[]; cursor: MessagesCursor | null; more: boolean }
export interface OrdersByEmail { docs: Array<Record<string, any> & { id: string }>; full: boolean }

const col = () => collection(db, "contactMessages");

export const messagesData = {
  async counts(): Promise<{ all: number; unread: number; archived: number }> {
    const [all, unread, archived] = await Promise.all([
      getCountFromServer(col()), getCountFromServer(query(col(), where("status", "in", ["new", "emailed"]))),
      getCountFromServer(query(col(), where("status", "==", "archived"))),
    ]);
    return { all: all.data().count, unread: unread.data().count, archived: archived.data().count };
  },
  async page(size: number, after: MessagesCursor | null): Promise<MessagesPage> {
    const parts = after ? [orderBy("createdAt", "desc"), startAfter(after as QueryDocumentSnapshot), limit(size)] : [orderBy("createdAt", "desc"), limit(size)];
    const snap = await getDocs(query(col(), ...parts));
    return {
      messages: snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
      cursor: snap.docs[snap.docs.length - 1] || after,
      more: snap.docs.length === size,
    };
  },
  async setStatus(id: string, status: ContactMessage["status"]): Promise<void> {
    await updateDoc(doc(db, "contactMessages", id), { status });
  },
  async erase(id: string): Promise<void> {
    await deleteDoc(doc(db, "contactMessages", id));
  },
  /** Up to 50 orders by this (lower-case) address. */
  async ordersFor(email: string): Promise<OrdersByEmail> {
    const snap = await getDocs(query(collection(db, "orders"), where("customer.email", "==", email), limit(50)));
    return { docs: snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })), full: snap.docs.length === 50 };
  },
};
