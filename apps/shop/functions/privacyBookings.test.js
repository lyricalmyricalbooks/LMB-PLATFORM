// Privacy export and erase cover bookings and the waiting list (bookings.js): what an erase writes onto a booking, and
// that the owner's export and erase read and change both collections.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bookingPaid, redactedBookingFields, BOOKING_NAME_REMOVED, findByEmail } = require('./privacyData.js');
const { privacyActions } = require('./privacyRequests.js');

const NOW = '2026-11-15T10:00:00.000Z';

describe('what an erase writes onto a booking', () => {
  it('a free booking loses every personal detail and its links', () => {
    const fields = redactedBookingFields({ payment: 'free', paid: false, customer: { name: 'Ada', email: 'ada@example.com', phone: '555' } }, NOW);
    expect(fields.customer).toEqual({ name: BOOKING_NAME_REMOVED, email: '', phone: '' });
    expect(fields).toMatchObject({ note: '', answers: [], pendingKey: null, manageKeyHash: '', reminderKeyHash: '', reminderSentAt: NOW, privacyRedactedAt: NOW });
  });

  it('a card-paid or refunded booking keeps the name and email as a payment record', () => {
    for (const booking of [{ paid: true }, { paid: false, refund: { amountMinor: 2500 } }]) {
      expect(bookingPaid(booking)).toBe(true);
      const fields = redactedBookingFields(booking, NOW);
      expect(fields.customer).toBeUndefined();
      expect(fields).toMatchObject({ 'customer.phone': '', note: '', answers: [], manageKeyHash: '' });
    }
    expect(bookingPaid({ paid: false })).toBe(false);
  });
});

// A small Firestore stand-in: collections of documents, equality and array-contains lookups, batches.
function fakeDb(seed) {
  const store = new Map(Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(docs))]));
  const col = name => { if (!store.has(name)) store.set(name, new Map()); return store.get(name); };
  const getPath = (data, field) => field.split('.').reduce((v, k) => (v == null ? undefined : v[k]), data);
  const docOf = (name, id) => {
    const ref = {
      id, path: `${name}/${id}`,
      get: async () => snap(),
      set: async (data, opts) => { col(name).set(id, opts?.merge ? { ...(col(name).get(id) || {}), ...data } : data); },
    };
    const snap = () => ({ id, ref, exists: col(name).has(id), data: () => col(name).get(id) });
    ref.snap = snap;
    return ref;
  };
  const query = (name, filters = []) => ({
    where: (field, op, value) => query(name, [...filters, [field, op, value]]),
    select: () => query(name, filters), orderBy: () => query(name, filters), limit: () => query(name, filters), startAfter: () => query(name, [...filters, ['__done__']]),
    get: async () => {
      if (filters.some(f => f[0] === '__done__')) return { empty: true, docs: [] };
      const docs = [...col(name).keys()].filter(id => filters.every(([field, op, value]) => {
        const v = getPath(col(name).get(id), field);
        return op === 'array-contains' ? Array.isArray(v) && v.includes(value) : v === value;
      })).map(id => docOf(name, id).snap());
      return { empty: !docs.length, docs };
    },
    doc: id => docOf(name, id),
  });
  const apply = (ref, data) => {
    const [name, id] = ref.path.split('/');
    const next = { ...(col(name).get(id) || {}) };
    for (const [k, v] of Object.entries(data)) {
      if (k.includes('.')) { const [a, b] = k.split('.'); next[a] = { ...(next[a] || {}), [b]: v }; } else next[k] = v;
    }
    col(name).set(id, next);
  };
  return {
    store,
    collection: name => query(name),
    getAll: async (...refs) => refs.map(r => r.snap()),
    batch: () => {
      const ops = [];
      return {
        delete: ref => ops.push(() => { const [name, id] = ref.path.split('/'); col(name).delete(id); }),
        update: (ref, data) => ops.push(() => apply(ref, data)),
        set: (ref, data) => ops.push(() => apply(ref, data)),
        commit: async () => { ops.forEach(op => op()); },
      };
    },
  };
}

function setup() {
  const db = fakeDb({
    bookings: {
      free1: { serviceName: 'Studio visit', start: '2026-11-20T15:00:00.000Z', status: 'confirmed', paid: false, customer: { name: 'Ada', email: 'ada@example.com', phone: '555' }, note: 'Bringing a friend', answers: [{ label: 'Allergies', answer: 'Nuts' }], manageKeyHash: 'abc', sessions: ['cs_1'] },
      paid1: { serviceName: 'Portfolio review', start: '2026-11-21T15:00:00.000Z', status: 'confirmed', paid: true, priceMinor: 2500, customer: { name: 'Ada', email: 'ada@example.com', phone: '555' }, note: 'Ring the bell', answers: [{ label: 'Website', answer: 'ada.example' }], manageKeyHash: 'def', paymentIntent: 'pi_1' },
      other: { serviceName: 'Studio visit', status: 'confirmed', paid: false, customer: { name: 'Bo', email: 'bo@example.com', phone: '' }, note: 'Mine', answers: [], manageKeyHash: 'ghi' },
    },
    bookingWaitlist: {
      w1: { serviceName: 'Evening class', day: '2026-11-22', name: 'Ada', email: 'ada@example.com' },
      w2: { serviceName: 'Evening class', day: '2026-11-22', name: 'Bo', email: 'bo@example.com' },
    },
  });
  const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const { handlePrivacyAdmin } = privacyActions({
    db, admin: { auth: () => ({ getUserByEmail: async () => { throw new Error('none'); }, deleteUser: async () => {} }) },
    GIFT_CARD_PERSONAL: {}, LIMITS: {}, findByEmailData: findByEmail, giftCardsFor: async () => [],
    neverPaid: () => false, optOutId: e => e, publicOutboxEntry: (id, d) => ({ id, ...d }),
    redactedOperationsFields: () => ({}), redactedOrderFields: () => ({}), reviewErasure: () => ({}),
    requireAdmin: async () => ({ email: 'owner@example.com' }),
  });
  return { db, res, handlePrivacyAdmin };
}

describe("the owner's privacy export and erase", () => {
  it("the export carries the person's bookings and waiting list, without link keys or payment ids", async () => {
    const { res, handlePrivacyAdmin } = setup();
    const out = res();
    await handlePrivacyAdmin({ body: { action: 'privacyExport', email: 'Ada@Example.com' } }, out);
    expect(out.code).toBe(200);
    expect(out.body.bookings.map(b => b.id).sort()).toEqual(['free1', 'paid1']);
    expect(out.body.bookings.find(b => b.id === 'free1')).toMatchObject({ note: 'Bringing a friend', answers: [{ label: 'Allergies', answer: 'Nuts' }] });
    for (const b of out.body.bookings) for (const key of ['manageKeyHash', 'pendingKey', 'sessions', 'paymentIntent']) expect(b).not.toHaveProperty(key);
    expect(out.body.bookingWaitingList.map(w => w.id)).toEqual(['w1']);
  });

  it("the erase clears that person's bookings and waiting list and nobody else's", async () => {
    const { db, res, handlePrivacyAdmin } = setup();
    const out = res();
    await handlePrivacyAdmin({ body: { action: 'privacyErase', email: 'ada@example.com' } }, out);
    expect(out.code).toBe(200);
    expect(out.body).toMatchObject({ redactedBookings: ['free1'], keptBookings: ['paid1'] });
    expect(out.body.deleted.waitingList).toBe(1);
    const bookings = db.store.get('bookings');
    expect(bookings.get('free1')).toMatchObject({ customer: { name: BOOKING_NAME_REMOVED, email: '', phone: '' }, note: '', answers: [], manageKeyHash: '', status: 'confirmed', start: '2026-11-20T15:00:00.000Z' });
    expect(bookings.get('paid1')).toMatchObject({ customer: { name: 'Ada', email: 'ada@example.com', phone: '' }, note: '', answers: [], manageKeyHash: '', paid: true, priceMinor: 2500 });
    expect(bookings.get('other')).toMatchObject({ customer: { name: 'Bo', email: 'bo@example.com' }, note: 'Mine', manageKeyHash: 'ghi' });
    expect([...db.store.get('bookingWaitlist').keys()]).toEqual(['w2']);
  });
});
