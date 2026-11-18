// Privacy export and erase cover bookings and the waiting list (bookings.js): what an erase writes onto a booking, and
// that the owner's export and erase read and change both collections.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bookingPaid, redactedBookingFields, BOOKING_NAME_REMOVED, findByEmail } = require('./privacyData.js');
const { privacyActions } = require('./privacyRequests.js');
const emailHash = (e) => require('node:crypto').createHash('sha256').update(e).digest('hex');

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
    bookingPacks: {
      p1: { serviceName: 'Lesson', status: 'active', visits: 5, customer: { name: 'Ada', email: 'ada@example.com' }, paymentIntent: 'pi_p', sessions: ['cs_p'], pendingCode: null },
      p2: { serviceName: 'Lesson', status: 'held', visits: 5, customer: { name: 'Ada', email: 'ada@example.com' }, pendingCode: 'ABCD-EFGH-JKLM' },
      p3: { serviceName: 'Lesson', status: 'held', visits: 5, customer: { name: 'Bo', email: 'bo@example.com' } },
    },
    gifts: {
      g1: { status: 'paid', amountMinor: 2500, chargedMinor: 2606, customer: { name: 'Ada', email: 'ada@example.com' }, note: 'For the press', keyHashes: ['k1'], paymentIntent: 'pi_g', sessions: ['cs_g'], fundraiserId: 'fund1', wall: true, reward: { id: 'rw1', title: 'Print', ships: true }, shipTo: { name: 'Ada', street: '1 Main St', city: 'Toronto', state: 'ON', zip: 'M6G 3H1', country: 'CA' } },
      g2: { status: 'cancelled', amountMinor: 1000, chargedMinor: 1000, customer: { name: 'Ada', email: 'ada@example.com' }, keyHashes: ['k2'] },
      g3: { status: 'paid', amountMinor: 1000, chargedMinor: 1000, customer: { name: 'Bo', email: 'bo@example.com' }, keyHashes: ['k3'] },
    },
    fundraisers: {
      fund1: { title: 'Reprint', status: 'live', wallEntries: [{ gift: 'g1', name: 'Ada', at: '2026-11-18' }, { gift: 'g3', name: 'Bo', at: '2026-11-18' }] },
    },
    eventOrders: {
      t1: { eventTitle: 'Launch', status: 'paid', chargedMinor: 3000, customer: { name: 'Ada', email: 'ada@example.com' }, tickets: [{ code: 'ABCD-2345', name: 'General' }], ticketCodes: ['ABCD-2345'], keyHashes: ['k1'], paymentIntent: 'pi_t', sessions: ['cs_t'] },
      t2: { eventTitle: 'Open day', status: 'paid', chargedMinor: 0, customer: { name: 'Ada', email: 'ada@example.com' }, tickets: [{ code: 'WXYZ-6789', name: 'Free' }], keyHashes: ['k2'] },
      t3: { eventTitle: 'Launch', status: 'paid', chargedMinor: 1500, customer: { name: 'Bo', email: 'bo@example.com' }, keyHashes: ['k3'] },
    },
    bookingIntros: {
      [emailHash('ada@example.com')]: { bookingId: 'paid1', at: '2026-11-17T10:00:00.000Z' },
      [emailHash('bo@example.com')]: { bookingId: 'other', at: '2026-11-17T11:00:00.000Z' },
    },
    bookingWaitlist: {
      w1: { serviceName: 'Evening class', day: '2026-11-22', name: 'Ada', email: 'ada@example.com' },
      w2: { serviceName: 'Evening class', day: '2026-11-22', name: 'Bo', email: 'bo@example.com' },
    },
    bookingForms: {
      f1: { email: 'ada@example.com', signedName: 'Ada Lovelace', answers: [{ label: 'Allergies', answer: 'Nuts' }] },
      f2: { email: 'bo@example.com', signedName: 'Bo' },
    },
    // The team's visit notes and before/after photos (clientVisits).
    clientVisits: {
      v1: { client: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', email: 'ada@example.com', day: '2026-11-10', note: 'Formula 6N + 20 vol', photos: [{ path: 'client-photos/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/before-1-x.jpg', kind: 'before' }, { path: '../elsewhere.jpg', kind: 'after' }] },
      v2: { client: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', email: 'bo@example.com', day: '2026-11-11', note: 'Trim', photos: [{ path: 'client-photos/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/after-1-y.jpg', kind: 'after' }] },
    },
    // Memberships (memberships.js): one of Ada's that ended, one never started, and Bo's running one.
    memberships: {
      m1: { state: 'ended', startedAt: '2026-10-01T00:00:00.000Z', plan: { name: 'Friends' }, customer: { name: 'Ada', email: 'ada@example.com', uid: 'u1' }, card: { brand: 'visa', last4: '4242' }, sessions: ['cs_m'], subscription: 'sub_1', stripeCustomer: 'cus_1', mode: 'test' },
      m2: { state: 'ended', neverStarted: true, customer: { name: 'Ada', email: 'ada@example.com', uid: 'u1' }, sessions: ['cs_n'] },
      m3: { state: 'active', customer: { name: 'Bo', email: 'bo@example.com', uid: 'u2' } },
    },
    // "Tell me if an earlier time opens".
    bookingEarlier: {
      free1: { bookingId: 'free1', serviceName: 'Studio visit', start: '2026-11-20T15:00:00.000Z', name: 'Ada', email: 'ada@example.com' },
      other: { bookingId: 'other', serviceName: 'Studio visit', start: '2026-11-21T15:00:00.000Z', name: 'Bo', email: 'bo@example.com' },
    },
  });
  const deletedFiles = [];
  const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const { handlePrivacyAdmin } = privacyActions({
    db, admin: {
      auth: () => ({ getUserByEmail: async () => { throw new Error('none'); }, deleteUser: async () => {} }),
      storage: () => ({ bucket: () => ({ file: path => ({ delete: async () => { deletedFiles.push(path); } }) }) }),
    },
    GIFT_CARD_PERSONAL: {}, LIMITS: {}, findByEmailData: findByEmail, giftCardsFor: async () => [],
    neverPaid: () => false, optOutId: e => e, publicOutboxEntry: (id, d) => ({ id, ...d }),
    redactedOperationsFields: () => ({}), redactedOrderFields: () => ({}), reviewErasure: () => ({}),
    requireAdmin: async () => ({ email: 'owner@example.com' }),
  });
  return { db, res, handlePrivacyAdmin, handleMyData: null, deletedFiles };
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
    expect(out.body.bookingWaitingList.map(w => w.id)).toEqual(['w1', 'free1']);
    expect(out.body.bookingForms.map(f => f.id)).toEqual(['f1']);
    // Their first-visit price claim.
    expect(out.body.bookingFirstVisitPrice).toEqual({ bookingId: 'paid1', at: '2026-11-17T10:00:00.000Z' });
    expect(out.body.bookingPacks.map(p => p.id).sort()).toEqual(['p1', 'p2']);
    for (const p of out.body.bookingPacks) for (const key of ['pendingCode', 'sessions', 'paymentIntent']) expect(p).not.toHaveProperty(key);
    // Event tickets they bought, codes included, without link keys or payment ids.
    expect(out.body.eventTickets.map(t => t.id).sort()).toEqual(['t1', 't2']);
    expect(out.body.eventTickets.find(t => t.id === 't1').tickets[0].code).toBe('ABCD-2345');
    for (const t of out.body.eventTickets) for (const key of ['keyHashes', 'pendingKey', 'sessions', 'paymentIntent']) expect(t).not.toHaveProperty(key);
    // Gifts they gave, with what they wrote, without link keys or payment ids.
    expect(out.body.gifts.map(g => g.id).sort()).toEqual(['g1', 'g2']);
    expect(out.body.gifts.find(g => g.id === 'g1').note).toBe('For the press');
    for (const g of out.body.gifts) for (const key of ['keyHashes', 'pendingKey', 'sessions', 'paymentIntent']) expect(g).not.toHaveProperty(key);
  });

  it("the erase clears that person's bookings and waiting list and nobody else's", async () => {
    const { db, res, handlePrivacyAdmin } = setup();
    const out = res();
    await handlePrivacyAdmin({ body: { action: 'privacyErase', email: 'ada@example.com' } }, out);
    expect(out.code).toBe(200);
    expect(out.body).toMatchObject({ redactedBookings: ['free1'], keptBookings: ['paid1'] });
    expect(out.body.deleted.waitingList).toBe(2);
    const bookings = db.store.get('bookings');
    expect(bookings.get('free1')).toMatchObject({ customer: { name: BOOKING_NAME_REMOVED, email: '', phone: '' }, note: '', answers: [], manageKeyHash: '', status: 'confirmed', start: '2026-11-20T15:00:00.000Z' });
    expect(bookings.get('paid1')).toMatchObject({ customer: { name: 'Ada', email: 'ada@example.com', phone: '' }, note: '', answers: [], manageKeyHash: '', paid: true, priceMinor: 2500 });
    expect(bookings.get('other')).toMatchObject({ customer: { name: 'Bo', email: 'bo@example.com' }, note: 'Mine', manageKeyHash: 'ghi' });
    expect([...db.store.get('bookingWaitlist').keys()]).toEqual(['w2']);
    expect([...db.store.get('bookingEarlier').keys()]).toEqual(['other']);
    expect([...db.store.get('bookingForms').keys()]).toEqual(['f2']);
    expect(out.body.deleted.bookingForms).toBe(1);
    expect([...db.store.get('bookingIntros').keys()]).toEqual([emailHash('bo@example.com')]);
    // An unpaid pack goes; a paid one stays as the payment record it is.
    expect(out.body.deleted.unpaidPacks).toBe(1);
    expect([...db.store.get('bookingPacks').keys()].sort()).toEqual(['p1', 'p3']);
    // Event tickets: a card-paid order keeps its name as a payment record, a free one loses it; links stop, tickets stay.
    const tickets = db.store.get('eventOrders');
    expect(tickets.get('t1')).toMatchObject({ customer: { name: 'Ada', email: 'ada@example.com' }, keyHashes: [], ticketCodes: ['ABCD-2345'] });
    expect(tickets.get('t2')).toMatchObject({ customer: { name: BOOKING_NAME_REMOVED, email: '' }, keyHashes: [], tickets: [{ code: 'WXYZ-6789', name: 'Free' }] });
    expect(tickets.get('t3')).toMatchObject({ customer: { name: 'Bo', email: 'bo@example.com' }, keyHashes: ['k3'] });
    // Gifts: a card-paid one keeps its name as a payment record, an unpaid one loses it; nobody else's changes.
    const given = db.store.get('gifts');
    expect(given.get('g1')).toMatchObject({ customer: { name: 'Ada', email: 'ada@example.com' }, keyHashes: [] });
    expect(given.get('g2')).toMatchObject({ customer: { name: BOOKING_NAME_REMOVED, email: '' }, keyHashes: [] });
    expect(given.get('g3')).toMatchObject({ customer: { name: 'Bo' }, keyHashes: ['k3'] });
    // A reward's posting address goes, and so does the giver's line on the fundraiser's wall (only theirs).
    expect(given.get('g1')).toMatchObject({ shipTo: null, wall: false, receiptAddress: null });
    expect(db.store.get('fundraisers').get('fund1').wallEntries).toEqual([{ gift: 'g3', name: 'Bo', at: '2026-11-18' }]);
  });

  it("visit notes and photos: in the owner's export, deleted with their photos on erase, nobody else's touched", async () => {
    const { db, res, handlePrivacyAdmin, deletedFiles } = setup();
    const exp = res();
    await handlePrivacyAdmin({ body: { action: 'privacyExport', email: 'ada@example.com' } }, exp);
    expect(exp.body.clientVisitNotes.map(v => v.id)).toEqual(['v1']);
    const out = res();
    await handlePrivacyAdmin({ body: { action: 'privacyErase', email: 'ada@example.com' } }, out);
    expect([...db.store.get('clientVisits').keys()]).toEqual(['v2']);
    // Only a path inside the client-photos folder is ever deleted.
    expect(deletedFiles).toEqual(['client-photos/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/before-1-x.jpg']);
    expect(out.body.deleted).toMatchObject({ clientVisits: 1, clientPhotos: 1 });
  });
});

describe("memberships in the privacy export and erase", () => {
  it("the export carries the person's memberships without provider ids or card pages", async () => {
    const { res, handlePrivacyAdmin } = setup();
    const out = res();
    await handlePrivacyAdmin({ body: { action: 'privacyExport', email: 'ada@example.com' } }, out);
    expect(out.body.memberships.map(m => m.id)).toEqual(['m1']);
    for (const key of ['sessions', 'subscription', 'stripeCustomer', 'mode']) expect(out.body.memberships[0]).not.toHaveProperty(key);
  });

  it("the erase is refused while a membership runs, then clears the name and card of ended ones", async () => {
    const { db, res, handlePrivacyAdmin } = setup();
    db.store.get('memberships').set('m4', { state: 'active', customer: { name: 'Ada', email: 'ada@example.com' } });
    const refused = res();
    await handlePrivacyAdmin({ body: { action: 'privacyErase', email: 'ada@example.com' } }, refused);
    expect(refused.code).toBe(409);
    expect(refused.body).toMatchObject({ code: 'membership_running', memberships: ['m4'] });
    expect(db.store.get('bookingForms').has('f1')).toBe(true);

    db.store.get('memberships').get('m4').state = 'ended';
    const out = res();
    await handlePrivacyAdmin({ body: { action: 'privacyErase', email: 'ada@example.com' } }, out);
    expect(out.code).toBe(200);
    const m = db.store.get('memberships');
    // Started: the email stays as a payment record. Never started: it goes too.
    expect(m.get('m1')).toMatchObject({ customer: { name: '', email: 'ada@example.com', uid: '' }, card: null });
    expect(m.get('m2')).toMatchObject({ customer: { name: '', email: '', uid: '' } });
    expect(m.get('m3')).toMatchObject({ customer: { name: 'Bo', email: 'bo@example.com' } });
  });
});

describe("the shopper's own copy", () => {
  it('leaves out the team\'s visit notes', async () => {
    const { db } = setup();
    const { privacyActions: actions } = require('./privacyRequests.js');
    expect(typeof actions).toBe('function');
    // The shopper's export reads with scan: false; clientVisits is never read then.
    const reads = [];
    const findByEmailData = async (_db, collection, field, email, opts) => { reads.push([collection, opts.scan]); return Object.assign(await findByEmail(_db, collection, field, email, opts), {}); };
    const { handleMyData } = actions({
      db, admin: { auth: () => ({ verifyIdToken: async () => ({ email: 'ada@example.com', email_verified: true, uid: 'u1' }), getUserByEmail: async () => { throw new Error('none'); } }) },
      LIMITS: {}, hitLimit: async () => true, findByEmailData, giftCardsFor: async () => [], publicOutboxEntry: (id, d) => ({ id, ...d }),
    });
    const out = { code: 0, body: null, status(c) { out.code = c; return out; }, json(b) { out.body = b; return out; } };
    await handleMyData({ headers: { authorization: 'Bearer t' }, body: { action: 'myDataExport' } }, out);
    expect(out.code).toBe(200);
    expect(out.body).not.toHaveProperty('clientVisitNotes');
    expect(reads.some(([c]) => c === 'clientVisits')).toBe(false);
  });
});
