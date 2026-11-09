// Changes an installed outside app asks for (platform code plan 26.3b, LMB-PLATFORM docs/app-store.md). Apps never
// touch this shop directly: the platform checks the app's key and permissions, then writes a request to
// `appRequests/<id>` with its own access. The trigger below applies it with this shop's own rules and writes the answer
// back on the same document, where the platform reads it.
//
// Request: { op, appId, appName, input, createdAt }. Answer fields added: { status: "done" | "refused", result, reason,
// answeredAt }. Admins can read `appRequests` (Settings › Apps); nobody can write them from the browser.
//
// Ops:
//   order.dispatch  { orderId, trackingCarrier, trackingNumber, trackingUrl?, shipped? }   (permission write_orders)
//     The same checks as a dispatch from the stockroom app (fulfillmentGuard.js externalDispatchProblem): paid, not
//     test, ships by carrier, not already sent, no open return or request, no dispute, no failed refund, not under
//     review or on hold, no website label being bought, no waiting pre-order. The packing checklist and address review
//     are the app's own steps, as with the stockroom app. `shipped: false` only attaches the tracking.
//     Marking it shipped sends the customer the shipped email (the order trigger does that, as for any dispatch).
//   inventory.adjust  { productId, variantId?, change, expected? }   (permission write_inventory)
//     Adds or takes away copies (`change`, a whole number). With `expected`, refused unless the stock is still that
//     (so an app can set a count without losing a sale made meanwhile). Refused for an item whose stock comes from the
//     stockroom link (the stockroom would undo it; editions sharing one pile are always linked), and for an item that
//     doesn't track stock. Stock never goes below 0. Checkout holds are kept apart and are untouched.
//     Result: { available, title }.
const { externalDispatchProblem } = require("./fulfillmentGuard");

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const cleanUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { const url = new URL(raw); return url.protocol === "https:" ? url.toString().slice(0, 500) : null; } catch { return null; }
};

async function dispatchOrder(db, request, now) {
  const input = request.input || {};
  const orderId = text(input.orderId, 128);
  const trackingNumber = text(input.trackingNumber, 100);
  const trackingCarrier = text(input.trackingCarrier, 80);
  const trackingUrl = cleanUrl(input.trackingUrl);
  const app = text(request.appName, 80) || "an app";
  const source = `app:${text(request.appId, 64)}`;
  if (!orderId || !/^[A-Za-z0-9_-]+$/.test(orderId)) return { status: "refused", reason: "Give the order's id." };
  if (!trackingNumber || !trackingCarrier) return { status: "refused", reason: "Give the carrier and the tracking number." };
  if (trackingUrl === null) return { status: "refused", reason: "The tracking link must start with https://" };
  const shipped = input.shipped !== false;
  const orderRef = db.collection("orders").doc(orderId);
  const opsRef = db.collection("order-operations").doc(orderId);
  return db.runTransaction(async (tx) => {
    const [snap, opsSnap] = await Promise.all([tx.get(orderRef), tx.get(opsRef)]);
    if (!snap.exists) return { status: "refused", reason: "There's no such order." };
    const order = snap.data();
    const operations = opsSnap.exists ? opsSnap.data() : {};
    const sameTracking = String(order.trackingNumber || "").trim() === trackingNumber;
    const dispatched = ["shipped", "out_for_delivery", "delivered", "collected"].includes(order.fulfillmentStatus) || order.status === "completed";
    if (dispatched && sameTracking) return { status: "done", result: "dispatched", reason: "Already sent with this tracking." };
    // Tracking the shop or another app already put on the order is never silently replaced.
    if (order.trackingNumber && !sameTracking && (order.labelUrl || order.trackingSource !== source || dispatched)) {
      return { status: "refused", reason: `The order already has tracking ${order.trackingNumber}. The shop must remove it first.` };
    }
    const problem = externalDispatchProblem(order, operations);
    if (problem) return { status: "refused", reason: problem };
    const at = now.toISOString();
    const message = shipped ? `Sent by ${app} via ${trackingCarrier}. Tracking: ${trackingNumber}` : `Tracking added by ${app}: ${trackingCarrier} ${trackingNumber}.`;
    tx.update(orderRef, {
      trackingNumber, trackingCarrier, trackingUrl, trackingSource: source,
      ...(shipped ? { status: "completed", fulfillmentStatus: "shipped", shippedAt: at } : {}),
      updatedAt: at,
    });
    tx.set(opsRef, {
      ...operations, ...(shipped ? { dispatchedFrom: source, dispatchedAt: at } : {}),
      updatedAt: at, activity: [...(operations.activity || []), { type: "event", message, createdAt: at }],
    });
    return { status: "done", result: shipped ? "dispatched" : "attached", reason: shipped ? "Marked sent; the customer gets the shipped email." : "Tracking is on the order." };
  });
}

const stockOf = (book, key) => {
  if (key === "_") return Math.max(0, Math.floor(Number(book.stockLevel) || 0));
  const v = (Array.isArray(book.variants) ? book.variants : []).find(x => x && x.id === key);
  return v ? Math.max(0, Math.floor(Number(v.stockLevel !== undefined ? v.stockLevel : v.stock) || 0)) : null;
};

async function adjustStock(db, request, now) {
  const input = request.input || {};
  const productId = text(input.productId, 128);
  const variantId = text(input.variantId, 128);
  const change = Number(input.change);
  const expected = input.expected === undefined || input.expected === null ? null : Number(input.expected);
  const app = text(request.appName, 80) || "an app";
  if (!productId || !/^[A-Za-z0-9_-]+$/.test(productId)) return { status: "refused", reason: "Give the product's id." };
  if (variantId && !/^[A-Za-z0-9_-]+$/.test(variantId)) return { status: "refused", reason: "That isn't a variant id." };
  if (!Number.isInteger(change) || change === 0 || Math.abs(change) > 10000) return { status: "refused", reason: "Give the change as a whole number between -10000 and 10000, not 0." };
  if (expected !== null && (!Number.isInteger(expected) || expected < 0)) return { status: "refused", reason: "expected must be a whole number, 0 or more." };
  const key = variantId || "_";
  const bookRef = db.collection("books").doc(productId);
  const linkRef = db.collection("systemStatus").doc("inventoryLink");
  return db.runTransaction(async (tx) => {
    const [snap, linkSnap] = await Promise.all([tx.get(bookRef), tx.get(linkRef)]);
    if (!snap.exists) return { status: "refused", reason: "There's no such product." };
    const book = snap.data();
    const from = stockOf(book, key);
    if (from === null) return { status: "refused", reason: "There's no such variant." };
    if (variantId === "" && Array.isArray(book.variants) && book.variants.length) return { status: "refused", reason: "This product has variants: give the variantId." };
    if (book.trackInventory !== true) return { status: "refused", reason: "The shop doesn't count stock for this product." };
    const links = (linkSnap.exists ? linkSnap.data() || {} : {}).links || {};
    if (links[productId] && typeof links[productId][key] === "string") return { status: "refused", reason: "This item's stock comes from the shop's stockroom. Change it there." };
    if (expected !== null && expected !== from) return { status: "refused", reason: `The stock is now ${from}, not ${expected}. Read it again and retry.` };
    const to = Math.max(0, from + change);
    const at = now.toISOString();
    // The same patch as the admin's stock change (inventoryLink.js stockPatch).
    const patch = key === "_" ? { stockLevel: to } : { variants: book.variants.map(v => (v && v.id === key ? { ...v, stockLevel: to, stock: to } : v)) };
    tx.update(bookRef, { ...patch, updatedAt: at });
    return { status: "done", result: { available: to, title: text(book.title, 200) }, reason: `Stock ${from} → ${to} (${app}).` };
  });
}

const OPS = { "order.dispatch": dispatchOrder, "inventory.adjust": adjustStock };

/** Applies one request and writes the answer on its document. Answers once: a request already answered is left alone. */
async function applyAppRequest(db, id, now = new Date()) {
  const ref = db.collection("appRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const request = snap.data();
  if (request.status) return request;
  let answer;
  try {
    const run = OPS[request.op];
    answer = run ? await run(db, request, now) : { status: "refused", reason: "The shop doesn't know that change." };
  } catch (error) {
    answer = { status: "refused", reason: `The shop couldn't make that change: ${String(error?.message || error).slice(0, 200)}` };
  }
  const written = { status: answer.status, result: answer.result ?? null, reason: answer.reason ?? "", answeredAt: now.toISOString() };
  await ref.set(written, { merge: true });
  return { ...request, ...written };
}

module.exports = { applyAppRequest, APP_REQUEST_OPS: Object.keys(OPS) };
