// Card pay links for stockroom invoices (invoicePay.js): the server keeps the amount, the customer's page only asks for a
// fresh card page, the webhook is never involved, and the admin learns "paid" from the card page itself.
import { describe, expect, test } from 'vitest';
import { createRequire } from 'module';

const realRequire = createRequire(import.meta.url);
const { cleanPayLink, payCheckoutParams, sessionPaid, invoicePayActions } = realRequire('./invoicePay');

function fakeDb() {
  const docs = new Map();
  const ref = (id) => ({
    id,
    async get() { return { exists: docs.has(id), data: () => docs.get(id), ref: ref(id) }; },
    async set(data, opts) { docs.set(id, opts?.merge ? { ...(docs.get(id) || {}), ...data } : data); },
    async create(data) { if (docs.has(id)) throw new Error('exists'); docs.set(id, data); },
  });
  const col = {
    doc: ref,
    where: (field, _op, value) => ({ async get() { return { docs: [...docs.entries()].filter(([, d]) => d[field] === value).map(([id, d]) => ({ id, data: () => d, ref: ref(id) })) }; } }),
  };
  return {
    docs,
    collection: () => col,
    async runTransaction(fn) { return fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o) }); },
  };
}

function setup({ checkout = undefined, admin = true } = {}) {
  const db = fakeDb();
  const opened = [];
  const sessions = new Map();
  const card = checkout === null ? null : {
    async open(params, key) { const id = `cs_test_${String(opened.length).padStart(8, '0')}`; opened.push({ params, key }); sessions.set(id, { id, payment_status: 'unpaid', status: 'open', amount_total: params.line_items[0].price_data.unit_amount, currency: params.line_items[0].price_data.currency, metadata: params.metadata }); return { id, url: `https://pay.example/${id}` }; },
    async read(id) { return sessions.get(id) || null; },
  };
  let n = 0;
  const actions = invoicePayActions({
    db,
    requireAdmin: async (_req, res) => (admin ? { email: 'owner@example.com' } : (res.status(401).json({ error: 'no' }), null)),
    payments: { standaloneCheckout: async () => card },
    shopTestMode: async () => true,
    hitLimit: async () => true,
    LIMITS: {},
    siteLink: (p) => `https://press.example${p}`,
    shopName: () => 'Moth Press',
    now: () => new Date('2026-11-11T12:00:00Z'),
    randomToken: () => String(++n).padStart(32, 'a'),
  });
  return { db, actions, opened, sessions };
}

function call(handler, body) {
  return new Promise((resolve) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(data) { resolve({ code: this.code, data }); return this; } };
    handler({ body }, res);
  });
}

describe('the link the admin asks for', () => {
  test('cleans the amount, currency and email', () => {
    expect(cleanPayLink({ ref: 'inv-1', amount: '120.5', currency: 'cad', email: 'Shop@Example.com', label: 'Invoice 12' }))
      .toEqual({ ref: 'inv-1', kind: 'invoice', label: 'Invoice 12', currency: 'CAD', amountMinor: 12050, email: 'shop@example.com' });
    expect(cleanPayLink({ ref: 'inv-1', amount: 0.2 }).problem).toMatch(/0.50/);
    expect(cleanPayLink({ ref: '../x', amount: 5 }).problem).toBeTruthy();
    expect(cleanPayLink({ ref: 'inv-1', amount: 5, currency: 'XYZ' }).problem).toMatch(/XYZ/);
  });
  test('the card page names no shop order, so the webhook leaves it alone', () => {
    const params = payCheckoutParams({ ref: 'inv-1', label: 'Invoice 12', amountMinor: 5000, currency: 'CAD', email: '' }, { token: 't', shopName: 'Moth Press', returnUrl: 'https://x', nowSeconds: 100 });
    expect(params).not.toHaveProperty('client_reference_id');
    expect(params.metadata).toEqual({ invoice_pay: 't', invoice_ref: 'inv-1' });
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'cad', unit_amount: 5000 });
  });
  test('two taps in the same ten minutes ask for exactly the same page (the card company refuses a repeated key with new details)', () => {
    const link = { ref: 'inv-1', label: 'Invoice 12', amountMinor: 5000, currency: 'CAD', email: '' };
    const at = nowSeconds => payCheckoutParams(link, { token: 't', shopName: 'Moth Press', returnUrl: 'https://x', nowSeconds });
    expect(at(1_800_000_005)).toEqual(at(1_800_000_400));
    expect(at(1_800_000_005).expires_at).not.toBe(at(1_800_000_700).expires_at);
    for (const t of [1_800_000_000, 1_800_000_599]) {
      expect(at(t).expires_at - t).toBeGreaterThanOrEqual(3600);
      expect(at(t).expires_at - t).toBeLessThanOrEqual(3600 + 600);
    }
  });
  test('a paid page counts only for the same link, amount and currency', () => {
    const link = { amountMinor: 5000, currency: 'CAD' };
    expect(sessionPaid({ payment_status: 'paid', amount_total: 5000, currency: 'cad', metadata: { invoice_pay: 't' } }, 't', link)).toBe(true);
    expect(sessionPaid({ payment_status: 'paid', amount_total: 4000, currency: 'cad', metadata: { invoice_pay: 't' } }, 't', link)).toBe(false);
    expect(sessionPaid({ payment_status: 'paid', amount_total: 5000, currency: 'cad', metadata: { invoice_pay: 'u' } }, 't', link)).toBe(false);
    expect(sessionPaid({ payment_status: 'unpaid' }, 't', link)).toBe(false);
  });
});

describe('making, opening and reading a link', () => {
  test('make, then the customer opens a page from the saved amount, then the admin sees it paid', async () => {
    const { actions, opened, sessions, db } = setup();
    const made = await call(actions.handleInvoicePay, { op: 'make', link: { ref: 'inv-1', amount: 50, currency: 'CAD', label: 'Invoice 12' } });
    expect(made.code).toBe(200);
    expect(made.data.url).toBe(`https://press.example/track?invoicePay=${made.data.token}`);

    const view = await call(actions.handleInvoicePayOpen, { token: made.data.token });
    expect(view.data).toEqual({ label: 'Invoice 12', amountMinor: 5000, currency: 'CAD', paid: false, open: true });
    expect(opened).toHaveLength(0);

    // The browser can't change the amount: only the token is read.
    const open = await call(actions.handleInvoicePayOpen, { token: made.data.token, op: 'open', amount: 1 });
    expect(open.data.url).toMatch(/^https:\/\/pay\.example\//);
    expect(opened[0].params.line_items[0].price_data.unit_amount).toBe(5000);
    expect(db.docs.get(made.data.token).sessions).toHaveLength(1);

    let status = await call(actions.handleInvoicePay, { op: 'status', tokens: [made.data.token] });
    expect(status.data.links[made.data.token]).toMatchObject({ ref: 'inv-1', paid: false });
    const id = db.docs.get(made.data.token).sessions[0];
    sessions.set(id, { ...sessions.get(id), payment_status: 'paid', status: 'complete' });
    status = await call(actions.handleInvoicePay, { op: 'status', tokens: [made.data.token] });
    expect(status.data.links[made.data.token]).toMatchObject({ paid: true, paidAt: '2026-11-11T12:00:00.000Z' });

    // A paid link opens no new page.
    const again = await call(actions.handleInvoicePayOpen, { token: made.data.token, op: 'open' });
    expect(again.data.paid).toBe(true);
    expect(again.data.url).toBeUndefined();
    expect(opened).toHaveLength(1);
  });
  test('a new link for the same invoice closes the old one', async () => {
    const { actions, db } = setup();
    const first = await call(actions.handleInvoicePay, { op: 'make', link: { ref: 'inv-1', amount: 50 } });
    const second = await call(actions.handleInvoicePay, { op: 'make', link: { ref: 'inv-1', amount: 60 } });
    expect(db.docs.get(first.data.token).status).toBe('closed');
    expect(db.docs.get(second.data.token).status).toBe('open');
    const old = await call(actions.handleInvoicePayOpen, { token: first.data.token, op: 'open' });
    expect(old.data).toMatchObject({ open: false });
    expect(old.data.url).toBeUndefined();
  });
  test('closing a link says when it was already paid, and closes an unpaid one', async () => {
    const { actions, sessions, db } = setup();
    const paid = await call(actions.handleInvoicePay, { op: 'make', link: { ref: 'inv-1', amount: 50, currency: 'CAD' } });
    await call(actions.handleInvoicePayOpen, { token: paid.data.token, op: 'open' });
    const id = db.docs.get(paid.data.token).sessions[0];
    sessions.set(id, { ...sessions.get(id), payment_status: 'paid', status: 'complete' });
    const first = await call(actions.handleInvoicePay, { op: 'close', token: paid.data.token });
    expect(first.data).toMatchObject({ ok: true, paid: true, amountMinor: 5000, currency: 'CAD' });

    const unpaid = await call(actions.handleInvoicePay, { op: 'make', link: { ref: 'inv-2', amount: 20, currency: 'CAD' } });
    const second = await call(actions.handleInvoicePay, { op: 'close', token: unpaid.data.token });
    expect(second.data).toMatchObject({ ok: true, paid: false });
    expect(db.docs.get(unpaid.data.token).status).toBe('closed');
    expect((await call(actions.handleInvoicePayOpen, { token: unpaid.data.token, op: 'open' })).data.url).toBeUndefined();
  });
  test('refuses without card payments, a stranger, or a made-up link', async () => {
    expect((await call(setup({ checkout: null }).actions.handleInvoicePay, { op: 'make', link: { ref: 'inv-1', amount: 50 } })).code).toBe(409);
    expect((await call(setup({ admin: false }).actions.handleInvoicePay, { op: 'make', link: { ref: 'inv-1', amount: 50 } })).code).toBe(401);
    expect((await call(setup().actions.handleInvoicePayOpen, { token: 'f'.repeat(32), op: 'open' })).code).toBe(404);
    expect((await call(setup().actions.handleInvoicePayOpen, { token: 'nope' })).code).toBe(404);
  });
});
