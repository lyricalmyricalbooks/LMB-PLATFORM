// The demo shop (docs/demo-shop.md): its settings, rules and seeding, proven without starting the emulators. The
// seeding runs against a pretend emulator that records every request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addresses, DEMO_OWNER, DEMO_PROJECT, demoRules, emulatorConfig, firebaseRc, javaMajor, joinFirestoreRules, PORTS,
  profileScript, shopProfile, stockroomProfile, viteEnv,
} from "./config.js";
import { demoProfilePlugin } from "./serve.js";
import { demoShopDocs, emulatorFetch, seedDemo } from "./seed.js";
import { coverSvg } from "./photos.js";
import { testShopDocs } from "../setup/test-catalogue.js";
import { fakeEmulators } from "./fakeEmulators.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the demo only ever names a made-up demo- project", () => {
  assert.match(DEMO_PROJECT, /^demo-/);
  assert.equal(shopProfile().firebase.projectId, DEMO_PROJECT);
  assert.equal(stockroomProfile().firebase.projectId, DEMO_PROJECT);
  assert.deepEqual(firebaseRc().projects, { default: DEMO_PROJECT });
  assert.match(DEMO_OWNER.email, /@example\.com$/);
});

test("the apps use the same emulator ports as the demo", () => {
  const shop = read("apps/shop/src/lib/emulators.ts");
  const stockroom = read("apps/stockroom/src/lib/emulators.js");
  for (const name of ["auth", "firestore", "storage", "functions"]) assert.match(shop, new RegExp(`${name}: ${PORTS[name]}\\b`), `shop ${name}`);
  for (const name of ["auth", "firestore", "database", "storage"]) assert.match(stockroom, new RegExp(`${name}: ${PORTS[name]}\\b`), `stockroom ${name}`);
});

test("the apps start with the emulator switch on and App Check off", () => {
  assert.deepEqual(viteEnv(), { VITE_FIREBASE_EMULATORS: "true", VITE_FIREBASE_EMULATOR_HOST: "127.0.0.1", VITE_APP_CHECK_MODE: "off" });
});

test("both profiles pass the apps' own profile checks", async () => {
  const shop = await import("../apps/stockroom/src/lib/shop-profile.js");
  const parsed = shop.parseShopProfile(stockroomProfile());
  assert.equal(parsed.firebase.projectId, DEMO_PROJECT);
  assert.deepEqual(parsed.stockroom, { firestoreDatabase: "stockroom", storageBucket: `${DEMO_PROJECT}-stockroom` });
  // The shop's check (shopProfile.ts) asks for the same shape: https site, six Firebase keys, both app flags.
  const profile = shopProfile();
  assert.match(profile.siteUrl, /^https:\/\/[^/\s]+$/);
  assert.deepEqual(Object.keys(profile.firebase).sort(), ["apiKey", "appId", "authDomain", "messagingSenderId", "projectId", "storageBucket"]);
  assert.match(profileScript(profile), /^\/\/.*\nwindow\.__SHOP_PROFILE__ = \{/);
});

test("the rules are filled in for the demo owner, the shop's and the stockroom's kept apart", () => {
  const rules = Object.fromEntries(demoRules(read).map(({ file, text }) => [file, text]));
  assert.deepEqual(Object.keys(rules).sort(), ["database.rules.json", "firestore.rules", "shop.storage.rules", "stockroom.storage.rules"]);
  for (const [file, text] of Object.entries(rules)) {
    assert.ok(!text.includes("__SHOP_OWNER_EMAIL__"), `${file} still has the owner slot`);
    assert.ok(text.includes(DEMO_OWNER.email), `${file} doesn't name the demo owner`);
  }
  const firestore = rules["firestore.rules"];
  assert.equal(firestore.match(/match \/databases\/\(default\)\/documents \{/g).length, 1);
  assert.equal(firestore.match(/match \/databases\/stockroom\/documents \{/g).length, 1);
  assert.ok(!firestore.includes("{database}/documents {"), "a rules block still covers every database");
  // The stockroom's Storage rules read its own database, as its deploy writes them.
  assert.ok(rules["stockroom.storage.rules"].includes("/databases/stockroom/documents/"));
  assert.equal(firestore.split("{").length, firestore.split("}").length, "the joined rules' braces don't balance");
});

test("joining the rules refuses a file without the usual layout", () => {
  assert.throws(() => joinFirestoreRules("service cloud.firestore {}", read("apps/stockroom/firestore.rules")), /shop Firestore rules/);
});

test("the emulator config names every piece, and leaves the server code out on request", () => {
  const withFunctions = emulatorConfig({ functionsSource: "../apps/shop/functions" });
  assert.deepEqual(Object.keys(withFunctions.emulators).sort(), ["auth", "database", "firestore", "functions", "hub", "logging", "singleProjectMode", "storage", "ui"]);
  assert.deepEqual(withFunctions.functions, [{ source: "../apps/shop/functions", codebase: "default" }]);
  const without = emulatorConfig({ functionsSource: null });
  assert.equal(without.functions, undefined);
  assert.equal(without.emulators.functions, undefined);
  assert.deepEqual(without.storage.map((bucket) => bucket.target), ["shop", "stockroom"]);
  assert.deepEqual(Object.keys(firebaseRc().targets[DEMO_PROJECT].storage), ["shop", "stockroom"]);
});

test("the console lists the storefront, a book, the admin, Studio, the stockroom and the emulator panel", () => {
  const list = addresses().map(([, address]) => address);
  assert.deepEqual(list, [
    "http://127.0.0.1:5173/",
    "http://127.0.0.1:5173/books/test-book-one",
    "http://127.0.0.1:5173/admin",
    "http://127.0.0.1:5173/admin#designer",
    "http://127.0.0.1:5174/",
    "http://127.0.0.1:4000/",
  ]);
});

test("Java versions are read from `java -version`", () => {
  assert.equal(javaMajor('openjdk version "21.0.12.1" 2026-08-18'), 21);
  assert.equal(javaMajor('java version "1.8.0_401"'), 8);
  assert.equal(javaMajor('openjdk version "11.0.2"'), 11);
  assert.equal(javaMajor("command not found"), 0);
});

test("the page's profile file is answered with the demo profile, and nothing else is", () => {
  let middleware;
  demoProfilePlugin("PROFILE").configureServer({ middlewares: { use: (fn) => { middleware = fn; } } });
  const answer = (url) => {
    const sent = { headers: {} };
    let passed = false;
    middleware({ url }, { setHeader: (k, v) => { sent.headers[k] = v; }, end: (body) => { sent.body = body; } }, () => { passed = true; });
    return passed ? "passed" : sent.body;
  };
  assert.equal(answer("/shop-profile.js"), "PROFILE");
  assert.equal(answer("/shop-profile.js?v=1"), "PROFILE");
  assert.equal(answer("/src/lib/shop-profile.js"), "passed");
  assert.equal(answer("/"), "passed");
});

test("the demo books are the test shop's, each with a cover", () => {
  const docs = demoShopDocs((id) => `http://photo/${id}`);
  const books = docs.filter(({ path }) => path.startsWith("books/"));
  assert.deepEqual(books.map(({ path }) => path), testShopDocs().filter(({ path }) => path.startsWith("books/")).map(({ path }) => path));
  for (const { path, data } of books) assert.deepEqual(data.photos, [{ url: `http://photo/${path.slice(6)}`, altText: `Cover of ${data.title}` }]);
  assert.ok(docs.some(({ path }) => path === "shipping-profiles/test-canada"));
  assert.ok(docs.some(({ path }) => path === "settings/website"));
  assert.deepEqual(docs.find(({ path }) => path === `members/${DEMO_OWNER.email}`).data, { role: "owner", addedBy: "demo" });
  assert.match(coverSvg("Test <Book>", 7), /^<svg[^>]+>.*TEST.*&LT;BOOK&GT;/);
});

test("Google's Firestore address goes to the emulator", async () => {
  const seen = [];
  const fetch = emulatorFetch(async (url) => { seen.push(url); return new Response("{}"); });
  await fetch("https://firestore.googleapis.com/v1/projects/demo-colophon-test/databases/(default)/documents/books/a");
  await fetch("http://127.0.0.1:9099/x");
  assert.deepEqual(seen, ["http://127.0.0.1:8080/v1/projects/demo-colophon-test/databases/(default)/documents/books/a", "http://127.0.0.1:9099/x"]);
});

test("seeding fills the shop, the stockroom, the photos and the owner, all on the emulators", async () => {
  const emulators = fakeEmulators();
  const result = await seedDemo({ fetch: emulators.fetch, now: () => new Date("2026-10-28T12:00:00Z") });
  assert.equal(result.ownerCreated, true);
  assert.equal(result.created.length, demoShopDocs(() => "").length);
  assert.deepEqual(result.stockroomAdded, ["test-book-one", "test-book-two", "test-book-three"]);
  assert.equal(emulators.files.size, 5);
  // Nothing went anywhere but the local emulators.
  for (const { url } of emulators.requests) assert.match(url, /^http:\/\/127\.0\.0\.1:(9099|9199|8080)\//);
  // The owner carries the Team owner role, which both apps accept.
  const update = emulators.requests.find(({ url }) => url.endsWith("accounts:update"));
  assert.deepEqual(JSON.parse(JSON.parse(update.body).customAttributes), { role: "owner" });
  // The stockroom's books are in its own database, switched to the newer storage.
  assert.ok(emulators.docs.has("stockroom/documents/settings/catalog"));
  assert.deepEqual(emulators.docs.get("stockroom/documents/settings/modeFlags").fs_mode_global, { booleanValue: true });
  assert.ok(emulators.docs.has("(default)/documents/books/test-book-one"));
});

test("seeding twice changes nothing the second time", async () => {
  const emulators = fakeEmulators();
  await seedDemo({ fetch: emulators.fetch });
  const before = new Map(emulators.docs);
  const again = await seedDemo({ fetch: emulators.fetch });
  assert.deepEqual(again.created, []);
  assert.deepEqual(again.stockroomAdded, []);
  assert.equal(again.ownerCreated, false);
  assert.deepEqual(emulators.docs, before);
});
