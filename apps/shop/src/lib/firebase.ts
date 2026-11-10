import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore } from "firebase/firestore";

import { emulators, emulatorUrl } from "./emulators";
import { app, appCheck, authState } from "./firebaseApp";
import { SHOP_FOLDER } from "./shopFolder";
import { shopProfile } from "./shopProfile";

// App Check is initialized in ./firebaseApp before Firestore and Auth, as it must be.
export { app, appCheck };
/** The whole database (shared by every shop): only for batches, transactions and the emulator. Never read paths from it. */
export const firestore = getFirestore(app);
/**
 * This shop's folder (`shops/<shopId>`, ./shopFolder). `collection(db, "books")` and `doc(db, "settings/website")` read and
 * write inside it, so no page can reach another shop's data by naming a path.
 */
export const db = doc(firestore, SHOP_FOLDER);
export const auth = getAuth(app);
// Everyone signs in on this shop's own sign-in list (the shared system, LMB-PLATFORM docs/shared-system.md): the rules
// and the server count a sign-in only in the shop whose list it came from. No list: the project's own (the demo).
auth.tenantId = shopProfile.tenant ?? null;
// The demo shop only (./emulators): data, sign-in and stored files come from the local emulators.
if (emulators) {
  connectFirestoreEmulator(firestore, emulators.host, emulators.ports.firestore);
  connectAuthEmulator(auth, emulatorUrl(emulators, "auth"));
  const { host, ports } = emulators;
  void import("firebase/storage").then(({ connectStorageEmulator, getStorage }) => connectStorageEmulator(getStorage(app), host, ports.storage));
}
authState.loaded = true;
export const googleProvider = new GoogleAuthProvider();
