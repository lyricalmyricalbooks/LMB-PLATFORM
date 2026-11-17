// Ways to sell (beta): what the admin reads to know which of the six ways (shared/waysToSell.ts) the platform has
// turned on for this shop. `platform/features` › `ways` is written only by the platform's control room; the owner's own
// switches are `firstWeek/start` › `ways` (adminApi.updateFirstWeek).
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { waysAllowed, type WayId } from "../../shared/waysToSell";

/** One object so the admin fixture (src/adminFixture/main.ts) can swap in sample answers. */
export const waysData = {
  /** Follows platform/features: the ways the platform allows this shop. None when the record can't be read. */
  watchAllowed(onChange: (ways: WayId[]) => void): () => void {
    return onSnapshot(doc(db, "platform", "features"), (snap) => onChange(snap.exists() ? waysAllowed(snap.data()) : []), () => onChange([]));
  },
};

/** The ways the platform turned on for this shop, kept up to date. */
export function useWaysAllowed(): WayId[] {
  const [ways, setWays] = useState<WayId[]>([]);
  useEffect(() => waysData.watchAllowed(setWays), []);
  return ways;
}
