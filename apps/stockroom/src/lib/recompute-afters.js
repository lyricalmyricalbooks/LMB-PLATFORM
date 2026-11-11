// The values the stockroom derives from an item's rows, rebuilt in one place: revenue and channel totals, the
// "Consignment" channel line, the store counters, the on-hand count and each sale's running `after`. Pure (no page,
// no globals), so the shop admin runs exactly this as its save's derive step. main.js wraps it (`recomputeAfters`,
// which falls back to the open item when none is given).
import { deriveOnHand, buildOrderTimeline, deduplicateDirectConsignmentSales, recalculateBookStatsFromHistory } from './inventory.js';
import { reconcileConsignmentMirrors, reconcileConsignmentChannel, reconcileStores } from './consignment.js';

export { reconcileConsignmentChannel, reconcileStores };


export function recomputeAfters(s, bk) {
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
