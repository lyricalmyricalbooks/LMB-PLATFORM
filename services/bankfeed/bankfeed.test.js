import test from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";
import { bankLine, createBankFeed, runBankFeed } from "./index.js";
import { monthCents, priceText, readBankFeedConfig } from "./config.js";
import { fakePlaid, plaidTx } from "./fakes.js";

const ENV = { BANK_FEED: "on", PLAID_CLIENT_ID: "plaid-client", PLAID_SECRET: "plaid-sandbox-secret", BANK_FEED_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64") };
const KEY = { "moth-press": "moth-press-service-key-0123456789abcdef", "fern-goods": "fern-goods-service-key-0123456789abcdef" };

async function build({ env = ENV, transactions = [], at = "2026-11-13T16:00:00Z" } = {}) {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", status: "live", serviceKeyHash: hashServiceKey(KEY["moth-press"]), billing: { access: "open", currency: "CAD" } });
  await registry.createShop("fern-goods", { shopId: "fern-goods", status: "live", serviceKeyHash: hashServiceKey(KEY["fern-goods"]), billing: { access: "open", currency: "USD" } });
  const plaid = fakePlaid({ transactions });
  const written = [];
  const auditLog = { ready: async () => true, write: async (shopId, id, entry) => void written.push({ shopId, ...entry }) };
  const clock = { at };
  const bankFeed = createBankFeed({ env, fetch: plaid.fetch, registry, auditLog, now: () => new Date(clock.at) });
  const call = (shop, op, args = {}, key = KEY[shop]) => bankFeed.shopCall({ headers: { "X-Shop-Id": shop, Authorization: `Bearer ${key}` }, body: { op, args } });
  return { registry, plaid, bankFeed, call, written, clock };
}

test("the settings: off without BANK_FEED and the keys, sandbox by default, prices per currency", () => {
  assert.equal(readBankFeedConfig({}).on, false);
  assert.equal(readBankFeedConfig({ BANK_FEED: "on" }).on, false, "on needs the Plaid keys too");
  const config = readBankFeedConfig(ENV);
  assert.deepEqual([config.on, config.plaidEnv, config.host], [true, "sandbox", "https://sandbox.plaid.com"]);
  assert.throws(() => readBankFeedConfig({ ...ENV, BANK_FEED_TOKEN_KEY: "" }), /BANK_FEED_TOKEN_KEY/);
  assert.throws(() => readBankFeedConfig({ ...ENV, PLAID_ENV: "live" }), /PLAID_ENV/);
  assert.deepEqual([monthCents(config, "CAD", 0), monthCents(config, "CAD", 1), monthCents(config, "CAD", 2), monthCents(config, "CAD", 4), monthCents(config, "USD", 3)], [0, 400, 400, 700, 400]);
  assert.deepEqual([priceText(400, "CAD"), priceText(150, "CAD"), priceText(300, "USD")], ["CA$4", "CA$1.50", "US$3"]);
});

test("off: every shop sees it as not open, the Plan page shows no add-on and nothing can be turned on", async () => {
  const { call, bankFeed } = await build({ env: {} });
  assert.deepEqual(await call("moth-press", "bank.status"), { available: false, addOn: { on: false, price: "", extraPrice: "", included: 2 }, banks: [] });
  assert.equal(await bankFeed.addOnView("moth-press"), null);
  await assert.rejects(bankFeed.setAddOn("moth-press", true), /isn't open yet/);
  await assert.rejects(call("moth-press", "bank.linkToken"), /isn't open yet/);
});

test("the door refuses a wrong key, an unknown shop and an unknown call with one plain answer", async () => {
  const { call } = await build();
  await assert.rejects(call("moth-press", "bank.status", {}, KEY["fern-goods"]), /can't reach its bank feed/);
  await assert.rejects(call("no-such-shop", "bank.status", {}, KEY["moth-press"]), /can't reach its bank feed/);
  await assert.rejects(call("moth-press", "bank.everything"), /Unknown call/);
});

test("add the add-on, connect a bank, and its transactions arrive once with money in above zero", async () => {
  const w = await build({ transactions: [plaidTx("tx-1", { out: 42.5, name: "CANVA* 02913" }), plaidTx("tx-2", { out: -180.25, name: "STRIPE PAYOUT" }), plaidTx("tx-3", { out: 9, pending: true })] });
  await assert.rejects(w.call("moth-press", "bank.linkToken"), /Add the bank feed to your plan first/);
  assert.deepEqual(await w.bankFeed.addOnView("moth-press"), { on: false, price: "CA$4", extraPrice: "CA$1.50", included: 2, banks: 0 });
  assert.equal((await w.bankFeed.addOnView("fern-goods")).price, "US$3");
  assert.equal((await w.bankFeed.setAddOn("moth-press", true, "owner@example.com")).on, true);
  assert.match((await w.call("moth-press", "bank.linkToken")).token, /^link-sandbox-/);
  assert.deepEqual(w.plaid.calls.at(-1).body.products, ["transactions"], "read-only: transactions is the only product asked for");

  const status = await w.call("moth-press", "bank.connect", { publicToken: "public-sandbox-1", bankName: "First Platypus Bank", by: "owner@example.com" });
  assert.deepEqual(status.banks.map((b) => [b.name, b.accounts]), [["First Platypus Bank", ["Chequing ••1234"]]]);
  const row = await w.registry.getShop("moth-press");
  assert.doesNotMatch(JSON.stringify(row), /access-sandbox/, "the bank's access is kept sealed");
  assert.doesNotMatch(JSON.stringify(status), /sealed|itemId/, "and never handed to the shop");
  assert.equal(row.bankFeed.months["2026-11"], 1);

  const bankId = status.banks[0].id;
  const pull = await w.call("moth-press", "bank.pull", {});
  assert.deepEqual(pull.banks[0].lines.map((l) => [l.id, l.cents, l.currency, l.account, l.pending ?? false]), [["tx-1", -4250, "CAD", "Chequing ••1234", false], ["tx-2", 18025, "CAD", "Chequing ••1234", false], ["tx-3", -900, "CAD", "Chequing ••1234", true]]);
  const again = await w.call("moth-press", "bank.pull", { cursors: { [bankId]: pull.banks[0].cursor } });
  assert.deepEqual([again.banks[0].lines, again.banks[0].more], [[], false], "nothing twice");
  assert.deepEqual(w.written.map((e) => e.kind), ["bank-feed-on", "bank-connected"]);
});

test("the wall: one shop's sealed bank copied onto another shop's row won't open, and each shop sees only its own banks", async () => {
  const w = await build({ transactions: [plaidTx("tx-1", { out: 5 })] });
  await w.bankFeed.setAddOn("moth-press", true);
  await w.bankFeed.setAddOn("fern-goods", true);
  await w.call("moth-press", "bank.connect", { publicToken: "public-sandbox-1", bankName: "Moth's bank" });
  assert.deepEqual((await w.call("fern-goods", "bank.status")).banks, []);
  const stolen = (await w.registry.getShop("moth-press")).bankFeed.banks;
  await w.registry.updateShop("fern-goods", { bankFeed: { on: true, banks: stolen, months: {} } });
  const pull = await w.call("fern-goods", "bank.pull", {});
  assert.deepEqual([pull.banks, pull.failed], [[], [stolen[0].id]]);
  await assert.rejects(w.call("fern-goods", "bank.disconnect", { bankId: stolen[0].id }), /couldn't be disconnected/);
  assert.equal(w.plaid.banks.size, 1, "Moth's bank is untouched");
});

test("a bank that wants its owner to sign in again is flagged, and signing in clears it", async () => {
  const w = await build();
  await w.bankFeed.setAddOn("moth-press", true);
  const bankId = (await w.call("moth-press", "bank.connect", { publicToken: "public-sandbox-1", bankName: "Bank" })).banks[0].id;
  [...w.plaid.banks.values()][0].broken = "ITEM_LOGIN_REQUIRED";
  assert.deepEqual((await w.call("moth-press", "bank.pull", {})).needsSignIn, [bankId]);
  assert.equal((await w.call("moth-press", "bank.status")).banks[0].needsSignIn, true);
  [...w.plaid.banks.values()][0].broken = null;
  assert.match((await w.call("moth-press", "bank.linkToken", { bankId })).token, /^link-/);
  assert.match(w.plaid.calls.at(-1).body.access_token, /^access-sandbox/, "the sign-in window opens for that bank");
  assert.equal((await w.call("moth-press", "bank.signedIn", { bankId })).banks[0].needsSignIn, undefined);
});

test("turning the add-on off disconnects every bank at Plaid; a bank that can't be reached keeps it on for a retry", async () => {
  const w = await build();
  await w.bankFeed.setAddOn("moth-press", true);
  await w.call("moth-press", "bank.connect", { publicToken: "public-sandbox-1", bankName: "One" });
  await w.call("moth-press", "bank.connect", { publicToken: "public-sandbox-2", bankName: "Two" });
  assert.equal(w.plaid.banks.size, 2);
  [...w.plaid.banks.values()][1].broken = "DOWN";
  await assert.rejects(w.bankFeed.setAddOn("moth-press", false), /still on/);
  assert.deepEqual([w.plaid.banks.size, (await w.bankFeed.forShop("moth-press")).banks.map((b) => b.name)], [1, ["Two"]]);
  [...w.plaid.banks.values()][0].broken = null;
  const off = await w.bankFeed.setAddOn("moth-press", false, "owner@example.com");
  assert.deepEqual([off.on, off.banks, w.plaid.banks.size], [false, 0, 0]);
  assert.ok(off.offSince);
  // Again: nothing to do, and a bank Plaid no longer knows counts as gone.
  assert.equal((await w.bankFeed.setAddOn("moth-press", false)).on, false);
  await assert.rejects(w.call("moth-press", "bank.pull", {}), /Add the bank feed/);
});

test("the owner disconnects one bank and the other stays", async () => {
  const w = await build();
  await w.bankFeed.setAddOn("moth-press", true);
  const one = (await w.call("moth-press", "bank.connect", { publicToken: "public-sandbox-1", bankName: "One" })).banks[0].id;
  await w.call("moth-press", "bank.connect", { publicToken: "public-sandbox-2", bankName: "Two" });
  const left = await w.call("moth-press", "bank.disconnect", { bankId: one, by: "owner@example.com" });
  assert.deepEqual([left.banks.map((b) => b.name), w.plaid.banks.size], [["Two"], 1]);
});

test("the daily job disconnects a paused shop's banks and bills last month once for the most banks it had", async () => {
  const w = await build({ at: "2026-11-13T16:00:00Z" });
  for (const shop of ["moth-press", "fern-goods"]) await w.bankFeed.setAddOn(shop, true);
  for (const n of [1, 2, 3]) await w.call("moth-press", "bank.connect", { publicToken: `public-sandbox-m${n}`, bankName: `Bank ${n}` });
  await w.call("fern-goods", "bank.connect", { publicToken: "public-sandbox-f1", bankName: "Fern's bank" });
  // Moth drops to one bank; November still counts three. Fern's plan is paused.
  const banks = (await w.call("moth-press", "bank.status")).banks;
  await w.call("moth-press", "bank.disconnect", { bankId: banks[0].id });
  await w.call("moth-press", "bank.disconnect", { bankId: banks[1].id });
  await w.registry.updateShop("fern-goods", { billing: { access: "paused", currency: "USD" } });

  w.clock.at = "2026-12-01T07:00:00Z";
  const bills = [];
  const billing = { billBankFeed: async (args) => { bills.push({ month: args.month, banks: args.banks, cents: Object.fromEntries(Object.entries(args.banks).map(([shop, n]) => [shop, args.cents(shop === "fern-goods" ? "USD" : "CAD", n)])) }); return { billed: Object.keys(args.banks) }; } };
  const run = await runBankFeed({ bankFeed: w.bankFeed, billing, now: () => new Date(w.clock.at) });
  assert.deepEqual(run.swept, { connected: 1, disconnected: ["fern-goods"], failed: [] });
  assert.deepEqual(bills, [{ month: "2026-11", banks: { "moth-press": 3, "fern-goods": 1 }, cents: { "moth-press": 550, "fern-goods": 300 } }]);
  assert.equal(w.plaid.banks.size, 1, "only Moth's one bank is still connected at Plaid");
  const fern = await w.bankFeed.forShop("fern-goods");
  assert.deepEqual([fern.on, fern.banks], [false, []]);
  assert.equal((await w.registry.getShop("moth-press")).bankFeed.months["2026-12"], 1, "December is counted from the sweep");
  await assert.rejects(w.call("fern-goods", "bank.linkToken"), /paused/);
  // Again the same day: nothing more to disconnect.
  assert.deepEqual((await runBankFeed({ bankFeed: w.bankFeed, billing, now: () => new Date(w.clock.at) })).swept.disconnected, []);
});

test("a bank line reads Plaid's amounts the shop's way", () => {
  const bank = { id: "b1", name: "Bank", accounts: [{ id: "acc-1", name: "Chequing", mask: "1234" }] };
  assert.deepEqual(bankLine(plaidTx("t", { out: 12.1, name: "  CANVA*   02913 " }), bank), { id: "t", bankId: "b1", date: "2026-11-10", cents: -1210, currency: "CAD", name: "CANVA* 02913", account: "Chequing ••1234" });
  assert.equal(bankLine({ ...plaidTx("t", { out: -5 }), account_id: "gone" }, bank).account, "Bank");
});
