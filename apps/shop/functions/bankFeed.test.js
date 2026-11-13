// Bank feed (beta): the shop's server collects its bank transactions from the platform's bank door, keeps them waiting
// until the owner decides each one, and never loses or repeats a line. A pretend door and database stand in.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { bankFeedActions } = require("./bankFeed.js");
const { readShopConfig } = require("./shopConfig.js");
const { usesPlatformServices } = require("./platformKey.js");

const URL_ = "https://platform.example/api/bank-feed";
const KEY = "service-key-moth-press-0123456789abcdef0123";
const NOW = Date.parse("2026-11-13T16:00:00Z");

/** A small in-memory Firestore: docs with get/set/update/delete and a limited list. */
function fakeDb() {
  const data = new Map();
  const col = (name) => { if (!data.has(name)) data.set(name, new Map()); return data.get(name); };
  const ref = (name, id) => ({
    id,
    get: async () => ({ id, exists: col(name).has(id), data: () => structuredClone(col(name).get(id)) }),
    set: async (value) => { col(name).set(id, structuredClone(value)); },
    update: async (value) => { col(name).set(id, { ...col(name).get(id), ...structuredClone(value) }); },
    delete: async () => { col(name).delete(id); },
  });
  const list = (name, max = Infinity) => ({
    limit: (n) => list(name, n),
    get: async () => ({ docs: [...col(name).entries()].slice(0, max).map(([id, d]) => ({ id, ref: ref(name, id), data: () => structuredClone(d) })) }),
  });
  return { data, col, collection: (name) => ({ doc: (id) => ref(name, id), ...list(name) }) };
}

const line = (id, cents, extra = {}) => ({ id, bankId: "bank01", date: "2026-11-10", cents, currency: "CAD", name: `LINE ${id}`, account: "Chequing ••1234", ...extra });

/** A pretend bank door: the add-on, the banks and the pages of lines waiting at the bank. */
function fakeDoor({ available = true, on = true, banks = [{ id: "bank01", name: "First Platypus Bank", accounts: ["Chequing ••1234"], connectedAt: "2026-11-13T15:00:00.000Z" }], pages = [] } = {}) {
  const state = { available, on, banks: [...banks], pages: [...pages], calls: [], down: false };
  const fetch = async (url, init) => {
    if (state.down) throw new Error("socket hang up");
    const { op, args } = JSON.parse(init.body);
    state.calls.push({ url, op, args, shop: init.headers["X-Shop-Id"], auth: init.headers.Authorization });
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    const view = () => ({ ok: true, available: state.available, addOn: { on: state.on, price: "CA$4", extraPrice: "CA$1.50", included: 2 }, banks: state.on ? state.banks : [] });
    if (op === "bank.status") return json(200, view());
    if (op === "bank.linkToken") return state.on ? json(200, { ok: true, token: "link-sandbox-1" }) : json(409, { ok: false, message: "Add the bank feed to your plan first, under Settings › Plan." });
    if (op === "bank.connect") { state.banks.push({ id: "bank02", name: args.bankName, accounts: ["Savings ••9"], connectedAt: "now" }); return json(200, view()); }
    if (op === "bank.signedIn") return json(200, view());
    if (op === "bank.disconnect") { state.banks = state.banks.filter((b) => b.id !== args.bankId); return json(200, view()); }
    if (op === "bank.pull") {
      const at = Number(args.cursors?.bank01 || 0);
      const page = state.pages[at];
      return json(200, { ok: true, banks: page ? [{ bankId: "bank01", lines: page.lines || [], removed: page.removed || [], cursor: String(at + 1), more: at + 1 < state.pages.length }] : [{ bankId: "bank01", lines: [], removed: [], cursor: String(at), more: false }], needsSignIn: [], failed: [] });
    }
    return json(400, { ok: false, message: "Unknown call." });
  };
  return { state, fetch };
}

function build({ door = fakeDoor(), role = "admin", url = URL_ } = {}) {
  const db = fakeDb();
  const refuse = async (_req, res) => { res.status(403).json({ error: "Not allowed." }); return null; };
  const person = async () => ({ email: "owner@example.com" });
  const clock = { now: NOW };
  const actions = bankFeedActions({
    url, shopId: () => "moth-press", serviceKey: () => KEY, db, fetch: door.fetch, now: () => clock.now,
    requireAdmin: role === "admin" ? person : refuse, requireBooksReader: role === "nobody" ? refuse : person,
  });
  const ask = async (step, extra = {}) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await actions.handleBankFeed({ body: { action: "bankFeed", step, ...extra } }, res);
    return res;
  };
  return { db, door, actions, ask, clock };
}

describe("bank feed on the shop's server", () => {
  test("without the door the page says it is opening soon, and nothing is asked", async () => {
    const w = build({ url: "" });
    expect((await w.ask("status")).body).toEqual({ available: false, addOn: { on: false, price: "", extraPrice: "", included: 2 }, banks: [], checkedAt: "", waiting: [], matches: [] });
    expect(w.door.state.calls).toEqual([]);
  });

  test("the bookkeeper may look but not connect, decide or disconnect; a stranger sees nothing", async () => {
    const w = build({ role: "bookkeeper" });
    expect((await w.ask("status")).code).toBe(200);
    for (const [step, extra] of [["linkToken", {}], ["check", {}], ["decide", { matches: [{ lineId: "tx-1", kind: "skipped", ref: "" }] }], ["disconnect", { bankId: "bank01" }]]) {
      expect((await w.ask(step, extra)).code).toBe(403);
    }
    expect((await build({ role: "nobody" }).ask("status")).code).toBe(403);
  });

  test("a check collects every page once, as this shop, and a second check adds nothing", async () => {
    const door = fakeDoor({ pages: [{ lines: [line("tx-1", -4250), line("tx-2", 18025)] }, { lines: [line("tx-3", -900, { pending: true })] }] });
    const w = build({ door });
    const first = (await w.ask("check")).body;
    expect(first.waiting.map((l) => [l.id, l.cents, l.pending ?? false])).toEqual([["tx-1", -4250, false], ["tx-2", 18025, false], ["tx-3", -900, true]]);
    expect(first.checkedAt).toBe("2026-11-13T16:00:00.000Z");
    expect(first.banks[0].name).toBe("First Platypus Bank");
    const pull = door.state.calls.find((c) => c.op === "bank.pull");
    expect([pull.url, pull.shop, pull.auth]).toEqual([`${URL_}/shop`, "moth-press", `Bearer ${KEY}`]);
    expect(w.db.col("bankFeedState").get("main").cursors).toEqual({ bank01: "2" });
    w.clock.now += 60_000;
    expect((await w.ask("check")).body.waiting).toHaveLength(3);
    // Pressed twice within seconds: the bank isn't asked again.
    const asked = door.state.calls.filter((c) => c.op === "bank.pull").length;
    await w.ask("check");
    expect(door.state.calls.filter((c) => c.op === "bank.pull")).toHaveLength(asked);
  });

  test("a decided line leaves the list, keeps its decision when the bank sends it again, and a pending one can't be decided", async () => {
    const door = fakeDoor({ pages: [{ lines: [line("tx-1", -4250), line("tx-2", 18025), line("tx-3", -900, { pending: true })] }] });
    const w = build({ door });
    await w.ask("check");
    const after = (await w.ask("decide", { matches: [{ lineId: "tx-1", kind: "expense", ref: "35" }, { lineId: "tx-2", kind: "payout", ref: "po_1" }, { lineId: "tx-3", kind: "skipped", ref: "" }, { lineId: "tx-gone", kind: "skipped", ref: "" }] })).body;
    expect(after.waiting.map((l) => l.id)).toEqual(["tx-3"]);
    expect(after.matches).toEqual([{ lineId: "tx-1", kind: "expense", ref: "35" }, { lineId: "tx-2", kind: "payout", ref: "po_1" }]);
    // The bank corrects tx-1's words and settles the pending line under a new id.
    door.state.pages.push({ lines: [line("tx-1", -4250, { name: "CANVA PTY" }), line("tx-4", -900)], removed: ["tx-3", "tx-2"] });
    w.clock.now += 60_000;
    const next = (await w.ask("check")).body;
    expect(next.waiting.map((l) => l.id)).toEqual(["tx-4"]);
    expect(next.matches.map((m) => m.lineId)).toEqual(["tx-1", "tx-2"]);
    expect(w.db.col("bankFeed").get("tx-1")).toMatchObject({ name: "CANVA PTY", state: "expense", ref: "35" });
  });

  test("bad requests are refused before the platform is asked", async () => {
    const w = build();
    for (const [step, extra] of [["everything", {}], ["decide", { matches: [] }], ["decide", { matches: [{ lineId: "tx-1", kind: "paid", ref: "x" }] }], ["decide", { matches: [{ lineId: "tx-1", kind: "expense", ref: "" }] }], ["disconnect", {}], ["linkToken", { bankId: "../x" }]]) {
      expect((await w.ask(step, extra)).code).toBe(400);
    }
    expect(w.door.state.calls).toEqual([]);
  });

  test("connecting collects the new bank's lines; disconnecting removes its waiting lines but keeps decisions", async () => {
    const door = fakeDoor({ pages: [{ lines: [line("tx-1", -4250), line("tx-2", -100)] }] });
    const w = build({ door });
    expect((await w.ask("linkToken")).body).toEqual({ token: "link-sandbox-1" });
    const connected = (await w.ask("connect", { publicToken: "public-sandbox-1", bankName: "Second Bank" })).body;
    expect(connected.banks.map((b) => b.name)).toEqual(["First Platypus Bank", "Second Bank"]);
    expect(connected.waiting).toHaveLength(2);
    expect(door.state.calls.find((c) => c.op === "bank.connect").args).toEqual({ publicToken: "public-sandbox-1", bankName: "Second Bank", by: "owner@example.com" });
    await w.ask("decide", { matches: [{ lineId: "tx-1", kind: "skipped", ref: "" }] });
    const left = (await w.ask("disconnect", { bankId: "bank01" })).body;
    expect([left.banks.map((b) => b.id), left.waiting, left.matches]).toEqual([["bank02"], [], [{ lineId: "tx-1", kind: "skipped", ref: "" }]]);
    expect(w.db.col("bankFeedState").get("main").cursors).toEqual({});
  });

  test("the add-on turned off: the page shows no banks or lines, and the platform's refusal is passed on in plain words", async () => {
    const door = fakeDoor({ pages: [{ lines: [line("tx-1", -4250)] }] });
    const w = build({ door });
    await w.ask("check");
    door.state.on = false;
    const off = (await w.ask("status")).body;
    expect([off.available, off.addOn.on, off.banks, off.waiting]).toEqual([true, false, [], []]);
    const refused = await w.ask("linkToken");
    expect([refused.code, refused.body.error]).toEqual([409, "Add the bank feed to your plan first, under Settings › Plan."]);
  });

  test("the sweep collects only for a shop with a bank connected, and a platform that is down is logged, not thrown", async () => {
    const door = fakeDoor({ pages: [{ lines: [line("tx-1", -4250)] }] });
    const w = build({ door });
    expect(await w.actions.sweepBankFeed()).toEqual({ ran: false });
    expect(door.state.calls).toEqual([]);
    await w.ask("check");
    door.state.pages.push({ lines: [line("tx-2", -100)] });
    expect(await w.actions.sweepBankFeed()).toEqual({ ran: true });
    expect(w.db.col("bankFeed").has("tx-2")).toBe(true);
    door.state.down = true;
    expect((await w.actions.sweepBankFeed()).ran).toBe(false);
  });

  test("the door's address is read from the shop's settings (https only) and needs the platform key", () => {
    const on = readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_BANK_FEED_URL: "https://platform.example/api/bank-feed/" });
    expect(on.platformBankFeedUrl).toBe("https://platform.example/api/bank-feed");
    expect(usesPlatformServices(on)).toBe(true);
    expect(readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_BANK_FEED_URL: "http://plain.example" }).platformBankFeedUrl).toBe("");
  });
});
