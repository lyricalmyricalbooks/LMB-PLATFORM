// Each paid order's real card fee and payout (code plan 7.10), against a pretend payment service (Stripe- and
// Square-shaped answers, as services/payments gives them) and a pretend Firestore. Nothing reaches Stripe or Square.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createPayments } = require("./payments/index.js");
const { moneyUpdate, recordOrderMoney, recordPayout, inOrderCurrency } = require("./orderMoney.js");

const SHOP = "moth-press";
const KEY = "service-key-moth-press-0123456789abcdef0123";
const NOW = () => new Date("2026-10-30T09:00:00Z");

function fakeDb(docs) {
  const writes = [];
  const store = { "settings/website": { payments: { testMode: false } }, ...docs };
  const ref = (path) => ({
    path,
    async get() { const data = store[path]; return { exists: data !== undefined, id: path.split("/")[1], data: () => (data === undefined ? undefined : structuredClone(data)) }; },
  });
  return {
    store,
    writes,
    collection: (name) => ({
      doc: (id) => ref(`${name}/${id}`),
      where: (field, _op, value) => ({
        limit: () => ({
          async get() {
            const docsFound = Object.entries(store).filter(([path, data]) => path.startsWith(`${name}/`) && data?.[field] === value).map(([path]) => ({ id: path.split("/")[1], ref: ref(path) }));
            return { empty: !docsFound.length, docs: docsFound };
          },
        }),
      }),
    }),
    async runTransaction(fn) {
      return fn({ get: (r) => r.get(), update: (r, fields) => { writes.push({ path: r.path, fields }); store[r.path] = { ...store[r.path], ...fields }; } });
    },
  };
}

// A pretend payment service: one answer per op, from `answers` (op -> body or (args) => body).
function fakeService(answers) {
  const calls = [];
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });
  const fetch = async (_url, init) => {
    const { op, mode, args } = JSON.parse(init.body);
    calls.push({ op, mode, args });
    const answer = answers[op];
    if (answer === undefined) return reply(400, { error: { code: "bad_request", message: `unknown call ${op}` } });
    return reply(200, typeof answer === "function" ? answer(args) : answer);
  };
  return { fetch, calls };
}

const makePayments = (provider, service) => createPayments({
  provider, mode: "platform", db: fakeDb({}), Stripe: class { constructor() { throw new Error("no Stripe package in platform mode"); } },
  readAdminSecret: async () => ({}), liveSecretKey: { value: () => "" },
  service: { url: "https://payments.platform.example", shopId: SHOP, fetch: service.fetch, serviceKey: () => KEY },
});

// Stripe's shapes: a $40.00 CAD sale, 2.9% + 30¢ card fee and Colophon's 1% (40¢); a $10.00 refund with no fee back.
const chargeTxn = { id: "txn_charge", type: "charge", amount: 4000, fee: 186, net: 3814, currency: "cad", exchange_rate: null, fee_details: [{ type: "stripe_fee", amount: 146 }, { type: "application_fee", amount: 40 }], source: { id: "ch_1", payment_intent: "pi_1" } };
const refundTxn = { id: "txn_refund", type: "refund", amount: -1000, fee: 0, net: -1000, currency: "cad", exchange_rate: null, fee_details: [], source: { id: "re_1", payment_intent: "pi_1" } };
const paidOrder = (fields = {}) => ({ orderId: "o1", paymentStatus: "paid", stripePaymentIntentId: "pi_1", stripeCurrency: "cad", stripeMode: "live", total: 40, ...fields });

describe("adding up an order's money", () => {
  test("the charge alone gives fee, net and Colophon's share; reading it again changes nothing", () => {
    const charge = { fee: 186, net: 3814, platformFee: 40, currency: "cad" };
    const first = moneyUpdate(paidOrder(), { charge });
    expect(first).toMatchObject({ fee: 186, net: 3814, platformFee: 40 });
    expect(first.payoutId).toBeUndefined();
    expect(moneyUpdate({ ...paidOrder(), ...first }, { charge })).toBeNull();
    // A refund alone, before the charge is known, adds nothing yet.
    expect(moneyUpdate(paidOrder(), { re_1: { fee: 0, net: -1000, currency: "cad" } })).toBeNull();
  });

  test("a payout keeps its id and date, and a later read of the payment never takes them away", () => {
    const withPayout = moneyUpdate(paidOrder(), { charge: { fee: 186, net: 3814, currency: "cad", payoutId: "po_1", payoutDate: "2026-10-30" } });
    expect(withPayout).toMatchObject({ payoutId: "po_1", payoutDate: "2026-10-30" });
    const order = { ...paidOrder(), ...withPayout };
    expect(moneyUpdate(order, { charge: { fee: 186, net: 3814, platformFee: 40, currency: "cad" } })).toMatchObject({ platformFee: 40, payoutId: "po_1" });
  });

  test("a refund's fee counts: Square's returned fee lowers the fee, and the refund lowers the net", () => {
    const fields = moneyUpdate(paidOrder(), { charge: { fee: 186, net: 3814, currency: "cad" }, RF1: { fee: -36, net: -964, currency: "cad" } });
    expect(fields).toMatchObject({ fee: 150, net: 2850 });
  });

  test("a sale in another currency than the payout is brought back with the rate Stripe used", () => {
    // A US$40.00 sale paid out in Canadian dollars at 1.38: Stripe's amounts are in CAD.
    const part = { fee: 256, net: 5264, currency: "cad", exchangeRate: 1.38 };
    expect(inOrderCurrency(256, part, "usd")).toBe(186);
    expect(moneyUpdate(paidOrder({ stripeCurrency: "usd" }), { charge: part })).toMatchObject({ fee: 186, net: 3814 });
    expect(moneyUpdate(paidOrder({ stripeCurrency: "usd" }), { charge: { ...part, exchangeRate: null } })).toBeNull();
  });
});

describe("Stripe: after payment, on refund and when the payout lands", () => {
  const service = (intent, refunds = [], pages = [[chargeTxn, refundTxn]]) => fakeService({
    "paymentIntents.retrieve": intent,
    "refunds.list": { data: refunds },
    "balanceTransactions.list": (args) => {
      const index = args.params.starting_after ? pages.findIndex((p) => p.at(-1).id === args.params.starting_after) + 1 : 0;
      return { data: pages[index] || [], has_more: index < pages.length - 1 };
    },
  });
  const intent = (fields = {}) => ({ id: "pi_1", metadata: { order_id: "o1" }, latest_charge: { id: "ch_1", amount_refunded: 0, balance_transaction: chargeTxn }, ...fields });

  test("the charge's fee is stored once after payment; a re-run writes nothing", async () => {
    const db = fakeDb({ "orders/o1": paidOrder() });
    const svc = service(intent());
    const payments = makePayments("stripe", svc);
    expect(await recordOrderMoney({ db, payments, orderId: "o1", now: NOW })).toBe(true);
    expect(db.store["orders/o1"]).toMatchObject({ fee: 186, net: 3814, platformFee: 40 });
    expect(svc.calls[0]).toMatchObject({ op: "paymentIntents.retrieve", args: { id: "pi_1", params: { expand: ["latest_charge.balance_transaction"] } } });
    expect(await recordOrderMoney({ db, payments, orderId: "o1", now: NOW })).toBe(false);
    expect(db.writes).toHaveLength(1);
  });

  test("a charge Stripe hasn't settled yet, or another order's payment, writes nothing", async () => {
    const db = fakeDb({ "orders/o1": paidOrder() });
    expect(await recordOrderMoney({ db, payments: makePayments("stripe", service(intent({ latest_charge: { id: "ch_1", balance_transaction: "txn_charge" } }))), orderId: "o1" })).toBe(false);
    expect(await recordOrderMoney({ db, payments: makePayments("stripe", service(intent({ metadata: { order_id: "o2" } }))), orderId: "o1" })).toBe(false);
    expect(db.writes).toHaveLength(0);
  });

  test("a refund's balance transaction is added: the net drops by the refund, and any fee given back", async () => {
    const db = fakeDb({ "orders/o1": paidOrder() });
    const refunded = intent({ latest_charge: { id: "ch_1", amount_refunded: 1000, balance_transaction: chargeTxn } });
    const svc = service(refunded, [{ id: "re_1", balance_transaction: { ...refundTxn, fee: -20, net: -980 } }]);
    await recordOrderMoney({ db, payments: makePayments("stripe", svc), orderId: "o1", now: NOW });
    expect(db.store["orders/o1"]).toMatchObject({ fee: 166, net: 2834 });
    expect(svc.calls.find((c) => c.op === "refunds.list").args.params).toEqual({ payment_intent: "pi_1", limit: 100, expand: ["data.balance_transaction"] });
  });

  test("payout.paid: every order in the payout gets its payout id and date, page by page; again changes nothing", async () => {
    const other = { ...chargeTxn, id: "txn_other", source: { id: "ch_9", payment_intent: "pi_nobody" } };
    const transfer = { id: "txn_payout", type: "payout", amount: -2814, fee: 0, net: -2814, currency: "cad", source: { id: "po_1" } };
    const db = fakeDb({ "orders/o1": paidOrder() });
    const svc = service(intent(), [], [[chargeTxn], [refundTxn, other, transfer]]);
    const payments = makePayments("stripe", svc);
    const arrival = Date.parse("2026-10-30T00:00:00Z") / 1000;
    expect(await recordPayout({ db, payments, mode: "live", payoutId: "po_1", arrivalDate: arrival, now: NOW })).toBe(1);
    expect(db.store["orders/o1"]).toMatchObject({ fee: 186, net: 2814, platformFee: 40, payoutId: "po_1", payoutDate: "2026-10-30" });
    expect(db.store["orders/o1"].moneyParts.re_1).toMatchObject({ net: -1000, payoutId: "po_1" });
    expect(svc.calls.filter((c) => c.op === "balanceTransactions.list").map((c) => c.args.params.starting_after)).toEqual([undefined, "txn_charge"]);
    expect(svc.calls[0].args.params).toMatchObject({ payout: "po_1", limit: 100, expand: ["data.source"] });
    expect(await recordPayout({ db, payments, mode: "live", payoutId: "po_1", arrivalDate: arrival, now: NOW })).toBe(0);
    // Reading the payment again afterwards keeps the payout.
    await recordOrderMoney({ db, payments, orderId: "o1", now: NOW });
    expect(db.store["orders/o1"]).toMatchObject({ payoutId: "po_1", net: 2814 });
    expect(db.writes).toHaveLength(1);
  });
});

describe("Square: the payment's processing fee and the payout's entries", () => {
  const payment = { id: "PAY1", status: "COMPLETED", referenceId: "o1", totalMinor: 4000, currency: "CAD", appFeeMinor: 40, processingFeeMinor: 146, refundIds: ["RF1"] };
  const square = () => fakeService({
    "square.payments.retrieve": payment,
    "square.refunds.forPayment": { data: [{ id: "RF1", status: "COMPLETED", amountMinor: 1000, currency: "CAD", appFeeMinor: 10, processingFeeMinor: -36, paymentId: "PAY1" }, { id: "RF2", status: "REJECTED", amountMinor: 500, currency: "CAD", paymentId: "PAY1" }] },
    "square.payouts.retrieve": { id: "po_sq1", status: "PAID", arrivalDate: "2026-10-31", amountMinor: 2850, currency: "CAD" },
    "square.payouts.entries": (args) => (args.cursor
      ? { data: [{ id: "e2", type: "REFUND", paymentId: "PAY1", refundId: "RF1", grossMinor: -1000, feeMinor: -36, netMinor: -964, currency: "CAD" }], cursor: null }
      : { data: [{ id: "e1", type: "CHARGE", paymentId: "PAY1", grossMinor: 4000, feeMinor: 186, netMinor: 3814, currency: "CAD" }, { id: "e3", type: "CHARGE", paymentId: "PAYelsewhere", grossMinor: 100, feeMinor: 3, netMinor: 97, currency: "CAD" }], cursor: "next" }),
  });
  const order = () => paidOrder({ stripePaymentIntentId: "sqpay_PAY1" });

  test("after payment: Square's fee and Colophon's app fee; a refund gives back its share; a rejected refund counts for nothing", async () => {
    const db = fakeDb({ "orders/o1": order() });
    await recordOrderMoney({ db, payments: makePayments("square", square()), orderId: "o1", now: NOW });
    // Charge: fee 146 + 40 = 186, net 3814. Refund RF1: fee -36 - 10 = -46, net -1000 + 46 = -954.
    expect(db.store["orders/o1"]).toMatchObject({ fee: 140, net: 2860, platformFee: 30 });
  });

  test("payout.paid: the payout's own lines are the truth, with the bank date; again changes nothing", async () => {
    const db = fakeDb({ "orders/o1": order() });
    const svc = square();
    const payments = makePayments("square", svc);
    expect(await recordPayout({ db, payments, mode: "live", payoutId: "po_sq1", now: NOW })).toBe(1);
    expect(db.store["orders/o1"]).toMatchObject({ fee: 150, net: 2850, payoutId: "po_sq1", payoutDate: "2026-10-31" });
    expect(await recordPayout({ db, payments, mode: "live", payoutId: "po_sq1", now: NOW })).toBe(0);
    expect(svc.calls.filter((c) => c.op === "square.payouts.entries").map((c) => c.args.cursor)).toEqual([undefined, "next", undefined, "next"]);
  });
});
