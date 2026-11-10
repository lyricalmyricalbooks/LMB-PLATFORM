import { connectFirestoreEmulator, doc, getFirestore } from "firebase/firestore/lite";

import { emulators } from "./emulators";
import { app } from "./firebaseApp";
import { SHOP_FOLDER } from "./shopFolder";

/**
 * Firestore Lite for the public storefront: one-off reads and writes over plain HTTPS, a fraction of the
 * full SDK's size. Use it with functions imported from "firebase/firestore/lite" only — references and
 * snapshots from the two editions can't be mixed. Admin, checkout and account keep `db` from ./firebase.
 */
export const liteFirestore = getFirestore(app);
// The demo shop only (./emulators).
if (emulators) connectFirestoreEmulator(liteFirestore, emulators.host, emulators.ports.firestore);
/** This shop's folder (./shopFolder), as `db` in ./firebase: every path is read inside it. */
export const liteDb = doc(liteFirestore, SHOP_FOLDER);
