// Swap for another size (plan 10.22). A returned item can be exchanged for another version (size, colour) of the same
// product when the price is the same: the resellable copies go back on the shelf, the new version is taken off it, and
// the order records the swap. No money moves, so a price difference is refused for now (refund the return and let the
// customer buy again). Pure: the handler reads the books and writes the result in one transaction.
const { stockChanges } = require("./inventory");
const { POOLS } = require("./stockPools");

const fail = message => { const error = new Error(message); error.status = 409; throw error; };
const priceOf = (book, variant) => Number(variant && variant.price !== undefined && variant.price !== "" ? variant.price : book.retailPrice);
const stockOf = variant => Number(variant.stockLevel !== undefined ? variant.stockLevel : variant.stock) || 0;

/**
 * order: the paid order whose return was inspected. returnCase: its private return record. swaps: [{ index, toVariantId,
 * quantity }], one per order line, quantity up to the copies that came back. books: Map id -> book, as readBooks returns it.
 * Returns { updates: [{ id, data }], lines, oversold } or throws a 409 with plain words.
 */
function planExchange(order, returnCase, swaps, books) {
  if (order.paymentStatus !== "paid") fail("Only paid orders can be exchanged.");
  if (order.refundRequest) fail("A refund has already been requested. Reconcile it before exchanging.");
  if (order.customerRequest?.type !== "return" || order.customerRequest.status !== "open") fail("This order has no open return to exchange.");
  if (returnCase?.state !== "inspected") fail("Receive and inspect the returned items before exchanging them.");
  if (!Array.isArray(swaps) || !swaps.length || swaps.length > 20) fail("Choose what to send in exchange.");
  const get = id => books.get(id);
  const seen = new Set();
  const lines = [], restock = [], send = [];
  for (const swap of swaps) {
    const row = (returnCase.inspection || []).find(r => r.index === swap?.index);
    const item = row && (order.items || [])[row.index];
    if (!row || !item || row.quantity <= 0) fail("Choose an item that came back.");
    if (seen.has(row.index)) fail("Each returned item can be exchanged once.");
    seen.add(row.index);
    if (Array.isArray(item.components) && item.components.length) fail("A box set can't be exchanged. Refund it instead.");
    const quantity = swap.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > row.quantity) fail("Enter how many to exchange, up to the number that came back.");
    const book = get(item.id);
    if (!book) fail("That product is no longer in the shop.");
    const variants = Array.isArray(book.variants) ? book.variants : [];
    const from = variants.find(v => v.id === (item.variantId || null));
    const to = variants.find(v => v.id === swap.toVariantId);
    if (!to) fail("Choose another version of the same product.");
    if (to.id === item.variantId) fail("Choose a different version from the one that came back.");
    if (priceOf(book, to) !== priceOf(book, from)) fail("The new version costs a different price. Refund the return and let the customer buy it instead.");
    if (book.trackInventory && stockOf(to) < quantity) fail(`${to.name || "That version"} has only ${stockOf(to)} left.`);
    const back = Math.min(quantity, Number(row.restockQuantity) || 0);
    if (back > 0) restock.push({ id: item.id, variantId: item.variantId || null, quantity: back });
    send.push({ id: item.id, variantId: to.id, quantity });
    lines.push({ index: row.index, id: item.id, fromVariantId: item.variantId || null, toVariantId: to.id, toName: to.name || "", quantity, restocked: back });
  }
  // One write per book: put the copies back first, then take the new ones off the updated stock.
  const merged = new Map(books);
  merged[POOLS] = books[POOLS];
  const first = stockChanges(restock, books, 1);
  const byId = new Map(first.updates.map(u => [u.id, u.data]));
  for (const [id, data] of byId) merged.set(id, { ...merged.get(id), ...data });
  const second = stockChanges(send, merged, -1);
  if (second.oversold) fail("Not enough stock of the new version. Check the stock and try again.");
  for (const u of second.updates) byId.set(u.id, { ...(byId.get(u.id) || {}), ...u.data });
  return { updates: [...byId].map(([id, data]) => ({ id, data })), lines };
}

module.exports = { planExchange };
