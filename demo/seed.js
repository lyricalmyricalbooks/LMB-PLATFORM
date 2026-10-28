// Fills the demo emulators with the test shop's starter catalogue (setup/test-catalogue.js) and a demo owner. Safe to
// run again: a document, photo or account already there is left as it is, so changes made while clicking around stay.
//
// Everything goes to the local emulators with the emulator's own "owner" token, which only the emulators accept (it
// passes their security rules the way the platform's own key would on Google). The Firestore writes reuse the
// platform's Firestore client (clients/firestore.js), pointed at the emulator.
import { firestoreClient, FIRESTORE } from "../clients/firestore.js";
import { stockroomClient } from "../clients/shop.js";
import { testShopDocs, testStockroomBooks } from "../setup/test-catalogue.js";
import { TEST_SHOP } from "../setup/test-shop.js";
import { DEMO_OWNER, DEMO_PROJECT, PORTS, SHOP_BUCKET, STOCKROOM_DATABASE, url } from "./config.js";
import { coverSvg } from "./photos.js";

const ADMIN = { Authorization: "Bearer owner" };
const IDENTITY = url(PORTS.auth, "/identitytoolkit.googleapis.com/v1");

/** A fetch that sends Google's Firestore address to the emulator instead. Anything else goes through unchanged. */
export function emulatorFetch(fetch) {
  return (target, init) => fetch(String(target).replace(FIRESTORE, url(PORTS.firestore, "/v1")), init);
}

async function json(response, what) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${what} answered ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/**
 * The demo owner, as if they had signed in with Google once: the emulator's Google sign-in then offers this account,
 * and the account carries the Team "owner" role, which the shop's admin and the stockroom both accept. Returns the
 * owner's sign-in token (for the shop's own link) and whether the account was made now.
 */
export async function ensureOwner(fetch) {
  const idToken = JSON.stringify({ sub: DEMO_OWNER.uid, email: DEMO_OWNER.email, email_verified: true, name: DEMO_OWNER.name });
  const signIn = await json(await fetch(`${IDENTITY}/accounts:signInWithIdp?key=demo-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestUri: url(PORTS.shop),
      postBody: new URLSearchParams({ id_token: idToken, providerId: "google.com" }).toString(),
      returnSecureToken: true,
      returnIdpCredential: true,
    }),
  }), "The sign-in emulator");
  await json(await fetch(`${IDENTITY}/projects/${DEMO_PROJECT}/accounts:update`, {
    method: "POST",
    headers: { ...ADMIN, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: signIn.localId, emailVerified: true, customAttributes: JSON.stringify({ role: "owner" }) }),
  }), "The sign-in emulator");
  return { uid: signIn.localId, created: Boolean(signIn.isNewUser) };
}

/** Uploads one placeholder cover to the shop's bucket (when missing) and returns its address. */
export async function ensurePhoto(fetch, { id, title, index }) {
  const name = `products/demo/${id}.svg`;
  const object = url(PORTS.storage, `/v0/b/${SHOP_BUCKET}/o/${encodeURIComponent(name)}`);
  const found = await fetch(object, { headers: ADMIN });
  if (!found.ok) {
    await json(await fetch(url(PORTS.storage, `/upload/storage/v1/b/${SHOP_BUCKET}/o?uploadType=media&name=${encodeURIComponent(name)}`), {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "image/svg+xml" },
      body: coverSvg(title, index),
    }), "The storage emulator");
  }
  return `${object}?alt=media`;
}

/** The shop's documents: the test shop's starter catalogue with photos, the settings the storefront needs, the Team. */
export function demoShopDocs(photoFor) {
  const books = testShopDocs().map(({ path, data }) => {
    if (!path.startsWith("books/")) return { path, data };
    const id = path.slice("books/".length);
    return { path, data: { ...data, photos: [{ url: photoFor(id), altText: `Cover of ${data.title}` }] } };
  });
  return [
    ...books,
    {
      path: "settings/website",
      data: {
        info: {
          name: "Demo Press",
          description: "A made-up press on your own computer. Nothing here is real: no money moves and no email is sent.",
          website: "https://yourpress.example",
        },
        // Sandbox mode: the checkout says it is a test. Card payments still can't run locally (docs/demo-shop.md).
        payments: { testMode: true },
      },
    },
    // The owner's place on the Team, as setup step 12 writes it (setup/later-steps.js).
    { path: `members/${DEMO_OWNER.email}`, data: { role: "owner", addedBy: "demo" } },
  ];
}

/**
 * Seeds everything once. `fetch` is the real fetch (or a fake in tests). Returns what was made, for the console.
 */
export async function seedDemo({ fetch, now = () => new Date() }) {
  const owner = await ensureOwner(fetch);

  const books = testShopDocs().filter(({ path }) => path.startsWith("books/"));
  const photos = {};
  for (const [index, { path, data }] of books.entries()) {
    const id = path.slice("books/".length);
    photos[id] = await ensurePhoto(fetch, { id, title: data.title, index });
  }

  const shop = firestoreClient({ fetch: emulatorFetch(fetch), token: async () => "owner", projectId: DEMO_PROJECT });
  const created = [];
  for (const { path, data } of demoShopDocs((id) => photos[id])) {
    if (await shop.create(path, { ...data, createdAt: now().toISOString() })) created.push(path);
  }

  // The stockroom's books, in its own database, laid out as setup step 12 adds them (clients/shop.js addBooks). Not
  // through addBooks itself: the emulator never answers a read inside a REST transaction, and nothing else writes here
  // while the demo starts.
  const stockroomDb = firestoreClient({ fetch: emulatorFetch(fetch), token: async () => "owner", projectId: DEMO_PROJECT, database: STOCKROOM_DATABASE });
  const have = await stockroomClient(() => stockroomDb).books(DEMO_PROJECT);
  const stockroomAdded = testStockroomBooks(TEST_SHOP).filter((book) => !have[book.id]);
  if (stockroomAdded.length) {
    const ts = now().getTime();
    const catalog = { ...have };
    const flags = (await stockroomDb.get("settings/modeFlags")) ?? {};
    for (const book of stockroomAdded) {
      catalog[book.id] = book;
      flags[`fs_mode_${book.id}`] = true;
      await stockroomDb.create(`books/${book.id}/data/metadata`, { data: "{}", ts });
    }
    flags.fs_mode_global = true;
    await stockroomDb.set("settings/catalog", { data: JSON.stringify(catalog), ts });
    await stockroomDb.set("settings/modeFlags", flags);
  }

  return { ownerCreated: owner.created, created, stockroomAdded: stockroomAdded.map((book) => book.id) };
}
