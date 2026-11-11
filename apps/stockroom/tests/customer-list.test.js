import { describe, expect, it } from 'vitest';
import { applyCustomerFilter, buildCustomerList, custEmailKey, customerSpendRough } from '../src/lib/customer-list.js';

// The Customers tab and the shop admin's Customers page both group buyers with this one function.

const books = { a: { id: 'a', title: 'Salt Hours', currency: 'CAD', listPrice: 20 }, b: { id: 'b', title: 'Night Songs', currency: 'EUR', listPrice: 18 } };
const states = {
  a: { hist: [
    { num: '1001', chan: 'Website', qty: 2, price: 20, date: '2026-10-01', email: 'Ada@Example.com', customer: 'Ada' },
    { num: '1002', chan: 'POS', qty: 1, price: 20, date: '2026-10-09', email: 'ada@example.com ', shipName: 'Ada Example' },
    { num: '1003', chan: 'Website', qty: 1, price: 20, date: '2026-10-05', email: 'ben@example.com', voided: true },
    { num: '1004', chan: 'Gratuity', qty: 1, price: 0, date: '2026-10-06', email: 'gift@example.com' },
    { num: '1005', chan: 'POS', qty: 1, price: 20, date: '2026-10-07' },
  ] },
  b: { hist: [{ num: '2001', chan: 'Website', qty: 1, price: 18, date: '2026-09-01', email: 'cleo@example.com', payment: { currency: 'USD', amount: 25 } }] },
};

describe('customer list', () => {
  const list = buildCustomerList({ books, states });

  it('groups one buyer across emails that differ only by case and spacing, fullest name kept', () => {
    const ada = list.find((r) => custEmailKey(r.email) === 'ada@example.com');
    expect(ada.orders).toBe(2);
    expect(ada.units).toBe(3);
    expect(ada.name).toBe('Ada Example');
    expect(ada.spend).toEqual({ CAD: 60 });
    expect(ada.first).toBe('2026-10-01');
    expect(ada.last).toBe('2026-10-09');
    expect(ada.lines.map((l) => l.num)).toEqual(['1002', '1001']);
  });

  it('leaves out voided sales and gifts, and counts sales with no email', () => {
    expect(list.map((r) => r.email.toLowerCase())).not.toContain('ben@example.com');
    expect(list.map((r) => r.email.toLowerCase())).not.toContain('gift@example.com');
    expect(list._noEmail).toBe(1);
  });

  it('keeps spend per currency, using what was paid when a payment is recorded; newest buyer first', () => {
    const cleo = list.find((r) => r.email === 'cleo@example.com');
    expect(cleo.spend).toEqual({ USD: 25 });
    expect(list.map((r) => r.email.toLowerCase())).toEqual(['ada@example.com', 'cleo@example.com']);
  });

  it('adds website orders not yet in history, but not ones that are', () => {
    const orders = [{ email: 'dee@example.com', orderNum: '9', bookId: 'a', qty: 2, date: '2026-10-20' }, { email: 'ada@example.com', orderNum: '1001', bookId: 'a', qty: 2 }];
    const more = buildCustomerList({ books, states, orders, appliedIds: new Set(['1001']) });
    expect(more.find((r) => r.email === 'dee@example.com')).toMatchObject({ orders: 1, spend: { CAD: 40 } });
    expect(more.find((r) => r.email.toLowerCase() === 'ada@example.com').orders).toBe(2);
  });

  it('counts a Stripe payment only for a buyer unknown beforehand, and skips refunds', () => {
    const stripeRows = [{ email: 'ada@example.com', amount: 99, currency: 'cad', date: '2026-10-30' }, { email: 'eve@example.com', amount: 30, currency: 'cad', date: '2026-10-02' }, { email: 'x@example.com', amount: 5, refunded: true }];
    const more = buildCustomerList({ books, states, stripeRows });
    const ada = more.find((r) => r.email.toLowerCase() === 'ada@example.com');
    expect(ada.orders).toBe(2);
    expect(ada.spend).toEqual({ CAD: 60 });
    expect(ada.last).toBe('2026-10-30');
    expect(more.find((r) => r.email === 'eve@example.com')).toMatchObject({ orders: 1, spend: { CAD: 30 } });
    expect(more.find((r) => r.email === 'x@example.com')).toBeUndefined();
  });
});

describe('customer filters', () => {
  const list = buildCustomerList({ books, states });
  it('searches name and email, filters by book, channel, orders and rough spend', () => {
    expect(applyCustomerFilter(list, { search: ' CLEO ' })).toHaveLength(1);
    expect(applyCustomerFilter(list, { bookId: 'b' }).map((r) => r.email)).toEqual(['cleo@example.com']);
    expect(applyCustomerFilter(list, { channel: 'POS' })).toHaveLength(1);
    expect(applyCustomerFilter(list, { orders: 'repeat' })).toHaveLength(1);
    expect(applyCustomerFilter(list, { orders: 'single' })).toHaveLength(1);
    // Cleo's 25 USD is about 33.75 at the tab's rough rate.
    expect(applyCustomerFilter(list, { spend: '30' }).map((r) => r.email.toLowerCase())).toEqual(['ada@example.com', 'cleo@example.com']);
    expect(applyCustomerFilter(list, { spend: '50' }).map((r) => r.email.toLowerCase())).toEqual(['ada@example.com']);
    expect(customerSpendRough({ USD: 10, CAD: 1 })).toBeCloseTo(14.5);
  });
});
