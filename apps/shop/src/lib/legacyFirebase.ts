/**
 * legacyFirebase.ts
 *
 * Initializes a SECONDARY Firebase app connected to the legacy
 * the inventory project (lmb-test-stockroom).
 *
 * This is read-only from the website's perspective — we only pull
 * stock levels from the RTDB and write them into the main Firestore.
 * The legacy app's auth is signed into separately using the same
 * Google account (owner@example.com).
 */
import { initializeApp, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const LEGACY_APP_NAME = "press-legacy";

const legacyConfig = {
  apiKey: "AIzaTestStockroomKeyNotReal000000000000",
  authDomain: "lmb-test-stockroom.firebaseapp.com",
  databaseURL: "https://lmb-test-stockroom-default-rtdb.firebaseio.com",
  projectId: "lmb-test-stockroom",
  storageBucket: "lmb-test-stockroom.firebasestorage.app",
  messagingSenderId: "100000000002",
  appId: "1:100000000002:web:0000000000000000000002",
};

function getLegacyApp() {
  try {
    return getApp(LEGACY_APP_NAME);
  } catch {
    return initializeApp(legacyConfig, LEGACY_APP_NAME);
  }
}

export const legacyApp = getLegacyApp();
export const legacyDb = getDatabase(legacyApp);
export const legacyAuth = getAuth(legacyApp);
