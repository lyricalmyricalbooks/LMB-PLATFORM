import { getFirestore } from "firebase/firestore/lite";

import { app } from "./firebaseApp";

/**
 * Firestore Lite for the public storefront: one-off reads and writes over plain HTTPS, a fraction of the
 * full SDK's size. Use it with functions imported from "firebase/firestore/lite" only — references and
 * snapshots from the two editions can't be mixed. Admin, checkout and account keep `db` from ./firebase.
 */
export const liteDb = getFirestore(app);
