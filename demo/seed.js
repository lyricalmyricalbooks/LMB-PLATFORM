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
import { PRACTICE_KEYS } from "./practicePay.js";
import { PRACTICE_MAIL_KEY } from "./practiceMail.js";
import { SAMPLE_CATEGORIES, SAMPLE_PRESS, sampleDiscounts, sampleProducts, sampleReviews } from "./sampleCatalogue.js";

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
  return ensureArt(fetch, `products/demo/${id}.svg`, coverSvg(title, index));
}

/** Uploads one SVG picture to the shop's bucket as `name` (when missing) and returns its address. */
export async function ensureArt(fetch, name, svg) {
  const object = url(PORTS.storage, `/v0/b/${SHOP_BUCKET}/o/${encodeURIComponent(name)}`);
  const found = await fetch(object, { headers: ADMIN });
  if (!found.ok) {
    await json(await fetch(url(PORTS.storage, `/upload/storage/v1/b/${SHOP_BUCKET}/o?uploadType=media&name=${encodeURIComponent(name)}`), {
      method: "POST",
      headers: { ...ADMIN, "Content-Type": "image/svg+xml" },
      body: svg,
    }), "The storage emulator");
  }
  return `${object}?alt=media`;
}

/** The sample press's printed books as the stockroom keeps them: what was printed, at the shop's prices. */
export function sampleStockroomBooks() {
  return sampleProducts()
    .filter(({ data }) => !data.kind && !data.digital && !data.preorder)
    .map(({ id, author, data }) => ({
      id, title: data.title, author, isbn: data.isbn ?? "—",
      maxPrint: data.stockLevel, listPrice: data.retailPrice, currency: "CA$", threshold: 3, productionCost: Math.round(data.retailPrice * 0.3), urlParam: id,
    }));
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
 * The demo's practice payments and inbox, written on every start (the shop may have been saved before they existed):
 * the shop takes cards in test mode through the practice card service with its practice keys, and sends email through
 * the practice inbox (practicePay.js, practiceMail.js). The keys work nowhere else.
 */
export async function ensurePracticeServices(shop) {
  await shop.set("settings/website", { payments: { testMode: true, stripe: { connected: true, testPublicKey: PRACTICE_KEYS.publishable } } },
    { fields: ["payments.testMode", "payments.stripe.connected", "payments.stripe.testPublicKey"] });
  await shop.set("adminSecrets/stripe", { testSecretKey: PRACTICE_KEYS.secret }, { fields: ["testSecretKey"] });
  await shop.set("adminSecrets/stripeWebhook", { test: PRACTICE_KEYS.webhookSecret }, { fields: ["test"] });
  await shop.set("adminSecrets/resend", { apiKey: PRACTICE_MAIL_KEY }, { fields: ["apiKey"] });
}

/**
 * The sample press shoppers see (sampleCatalogue.js): its products with their pictures, reviews, a discount code, a
 * second shipping zone, and its name and menu. Products, reviews and codes are only added when missing, so changes
 * made while clicking around stay. The first time, the platform's own test products are hidden from shoppers (made
 * drafts) and the shop takes the sample press's name and menu. Returns the ids of the products added.
 */
export async function seedSamplePress(fetch, shop, now = () => new Date()) {
  const added = [];
  for (const product of sampleProducts()) {
    if (await shop.get(`books/${product.id}`)) continue;
    const urls = [];
    for (const art of product.art) urls.push(await ensureArt(fetch, `products/sample/${product.id}-${art.name}.svg`, art.svg));
    const data = { ...product.data, slug: product.id, photos: urls.map((url) => ({ url, altText: `${product.data.title}` })), createdAt: now().toISOString() };
    if (product.variantPhotos && data.variants) data.variants = data.variants.map((v) => ({ ...v, photoUrl: urls[product.variantPhotos[v.id] ?? 0] }));
    if (await shop.create(`books/${product.id}`, data)) added.push(product.id);
  }
  for (const { id, data } of sampleReviews(now())) await shop.create(`reviews/${id}`, data);
  for (const { id, data } of sampleDiscounts()) await shop.create(`discounts/${id}`, { ...data, createdAt: now().toISOString(), updatedAt: now().toISOString() });
  await shop.create("shipping-profiles/sample-world", { name: "Everywhere else", countries: [], continents: [], restOfWorld: true, base: 15, additional: 3, freeThreshold: 0, createdAt: now().toISOString() });

  if (added.includes("low-tide-almanac")) {
    for (const { path } of testShopDocs().filter(({ path }) => path.startsWith("books/"))) {
      if (await shop.get(path)) await shop.set(path, { status: "draft" }, { fields: ["status"] });
    }
    await shop.set("settings/website", {
      info: { name: SAMPLE_PRESS.name, description: SAMPLE_PRESS.description, website: SAMPLE_PRESS.website, email: SAMPLE_PRESS.email },
      // Studio › Text & labels › Site name: the wordmark, footer, checkout and emails follow it (shared/shopIdentity).
      design: { categories: [...SAMPLE_CATEGORIES], copy: { siteName: SAMPLE_PRESS.name } },
    }, { fields: ["info", "design.categories", "design.copy.siteName"] });
  }
  return added;
}

/**
 * What a press that has just signed up has in its `firstWeek/start` (setup step 12 writes it from the sign-up answers,
 * setup/later-steps.js): no look chosen and no step ticked, so the admin opens on Choose your look and then Set up your
 * shop. "How do you sell today?" is "just starting out" and "What do you sell?" is books.
 */
export const NEW_PRESS_START = Object.freeze({ sellingToday: "starting", publishes: "books", country: "CA", plan: "both" });

/** Starts the demo shop over as a brand-new press: writes `firstWeek/start` afresh, forgetting a look chosen before. */
export async function startAsNewPress(shop, now = () => new Date()) {
  await shop.set("firstWeek/start", { ...NEW_PRESS_START, createdAt: now().toISOString() });
}

/**
 * Seeds everything once. `fetch` is the real fetch (or a fake in tests). `newPress` also starts the shop as a brand-new
 * press (`startAsNewPress`), every time it is asked for. Returns what was made, for the console.
 */
export async function seedDemo({ fetch, now = () => new Date(), newPress = false }) {
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

  await ensurePracticeServices(shop);
  const sampleAdded = await seedSamplePress(fetch, shop, now);

  if (newPress) await startAsNewPress(shop, now);

  // The stockroom's books, in its own database, laid out as setup step 12 adds them (clients/shop.js addBooks). Not
  // through addBooks itself: the emulator never answers a read inside a REST transaction, and nothing else writes here
  // while the demo starts.
  const stockroomDb = firestoreClient({ fetch: emulatorFetch(fetch), token: async () => "owner", projectId: DEMO_PROJECT, database: STOCKROOM_DATABASE });
  const have = await stockroomClient(() => stockroomDb).books(DEMO_PROJECT);
  const stockroomAdded = [...testStockroomBooks(TEST_SHOP), ...sampleStockroomBooks()].filter((book) => !have[book.id]);
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

  return { ownerCreated: owner.created, created, sampleAdded, stockroomAdded: stockroomAdded.map((book) => book.id), newPress };
}
