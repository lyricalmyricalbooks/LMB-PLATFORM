import { initializeApp } from "firebase/app";

import { initializeBrowserAppCheck } from "./appCheck";
import { shopProfile } from "./shopProfile";

// The shopper bundle starts with just the app and App Check. Shopper reads/writes use Firestore Lite
// (./firestoreLite); the full Firestore SDK and Firebase Auth live in ./firebase and load only with
// admin, checkout, account or a saved sign-in. Both Firestore editions pick up the signed-in user's
// and App Check's tokens whenever those register, so nothing has to load in a fixed order.
// The Firebase settings come from the shop profile the page opened with (./shopProfile).
export const app = initializeApp(shopProfile.firebase);

// One Enterprise provider; legacy v3 keys are no longer used. Must run before Firestore/Auth start.
export const appCheck = initializeBrowserAppCheck(app);

export { authState } from "./authState";
