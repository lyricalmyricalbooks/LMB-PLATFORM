// Abandoned-cart documents are written by anonymous browsers and nothing else deletes them, so the sweep removes
// the ones no reminder can still be sent for. Same index as the sweep itself (recovered + updatedAt).
const DAY = 24 * 60 * 60 * 1000;
const CART_KEEP_DAYS = 30;     // a reminder is only sent within 7 days; the rest is kept as a month of history
const CART_PRUNE_LIMIT = 300;  // per query and run

/** Deletes old carts (recovered or not) in small batches; returns how many were removed. */
async function pruneOldCarts(db, now = Date.now()) {
  const before = new Date(now - CART_KEEP_DAYS * DAY).toISOString();
  let removed = 0;
  for (const recovered of [false, true]) {
    const snap = await db.collection("abandoned-carts")
      .where("recovered", "==", recovered).where("updatedAt", "<", before)
      .orderBy("updatedAt", "asc").limit(CART_PRUNE_LIMIT).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    removed += snap.size;
  }
  return removed;
}

module.exports = { pruneOldCarts, CART_KEEP_DAYS, CART_PRUNE_LIMIT };
