import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

import { emulators, emulatorUrl } from "./emulators";
import { app, appCheck, authState } from "./firebaseApp";

// App Check is initialized in ./firebaseApp before Firestore and Auth, as it must be.
export { app, appCheck };
export const db = getFirestore(app);
export const auth = getAuth(app);
// The demo shop only (./emulators): data, sign-in and stored files come from the local emulators.
if (emulators) {
  connectFirestoreEmulator(db, emulators.host, emulators.ports.firestore);
  connectAuthEmulator(auth, emulatorUrl(emulators, "auth"));
  const { host, ports } = emulators;
  void import("firebase/storage").then(({ connectStorageEmulator, getStorage }) => connectStorageEmulator(getStorage(app), host, ports.storage));
}
authState.loaded = true;
export const googleProvider = new GoogleAuthProvider();
