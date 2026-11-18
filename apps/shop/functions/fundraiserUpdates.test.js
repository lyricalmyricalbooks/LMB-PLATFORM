// Updates to a fundraiser's supporters (Donations G2c, fundraiserUpdates.js): the owner queues one, the sweep emails each
// paid giver once per address (never a refunded one, never someone who unsubscribed), a re-run never mails twice, one
// update per fundraiser sends at a time, and the owner can stop or carry on.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const realRequire = createRequire(import.meta.url);
const { runFundraiserUpdates, fundraiserUpdateActions, updateAudience, updateDraftProblem, updateDraft, updateEmail } = realRequire("./fundraiserUpdates");

function fakeDb() {
  const store = new Map();
  let n = 0;
  const snapOf = (path) => ({ id: path.split("/").pop(), exists: store.has(path), data: () => structuredClone(store.get(path)), ref: ref(path) });
  const ref = (path) => ({
    id: path.split("/").pop(), path,
    async get() { return snapOf(path); },
    async create(d) { if (store.has(path)) throw new Error("exists"); store.set(path, structuredClone(d)); },
    async set(d) { store.set(path, structuredClone(d)); },
    async update(d) { store.set(path, { ...store.get(path), ...structuredClone(d) }); },
    async delete() { store.delete(path); },
    collection: (c) => coll(`${path}/${c}`),
  });
  const query = (c, filters = [], max = 1000) => ({
    where: (f, op, v) => query(c, [...filters, [f, op, v]], max),
    limit: (m) => query(c, filters, m),
    async get() {
      const docs = [...store.keys()].filter((k) => k.startsWith(`${c}/`) && !k.slice(c.length + 1).includes("/")).map(snapOf)
        .filter((d) => filters.every(([f, op, v]) => (op === "in" ? v.includes(d.data()[f]) : d.data()[f] === v))).slice(0, max);
      return { docs, empty: docs.length === 0 };
    },
  });
  const coll = (c) => ({ doc: (id) => ref(`${c}/${id || `auto${String(++n).padStart(4, "0")}`}`), ...query(c) });
  let queue = Promise.resolve();
  return {
    store,
    collection: coll,
    runTransaction(fn) {
      const run = queue.then(() => fn({ get: (r) => r.get(), update: (r, d) => r.update(d), create: (r, d) => r.create(d) }));
      queue = run.catch(() => {});
      return run;
    },
  };
}

function res() {
  const out = { statusCode: 200, body: null };
  out.status = (c) => { out.statusCode = c; return out; };
  out.json = (b) => { out.body = b; return out; };
  return out;
}

const gift = (id, email, extra = {}) => ({ id, data: { status: "paid", fundraiserId: "fund0001", customer: { name: "A", email }, ...extra } });

function setup(gifts, { optedOut = [], fail = null } = {}) {
  const db = fakeDb();
  db.store.set("fundraisers/fund0001", { title: "New press fund", status: "live" });
  const sent = [];
  const common = {
    db, escapeHtml: (s) => String(s).replace(/</g, "&lt;"), risoLayout: (body) => `<main>${body}</main>`, risoButton: (url, label) => `<a href="${url}">${label}</a>`,
    layout: async () => ({ shopName: "Test Press" }),
  };
  const sendEmail = async (m) => { if (fail && fail(m)) throw fail(m); sent.push(m); };
  const desk = fundraiserUpdateActions({
    ...common, sendEmail, supportUrl: () => "https://shop.example/support", unsubscribeLink: async () => (e) => `https://shop.example/u?e=${e}`,
    countAudience: async (fid) => updateAudience(gifts.map((g) => g.data), fid, new Set(optedOut), (e) => `h_${e}`),
  });
  const run = () => runFundraiserUpdates({
    ...common, sendEmail, supportUrl: "https://shop.example/support", unsubscribeUrl: (e) => `https://shop.example/u?e=${e}`,
    optOutId: (e) => `h_${e}`, optedOutIds: async () => new Set(optedOut),
    listGifts: async (fid, after, limit) => gifts.filter((g) => g.data.fundraiserId === fid && g.id > after).slice(0, limit),
  });
  const ask = async (body) => {
    const r = res();
    const handled = await desk.handle(body.op, body, { email: "owner@example.com" }, r, async (id) => (db.store.get(`fundraisers/${id}`) || null));
    return { handled, ...r };
  };
  return { db, sent, desk, run, ask };
}

describe("fundraiser updates (G2c)", () => {
  test("the draft needs a subject and words; the email escapes the owner's text and has the unsubscribe link", () => {
    expect(updateDraftProblem(updateDraft({ subject: " ", body: "x" }))).toMatch(/subject/);
    expect(updateDraftProblem(updateDraft({ subject: "Hi", body: "" }))).toMatch(/Write/);
    const email = updateEmail({
      draft: { subject: "We did it", body: "Thanks <all>" }, title: "New press fund", layout: { shopName: "Test Press" }, locale: "fr-CA",
      supportUrl: "https://shop.example/support", unsubscribeUrl: "https://shop.example/u", escapeHtml: (s) => String(s).replace(/</g, "&lt;"),
      risoLayout: (b) => b, risoButton: (u, l) => `<a href="${u}">${l}</a>`,
    });
    expect(email.subject).toBe("We did it");
    expect(email.html).toContain("Thanks &lt;all>");
    expect(email.html).toContain("Se désabonner");
    expect(email.html).toContain("https://shop.example/u");
  });

  test("paid givers get it once per address; refunded, other fundraisers and unsubscribed people don't; a re-run sends nothing", async () => {
    const gifts = [
      gift("g01", "ada@example.com"), gift("g02", "ADA@example.com"), gift("g03", "bo@example.com"),
      gift("g04", "cy@example.com", { status: "refunded" }), gift("g05", "di@example.com", { fundraiserId: "other001" }),
      gift("g06", "ed@example.com"), gift("g07", "fay@example.com", { status: "held" }),
    ];
    const { sent, run, ask, db } = setup(gifts, { optedOut: ["h_ed@example.com"] });
    expect((await ask({ op: "updateCount", fundraiserId: "fund0001" })).body.audience).toBe(2);
    expect((await ask({ op: "updateSend", fundraiserId: "fund0001", subject: "", body: "x" })).statusCode).toBe(400);
    const queued = await ask({ op: "updateSend", fundraiserId: "fund0001", subject: "We did it", body: "Thank you all." });
    expect(queued.body.update).toMatchObject({ status: "queued", audience: 2, subject: "We did it" });
    // A second while it is queued: refused.
    expect((await ask({ op: "updateSend", fundraiserId: "fund0001", subject: "Again", body: "x" })).statusCode).toBe(409);
    const result = await run();
    expect(result).toMatchObject({ sent: 2, status: "sent" });
    expect(sent.map((m) => m.to).sort()).toEqual(["ada@example.com", "bo@example.com"]);
    expect(sent[0]).toMatchObject({ bulk: true, kind: "campaign-fundraiser-update", subject: "We did it" });
    expect(sent[0].html).toContain("New press fund");
    // Done: nothing more to send, and the claims hold no address.
    expect(await run()).toMatchObject({ update: null, sent: 0 });
    expect([...db.store.keys()].filter((k) => k.includes("/sent/")).every((k) => !k.includes("@") || k.includes("h_"))).toBe(true);
  });

  test("an older cursor never mails twice; a failure frees the claim and tries again; the owner can stop it", async () => {
    let down = true;
    const gifts = [gift("g01", "ada@example.com"), gift("g02", "bo@example.com")];
    const { sent, run, ask, db, desk } = setup(gifts, { fail: (m) => (down && m.to === "bo@example.com" ? new Error("timeout") : null) });
    const { body } = await ask({ op: "updateSend", fundraiserId: "fund0001", subject: "News", body: "Printing starts." });
    const first = await run();
    expect(first).toMatchObject({ sent: 1, status: "sending" });
    expect(db.store.get(`fundraiserUpdates/${body.update.id}`).lastError).toMatch(/try again/);
    // The cursor is wound back: ada was claimed, so she still gets one email only.
    db.store.set(`fundraiserUpdates/${body.update.id}`, { ...db.store.get(`fundraiserUpdates/${body.update.id}`), cursor: "", leaseUntil: null });
    down = false;
    expect(await run()).toMatchObject({ sent: 1, status: "sent" });
    expect(sent.map((m) => m.to)).toEqual(["ada@example.com", "bo@example.com"]);
    expect((await ask({ op: "updateCancel", fundraiserId: "fund0001", id: body.update.id })).statusCode).toBe(409);
    expect((await desk.recent())["fund0001"][0]).toMatchObject({ id: body.update.id, status: "sent", sent: 2 });

    // A new one stopped before the sweep sends nothing; a paused one can carry on.
    const next = await ask({ op: "updateSend", fundraiserId: "fund0001", subject: "More", body: "x" });
    expect((await ask({ op: "updateCancel", fundraiserId: "fund0001", id: next.body.update.id })).body.update.status).toBe("cancelled");
    expect(await run()).toMatchObject({ update: null });
    expect((await ask({ op: "updateResume", fundraiserId: "fund0001", id: next.body.update.id })).statusCode).toBe(409);
  });

  test("the platform pausing bulk mail pauses the update at once; a test goes only to the owner; unknown ops pass through", async () => {
    const paused = Object.assign(new Error("newsletter is paused"), { permanent: true });
    const { run, ask, db, sent } = setup([gift("g01", "ada@example.com")], { fail: (m) => (m.bulk ? paused : null) });
    const t = await ask({ op: "updateTest", fundraiserId: "fund0001", subject: "Hi", body: "x" });
    expect(t.body).toMatchObject({ ok: true, to: "owner@example.com" });
    expect(sent[0].subject).toBe("[Test] Hi");
    const { body } = await ask({ op: "updateSend", fundraiserId: "fund0001", subject: "Hi", body: "x" });
    expect(await run()).toMatchObject({ sent: 0, status: "paused" });
    expect(db.store.get(`fundraiserUpdates/${body.update.id}`).lastError).toMatch(/spam/);
    expect((await ask({ op: "updateResume", fundraiserId: "fund0001", id: body.update.id })).body.update.status).toBe("queued");
    expect((await ask({ op: "list" })).handled).toBe(false);
    expect((await ask({ op: "updateCount", fundraiserId: "nope0001" })).statusCode).toBe(404);
    // Nobody gave yet: nothing to queue.
    const empty = setup([]);
    expect((await empty.ask({ op: "updateSend", fundraiserId: "fund0001", subject: "Hi", body: "x" })).statusCode).toBe(400);
  });
});
