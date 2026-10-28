import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { readAccountingConfig } from "./config.js";
import { createAccountingService, readSummary, ITEM_NAMES } from "./accounting.js";
import { createQuickBooksApi } from "./quickbooksApi.js";
import { handleAccounting } from "./http.js";
import { companyPath, ACCOUNTING_SCOPE, AUTHORIZE_URL, TOKEN_URL } from "./endpoints.js";
import { fakeConnections, fakeNotifier, fakeQuickBooksFetch, fakeSent, fakeStates } from "./fakes.js";
import { unseal } from "../payments/tokenSeal.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";

const SHOP = "moth-press";
const OTHER = "lark-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const OTHER_KEY = "shop-service-key-lark-press-0123456789abcdef";
const REALM = "9130354512345678";
const START = Date.parse("2026-10-28T12:00:00Z");
const ENV = {
  ACCOUNTING_ENABLED: "true",
  QUICKBOOKS_CLIENT_ID_LIVE: "ABliveClientId",
  QUICKBOOKS_CLIENT_SECRET_LIVE: "liveSecret",
  QUICKBOOKS_CLIENT_ID_TEST: "ABtestClientId",
  QUICKBOOKS_CLIENT_SECRET_TEST: "testSecret",
  QUICKBOOKS_REDIRECT_URL: "https://accounting.platform.example/quickbooks/oauth",
  QUICKBOOKS_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64"),
};

const row = (shopId = SHOP, key = KEY, fields = {}) => ({
  shopId, projectId: shopId, pressName: "Moth Press", ownerEmail: "owner@example.com", status: "live",
  serviceKeyHash: hashServiceKey(key), payments: { provider: "stripe", mode: "test" }, ...fields,
});

const day = (date, fields = {}) => ({
  date, salesCents: 4000, shippingCents: 1000, discountsCents: 500, giftCardsSoldCents: 0, giftCardsUsedCents: 0,
  refundsCents: 0, taxes: { GST: 225 }, feesCents: 180, netCents: 4545, currency: "CAD", ...fields,
});

async function setup({ env = ENV, rows = [row(), row(OTHER, OTHER_KEY)] } = {}) {
  let clock = START;
  const now = () => clock;
  const config = readAccountingConfig(env);
  const pretend = fakeQuickBooksFetch({ apps: config.apps });
  const registry = fakeRegistry();
  for (const r of rows) await registry.createShop(r.shopId, r);
  const auditLog = fakeAuditLog();
  const connections = fakeConnections();
  const states = fakeStates();
  const sent = fakeSent();
  const notifier = fakeNotifier();
  const service = createAccountingService({
    qbo: createQuickBooksApi({ fetch: pretend.fetch, apps: config.apps, redirectUrl: config.redirectUrl, now }),
    registry, auditLog, connections, states, sent, notifyOwner: notifier.notifyOwner, config, now,
  });
  const call = (op, args = {}, { shopId = SHOP, key = KEY } = {}) =>
    handleAccounting({ method: "POST", path: "/shop", headers: { "X-Shop-Id": shopId, Authorization: `Bearer ${key}` }, body: { op, args } }, { service });
  const tick = (ms) => { clock += ms; };
  return { service, pretend, registry, auditLog, connections, states, sent, notifier, call, tick, config };
}

/** Connect to QuickBooks: the link, Intuit's sign-in (pretend), the answer back. */
async function connect(t, { shopId = SHOP, key = KEY, realmId = REALM, code = "code-1" } = {}) {
  if (!t.pretend.world.companies.has(realmId)) t.pretend.world.addCompany(realmId, "test");
  const link = await t.call("accounting.connectLink", { returnUrl: `https://${shopId}.web.app/admin#settings/bookkeeping` }, { shopId, key });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  const state = new URL(link.body.url).searchParams.get("state");
  t.pretend.world.codes.set(code, realmId);
  return handleAccounting({ method: "GET", path: "/quickbooks/oauth", query: { code, state, realmId } }, { service: t.service });
}

const SAVE = { style: "daily", currency: "CAD", taxCodes: { GST: "5", "HST ON": "6" }, noTaxCode: "2", accounts: { income: "40", clearing: "4", bank: "35", fees: "8", giftCards: "90" } };

async function ready(t, args = SAVE) {
  assert.equal((await connect(t)).status, 302);
  const saved = await t.call("accounting.save", args);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return saved;
}

test("off by default: no setting, no keys, status says so and every other call is refused", async () => {
  assert.equal(readAccountingConfig({}).enabled, false);
  const t = await setup({ env: { ...ENV, ACCOUNTING_ENABLED: "" } });
  const status = await t.call("accounting.status");
  assert.deepEqual(status.body, { enabled: false });
  const link = await t.call("accounting.connectLink", { returnUrl: `https://${SHOP}.web.app/admin` });
  assert.equal(link.status, 409);
  assert.equal(link.body.error.code, "accounting_off");
  assert.equal(t.pretend.requests.length, 0);
});

test("settings: keys go in pairs, need the sealing key and the sign-in address", () => {
  assert.throws(() => readAccountingConfig({ QUICKBOOKS_CLIENT_ID_TEST: "x" }), /go together/);
  assert.throws(() => readAccountingConfig({ QUICKBOOKS_CLIENT_ID_TEST: "x", QUICKBOOKS_CLIENT_SECRET_TEST: "y", QUICKBOOKS_REDIRECT_URL: ENV.QUICKBOOKS_REDIRECT_URL }), /QUICKBOOKS_TOKEN_KEY/);
  assert.throws(() => readAccountingConfig({ ...ENV, QUICKBOOKS_TOKEN_KEY: "c2hvcnQ=" }), /QUICKBOOKS_TOKEN_KEY must be 32 bytes/);
  assert.throws(() => readAccountingConfig({ ...ENV, QUICKBOOKS_REDIRECT_URL: "http://x.example/q" }), /https/);
});

test("the door: wrong key and unknown shop get the same answer", async () => {
  const t = await setup();
  const wrong = await t.call("accounting.status", {}, { key: OTHER_KEY });
  const unknown = await t.call("accounting.status", {}, { shopId: "nobody", key: KEY });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
});

test("connect: Intuit's sign-in page, then tokens kept sealed and the company named", async () => {
  const t = await setup();
  t.pretend.world.addCompany(REALM, "test");
  const link = await t.call("accounting.connectLink", { returnUrl: `https://${SHOP}.web.app/admin#settings/bookkeeping` });
  const url = new URL(link.body.url);
  assert.equal(`${url.origin}${url.pathname}`, AUTHORIZE_URL);
  assert.equal(url.searchParams.get("client_id"), "ABtestClientId");
  assert.equal(url.searchParams.get("scope"), ACCOUNTING_SCOPE);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), ENV.QUICKBOOKS_REDIRECT_URL);
  const bad = await t.call("accounting.connectLink", { returnUrl: "https://elsewhere.example/admin" });
  assert.equal(bad.status, 400);

  t.pretend.world.codes.set("code-1", REALM);
  const back = await handleAccounting({ method: "GET", path: "/quickbooks/oauth", query: { code: "code-1", state: url.searchParams.get("state"), realmId: REALM } }, { service: t.service });
  assert.equal(back.status, 302);
  assert.equal(new URL(back.headers.Location).searchParams.get("quickbooks"), "connected");
  const token = t.pretend.requests.find((r) => r.kind === "token");
  assert.equal(token.form.grant_type, "authorization_code");
  assert.equal(token.form.redirect_uri, ENV.QUICKBOOKS_REDIRECT_URL);
  assert.equal(token.headers["x-include-refresh-token-hard-expires-in"], "true");

  const stored = t.connections.rows.get(SHOP);
  assert.ok(!JSON.stringify(stored).includes("access-"), "no token in the clear");
  const opened = unseal(t.config.tokenKey, `quickbooks/${SHOP}/test/${REALM}`, stored.sealed);
  assert.match(opened.refreshToken, /^refresh-/);
  assert.throws(() => unseal(t.config.tokenKey, `quickbooks/${OTHER}/test/${REALM}`, stored.sealed));

  const status = (await t.call("accounting.status")).body;
  assert.equal(status.connected, true);
  assert.equal(status.companyName, "Moth Press Ltd");
  assert.equal(status.ready, false);
  assert.equal(status.endsSoon, false);

  // The state is used up.
  const again = await handleAccounting({ method: "GET", path: "/quickbooks/oauth", query: { code: "code-1", state: url.searchParams.get("state"), realmId: REALM } }, { service: t.service });
  assert.equal(again.status, 400);
});

test("connect: a press saying no, and one company per shop", async () => {
  const t = await setup();
  t.pretend.world.addCompany(REALM, "test");
  const link = await t.call("accounting.connectLink", { returnUrl: `https://${SHOP}.web.app/admin` });
  const state = new URL(link.body.url).searchParams.get("state");
  const denied = await handleAccounting({ method: "GET", path: "/quickbooks/oauth", query: { error: "access_denied", state } }, { service: t.service });
  assert.equal(new URL(denied.headers.Location).searchParams.get("quickbooks"), "denied");

  await connect(t);
  const second = await connect(t, { shopId: OTHER, key: OTHER_KEY, code: "code-2" });
  assert.equal(new URL(second.headers.Location).searchParams.get("quickbooks"), "in_use");
  t.pretend.world.addCompany("555", "test", "Other books");
  const other = await connect(t, { realmId: "555", code: "code-3" });
  assert.equal(new URL(other.headers.Location).searchParams.get("quickbooks"), "other_company");
});

test("options suggest accounts; save matches taxes and makes the three items once", async () => {
  const t = await setup();
  await connect(t);
  const options = (await t.call("accounting.options")).body;
  assert.deepEqual(options.suggested, { income: "40", clearing: "4", bank: "35", fees: "8", giftCards: "90" });
  assert.ok(options.taxCodes.some((c) => c.name === "GST"));

  const noRate = await t.call("accounting.save", { ...SAVE, taxCodes: { GST: "8" } });
  assert.equal(noRate.status, 400);
  assert.match(noRate.body.error.message, /no sales rate/);

  const saved = (await t.call("accounting.save", SAVE)).body;
  assert.equal(saved.ready, true);
  assert.equal(saved.style, "daily");
  assert.deepEqual(saved.taxCodes, { GST: "5", "HST ON": "6" });
  const items = t.pretend.world.companies.get(REALM).Item.map((i) => i.Name).sort();
  assert.deepEqual(items, Object.values(ITEM_NAMES).sort());
  await t.call("accounting.save", { ...SAVE, style: "orders" });
  assert.equal(t.pretend.world.companies.get(REALM).Item.length, 3, "items are found, not made again");
});

test("nightly run: a day becomes a sales receipt and a fee expense; a re-run writes nothing new", async () => {
  const t = await setup();
  await ready(t);
  const first = (await t.call("accounting.post", { days: [day("2026-10-27")] })).body;
  assert.deepEqual(first.results, [{ kind: "day", ref: "2026-10-27", outcome: "sent", wrote: ["sale", "fees"] }]);
  const company = t.pretend.world.companies.get(REALM);
  const [receipt] = company.SalesReceipt;
  assert.equal(receipt.TxnDate, "2026-10-27");
  assert.deepEqual(receipt.Line.map((l) => [l.DetailType, l.Amount]), [["SalesItemLineDetail", 40], ["SalesItemLineDetail", 10], ["DiscountLineDetail", 5]]);
  assert.equal(receipt.Line[0].SalesItemLineDetail.TaxCodeRef.value, "5");
  assert.deepEqual(receipt.TxnTaxDetail, { TotalTax: 2.25, TaxLine: [{ DetailType: "TaxLineDetail", Amount: 2.25, Description: "GST", TaxLineDetail: { TaxRateRef: { value: "7" }, PercentBased: true } }] });
  assert.equal(receipt.DepositToAccountRef.value, "4");
  assert.equal(company.Purchase[0].Line[0].AccountBasedExpenseLineDetail.AccountRef.value, "8");
  assert.equal(company.Purchase[0].Line[0].Amount, 1.8);

  const writes = t.pretend.writes.length;
  const again = (await t.call("accounting.post", { days: [day("2026-10-27")] })).body;
  assert.deepEqual(again.results, [{ kind: "day", ref: "2026-10-27", outcome: "already" }]);
  assert.equal(t.pretend.writes.length, writes);
  assert.equal((await t.call("accounting.status")).body.lastSent.date, "2026-10-27");
});

test("a refund after the day was sent goes as a refund receipt for the difference, once", async () => {
  const t = await setup();
  await ready(t);
  await t.call("accounting.post", { days: [day("2026-10-27")] });
  const late = (await t.call("accounting.post", { days: [day("2026-10-27", { refundsCents: 1250 })] })).body;
  assert.deepEqual(late.results[0].wrote, ["refund"]);
  const company = t.pretend.world.companies.get(REALM);
  assert.equal(company.RefundReceipt.length, 1);
  assert.equal(company.RefundReceipt[0].Line[0].Amount, 12.5);
  await t.call("accounting.post", { days: [day("2026-10-27", { refundsCents: 1250 })] });
  assert.equal(company.RefundReceipt.length, 1);
  // A day with only a refund on an older order: no sales receipt, one refund receipt.
  const quiet = (await t.call("accounting.post", { days: [day("2026-10-28", { salesCents: 0, shippingCents: 0, discountsCents: 0, taxes: {}, feesCents: 0, refundsCents: 800 })] })).body;
  assert.deepEqual(quiet.results[0].wrote, ["refund"]);
  assert.equal(company.SalesReceipt.length, 1);
});

test("a day that changed after sending is reported, not sent twice", async () => {
  const t = await setup();
  await ready(t);
  await t.call("accounting.post", { days: [day("2026-10-27")] });
  const changed = (await t.call("accounting.post", { days: [day("2026-10-27", { salesCents: 5000 })] })).body;
  assert.equal(changed.results[0].outcome, "changed");
  assert.equal(t.pretend.world.companies.get(REALM).SalesReceipt.length, 1);
});

test("payouts become deposits once; a negative payout is left to a person", async () => {
  const t = await setup();
  await ready(t);
  const payouts = [{ id: "po_1", date: "2026-10-28", amountCents: 9000, currency: "CAD" }, { id: "po_2", date: "2026-10-28", amountCents: -300, currency: "CAD" }];
  const first = (await t.call("accounting.post", { payouts })).body;
  assert.deepEqual(first.results.map((r) => r.outcome), ["sent", "failed"]);
  const [deposit] = t.pretend.world.companies.get(REALM).Deposit;
  assert.equal(deposit.DepositToAccountRef.value, "35");
  assert.equal(deposit.Line[0].DepositLineDetail.AccountRef.value, "4");
  assert.equal(deposit.Line[0].Amount, 90);
  await t.call("accounting.post", { payouts });
  assert.equal(t.pretend.world.companies.get(REALM).Deposit.length, 1);
});

test("every order style: one sales receipt per order", async () => {
  const t = await setup();
  await ready(t, { ...SAVE, style: "orders" });
  const orders = [{ ...day("2026-10-27"), orderId: "A1001" }, { ...day("2026-10-27", { taxes: { "HST ON": 650 } }), orderId: "A1002" }];
  const result = (await t.call("accounting.post", { orders, days: [day("2026-10-27")] })).body;
  assert.deepEqual(result.results.map((r) => [r.kind, r.ref, r.outcome]), [["order", "A1001", "sent"], ["order", "A1002", "sent"]]);
  const receipts = t.pretend.world.companies.get(REALM).SalesReceipt;
  assert.equal(receipts.length, 2);
  assert.equal(receipts[1].Line[0].SalesItemLineDetail.TaxCodeRef.value, "6");
});

test("a tax with no match and a wrong currency are not sent", async () => {
  const t = await setup();
  await ready(t);
  const result = (await t.call("accounting.post", { days: [day("2026-10-26", { taxes: { "PST BC": 300 } }), day("2026-10-27", { currency: "USD" })] })).body;
  assert.deepEqual(result.results.map((r) => r.code), ["tax_not_matched", "currency"]);
  assert.match(result.results[0].message, /Match the tax "PST BC"/);
  assert.equal(t.pretend.writes.filter((w) => w.entity !== "Item").length, 0);
  const shape = await t.call("accounting.post", { days: [{ ...day("2026-10-27"), salesCents: 12.5 }] });
  assert.equal(shape.status, 400);
});

test("tokens are refreshed after an hour, and the new refresh token kept", async () => {
  const t = await setup();
  await ready(t);
  const before = t.connections.rows.get(SHOP).sealed;
  t.tick(2 * 60 * 60 * 1000);
  await t.call("accounting.post", { days: [day("2026-10-27")] });
  const refreshes = t.pretend.requests.filter((r) => r.kind === "token" && r.form.grant_type === "refresh_token");
  assert.equal(refreshes.length, 1);
  assert.notEqual(t.connections.rows.get(SHOP).sealed, before);
  assert.equal(t.pretend.world.companies.get(REALM).SalesReceipt.length, 1);
});

test("a company disconnected in QuickBooks stops the run and tells the owner once", async () => {
  const t = await setup();
  await ready(t);
  await t.call("accounting.post", { days: [day("2026-10-26")] });
  t.pretend.world.cutOff(REALM);
  t.tick(2 * 60 * 60 * 1000);
  const run = (await t.call("accounting.post", { days: [day("2026-10-27"), day("2026-10-28")] })).body;
  assert.equal(run.stopped, "disconnected");
  assert.equal(t.pretend.world.companies.get(REALM).SalesReceipt.length, 1);
  assert.equal(t.notifier.sent.length, 1);
  assert.equal(t.notifier.sent[0].kind, "accounting-lost");
  assert.equal(t.notifier.sent[0].to, "owner@example.com");
  const status = (await t.call("accounting.status")).body;
  assert.equal(status.connected, false);
  assert.equal(status.problem, "lost");
  const next = await t.call("accounting.post", { days: [day("2026-10-28")] });
  assert.equal(next.status, 409);
  assert.equal(next.body.error.code, "disconnected");
  assert.equal(t.notifier.sent.length, 1);

  // Connecting the same company again keeps the choices; the missed days then go.
  await connect(t, { code: "code-9" });
  assert.equal((await t.call("accounting.status")).body.ready, true);
  const caught = (await t.call("accounting.post", { days: [day("2026-10-26"), day("2026-10-27"), day("2026-10-28")] })).body;
  assert.deepEqual(caught.results.map((r) => r.outcome), ["already", "sent", "sent"]);
});

test("send again: nothing while the receipt is in QuickBooks, again once the press deleted it", async () => {
  const t = await setup();
  await ready(t);
  await t.call("accounting.post", { days: [day("2026-10-27")] });
  const still = (await t.call("accounting.resend", { summary: day("2026-10-27") })).body;
  assert.equal(still.results[0].outcome, "already");
  const company = t.pretend.world.companies.get(REALM);
  t.pretend.world.remove(REALM, "SalesReceipt", company.SalesReceipt[0].Id);
  const again = (await t.call("accounting.resend", { summary: day("2026-10-27") })).body;
  assert.deepEqual(again.results[0].wrote, ["sale"]);
  assert.equal(company.SalesReceipt.length, 1);
  assert.equal(company.Purchase.length, 1, "fees were not deleted, so not sent again");
});

test("disconnect revokes the token; the page can connect again", async () => {
  const t = await setup();
  await ready(t);
  const after = (await t.call("accounting.disconnect")).body;
  assert.equal(after.connected, false);
  assert.equal(after.problem, "disconnected");
  assert.equal(t.pretend.world.revoked.length, 1);
  assert.equal(t.connections.rows.get(SHOP).sealed, null);
  assert.equal((await t.call("accounting.post", { days: [day("2026-10-27")] })).status, 409);
});

test("30 days before the connection ends the owner is warned once; status says so", async () => {
  const t = await setup();
  await ready(t);
  assert.deepEqual((await t.service.nightly()).warned, []);
  // The pretend connection ends five years after it was made.
  t.tick(157680000 * 1000 - 20 * 24 * 60 * 60 * 1000);
  const conn = t.connections.rows.get(SHOP);
  t.connections.rows.set(SHOP, { ...conn, accessExpiresAt: new Date(START + 157680000 * 1000).toISOString() });
  assert.equal((await t.call("accounting.status")).body.endsSoon, true);
  assert.deepEqual((await t.service.nightly()).warned, [SHOP]);
  assert.deepEqual((await t.service.nightly()).warned, []);
  assert.equal(t.notifier.sent.filter((m) => m.kind === "accounting-ending").length, 1);
});

test("the reconnect page sends a known company to its shop's Bookkeeping page", async () => {
  const t = await setup();
  await connect(t);
  const known = await handleAccounting({ method: "GET", path: "/quickbooks/reconnect", query: { realmId: REALM } }, { service: t.service });
  assert.equal(known.status, 302);
  assert.equal(known.headers.Location, `https://${SHOP}.web.app/admin#settings/bookkeeping`);
  const unknown = await handleAccounting({ method: "GET", path: "/quickbooks/reconnect", query: { realmId: "1" } }, { service: t.service });
  assert.equal(unknown.status, 200);
  assert.match(unknown.body, /Settings, then Bookkeeping/);
});

test("readSummary takes the fixed daily shape and refuses anything else", () => {
  const s = readSummary(day("2026-10-27", { taxes: { GST: 225, QST: 0 } }));
  assert.deepEqual(s.taxes, { GST: 225 });
  assert.throws(() => readSummary({ ...day("2026-13-40") }), /date/);
  assert.throws(() => readSummary({ ...day("2026-10-27"), feesCents: -1 }), /feesCents/);
  assert.throws(() => readSummary(day("2026-10-27"), { order: true }), /orderId/);
});

test("endpoints: every QuickBooks address in this folder comes from endpoints.js", () => {
  assert.equal(companyPath("123", "salesreceipt"), "/v3/company/123/salesreceipt");
  assert.throws(() => companyPath("123", "journalentry"), /no QuickBooks entity/);
  assert.match(TOKEN_URL, /^https:\/\/oauth\.platform\.intuit\.com\//);
  for (const file of readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".js") && f !== "endpoints.js" && !f.endsWith(".test.js"))) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(!/intuit\.com|\/v3\/company/.test(text.replace(/^\s*\/\/.*$/gm, "")), `${file} spells a QuickBooks address`);
  }
});
