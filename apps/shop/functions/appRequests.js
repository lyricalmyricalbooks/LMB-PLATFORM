// Changes an installed outside app asks for (platform code plan 26.3b, LMB-PLATFORM docs/app-store.md). Apps never
// touch this shop directly: the platform checks the app's key and permissions, then writes a request to
// `appRequests/<id>` with its own access. The trigger below applies it with this shop's own rules and writes the answer
// back on the same document, where the platform reads it.
//
// Request: { op, appId, appName, input, createdAt }. Answer fields added: { status: "done" | "refused", result, reason,
// answeredAt }. Shoppers and staff can't read or write `appRequests` (no rule allows it).
//
// Ops:
//   order.dispatch  { orderId, trackingCarrier, trackingNumber, trackingUrl?, shipped? }   (permission write_orders)
//     The same checks as a dispatch from the stockroom app (fulfillmentGuard.js externalDispatchProblem): paid, not
//     test, ships by carrier, not already sent, no open return or request, no dispute, no failed refund, not under
//     review or on hold, no website label being bought, no waiting pre-order. The packing checklist and address review
//     are the app's own steps, as with the stockroom app. `shipped: false` only attaches the tracking.
//     Marking it shipped sends the customer the shipped email (the order trigger does that, as for any dispatch).
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

const OPS = { "order.dispatch": dispatchOrder };

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
