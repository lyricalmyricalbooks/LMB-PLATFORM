import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { app, appCheck, authState } from "./firebaseApp";

// App Check is initialized in ./firebaseApp before Firestore and Auth, as it must be.
export { app, appCheck };
export const db = getFirestore(app);
export const auth = getAuth(app);
authState.loaded = true;
export const googleProvider = new GoogleAuthProvider();
