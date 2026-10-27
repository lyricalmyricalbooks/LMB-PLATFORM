// Editions of one website book matched to the same inventory-app book (Inventory › Inventory app link)
// share one pile of copies: The Hound's Signed and Unsigned hardcovers are the same copies, signed on
// request. A sale of either takes a copy off both, a refund puts one back on both, and checkout holds
// count both editions' lines against the one pile. The pile is read from the link itself
// (systemStatus/inventoryLink.links), so matching or unmatching an edition changes it at once.
const POOLS = Symbol("stockPools");

/** { bookId: { variantId: inventoryBookId } } for editions that share their inventory book with a sibling. */
function poolsFromLinks(links) {
  const out = {};
  for (const [bookId, entry] of Object.entries(links || {})) {
    const byInv = new Map();
    for (const [key, inv] of Object.entries(entry || {})) {
      if (key === "_" || typeof inv !== "string" || !inv) continue;
      byInv.set(inv, [...(byInv.get(inv) || []), key]);
    }
    for (const [inv, keys] of byInv) {
      if (keys.length < 2) continue;
      out[bookId] = { ...(out[bookId] || {}) };
      keys.forEach(key => { out[bookId][key] = inv; });
    }
  }
  return out;
}

/** Reads the shared piles with `reader` (a transaction or the database). Missing link = none. */
async function readStockPools(reader, db) {
  const snap = await reader.get(db.collection("systemStatus").doc("inventoryLink"));
  return poolsFromLinks(snap.exists ? (snap.data() || {}).links : null);
}

/** The edition keys that share one pile with `key` (just [key] when it shares with none). */
function poolMembers(pools, bookId, key) {
  const book = (pools || {})[bookId];
  const pool = book && key !== "_" ? book[key] : null;
  if (!pool) return [key];
  return Object.keys(book).filter(k => book[k] === pool);
}

module.exports = { POOLS, poolsFromLinks, readStockPools, poolMembers };
