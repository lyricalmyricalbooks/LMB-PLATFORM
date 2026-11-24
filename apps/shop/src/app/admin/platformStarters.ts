// The control room's choice of starter websites for this shop (`platform/starters`, admin-read, written only by the
// platform: control-room/starterSites.js). The pure rules are in lookGallery.ts (`offeredStarters`, `newStarters`).
// Kept apart from lookGallery.ts so setup mode, which has no shop database, never loads Firestore.
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { StarterChoice } from "./lookGallery";

/** One object so the fixtures can swap in sample answers. */
export const startersData = {
  /** Follows platform/starters; null when there is none or it can't be read (every starter then shows). */
  watch(onChange: (choice: StarterChoice) => void): () => void {
    return onSnapshot(doc(db, "platform", "starters"), (snap) => onChange(snap.exists() ? (snap.data() as StarterChoice) : null), () => onChange(null));
  },
};

/** The control room's starter choice, kept up to date (null until read, and when switched off). */
export function usePlatformStarters(enabled = true): StarterChoice {
  const [choice, setChoice] = useState<StarterChoice>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    // A read that can't even start (no database here) shows every starter, never breaks the page.
    try { return startersData.watch(setChoice); } catch { return undefined; }
  }, [enabled]);
  return choice;
}
