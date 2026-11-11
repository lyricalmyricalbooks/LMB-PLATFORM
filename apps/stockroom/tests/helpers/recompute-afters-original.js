// A frozen copy of recomputeAfters (and its two helpers) exactly as main.js held it before it moved to
// src/lib/recompute-afters.js. Only getBook() is gone (the callers here always pass the item). The equivalence test
// runs both on the same records; never edit this file to match a later change.
import { deriveOnHand, buildOrderTimeline, deduplicateDirectConsignmentSales, recalculateBookStatsFromHistory } from '../../src/lib/inventory.js';
import { reconcileConsignmentMirrors } from '../../src/lib/consignment.js';

// Keep the "Consignment" line in Sales by channel honest by deriving it from
// the consignment ledger — the canonical record of each sale — instead of
// trusting the running chStats counter. That counter can drift out of sync
// with the per-store tallies (older entries, partial updates, a sale recorded
// before this channel was tracked), which is exactly how a store can show
// "Sold 6" while the channel still reads 0. Rebuilding from the ledger makes
// the figure self-healing on every load and after any void/unvoid.
function reconcileConsignmentChannel(s) {
  if (!s || !Array.isArray(s.hist)) return;

  let txns = 0, units = 0, revenue = 0;
  for (const h of s.hist) {
    if (h.consignmentLink && !h.voided) {
      txns++;
      units += (h.qty || 0);
      revenue += (h.qty || 0) * (h.price || 0);
    }
  }

  if (txns > 0) {
    s.chStats = s.chStats || {};
    s.chStats['Consignment'] = { txns, units, revenue };
  } else if (s.chStats && s.chStats['Consignment']) {
    // No live consignment sales on record — drop a stale all-zero line so it
    // doesn't linger as a confusing "Consignment  0  0  $0.00" row. A non-zero
    // legacy figure is left alone.
    const c = s.chStats['Consignment'];
    if (!(c.txns || c.units || c.revenue)) delete s.chStats['Consignment'];
  }
}

function reconcileStores(s) {
  if (!s || !Array.isArray(s.stores) || !Array.isArray(s.ledger)) return;
  // The ledger is the source of truth for consignment movement. Each store's
  // running counters (sent/sold/returned/outstanding) are nudged per action,
  // so they can drift out of sync after an offline merge, an interrupted save,
  // or a void/unvoid that touched one counter but not another. The classic
  // symptom is a phantom "outstanding" that doesn't match sent − sold − returned
  // (e.g. 6 sent, 6 sold, but 1 outstanding). Rebuild the unit counters from the
  // non-voided ledger so they always reconcile. amountOwed is left untouched —
  // payments are settled separately, not purely from these ledger rows.
  const tally = new Map(); // storeId -> {sent, sold, returned}
  for (const e of s.ledger) {
    if (e.voided || e.storeId == null) continue;
    let t = tally.get(e.storeId);
    if (!t) { t = { sent: 0, sold: 0, returned: 0 }; tally.set(e.storeId, t); }
    const qty = e.qty || 0;
    if (e.type === 'Shipment') t.sent += qty;
    else if (e.type === 'Sale') t.sold += qty;
    else if (e.type === 'Return') t.returned += qty;
  }
  for (const st of s.stores) {
    const t = tally.get(st.id);
    // Skip stores with no ledger history (e.g. legacy data) so we never wipe
    // counters we can't rebuild from events.
    if (!t) continue;
    st.sent = t.sent;
    st.sold = t.sold;
    st.returned = t.returned;
    st.outstanding = Math.max(0, t.sent - t.sold - t.returned);
  }
}

export function recomputeAfters(s, book) {
  const bk = book;
  deduplicateDirectConsignmentSales(s);
  // Re-derive consignment mirrors from their canonical ledger rows BEFORE the
  // stats are rebuilt below — recalculateBookStatsFromHistory reads s.hist, so
  // a mirror still carrying a sale's pre-edit amount would book that stale
  // figure as revenue (and the Tax Center would report it) even though the
  // ledger, the store card and the Google Sheet all show the corrected one.
  reconcileConsignmentMirrors(s);
  recalculateBookStatsFromHistory(s);
  if (bk && Number.isFinite(bk.maxPrint)) {
    s.stock = deriveOnHand(s, bk);
  }
  reconcileConsignmentChannel(s);
  reconcileStores(s);
  // Stock After mirrors the History view: a single running balance over the
  // full timeline (direct sales + consignment movements) from the print run
  // down to the records-true on-hand. Computing it here too keeps each entry's
  // stored `after` — the value synced to the Google Sheet — agreeing with the
  // app instead of anchoring to a header count that may have drifted.
  const timeline = buildOrderTimeline(s, bk);
  for (const r of timeline) {
    if (r.type === 'hist') r.h.after = r._after;
  }
}
