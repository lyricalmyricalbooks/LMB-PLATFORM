// Stock changes for a set of order lines, grouped so each book document is
// written once. Several lines of the same book (two editions, or a duplicate
// line) used to be applied from the same snapshot with the last write winning,
// which silently lost all but one decrement. Pure: callers write the updates.
//
// items:  [{ id, variantId?, quantity }]
// books:  Map/object id -> book data (only books that exist)
// sign:   -1 to take stock out (a sale), +1 to put it back (refund/restock)
// Returns { updates: [{ id, data }], oversold: boolean } — oversold is true when
// a sale asked for more copies than were in stock (stock is floored at 0).
// Box-set lines count as the books inside them (promotions.stockLines).
// Editions sharing one pile (stockPools.js; carried on `books[POOLS]` by readBooks)
// all move together: a sale of one takes the copy off each of them.
const { stockLines } = require("./shared/promotions");
const { POOLS, readStockPools, poolMembers } = require("./stockPools");

function stockChanges(items, books, sign) {
  const get = id => (books instanceof Map ? books.get(id) : books[id]);
  const pools = (books && books[POOLS]) || {};
  const perBook = new Map();
  for (const item of stockLines(items)) {
    const book = item && get(item.id);
    if (!book || !book.trackInventory) continue;
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (!qty) continue;
    const entry = perBook.get(item.id) || { book, base: 0, variants: new Map() };
    entry.base += qty;
    if (item.variantId) entry.variants.set(item.variantId, (entry.variants.get(item.variantId) || 0) + qty);
    perBook.set(item.id, entry);
  }
  let oversold = false;
  const updates = [];
  for (const [id, { book, base, variants: own }] of perBook) {
    // Each edition moves by its own lines plus those of every edition sharing its pile.
    const variants = new Map();
    for (const v of book.variants || []) {
      const qty = v && v.id ? poolMembers(pools, id, v.id).reduce((sum, key) => sum + (own.get(key) || 0), 0) : 0;
      if (qty) variants.set(v.id, qty);
    }
    const data = {};
    const currentBase = Number(book.stockLevel) || 0;
    if (sign < 0 && currentBase < base) oversold = true;
    data.stockLevel = Math.max(0, currentBase + sign * base);
    if (variants.size) {
      data.variants = (book.variants || []).map(v => {
        const qty = variants.get(v.id);
        if (!qty) return v;
        const current = Number(v.stockLevel !== undefined ? v.stockLevel : v.stock) || 0;
        if (sign < 0 && current < qty) oversold = true;
        const next = Math.max(0, current + sign * qty);
        return { ...v, stockLevel: next, stock: next };
      });
    }
    updates.push({ id, data });
  }
  return { updates, oversold };
}

// Reads every distinct book in `items` inside a transaction, then writes the
// grouped stock change. Must be called before any other transaction write
// that follows a read (Firestore requires all reads first) — callers read
// books up front via `readBooks` and pass the result to `writeStock`.
async function readBooks(transaction, db, items) {
  const ids = [...new Set(stockLines(items).map(item => item && item.id).filter(Boolean))];
  const docs = await Promise.all(ids.map(id => transaction.get(db.collection("books").doc(id))));
  const books = new Map();
  docs.forEach((doc, i) => { if (doc.exists) books.set(ids[i], doc.data()); });
  if (ids.length) books[POOLS] = await readStockPools(transaction, db);
  return books;
}

function writeStock(transaction, db, items, books, sign, now) {
  const { updates, oversold } = stockChanges(items, books, sign);
  for (const { id, data } of updates) transaction.update(db.collection("books").doc(id), { ...data, updatedAt: now });
  return oversold;
}

module.exports = { stockChanges, readBooks, writeStock };
