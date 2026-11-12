// Customers › Newsletter: only confirmed, not-unsubscribed people; never twice; a page at a time; stops cleanly.
import { expect, test } from 'vitest';
import { createRequire } from 'module';
const {
  newsletterDraft, newsletterDraftProblem, newsletterEmail, runNewsletterIssues, newsletterAdminActions, audienceCount,
  MAX_SENDS_PER_RUN, MAX_FAILED_RUNS,
} = createRequire(import.meta.url)('./newsletterSend.js');

const NOW = Date.parse('2026-11-03T12:00:00Z');
const optOutId = email => `h:${email}`;
const escapeHtml = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A stand-in for index.js compileEmailTemplate: fills {{vars}} and lays out body, button and footer.
const compileEmailTemplate = (id, settings, vars, extra) => {
  const t = settings[id];
  const fill = text => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k === 'shop_name' ? settings.shopName : vars[k] ?? ''));
  return { subject: fill(t.subject), html: `<html><p>${fill(t.body)}</p>${t.buttonText && vars.button_url ? `<a href="${vars.button_url}">${t.buttonText}</a>` : ''}${extra}<p>${fill(t.signoff)}</p></html>` };
};

function fakeDb({ issues = {} } = {}) {
  const data = { newsletterIssues: issues, sent: {} };
  const issueRef = id => ({
    id,
    async get() { const d = data.newsletterIssues[id]; return { exists: !!d, data: () => d }; },
    collection: () => ({
      doc: h => ({
        async create(v) { const key = `${id}/${h}`; if (data.sent[key]) throw Object.assign(new Error('exists'), { code: 6 }); data.sent[key] = v; },
        async delete() { delete data.sent[`${id}/${h}`]; },
      }),
    }),
  });
  let added = 0;
  let lock = Promise.resolve();
  const db = {
    collection(name) {
      const q = { filters: [], n: 1e9, where(f, op, v) { this.filters.push([f, op, v]); return this; }, limit(n) { this.n = n; return this; },
        async get() {
          const docs = Object.entries(data[name] || {}).filter(([, d]) => this.filters.every(([f, op, v]) => (op === 'in' ? v.includes(d[f]) : d[f] === v)))
            .slice(0, this.n).map(([id, d]) => ({ id, data: () => d, ref: issueRef(id) }));
          return { docs, empty: !docs.length };
        } };
      return { ...q, doc: id => issueRef(id ?? `issue${++added}`), async add(v) { const id = `issue${++added}`; data[name][id] = v; return { id }; } };
    },
    // One transaction at a time, like Firestore's serializable transactions.
    runTransaction(fn) {
      const run = lock.then(() => fn({
        get: r => r.get(),
        update: (r, patch) => Object.assign(data.newsletterIssues[r.id], patch),
        create: (r, v) => { if (data.newsletterIssues[r.id]) throw new Error('exists'); data.newsletterIssues[r.id] = v; },
      }));
      lock = run.catch(() => {});
      return run;
    },
  };
  return { db, data };
}

const list = n => Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(4, '0')}@x.example`, data: { email: `p${String(i).padStart(4, '0')}@x.example`, status: 'confirmed' } }));
const lister = rows => async (after, limit) => rows.filter(r => !after || r.id > after).slice(0, limit);
const issue = extra => ({ subject: 'News', body: 'Hello from {{shop_name}}', buttonText: '', buttonUrl: '', status: 'queued', audience: 3, sent: 0, skipped: 0, failed: 0, cursor: '', createdAt: '2026-11-03T10:00:00Z', ...extra });

function deps(db, rows, { optedOut = [], send } = {}) {
  const sentTo = [];
  return {
    sentTo,
    deps: {
      db, now: () => NOW, optOutId, escapeHtml, compileEmailTemplate, notificationSettings: { shopName: 'Field Notes' },
      listSubscribers: lister(rows), optedOutIds: async () => new Set(optedOut.map(optOutId)),
      unsubscribeUrl: email => `https://shop.example/track?unsubscribe=1&e=${email}`,
      sendEmail: send || (async m => { sentTo.push(m); }),
    },
  };
}

test('a draft needs a subject and words, and a button needs an https address', () => {
  expect(newsletterDraftProblem(newsletterDraft({ subject: ' ', body: 'x' }))).toMatch(/subject/);
  expect(newsletterDraftProblem(newsletterDraft({ subject: 'Hi', body: '' }))).toMatch(/Write something/);
  expect(newsletterDraftProblem(newsletterDraft({ subject: 'Hi', body: 'x', buttonText: 'Go' }))).toMatch(/web address/);
  expect(newsletterDraftProblem(newsletterDraft({ subject: 'Hi', body: 'x', buttonText: 'Go', buttonUrl: 'javascript:alert(1)' }))).toMatch(/https/);
  expect(newsletterDraftProblem(newsletterDraft({ subject: 'Hi', body: 'x', buttonText: 'Go', buttonUrl: 'https://shop.example/new' }))).toBe('');
  expect(newsletterDraft({ subject: 'a\nb', body: 'x'.repeat(30000) }).body).toHaveLength(20000);
});

test("a past buyer is told they bought, never that they signed up", () => {
  const email = buyer => newsletterEmail(newsletterDraft({ subject: 'News', body: 'Hello' }),
    { compileEmailTemplate, notificationSettings: { shopName: 'Field Notes' }, escapeHtml, unsubscribeUrl: 'https://shop.example/u', buyer }).html;
  expect(email(true)).toContain('because you bought from Field Notes');
  expect(email(true)).not.toContain('signed up');
  expect(email(false)).toContain('because you signed up for news from Field Notes');
});

test("the owner's words are text, not HTML, and every email carries its own unsubscribe link", () => {
  const { subject, html } = newsletterEmail(newsletterDraft({ subject: 'New at {{shop_name}}', body: '<script>x</script> from {{shop_name}}' }),
    { compileEmailTemplate, notificationSettings: { shopName: 'Field Notes' }, escapeHtml, unsubscribeUrl: 'https://shop.example/u?e=a' });
  expect(subject).toBe('New at Field Notes');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('from Field Notes');
  expect(html).toContain('href="https://shop.example/u?e=a"');
  expect(html).not.toMatch(/\{\{/);
});

test('only confirmed people who did not unsubscribe are counted, each address once', () => {
  const records = [
    { email: 'a@x.example', status: 'confirmed' }, { email: 'A@x.example ', status: 'confirmed' },
    { email: 'b@x.example', status: 'pending' }, { email: 'c@x.example' }, { email: 'd@x.example', status: 'imported' },
    { email: 'gone@x.example', status: 'confirmed' }, { email: 'not-an-email', status: 'confirmed' },
  ];
  expect(audienceCount(records, new Set([optOutId('gone@x.example')]), optOutId)).toBe(3);
});

test('a send reaches confirmed people only and finishes', async () => {
  const rows = [
    { id: 'a@x.example', data: { email: 'a@x.example', status: 'confirmed' } },
    { id: 'b@x.example', data: { email: 'b@x.example', status: 'pending' } },
    { id: 'c@x.example', data: { email: 'c@x.example', status: 'confirmed' } },
    { id: 'd@x.example', data: { email: 'd@x.example', status: 'confirmed' } },
  ];
  const { db, data } = fakeDb({ issues: { n1: issue() } });
  const { deps: d, sentTo } = deps(db, rows, { optedOut: ['d@x.example'] });
  const result = await runNewsletterIssues(d);
  expect(sentTo.map(m => m.to)).toEqual(['a@x.example', 'c@x.example']);
  expect(sentTo.every(m => m.bulk === true && m.kind === 'newsletter' && !m.queue)).toBe(true);
  expect(sentTo[0].html).toContain('e=a@x.example');
  expect(result.status).toBe('sent');
  expect(data.newsletterIssues.n1).toMatchObject({ status: 'sent', sent: 2, skipped: 2, leaseUntil: null });
  expect(data.newsletterIssues.n1.finishedAt).toBeTruthy();
});

test('a big list goes a page at a time across sweeps, and nobody gets it twice', async () => {
  const rows = list(MAX_SENDS_PER_RUN + 40);
  const { db, data } = fakeDb({ issues: { n1: issue({ audience: rows.length }) } });
  const { deps: d, sentTo } = deps(db, rows);
  const first = await runNewsletterIssues(d);
  expect(first.sent).toBe(MAX_SENDS_PER_RUN);
  expect(data.newsletterIssues.n1.status).toBe('sending');
  // A rerun from an older cursor (a crash before the cursor was saved) skips everyone already claimed.
  data.newsletterIssues.n1.cursor = '';
  await runNewsletterIssues(d);
  expect(sentTo).toHaveLength(rows.length);
  expect(new Set(sentTo.map(m => m.to)).size).toBe(rows.length);
  expect(data.newsletterIssues.n1.status).toBe('sent');
});

test('a second sweep while one holds the lease sends nothing', async () => {
  const { db } = fakeDb({ issues: { n1: issue({ status: 'sending', leaseUntil: new Date(NOW + 60000).toISOString() }) } });
  const { deps: d, sentTo } = deps(db, list(3));
  expect(await runNewsletterIssues(d)).toMatchObject({ sent: 0, skipped: 'busy' });
  expect(sentTo).toHaveLength(0);
});

test('a failed send stops the run, frees that person for the next try, and pauses after repeated failures', async () => {
  const rows = list(3);
  const { db, data } = fakeDb({ issues: { n1: issue() } });
  let calls = 0;
  const { deps: d } = deps(db, rows, { send: async () => { calls += 1; if (calls === 2) throw new Error('timeout'); } });
  await runNewsletterIssues(d);
  expect(data.newsletterIssues.n1).toMatchObject({ status: 'sending', sent: 1, cursor: rows[0].id, failedRuns: 1 });
  expect(data.sent[`n1/${optOutId(rows[1].id)}`]).toBeUndefined();
  await runNewsletterIssues(d);
  expect(data.newsletterIssues.n1).toMatchObject({ status: 'sent', sent: 3 });

  const broken = fakeDb({ issues: { n2: issue({ failedRuns: MAX_FAILED_RUNS - 1 }) } });
  const { deps: d2 } = deps(broken.db, rows, { send: async () => { throw new Error('no sender'); } });
  await runNewsletterIssues(d2);
  expect(broken.data.newsletterIssues.n2.status).toBe('paused');
  expect(broken.data.newsletterIssues.n2.lastError).toMatch(/Resume/);
});

test('a bad address is skipped for good; a platform pause stops the issue in plain words', async () => {
  const rows = list(3);
  const { db, data } = fakeDb({ issues: { n1: issue() } });
  const { deps: d } = deps(db, rows, { send: async m => { if (m.to === rows[0].id) throw Object.assign(new Error('bad address'), { permanent: true }); } });
  await runNewsletterIssues(d);
  expect(data.newsletterIssues.n1).toMatchObject({ status: 'sent', sent: 2, failed: 1 });

  const paused = fakeDb({ issues: { n2: issue() } });
  const err = Object.assign(new Error("The platform's shared sender refused the email (422: shop's newsletter is paused because too many people marked it as spam)."), { permanent: true });
  const { deps: d2 } = deps(paused.db, rows, { send: async () => { throw err; } });
  await runNewsletterIssues(d2);
  expect(paused.data.newsletterIssues.n2.status).toBe('paused');
  expect(paused.data.newsletterIssues.n2.lastError).toMatch(/marked your newsletters as spam/);
  expect(paused.data.sent).toEqual({});
});

test('cancelling while a run is sending wins', async () => {
  const rows = list(3);
  const { db, data } = fakeDb({ issues: { n1: issue() } });
  const { deps: d } = deps(db, rows, { send: async () => { data.newsletterIssues.n1.status = 'cancelled'; } });
  await runNewsletterIssues(d);
  expect(data.newsletterIssues.n1.status).toBe('cancelled');
});

function res() {
  return { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
function admin(db, extra = {}) {
  const mails = [];
  const { handleNewsletterAdmin } = newsletterAdminActions({
    db, now: () => NOW, escapeHtml, compileEmailTemplate,
    requireAdmin: async () => ({ email: 'owner@example.com', uid: 'u1' }),
    countAudience: async () => 2, loadNotificationSettings: async () => ({ shopName: 'Field Notes' }),
    unsubscribeLink: async () => email => `https://shop.example/u?e=${email}`,
    sendEmail: async m => { mails.push(m); }, ...extra,
  });
  return { handle: body => { const r = res(); return handleNewsletterAdmin({ body }, r).then(() => r); }, mails };
}

test('the admin action: a test goes to the signed-in person only, a send is queued, never two at once', async () => {
  const { db, data } = fakeDb();
  const a = admin(db);
  expect((await a.handle({ op: 'audience' })).body).toEqual({ audience: 2 });
  expect((await a.handle({ op: 'send', subject: '', body: 'x' })).code).toBe(400);
  const t = await a.handle({ op: 'test', subject: 'Hi', body: 'Hello' });
  expect(t.body).toEqual({ ok: true, to: 'owner@example.com' });
  expect(a.mails).toHaveLength(1);
  expect(a.mails[0].subject).toBe('[Test] Hi');
  expect(Object.keys(data.newsletterIssues)).toHaveLength(0);

  const s = await a.handle({ op: 'send', subject: 'Hi', body: 'Hello' });
  expect(s.body).toMatchObject({ ok: true, audience: 2 });
  expect(data.newsletterIssues[s.body.id]).toMatchObject({ status: 'queued', audience: 2, sent: 0, createdBy: 'owner@example.com' });
  expect(a.mails).toHaveLength(1); // queuing sends nothing: the sweep does
  expect((await a.handle({ op: 'send', subject: 'Again', body: 'x' })).code).toBe(409);

  expect((await a.handle({ op: 'resume', id: s.body.id })).code).toBe(409);
  expect((await a.handle({ op: 'cancel', id: s.body.id })).code).toBe(200);
  expect(data.newsletterIssues[s.body.id].status).toBe('cancelled');
  expect((await a.handle({ op: 'cancel', id: s.body.id })).code).toBe(409);
  expect((await a.handle({ op: 'cancel', id: '../x' })).code).toBe(400);
});

test('two Send presses at once queue one newsletter, so nobody gets it twice', async () => {
  const { db, data } = fakeDb();
  const a = admin(db);
  const answers = await Promise.all([a.handle({ op: 'send', subject: 'Hi', body: 'x' }), a.handle({ op: 'send', subject: 'Hi', body: 'x' })]);
  expect(answers.map(r => r.code).sort()).toEqual([200, 409]);
  expect(Object.keys(data.newsletterIssues)).toHaveLength(1);
});

test('the admin action refuses an empty list and a non-admin', async () => {
  const { db } = fakeDb();
  expect((await admin(db, { countAudience: async () => 0 }).handle({ op: 'send', subject: 'Hi', body: 'x' })).code).toBe(400);
  let asked = false;
  const blocked = admin(db, { requireAdmin: async (req, r) => { asked = true; r.status(403).json({ error: 'no' }); return null; } });
  expect((await blocked.handle({ op: 'send', subject: 'Hi', body: 'x' })).code).toBe(403);
  expect(asked).toBe(true);
});
