// The admin walkthrough's mark on the shop's account as well as the device (tourSteps.ts): one admin-only document,
// `adminPrefs/combinedTour` (its name from the first, shorter tour; same shape and rule as the Overview's boards), so an
// owner who took or skipped the tour on the laptop isn't offered it again on the phone. The value says which tour was
// seen: "done" was the old six-step tour, so owners who saw only that are offered this one once.
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { TOUR_SEEN_VALUE } from "./tourSteps";

const REMOTE = () => doc(db, "adminPrefs", "combinedTour");

/** Whether this tour was seen on any device of this shop; false when it can't be read (offline, a member's sign-in). */
export async function tourSeenOnAccount(read: () => Promise<{ exists(): boolean; data(): unknown }> = () => getDoc(REMOTE())): Promise<boolean> {
  try {
    const snap = await read();
    return snap.exists() && (snap.data() as { data?: unknown } | undefined)?.data === TOUR_SEEN_VALUE;
  } catch { return false; }
}

/** Marks the tour seen on the account; never throws (a member can't write here, and offline it just waits). */
export async function markTourSeenOnAccount(write: (value: { data: string; updatedAt: number }) => Promise<unknown> = (v) => setDoc(REMOTE(), v)): Promise<void> {
  try { await write({ data: TOUR_SEEN_VALUE, updatedAt: Date.now() }); } catch { /* the device's own mark still holds */ }
}
