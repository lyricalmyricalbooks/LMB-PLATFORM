import { describe, expect, it } from 'vitest';
import { reconcileConsignmentChannel, reconcileStores } from '../src/lib/consignment.js';

// These two rebuilders used to live inline in main.js. The admin now shares them through this module, so main.js and the
// admin cannot drift. The "before" functions below are the old inline bodies, kept as a frozen reference: the lib
// versions must give the same result on the same records.
function oldChannel(s) {
  if (!s || !Array.isArray(s.hist)) return;
  let txns = 0, units = 0, revenue = 0;
  for (const h of s.hist) {
    if (h.consignmentLink && !h.voided) { txns++; units += (h.qty || 0); revenue += (h.qty || 0) * (h.price || 0); }
  }
  if (txns > 0) {
    s.chStats = s.chStats || {};
    s.chStats['Consignment'] = { txns, units, revenue };
  } else if (s.chStats && s.chStats['Consignment']) {
    const c = s.chStats['Consignment'];
    if (!(c.txns || c.units || c.revenue)) delete s.chStats['Consignment'];
  }
}
function oldStores(s) {
  if (!s || !Array.isArray(s.stores) || !Array.isArray(s.ledger)) return;
  const tally = new Map();
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
    if (!t) continue;
    st.sent = t.sent; st.sold = t.sold; st.returned = t.returned;
    st.outstanding = Math.max(0, t.sent - t.sold - t.returned);
  }
}

const samples = () => [
  { hist: [], ledger: [], stores: [] },
  { hist: [{ qty: 6, price: 18, consignmentLink: true }, { qty: 2, price: 18, consignmentLink: true, voided: true }, { qty: 40, price: 18, chan: 'Web' }],
    chStats: { Consignment: { txns: 9, units: 9, revenue: 9 } },
    ledger: [
      { type: 'Shipment', storeId: 1, qty: 30 }, { type: 'Sale', storeId: 1, qty: 6 }, { type: 'Sale', storeId: 1, qty: 2, voided: true },
      { type: 'Return', storeId: 1, qty: 3 }, { type: 'Shipment', storeId: 2, qty: 5 }, { type: 'Inventory Disposal', qty: 4 },
    ],
    stores: [{ id: 1, name: 'A', sent: 99, sold: 99, returned: 0, outstanding: 99 }, { id: 2, name: 'B', sent: 0, sold: 0, returned: 0, outstanding: 0 }, { id: 3, name: 'Legacy', sent: 7, sold: 2, returned: 1, outstanding: 4 }] },
  { hist: [{ qty: 1, price: 5 }], chStats: { Consignment: { txns: 0, units: 0, revenue: 0 } }, ledger: [{ type: 'Shipment', storeId: 1, qty: 2 }, { type: 'Sale', storeId: 1, qty: 5 }], stores: [{ id: 1 }] },
  { hist: [{ qty: '3', price: '2.5', consignmentLink: true }], ledger: [], stores: [] },
  { hist: null, ledger: null, stores: null },
];

describe('consignment rebuilders shared by the stockroom and the admin', () => {
  samples().forEach((sample, i) => {
    it(`gives the old inline result on sample ${i + 1}`, () => {
      const before = JSON.parse(JSON.stringify(sample)), after = JSON.parse(JSON.stringify(sample));
      oldChannel(before); oldStores(before);
      reconcileConsignmentChannel(after); reconcileStores(after);
      expect(after).toEqual(before);
    });
  });

  it('rebuilds the Consignment line from live consignment sales, leaving voided ones out', () => {
    const s = { hist: [{ qty: 6, price: 18, consignmentLink: true }, { qty: 2, price: 18, consignmentLink: true, voided: true }], chStats: {} };
    reconcileConsignmentChannel(s);
    expect(s.chStats.Consignment).toEqual({ txns: 1, units: 6, revenue: 108 });
  });

  it('drops a stale all-zero Consignment line but keeps a non-zero legacy one', () => {
    const zero = { hist: [], chStats: { Consignment: { txns: 0, units: 0, revenue: 0 } } };
    reconcileConsignmentChannel(zero);
    expect(zero.chStats.Consignment).toBeUndefined();
    const legacy = { hist: [], chStats: { Consignment: { txns: 1, units: 1, revenue: 5 } } };
    reconcileConsignmentChannel(legacy);
    expect(legacy.chStats.Consignment.units).toBe(1);
  });

  it('rebuilds each store from its non-voided ledger rows and keeps a store with no rows as saved', () => {
    const s = sampleStores();
    reconcileStores(s);
    expect(s.stores[0]).toMatchObject({ sent: 30, sold: 6, returned: 3, outstanding: 21 });
    expect(s.stores[1]).toMatchObject({ sent: 7, sold: 2, outstanding: 4 });
  });
});

function sampleStores() {
  return {
    ledger: [{ type: 'Shipment', storeId: 1, qty: 30 }, { type: 'Sale', storeId: 1, qty: 6 }, { type: 'Sale', storeId: 1, qty: 9, voided: true }, { type: 'Return', storeId: 1, qty: 3 }],
    stores: [{ id: 1, sent: 0, sold: 0, returned: 0, outstanding: 0 }, { id: 'x', sent: 7, sold: 2, returned: 1, outstanding: 4 }],
  };
}
