// "Your data" in the shopper's account (plan 14.7): a signed-in shopper downloads only their own data, and asks for
// deletion, which waits for the owner (nothing is erased here).
import { expect, test } from 'vitest';
import { createRequire } from 'module';

const { privacyActions } = createRequire(import.meta.url)('./privacyRequests');
const { privacyRequestRecord } = createRequire(import.meta.url)('./customerRequests');

function build({ user = { uid: 'u1', email: 'Ada@Example.com', email_verified: true }, orders = [], allow = () => true } = {}) {
  const added = [];
  const limits = [];
  const erased = [];
  const sent = [];
  const queried = [];
  const doc = (data) => ({ id: data.id, data: () => data, ref: { delete: () => erased.push(data.id) } });
  const missing = { exists: false, data: () => undefined };
  const db = {
    collection: (name) => ({
      doc: () => ({ get: async () => missing }),
      add: async (record) => { added.push({ name, record }); },
      where: () => { const q = { get: async () => ({ docs: added.filter((a) => a.name === name && a.record.status === 'open').map((a) => doc({ id: 'r', ...a.record })) }), where: () => q }; return q; },
    }),
    getAll: async () => [],
  };
  const admin = { auth: () => ({ verifyIdToken: async (t) => { if (t !== 'good') throw new Error('bad'); return user; }, getUserByEmail: async () => { throw new Error('none'); } }) };
  const actions = privacyActions({
    db, admin, ADMIN_TO: 'owner@example.com', GIFT_CARD_PERSONAL: {}, LIMITS: { track: {}, myDataExport: {} }, RESEND_API_KEY: { value: () => 'k' },
    claimEmailSendDetailed: async () => ({ allowed: true }), confirmationEmail: () => ({}), confirmedRecord: () => ({}),
    escapeHtml: (s) => String(s), findByEmailData: async (_d, coll, _f, email, options = {}) => { queried.push([coll, email, options]); return coll === 'orders' ? orders : []; },
    footerAddress: () => '', giftCardsFor: async () => [], hitLimit: async (_d, bucket, _req, opts, extra) => { limits.push([bucket, extra?.key || '']); return allow(bucket); }, marketingUnsubscribeKey: async () => 'k',
    neverPaid: () => false, normMarketingEmail: (e) => e, optOutId: (e) => e, pendingRecord: () => ({}), privacyRequestRecord,
    publicOutboxEntry: (id, d) => ({ id, ...d }), purposeToken: () => 't', purposeTokenMatches: () => true, readAdminSecret: async () => ({}),
    redactedOperationsFields: () => ({}), redactedOrderFields: () => ({}), requireAdmin: async () => null, reviewErasure: () => ({}),
    sendEmail: async (m) => { sent.push(m); }, siteLink: (p) => p, unsubscribeToken: () => 't',
  });
  return { ...actions, added, erased, sent, queried, limits };
}
const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const req = (action, token = 'good') => ({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { action } });

test('a signed-in shopper downloads a copy of their own data, looked up by their own verified address only', async () => {
  const a = build({ orders: [{ id: 'o1', data: () => ({ customer: { email: 'ada@example.com' }, downloadToken: 'secret', total: 12 }) }] });
  const r = res();
  await a.handleMyData(req('myDataExport'), r);
  expect(r.code).toBe(200);
  expect(r.body.email).toBe('ada@example.com');
  expect(r.body.orders).toEqual([{ id: 'o1', customer: { email: 'ada@example.com' }, total: 12 }]);
  expect(a.queried.every(([, email]) => email === 'ada@example.com')).toBe(true);
  // Indexed lookups only: a signed-in visitor never makes the shop scan whole collections.
  expect(a.queried.every(([, , options]) => options.scan === false)).toBe(true);
  expect(a.limits).toContainEqual(['myDataExport', 'uid:u1']);
});

test('a shopper asking for copies over and over is stopped per account, before any lookup', async () => {
  const a = build({ allow: bucket => bucket !== 'myDataExport' });
  const r = res();
  await a.handleMyData(req('myDataExport'), r);
  expect(r.code).toBe(429);
  expect(a.queried).toEqual([]);
});

test('the shop finds a person by an indexed exact match only, when asked not to scan', async () => {
  const { findByEmail } = createRequire(import.meta.url)('./privacyData');
  const calls = [];
  const row = { id: 'o1', ref: 'o1' };
  const query = { where: (...args) => { calls.push(['where', ...args]); return query; }, select: () => { calls.push(['scan']); return query; }, orderBy: () => query, limit: () => query, startAfter: () => query, get: async () => ({ empty: false, docs: [row] }) };
  const db = { collection: () => query, getAll: async () => [] };
  const docs = await findByEmail(db, 'emailLog', 'to', 'Ada@Example.com', { contains: true, scan: false });
  expect([...docs]).toEqual([row]);
  expect(calls).toEqual([['where', 'to', '==', 'ada@example.com']]);
});

test('no sign-in, a bad token or an unverified address gets nothing', async () => {
  for (const r of [res(), res()]) await build().handleMyData({ method: 'POST', headers: {}, body: { action: 'myDataExport' } }, r);
  const bad = res();
  await build().handleMyData(req('myDataExport', 'wrong'), bad);
  expect(bad.code).toBe(401);
  const unverified = res();
  await build({ user: { uid: 'u2', email: 'x@example.com', email_verified: false } }).handleMyData(req('myDataExport'), unverified);
  expect(unverified.code).toBe(401);
});

test('asking for deletion records a verified request and tells the owner, and erases nothing', async () => {
  const a = build();
  const r = res();
  await a.handleMyData(req('myDataErase'), r);
  expect(r.code).toBe(200);
  expect(a.added).toHaveLength(1);
  expect(a.added[0].record).toMatchObject({ email: 'ada@example.com', type: 'delete', status: 'open', verified: true, source: 'account', uid: 'u1' });
  expect(a.erased).toEqual([]);
  expect(a.sent).toHaveLength(1);
  expect(a.sent[0].html).toMatch(/one tap/);
  // Asking again adds nothing new.
  const again = res();
  await a.handleMyData(req('myDataErase'), again);
  expect(again.body.already).toBe(true);
  expect(a.added).toHaveLength(1);
});
