// The combined admin's tour, remembered on the shop's account as well as on the device (CombinedTour.tsx): one
// admin-only document, `adminPrefs/combinedTour` (the same shape and rule as the Overview's boards and notes), so a
// press who took the tour on the laptop isn't invited again on the phone. Losing it only shows the invitation again.
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

const REMOTE = () => doc(db, "adminPrefs", "combinedTour");

/** Whether the tour was seen on any device of this shop; false when it can't be read (offline, a member's sign-in). */
export async function tourSeenOnAccount(read: () => Promise<{ exists(): boolean; data(): unknown }> = () => getDoc(REMOTE())): Promise<boolean> {
  try {
    const snap = await read();
    return snap.exists() && (snap.data() as { data?: unknown } | undefined)?.data === "done";
  } catch { return false; }
}

/** Marks the tour seen on the account; never throws (a member can't write here, and offline it just waits). */
export async function markTourSeenOnAccount(write: (value: { data: string; updatedAt: number }) => Promise<unknown> = (v) => setDoc(REMOTE(), v)): Promise<void> {
  try { await write({ data: "done", updatedAt: Date.now() }); } catch { /* the device's own mark still holds */ }
}
