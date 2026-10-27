import type { Firestore } from "firebase/firestore/lite";

/**
 * Firestore Lite (and the Firebase app + App Check under it) loads on first use, in its own chunk, so the shop's
 * first screen never waits for it to download and start. Use the functions this returns, not static imports from
 * "firebase/firestore/lite" (a static import pulls it back into the page's main script).
 */
export type Lite = typeof import("firebase/firestore/lite") & { liteDb: Firestore };

let loading: Promise<Lite> | null = null;

export function lite(): Promise<Lite> {
  if (!loading) {
    loading = Promise.all([import("firebase/firestore/lite"), import("./firestoreLite")])
      .then(([sdk, own]) => ({ ...sdk, liteDb: own.liteDb }) as Lite)
      .catch(error => { loading = null; throw error; });
  }
  return loading;
}
