// The yearly giving summary (Donations G3b, givingYearly.js): in January each giver with tax receipts for last year gets
// one email listing them with the total; never a cancelled or test receipt, never someone who unsubscribed, never twice,
// and nothing outside January or with receipts or the summary switched off.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const realRequire = createRequire(import.meta.url);
const { summaryYear, summaryRecipient, summaryOf, summaryEmail, runYearlySummary } = realRequire("./givingYearly");

function fakeDb() {
  const store = new Map();
  const snapOf = (path) => ({ id: path.split("/").pop(), exists: store.has(path), data: () => structuredClone(store.get(path)) });
  const ref = (path) => ({
    id: path.split("/").pop(), path,
    async get() { return snapOf(path); },
    async create(d) { if (store.has(path)) throw new Error("exists"); store.set(path, structuredClone(d)); },
    async update(d) { store.set(path, { ...store.get(path), ...structuredClone(d) }); },
    async delete() { store.delete(path); },
    collection: (c) => ({ doc: (id) => ref(`${path}/${c}/${id}`) }),
  });
  let queue = Promise.resolve();
  return {
    store,
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }),
    runTransaction(fn) {
      const run = queue.then(() => fn({ get: (r) => r.get(), update: (r, d) => r.update(d), create: (r, d) => r.create(d) }));
      queue = run.catch(() => {});
      return run;
    },
  };
}

const CHARITY = { kind: "ca", number: "123456789 RR 0001", name: "Test Arts Society", address: "1 Main St, Toronto ON", signer: "A. Signer" };
const receipt = (number, receivedOn, eligibleMinor, extra = {}) => ({ number, year: Number(receivedOn.slice(0, 4)), issuedOn: receivedOn, receivedOn, eligibleMinor, currency: "CAD", name: "Ada Giver", address: null, status: "issued", cancelledOn: "", replaces: "", test: false, ...extra });
const gift = (id, email, r, extra = {}) => ({ id, data: { status: "paid", customer: { name: "Ada", email }, receipt: r, ...extra } });

function setup(gifts, { settings = { charity: CHARITY, yearlySummary: true }, today = "2027-01-03", optedOut = [], fail = null } = {}) {
  const db = fakeDb();
  const sent = [];
  const run = () => runYearlySummary({
    db, today: () => today, settings: async () => settings,
    listGifts: async (year, after, limit) => gifts.filter((g) => g.data.receipt?.year === year && g.id > after).sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit),
    giverGifts: async (year, email) => gifts.filter((g) => g.data.customer.email === email && g.data.receipt?.year === year).map((g) => g.data),
    optedOutIds: async () => new Set(optedOut), optOutId: (e) => `h_${e}`,
    sendEmail: async (m) => { if (fail && fail(m)) throw fail(m); sent.push(m); },
    escapeHtml: (s) => String(s).replace(/</g, "&lt;"), risoLayout: (body) => `<main>${body}</main>`,
    layout: async () => ({ shopName: "Test Arts" }), unsubscribeUrl: (e) => `https://shop.example/u?e=${e}`,
  });
  return { db, sent, run };
}

describe("yearly giving summary (G3b)", () => {
  test("due only in January, with receipts and the summary on", () => {
    const on = { charity: CHARITY, yearlySummary: true };
    expect(summaryYear(on, "2027-01-01")).toBe(2026);
    expect(summaryYear(on, "2027-01-31")).toBe(2026);
    expect(summaryYear(on, "2027-02-01")).toBe(0);
    expect(summaryYear(on, "2026-12-31")).toBe(0);
    expect(summaryYear({ charity: null, yearlySummary: true }, "2027-01-02")).toBe(0);
    expect(summaryYear({ charity: CHARITY, yearlySummary: false }, "2027-01-02")).toBe(0);
  });

  test("counts issued, real receipts for that year only", () => {
    expect(summaryRecipient(gift("a", "Ada@Example.com", receipt("2026-00001", "2026-03-01", 2500)).data, 2026)).toBe("ada@example.com");
    expect(summaryRecipient(gift("a", "ada@example.com", receipt("2026-00001", "2026-03-01", 2500, { status: "cancelled" })).data, 2026)).toBe("");
    expect(summaryRecipient(gift("a", "ada@example.com", receipt("TEST-2026-00001", "2026-03-01", 2500, { test: true })).data, 2026)).toBe("");
    expect(summaryRecipient(gift("a", "ada@example.com", receipt("2025-00001", "2025-03-01", 2500)).data, 2026)).toBe("");
    expect(summaryRecipient(gift("a", "ada@example.com", null).data, 2026)).toBe("");
  });

  test("one giver's receipts in order with the total, and the email lists them", () => {
    const gifts = [
      gift("b", "ada@example.com", receipt("2026-00007", "2026-09-01", 5000)).data,
      gift("a", "ada@example.com", receipt("2026-00002", "2026-02-01", 2500)).data,
      gift("c", "ada@example.com", receipt("2026-00003", "2026-02-02", 1000, { status: "cancelled" })).data,
    ];
    const summary = summaryOf(gifts, 2026, "ada@example.com");
    expect(summary.receipts.map((r) => r.number)).toEqual(["2026-00002", "2026-00007"]);
    expect(summary.totals).toEqual({ CAD: 7500 });
    const email = summaryEmail({ year: 2026, summary, charity: CHARITY, layout: { shopName: "Test Arts" }, unsubscribeUrl: "https://u", escapeHtml: (s) => String(s), risoLayout: (b) => b });
    expect(email.subject).toBe("Your 2026 tax receipts from Test Arts");
    expect(email.html).toContain("2026-00002");
    expect(email.html).toContain("$75.00");
    expect(email.html).toContain("123456789 RR 0001");
    expect(email.html).not.toContain("2026-00003");
  });

  test("the sweep mails each giver once, skips the unsubscribed, and a second run sends nothing", async () => {
    const gifts = [
      gift("g1", "ada@example.com", receipt("2026-00001", "2026-02-01", 2500)),
      gift("g2", "bo@example.com", receipt("2026-00002", "2026-03-01", 1000)),
      gift("g3", "ada@example.com", receipt("2026-00003", "2026-04-01", 5000)),
      gift("g4", "cy@example.com", receipt("2026-00004", "2026-05-01", 1000)),
      gift("g5", "di@example.com", receipt("2026-00005", "2026-05-02", 1000, { status: "cancelled" })),
    ];
    const { db, sent, run } = setup(gifts, { optedOut: ["h_cy@example.com"] });
    const first = await run();
    expect(first).toMatchObject({ year: 2026, sent: 2, status: "sent" });
    expect(sent.map((m) => m.to)).toEqual(["ada@example.com", "bo@example.com"]);
    expect(sent[0].html).toContain("$75.00");
    expect(sent[0]).toMatchObject({ bulk: true, kind: "giving-yearly-summary" });
    expect(db.store.get("givingYearly/2026")).toMatchObject({ status: "sent", sent: 2 });
    const again = await run();
    expect(again.sent).toBe(0);
    expect(sent).toHaveLength(2);
  });

  test("a failed send frees its claim and the next run carries on; outside January nothing starts", async () => {
    const gifts = [gift("g1", "ada@example.com", receipt("2026-00001", "2026-02-01", 2500)), gift("g2", "bo@example.com", receipt("2026-00002", "2026-03-01", 1000))];
    let down = true;
    const { db, sent, run } = setup(gifts, { fail: (m) => (down && m.to === "bo@example.com" ? new Error("busy") : null) });
    expect(await run()).toMatchObject({ sent: 1, status: "sending" });
    expect(db.store.get("givingYearly/2026").lastError).toMatch(/try again/);
    expect(db.store.has("givingYearly/2026/sent/h_bo@example.com")).toBe(false);
    down = false;
    expect(await run()).toMatchObject({ sent: 1, status: "sent" });
    expect(sent.map((m) => m.to)).toEqual(["ada@example.com", "bo@example.com"]);

    const feb = setup(gifts, { today: "2027-02-01" });
    expect(await feb.run()).toEqual({ year: 0, sent: 0 });
    expect(feb.db.store.size).toBe(0);
  });
});
