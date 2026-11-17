// Ways to sell (beta): what the admin reads to know which of the six ways (shared/waysToSell.ts) the platform has
// turned on for this shop. `platform/features` › `ways` is written only by the platform's control room; the owner's own
// switches are `firstWeek/start` › `ways` (adminApi.updateFirstWeek).
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { waysAllowed, waysIn, type WayId } from "../../shared/waysToSell";

/** One object so the admin fixture (src/adminFixture/main.ts) can swap in sample answers. */
export const waysData = {
  /** Follows platform/features: the ways the platform allows this shop. None when the record can't be read. */
  watchAllowed(onChange: (ways: WayId[]) => void): () => void {
    return onSnapshot(doc(db, "platform", "features"), (snap) => onChange(snap.exists() ? waysAllowed(snap.data()) : []), () => onChange([]));
  },
  /** Follows firstWeek/start: the ways the owner switched on in Settings › Ways to sell. */
  watchChosen(onChange: (ways: WayId[]) => void): () => void {
    return onSnapshot(doc(db, "firstWeek", "start"), (snap) => onChange(snap.exists() ? waysIn(snap.data()?.ways) : []), () => onChange([]));
  },
};

/** The ways the platform turned on for this shop, kept up to date. */
export function useWaysAllowed(): WayId[] {
  const [ways, setWays] = useState<WayId[]>([]);
  useEffect(() => waysData.watchAllowed(setWays), []);
  return ways;
}

/**
 * The ways that are on for this shop: allowed by the platform and switched on by the owner (the server checks the same
 * two switches before every action). Follows both, so a page shows and hides without a reload.
 */
export function useWaysOn(enabled = true): WayId[] {
  const [allowed, setAllowed] = useState<WayId[]>([]);
  const [chosen, setChosen] = useState<WayId[]>([]);
  useEffect(() => (enabled ? waysData.watchAllowed(setAllowed) : undefined), [enabled]);
  useEffect(() => (enabled ? waysData.watchChosen(setChosen) : undefined), [enabled]);
  return allowed.filter((id) => chosen.includes(id));
}
