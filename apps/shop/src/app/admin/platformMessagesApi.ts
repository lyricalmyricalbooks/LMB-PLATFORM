// Reads the platform's messages to the press (platform/messages, written only by the platform; see
// platformMessages.ts) and follows their changes, so a message added or ended in the control room shows or goes
// within moments, without a reload. Admin only: the storefront never imports this.
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";

/** The raw document while `enabled` (a signed-in admin), or null. A failed read shows no banner. */
export function usePlatformMessagesDoc(enabled: boolean): unknown {
  const [raw, setRaw] = useState<unknown>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(doc(db, "platform", "messages"),
      (snap) => setRaw(snap.exists() ? snap.data() : null),
      () => setRaw(null));
  }, [enabled]);
  return raw;
}
