// The demo shop's fixed settings (docs/demo-shop.md): one made-up project on the Firebase Local Emulator Suite, the
// ports each piece listens on, the two apps' shop profiles and the emulator config. Nothing here reaches Google: the
// emulators never contact Google for a project id that starts with "demo-", and the apps only switch to the emulators
// when they are started with the demo flag (apps/shop/src/lib/emulators.ts, apps/stockroom/src/lib/emulators.js).
import { fillRules as fillShopRules } from "../apps/shop/scripts/deployConfig.mjs";
import { fillRules as fillStockroomRules } from "../apps/stockroom/scripts/deployConfig.mjs";

export const DEMO_PROJECT = "demo-colophon-test";
export const DEMO_OWNER = Object.freeze({ email: "owner@example.com", name: "Demo Owner", uid: "demo-owner" });
export const HOST = "127.0.0.1";
// The firebase-tools release the repo's CI already uses.
export const FIREBASE_TOOLS = "firebase-tools@15.32.1";
export const SHOP_BUCKET = `${DEMO_PROJECT}.appspot.com`;
export const STOCKROOM_DATABASE = "stockroom";
export const STOCKROOM_BUCKET = `${DEMO_PROJECT}-stockroom`;
export const RTDB_NAMESPACE = `${DEMO_PROJECT}-default-rtdb`;

// The apps read the same numbers (apps/shop/src/lib/emulators.ts, apps/stockroom/src/lib/emulators.js); demo.test.js
// checks they agree.
export const PORTS = Object.freeze({
  auth: 9099,
  firestore: 8080,
  database: 9000,
  storage: 9199,
  functions: 5001,
  ui: 4000,
  hub: 4400,
  logging: 4500,
  shop: 5173,
  stockroom: 5174,
  // The practice card service and inbox (practiceServices.js).
  practice: 5175,
});

export const url = (port, path = "") => `http://${HOST}:${port}${path}`;

const firebaseWeb = {
  // Made up: the emulators accept any key.
  apiKey: "demo-api-key",
  authDomain: `${DEMO_PROJECT}.firebaseapp.com`,
  projectId: DEMO_PROJECT,
  storageBucket: SHOP_BUCKET,
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

/** The shop's profile (apps/shop/src/lib/shopProfile.ts), served as /shop-profile.js while the demo runs. */
export function shopProfile() {
  return {
    version: 1,
    shopId: DEMO_PROJECT,
    firebase: { ...firebaseWeb },
    functionsRegion: "us-central1",
    siteUrl: `https://${DEMO_PROJECT}.web.app`,
    apps: { shop: true, stockroom: true },
  };
}

/** The stockroom's profile (apps/stockroom/src/lib/shop-profile.js): the same project, its own database and bucket. */
export function stockroomProfile() {
  return {
    ...shopProfile(),
    firebase: { ...firebaseWeb, databaseURL: `https://${RTDB_NAMESPACE}.firebaseio.com` },
    stockroom: { firestoreDatabase: STOCKROOM_DATABASE, storageBucket: STOCKROOM_BUCKET },
  };
}

/** A profile as the file Hosting would serve. */
export const profileScript = (profile) => `// The demo shop's profile (LMB-PLATFORM demo/). Local emulators only.\nwindow.__SHOP_PROFILE__ = ${JSON.stringify(profile, null, 2)};\n`;

/** The Vite settings each app is started with: the emulator switch, and App Check off. */
export function viteEnv() {
  return { VITE_FIREBASE_EMULATORS: "true", VITE_FIREBASE_EMULATOR_HOST: HOST, VITE_APP_CHECK_MODE: "off" };
}

/**
 * The emulator only takes one Firestore rules file for every database, so the shop's rules and the stockroom's are
 * joined: the shop's apply to the default database, the stockroom's to its own. Each keeps its own helper functions,
 * since they sit inside their own `match` block.
 */
export function joinFirestoreRules(shopRules, stockroomRules) {
  const OPEN = "match /databases/{database}/documents {";
  const body = (rules, name) => {
    const start = rules.indexOf(OPEN);
    const end = rules.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error(`The ${name} Firestore rules don't have the usual layout.`);
    // From the database match to the service's closing brace (exclusive): the whole match block.
    return rules.slice(start + OPEN.length, end).replace(/\}\s*$/, "");
  };
  return [
    "rules_version = '2';",
    "// Written by LMB-PLATFORM demo/ for the local emulators only: the shop's and the stockroom's rules, joined.",
    "service cloud.firestore {",
    "  match /databases/(default)/documents {",
    body(shopRules, "shop"),
    "  }",
    `  match /databases/${STOCKROOM_DATABASE}/documents {`,
    body(stockroomRules, "stockroom"),
    "  }",
    "}",
    "",
  ].join("\n");
}

/** Every rules file the emulators load, filled in for the demo owner: [{ file, text }]. */
export function demoRules(read) {
  const owner = DEMO_OWNER.email;
  const stockroom = (file) => fillStockroomRules(file, read(`apps/stockroom/${file}`), { owner, database: STOCKROOM_DATABASE });
  return [
    { file: "firestore.rules", text: joinFirestoreRules(fillShopRules(read("apps/shop/firestore.rules"), owner), stockroom("firestore.rules")) },
    { file: "shop.storage.rules", text: fillShopRules(read("apps/shop/storage.rules"), owner) },
    { file: "stockroom.storage.rules", text: stockroom("storage.rules") },
    { file: "database.rules.json", text: stockroom("database.rules.json") },
  ];
}

/**
 * firebase.json for the emulators, written to .demo/ with the rules. `functionsSource` is the shop's functions folder
 * relative to .demo/, or null to leave the server code out.
 */
export function emulatorConfig({ functionsSource }) {
  const at = (port) => ({ host: HOST, port });
  return {
    emulators: {
      singleProjectMode: true,
      auth: at(PORTS.auth),
      firestore: at(PORTS.firestore),
      database: at(PORTS.database),
      storage: at(PORTS.storage),
      ...(functionsSource ? { functions: at(PORTS.functions) } : {}),
      ui: { enabled: true, ...at(PORTS.ui) },
      hub: at(PORTS.hub),
      logging: at(PORTS.logging),
    },
    firestore: { rules: "firestore.rules" },
    database: { rules: "database.rules.json" },
    // Two buckets need deploy targets, which .firebaserc names (firebaseRc below).
    storage: [
      { target: "shop", rules: "shop.storage.rules" },
      { target: "stockroom", rules: "stockroom.storage.rules" },
    ],
    ...(functionsSource ? { functions: [{ source: functionsSource, codebase: "default" }] } : {}),
  };
}

/** .firebaserc for .demo/: the demo project and its two buckets. Never written inside apps/. */
export function firebaseRc() {
  return {
    projects: { default: DEMO_PROJECT },
    targets: { [DEMO_PROJECT]: { storage: { shop: [SHOP_BUCKET], stockroom: [STOCKROOM_BUCKET] } } },
  };
}

/** The addresses to open, in the order the console prints them. */
export function addresses() {
  return [
    ["Storefront", url(PORTS.shop, "/")],
    ["A book page", url(PORTS.shop, "/books/low-tide-almanac")],
    ["A shirt in sizes", url(PORTS.shop, "/books/night-buses-t-shirt")],
    ["Admin", url(PORTS.shop, "/admin")],
    ["Studio (the theme editor)", url(PORTS.shop, "/admin#designer")],
    ["Stockroom", url(PORTS.stockroom, "/")],
    ["Practice inbox (the shop's emails)", url(PORTS.practice, "/inbox")],
    ["Emulator control panel", url(PORTS.ui, "/")],
  ];
}

/** Java's major version from `java -version` output, or 0 when it can't be read. */
export function javaMajor(text) {
  const match = String(text).match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return 0;
  const major = Number(match[1]);
  // Java 8 and older call themselves 1.x.
  return major === 1 ? Number(match[2] || 0) : major;
}
