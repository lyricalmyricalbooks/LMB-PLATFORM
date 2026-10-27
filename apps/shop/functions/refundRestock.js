// Refunds and the books they leave out.
//
// `leftTheShop` is the one rule for "the books already went to the customer": a full refund
// restocks by default only when they didn't (applyOrderRefund, and the admin refund window's
// "Restock items" box — mirrored in src/app/admin/refundRestock.ts).
//
// `restockRefundedOrder` puts the books of a refund that left them out back on the shelf, once:
// the same stock change and `restockedItems` record a restocking refund writes, so stock,
// a later failed-refund undo (revertFailedRefund) and the inventory app link
// (orderFootprint subtracts restockedItems) all see it the same way.
const { readBooks, writeStock } = require("./inventory");
const { returnRestockItems } = require("./returns");
const { withoutRestocked } = require("./partialRefund");
const { isPhysicalItem } = require("./shared/localFulfillment");

const LEFT_STATES = ["shipped", "out_for_delivery", "delivered", "collected", "completed"];

function leftTheShop(order = {}) {
  return LEFT_STATES.includes(order.fulfillmentStatus) || order.status === "completed";
}

/** The printed lines a refunded order can still put back (box sets as their lines). */
function restockableItems(order = {}, returnCase = null) {
  return withoutRestocked(returnRestockItems(order, returnCase), order)
    .filter(item => isPhysicalItem(item) && Math.floor(Number(item.quantity) || 0) > 0);
}

/** Why the books of this order can't be put back now, or "" when they can. */
function restockRefundedProblem(order, returnCase = null) {
  if (!order) return "Order not found.";
  if (!["refunded", "refund_pending"].includes(order.paymentStatus)) return "Only a refunded order's books can be put back this way.";
  if (order.inventoryRestockedAt != null) return "This order's books are already back in stock.";
  if (order.sandboxPayment === true) return "A test payment never took the books out of stock.";
  if (!restockableItems(order, returnCase).length) return "This order has no printed books to put back.";
  return "";
}

function recordOf(items) {
  return items.map(item => ({
    id: item.id,
    variantId: item.variantId || null,
    quantity: Number(item.quantity) || 0,
    ...(Array.isArray(item.components) && item.components.length
      ? { components: item.components.map(part => ({ id: part.id, variantId: part.variantId || null, quantity: Number(part.quantity) || 1 })) }
      : {}),
  }));
}

/** One transaction: refuse, or put the books back and record it on the order. */
async function restockRefundedOrder(db, orderId, { actor = "admin", now = new Date().toISOString() } = {}) {
  const orderRef = db.collection("orders").doc(orderId);
  return db.runTransaction(async transaction => {
    const snap = await transaction.get(orderRef);
    const order = snap.exists ? snap.data() : null;
    const ops = order?.returnProgress ? await transaction.get(db.collection("order-operations").doc(orderId)) : null;
    const returnCase = ops?.exists ? (ops.data() || {}).returnCase : null;
    const problem = restockRefundedProblem(order, returnCase);
    if (problem) { const error = new Error(problem); error.status = order ? 409 : 404; throw error; }
    const items = restockableItems(order, returnCase);
    const books = await readBooks(transaction, db, items);
    writeStock(transaction, db, items, books, 1, now);
    transaction.update(orderRef, {
      inventoryRestockedAt: now,
      restockedItems: recordOf(items),
      updatedAt: now,
      activity: [...(order.activity || []), { type: "event", message: "Books put back in stock after the refund.", createdAt: now, actor }],
    });
    return { restocked: items.reduce((sum, item) => sum + (Math.floor(Number(item.quantity) || 0)), 0) };
  });
}

module.exports = { LEFT_STATES, leftTheShop, restockableItems, restockRefundedProblem, restockRefundedOrder };
