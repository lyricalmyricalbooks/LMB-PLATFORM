// Where the Overview boards are kept: this browser first (instant, works offline) and the admin-only
// `adminPrefs/overviewBoard` document, so the same boards open on every device the owner signs in on.
// The newer copy wins (`updatedAt`). Nothing here is shop data; losing it only resets the layout.
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { normalizeStore, type BoardStore } from "./overviewBoard";

const LOCAL_KEY = "lm:overview-board";
const REMOTE = () => doc(db, "adminPrefs", "overviewBoard");
/** The document's whole payload stays well under Firestore's 1 MiB; rules cap it at 200 KB. */
export const MAX_BOARD_BYTES = 180_000;

export function readLocalBoards(): BoardStore | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? normalizeStore(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function writeLocalBoards(store: BoardStore) {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store)); } catch { /* private window or full storage: the account copy still saves */ }
}

export async function readRemoteBoards(): Promise<BoardStore | null> {
  const snap = await getDoc(REMOTE());
  if (!snap.exists()) return null;
  const data = snap.data() as { data?: string };
  if (typeof data?.data !== "string") return null;
  try { return normalizeStore(JSON.parse(data.data)); } catch { return null; }
}

export async function writeRemoteBoards(store: BoardStore) {
  const data = JSON.stringify(store);
  if (data.length > MAX_BOARD_BYTES) throw new Error("These boards are too big to save to your account. Remove a board or some widgets.");
  await setDoc(REMOTE(), { data, updatedAt: store.updatedAt });
}
