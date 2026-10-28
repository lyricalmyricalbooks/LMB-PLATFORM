// Reads and writes in the inventory app's (the stockroom's) Firestore — docs/INVENTORY_LINK.md.
//
// The stockroom lives in this shop's own Firebase project, in its own named database (plan 1.21; `stockroom`, set by
// SHOP_STOCKROOM_DATABASE in functions/shopConfig.js). The Functions reach it through the project's own Admin SDK app,
// so there is nothing for the owner to grant: no second project, no second app, no "Cloud Datastore User" step.
// A database that isn't there yet (a shop without the stockroom) answers NOT_FOUND, which the admin panel reports as
// "the stockroom isn't set up in this shop".
// The Admin SDK bypasses the stockroom's rules, so this file is the only code that may touch that database, and it
// touches only the link's own documents (plus a read of the book list, reduced to safe fields by
// projectInventoryCatalog). The shop's own data stays in the (default) database; this file never opens it.
const admin = require("./adminSdk")(require("firebase-admin"));
const { getFirestore } = require("firebase-admin/firestore");
const { projectInventoryCatalog } = require("./inventoryLink");
const { shopConfig } = require("./shopConfig");

const STOCKROOM_DATABASE = shopConfig.stockroomDatabase;
const LINK_VERSION = "website-link-1";

let cachedDb = null;
/**
 * The stockroom's named database in this project. `deps` are for tests: `app()` gives the project's default Admin
 * app, `firestoreFor(app, databaseId)` opens a database in it, `database` names it.
 */
function inventoryDb(deps = {}) {
  const { app = () => admin.app(), firestoreFor = getFirestore, database = STOCKROOM_DATABASE } = deps;
  const custom = Object.keys(deps).length > 0;
  if (cachedDb && !custom) return cachedDb;
  // Never the shop's own database: an empty or "(default)" name would point the link at the shop's orders.
  if (!database || database === "(default)") throw new Error("The stockroom database name is missing.");
  const db = firestoreFor(app(), database);
  if (!custom) cachedDb = db;
  return db;
}

/** The address the owner grants access to (the Functions' runtime service account), or "" when unknown. */
async function serviceAccountEmail() {
  if (process.env.FUNCTIONS_EMULATOR === "true") return "";
  try {
    const res = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email", {
      headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2000),
    });
    return res.ok ? (await res.text()).trim().slice(0, 200) : "";
  } catch {
    return "";
  }
}

/**
 * A short reason the stockroom can't be reached: "no-stockroom" when its database isn't in this project (NOT_FOUND),
 * "not-granted" when the project refuses the Functions' own account (someone removed its role), else a short reason.
 */
function connectionProblem(err) {
  if (err && (err.code === 5 || err.code === "not-found" || /NOT_FOUND|database .* does not exist/i.test(String(err.message)))) return "no-stockroom";
  const code = err && (err.code === 7 || err.code === "permission-denied" || /PERMISSION_DENIED|Missing or insufficient permissions/i.test(String(err.message)));
  if (code) return "not-granted";
  if (/has not been used|is disabled/i.test(String(err && err.message))) return "api-disabled";
  return "unreachable";
}

/** A read and the website's heartbeat write. Returns { ok, serviceAccount, problem?, error? }. */
async function checkConnection({ now = new Date() } = {}) {
  const serviceAccount = await serviceAccountEmail();
  try {
    const ref = inventoryDb().collection("websiteLink").doc("website");
    await ref.get();
    await ref.set({ at: now.toISOString(), serviceAccount, version: LINK_VERSION }, { merge: true });
    return { ok: true, serviceAccount };
  } catch (err) {
    return { ok: false, serviceAccount, problem: connectionProblem(err), error: String(err && err.message || err).slice(0, 300) };
  }
}

/**
 * Tell the inventory app that older website orders are about to arrive (the start day moved earlier).
 * Informational: the app brings website orders in by itself, linking sales already typed in by hand.
 */
async function markPastOrders({ from, at }) {
  await inventoryDb().collection("websiteLink").doc("website").set({ pastFrom: from, pastFromAt: at }, { merge: true });
}

async function heartbeat({ now = new Date(), serviceAccount = "" } = {}) {
  await inventoryDb().collection("websiteLink").doc("website").set({ at: now.toISOString(), ...(serviceAccount ? { serviceAccount } : {}), version: LINK_VERSION }, { merge: true });
}

/**
 * Put the website's view of one order in the inbox. Never goes backwards: a push built from an older
 * snapshot of the order than the one already there is refused, and the same content is not rewritten.
 * Only the website's fields are written (web, pending); the app's `imported`/`app` are left alone.
 * Returns "written" | "same" | "older".
 */
async function writeWebsiteOrder(orderId, web) {
  const db = inventoryDb();
  const ref = db.collection("websiteOrders").doc(orderId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data().web : null;
    if (current && current.hash === web.hash) return "same";
    if (current && current.sourceUpdatedAt && web.sourceUpdatedAt && String(current.sourceUpdatedAt) > String(web.sourceUpdatedAt)) return "older";
    // pendingSince: when this order started waiting for the app (kept while it still waits).
    const waiting = snap.exists && snap.data().pending === true && snap.data().pendingSince;
    tx.set(ref, { web, pending: true, pendingSince: waiting || new Date().toISOString() }, { mergeFields: ["web", "pending", "pendingSince"] });
    return "written";
  });
}

/** Labels the app bought for website orders and hasn't heard back about. */
async function waitingShipments(max = 50) {
  const snap = await inventoryDb().collection("websiteOrders").where("app.shipmentWaiting", "==", true).limit(max).get();
  return snap.docs.map(doc => ({ id: doc.id, shipment: doc.data().app?.shipment || null }));
}

/**
 * The website's answer to one app shipment. Written only if the app hasn't replaced that shipment
 * since; clears app.shipmentWaiting and wakes the app (pending) in the same transaction.
 */
async function replyShipment(orderId, hash, { result, reason = "", now = new Date() }) {
  const db = inventoryDb();
  const ref = db.collection("websiteOrders").doc(orderId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().app?.shipment?.hash !== hash) return false;
    tx.update(ref, {
      shipmentReply: { hash, result, reason: String(reason || "").slice(0, 500), at: now.toISOString() },
      pending: true,
      ...(snap.data().pending === true && snap.data().pendingSince ? {} : { pendingSince: now.toISOString() }),
      "app.shipmentWaiting": false,
    });
    return true;
  });
}

/** websiteStockFeed docs by inventory book id (missing books are absent). */
async function readFeeds(ids) {
  const unique = [...new Set(ids || [])].filter(Boolean);
  if (!unique.length) return {};
  const db = inventoryDb();
  const out = {};
  for (let i = 0; i < unique.length; i += 100) {
    const snaps = await db.getAll(...unique.slice(i, i + 100).map(id => db.collection("websiteStockFeed").doc(id)));
    snaps.forEach(snap => { if (snap.exists) out[snap.id] = snap.data(); });
  }
  return out;
}

/** The inventory app's books (safe fields only) with their latest published count. */
async function readCatalog() {
  const db = inventoryDb();
  const [catalogSnap, feedSnap] = await Promise.all([
    db.collection("settings").doc("catalog").get(),
    db.collection("websiteStockFeed").limit(1000).get(),
  ]);
  const feeds = {};
  feedSnap.docs.forEach(doc => { feeds[doc.id] = doc.data(); });
  const books = catalogSnap.exists ? projectInventoryCatalog(catalogSnap.data()) : [];
  const seen = new Set(books.map(book => book.id));
  // A book the catalog read couldn't see (e.g. still on the old storage) but which has published a count.
  for (const [id, feed] of Object.entries(feeds)) {
    if (!seen.has(id)) books.push({ id, title: String(feed.title || id).slice(0, 200), author: "", isbn: "", currency: "", maxPrint: null, price: null });
  }
  return books.map(book => {
    const feed = feeds[book.id];
    return { ...book, onHand: feed && Number.isFinite(Number(feed.onHand)) ? Number(feed.onHand) : null, feedAt: feed?.at || null };
  });
}

/** How many website orders (new sales, refunds, shipping updates) wait for the app, and since when. */
async function pendingSummary() {
  const snap = await inventoryDb().collection("websiteOrders").where("pending", "==", true).select("web.paidAt", "web.test", "pendingSince").limit(500).get();
  let oldest = null;
  let count = 0;
  snap.docs.forEach(doc => {
    const web = doc.get("web") || {};
    if (web.test) return;
    count += 1;
    const since = doc.get("pendingSince") || web.paidAt;
    if (since && (!oldest || since < oldest)) oldest = since;
  });
  return { count, oldestSince: oldest, capped: snap.size >= 500 };
}

/**
 * The website's side of the shared to-do list and its answers to the app's "Add to the app" requests
 * (`websiteLink/website.todo` / `.linkReplies`). Both fields are replaced whole, leaving the heartbeat alone.
 */
async function writeWebsiteSide({ todo, linkReplies }) {
  await inventoryDb().collection("websiteLink").doc("website").set({ todo, linkReplies }, { mergeFields: ["todo", "linkReplies"] });
}

/** Printed website books the app doesn't have yet (`websiteLink/catalog`), replaced whole. */
async function writeShopCatalog({ books, linked = [], at }) {
  await inventoryDb().collection("websiteLink").doc("catalog").set({ v: 1, at, books, linked });
}

async function readAppHeartbeat() {
  const snap = await inventoryDb().collection("websiteLink").doc("app").get();
  return snap.exists ? snap.data() : null;
}

module.exports = {
  STOCKROOM_DATABASE, inventoryDb, serviceAccountEmail, connectionProblem, checkConnection, heartbeat, markPastOrders,
  writeWebsiteOrder, waitingShipments, replyShipment, readFeeds, readCatalog, pendingSummary, readAppHeartbeat,
  writeWebsiteSide, writeShopCatalog,
};
