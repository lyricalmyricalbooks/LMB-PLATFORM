// Reads the shop's plan (platform/plan, written only by the platform; see platformPlan.ts) and follows its changes, so a
// card added on the platform's Plan & billing page opens a paused admin within moments, without a reload.
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { parsePlatformPlan, type PlatformPlan } from "./platformPlan";

/**
 * The plan while `enabled` (a signed-in admin): undefined while loading, null when the shop has no plan document.
 * `failed` is true when it couldn't be read; the last plan read is kept then, so a dropped connection never locks or
 * unlocks the admin by itself (the shop's server and rules refuse orders on a paused plan either way).
 */
export function usePlatformPlan(enabled: boolean): { plan: PlatformPlan | null | undefined; failed: boolean } {
  const [plan, setPlan] = useState<PlatformPlan | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(doc(db, "platform", "plan"),
      (snap) => { setFailed(false); setPlan(snap.exists() ? parsePlatformPlan(snap.data()) : null); },
      () => { setFailed(true); setPlan((p) => (p === undefined ? null : p)); });
  }, [enabled]);
  return { plan, failed };
}
