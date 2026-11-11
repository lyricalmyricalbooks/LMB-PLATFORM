import { describe, expect, it } from 'vitest';
import { labelledOrderNums, openCallWaiting, ordersWithLabels, submissionsInput, tripsSummaryAll } from '../src/lib/attention-input.js';

describe('what the to-do list is fed from the records', () => {
  it('counts the author entries waiting per book', () => {
    expect(submissionsInput({ a: { sales: { x: 1, y: 2 }, expenses: { z: 3 } }, b: null }, id => `Title ${id}`)).toEqual([
      { bookId: 'a', bookTitle: 'Title a', sales: 2, expenses: 1 },
      { bookId: 'b', bookTitle: 'Title b', sales: 0, expenses: 0 },
    ]);
    expect(submissionsInput(undefined)).toEqual([]);
  });

  it('counts open-call contributors with a stage still to tick, and skips books with none', () => {
    const states = { a: { openCall: [{}, {}] }, b: { openCall: [] }, c: {} };
    const out = openCallWaiting(states, id => id.toUpperCase());
    expect(out).toEqual([{ bookId: 'a', bookTitle: 'A', waiting: 2 }]);
  });

  const label = { ref: 'shippo:1', shippingMatchStatus: 'matched', shippingOrderNumber: 'W-1', amount: 5, baseAmount: 5 };
  it('finds the orders that have a postage label matched', () => {
    expect(ordersWithLabels(['W-1', 'W-2', ''], [label])).toEqual(['W-1']);
    expect(ordersWithLabels([], [label])).toEqual([]);
  });

  it('checks only the unsent orders for labels', () => {
    const old = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
    const entry = (num) => ({ num, chan: 'Website', date: old, shipName: 'Sam', shipAddr1: '1 Main St' });
    const out = labelledOrderNums({ a: { hist: [entry('W-1'), entry('W-2')] } }, [label]);
    expect(out).toEqual(['W-1']);
    expect(labelledOrderNums({}, [label])).toEqual([]);
  });

  it('sums an event\'s costs as the ledger does, and lists declared events with no costs yet', () => {
    const summary = tripsSummaryAll({
      trips: [{ name: 'Fair', startDate: '2026-05-01', endDate: '2026-05-02' }, { name: ' ' }],
      businessExpenses: [
        { trip: 'Fair', date: '2026-05-01', amount: 20, baseAmount: 20, cat: 'Travel' },
        { trip: 'Fair', date: '2026-05-02', amount: 10, currency: 'CAD', cat: 'Travel' },
        { trip: '', amount: 5 },
      ],
    });
    expect(Object.keys(summary)).toEqual(['Fair']);
    expect(summary.Fair.total).toBe(30);
    expect(summary.Fair.count).toBe(2);
    expect(summary.Fair.record.name).toBe('Fair');
    expect(tripsSummaryAll(null)).toEqual({});
  });

  it('counts a foreign-currency cost with no stored amount as nothing rather than guessing a rate', () => {
    const summary = tripsSummaryAll({ businessExpenses: [{ trip: 'Fair', date: '2026-05-01', amount: 20, currency: 'EUR' }] });
    expect(summary.Fair.total).toBe(0);
  });
});
