import type { Auth } from "firebase/auth";
import { authState } from "./authState";

/** Loads Firebase Auth on demand (its own chunk), so shoppers who never sign in never download it. */
export const loadAuth = (): Promise<Auth> => import("./firebase").then(m => m.auth);

/**
 * Whether this browser may hold a saved Firebase sign-in. Auth keeps it in the `firebaseLocalStorageDb`
 * IndexedDB database (or `firebase:authUser:*` in localStorage as a fallback). When the browser cannot
 * list databases we answer yes, so a signed-in owner or customer is never mistaken for a guest.
 */
export async function maySavedSignIn(): Promise<boolean> {
  try {
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith("firebase:authUser:")) return true;
  } catch { /* Storage blocked: fall through to IndexedDB. */ }
  try {
    const list = await (indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> }).databases?.();
    if (Array.isArray(list)) return list.some(db => db.name === "firebaseLocalStorageDb");
  } catch { /* Unknown: assume a session may exist. */ }
  return true;
}

/** The signed-in user once Auth has restored any saved session, or null without loading Auth for guests. */
export async function restoredUser(timeoutMs?: number) {
  if (!authState.loaded && !(await maySavedSignIn())) return null;
  const auth = await loadAuth();
  const ready = auth.authStateReady?.() ?? Promise.resolve();
  await (timeoutMs ? Promise.race([ready, new Promise(resolve => setTimeout(resolve, timeoutMs))]) : ready);
  return auth.currentUser;
}
