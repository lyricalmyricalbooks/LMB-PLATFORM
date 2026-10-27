// Admin › Reviews loading, kept small and paged (#144). Spam can create thousands of pending reviews, so the
// screen never reads them all: it shows the newest PENDING_PAGE pending ones, says how many there really are
// (a server-side count), and fetches more on request. Reviewer emails are not read here at all — each one is
// fetched on demand when the owner asks to see it.
import {
  collection, getCountFromServer, getDocs, limit, orderBy, query, startAfter, where,
  type DocumentData, type Firestore, type QueryDocumentSnapshot,
} from "firebase/firestore";

export const PENDING_PAGE = 50;
export const BROWSE_LIMIT = 200;

export type QueueDoc = QueryDocumentSnapshot<DocumentData>;

export type QueuePage = {
  /** Newest reviews of any status (the browse list), capped at BROWSE_LIMIT. */
  recent: QueueDoc[];
  /** The newest pending reviews, one page. */
  pending: QueueDoc[];
  /** Every pending review in the shop, counted by Firestore; null when the count could not be read. */
  pendingTotal: number | null;
  /** Cursor for the next page of pending reviews; null when there is no more. */
  cursor: QueueDoc | null;
};

const pendingBase = (db: Firestore) => [collection(db, "reviews"), where("status", "==", "pending"), orderBy("createdAt", "desc")] as const;

export async function loadReviewQueue(db: Firestore): Promise<QueuePage> {
  const [recent, pending, pendingTotal] = await Promise.all([
    getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(BROWSE_LIMIT))),
    getDocs(query(...pendingBase(db), limit(PENDING_PAGE))),
    getCountFromServer(query(collection(db, "reviews"), where("status", "==", "pending"))).then(s => s.data().count).catch(() => null),
  ]);
  return {
    recent: recent.docs,
    pending: pending.docs,
    pendingTotal,
    cursor: pending.docs.length >= PENDING_PAGE ? pending.docs[pending.docs.length - 1] : null,
  };
}

/** The page of pending reviews after `cursor`. */
export async function loadMorePending(db: Firestore, cursor: QueueDoc): Promise<{ docs: QueueDoc[]; cursor: QueueDoc | null }> {
  const snap = await getDocs(query(...pendingBase(db), startAfter(cursor), limit(PENDING_PAGE)));
  return { docs: snap.docs, cursor: snap.docs.length >= PENDING_PAGE ? snap.docs[snap.docs.length - 1] : null };
}
