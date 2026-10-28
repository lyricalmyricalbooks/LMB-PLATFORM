// The bookkeeping service (code plan 7.15): a press's shop sends its sales to their own QuickBooks Online company. The
// shop's server calls it with the shop's service key (`X-Shop-Id` + `Authorization: Bearer`), like the payment, email
// and domain services; nothing here is reachable without it except Intuit's two answers (sign-in and reconnect).
// **Off unless the platform turns it on** (config.js `ACCOUNTING_ENABLED`); while off, `accounting.status` says so and
// the shop hides its Bookkeeping page.
//
//   accounting.status                     connected or not, the company's name, the choices saved, the last day sent,
//                                         when the connection ends (warned 30 days before) and why it stopped, if it did
//   accounting.connectLink { returnUrl }  Intuit's sign-in page; Intuit sends the press back to `oauthCallback`
//                                         (GET /quickbooks/oauth), which keeps the tokens sealed and goes back to the shop
//   accounting.options                    the company's tax codes and accounts, with a suggested pick for each account
//   accounting.save { style, currency, taxCodes, noTaxCode, accounts }
//                                         "daily" (one sales receipt per day, the default) or "orders" (one per order);
//                                         each tax name matched once to a QuickBooks tax code; three items made if missing
//   accounting.post { days?, orders?, payouts? }
//                                         the nightly run: each day (or order) as a sales receipt, its refunds as a refund
//                                         receipt, its card fees as an expense (Purchase); each payout as a deposit.
//                                         Never twice: `sent` remembers every write per shop, company and day / order /
//                                         payout. A refund or fee that arrives after a day was sent is sent as the
//                                         difference, on its own
//   accounting.resend { date | orderId, summary }
//                                         "Send again": sends the sales receipt again only when it is gone from QuickBooks
//   accounting.disconnect                 revokes the tokens; the choices stay for a later reconnect
//
// A company that stops answering (Intuit says `invalid_grant`, or refuses a fresh token) is marked lost: every send
// stops, the owner is emailed once and the Bookkeeping page says to connect again. `nightly()` warns owners 30 days
// before a connection's five-year end. Each change is logged in the registry and the shop's audit log.
//
// Clients (fakes in fakes.js):
//   qbo          createQuickBooksApi(...) (quickbooksApi.js)
//   registry     getShop(shopId), recordEvent(shopId, entry)
//   auditLog     write(shopId, id, entry)
//   connections  get(shopId), set(shopId, record), list(), findByRealm(mode, realmId) -> record with shopId | null
//   states       put(state, { shopId, mode, returnUrl, expiresAt }); take(state) -> that record | null (once only)
//   sent         get(key), put(key, record)
//   notifyOwner  (row, { kind, subject, text }) -> Promise; the owner's email (services/email), optional
import { createHash, randomBytes } from "node:crypto";
import { serviceKeyMatches } from "../email/http.js";
import { seal, unseal } from "../payments/tokenSeal.js";
import { shopHosts } from "../payments/service.js";
import { ENTITIES, QB } from "./endpoints.js";
import { QuickBooksError } from "./quickbooksApi.js";

export class AccountingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AccountingError";
    this.status = status;
    this.code = code;
  }
}

export const STYLES = Object.freeze(["daily", "orders"]);
const STATE_MS = 15 * 60 * 1000;
// Intuit's access tokens last an hour; refresh five minutes before.
const REFRESH_BEFORE_MS = 5 * 60 * 1000;
export const WARN_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;
const MONEY = Object.freeze(["salesCents", "shippingCents", "discountsCents", "giftCardsSoldCents", "giftCardsUsedCents", "refundsCents", "feesCents"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const QB_ID = /^\d{1,32}$/;
const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BATCH = 400;
/** The three items every sales receipt uses; made in the press's company when missing. */
export const ITEM_NAMES = Object.freeze({ sales: "Book sales", shipping: "Shipping", giftCards: "Gift cards" });

const bad = (message) => new AccountingError(400, "bad_request", message);
const dollars = (cents) => Math.round(cents) / 100;
const requestIdFor = (key) => createHash("sha256").update(key).digest("hex").slice(0, 40);
const quote = (value) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** A day's (or an order's) numbers, checked. The shop's summary builder makes them; nothing here adds them up. */
export function readSummary(input, { order = false } = {}) {
  if (!input || typeof input !== "object") throw bad("a summary is needed");
  if (typeof input.date !== "string" || !DATE.test(input.date) || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`))) throw bad("date must be YYYY-MM-DD");
  if (order && (typeof input.orderId !== "string" || !ORDER_ID.test(input.orderId))) throw bad("orderId is needed");
  const out = { date: input.date, ...(order ? { orderId: input.orderId } : {}) };
  for (const field of MONEY) {
    const value = input[field] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) throw bad(`${field} must be a whole number of cents, 0 or more`);
    out[field] = value;
  }
  if (!Number.isSafeInteger(input.netCents ?? 0)) throw bad("netCents must be a whole number of cents");
  out.netCents = input.netCents ?? 0;
  const currency = String(input.currency ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw bad("currency must be a three-letter code");
  out.currency = currency;
  const taxes = input.taxes ?? {};
  if (typeof taxes !== "object" || Array.isArray(taxes) || Object.keys(taxes).length > 20) throw bad("taxes must name at most 20 taxes");
  out.taxes = {};
  for (const [name, cents] of Object.entries(taxes)) {
    if (!name.trim() || name.length > 60) throw bad("each tax needs a name of at most 60 letters");
    if (!Number.isSafeInteger(cents) || cents < 0) throw bad(`the tax ${name} must be a whole number of cents`);
    if (cents > 0) out.taxes[name.trim()] = cents;
  }
  return out;
}

const saleCents = (s) => s.salesCents + s.shippingCents + s.giftCardsSoldCents;
/** What the sales receipt carries, so a changed day can be told from an unchanged one. */
const saleFingerprint = (s) => JSON.stringify([s.salesCents, s.shippingCents, s.discountsCents, s.giftCardsSoldCents, s.giftCardsUsedCents, Object.entries(s.taxes).sort()]);

export function createAccountingService({ qbo, registry, auditLog, connections, states, sent, notifyOwner = null, config, now = () => Date.now() }) {
  const iso = (ms = now()) => new Date(ms).toISOString();
  const bound = (shopId, mode, realmId) => `quickbooks/${shopId}/${mode}/${realmId}`;
  const sealKey = () => {
    if (!config.tokenKey) throw new AccountingError(503, "accounting_off", "Bookkeeping links aren't set up on the platform yet.");
    return config.tokenKey;
  };

  async function logChange(shopId, id, entry) {
    const full = { id, source: "accounting-service", at: iso(), ...entry };
    await registry.recordEvent(shopId, full);
    await auditLog.write(shopId, id, full);
  }

  async function tell(row, message) {
    if (!notifyOwner) return;
    try { await notifyOwner(row, message); } catch (err) {
      console.error(`Bookkeeping email to ${row.shopId} failed:`, err?.message || err);
    }
  }

  const modeOf = (row) => (row.payments?.mode === "live" ? "live" : "test");
  const isOn = (row) => config.enabled && qbo.hasMode(modeOf(row));
  const connected = (conn) => Boolean(conn?.realmId && conn.sealed && !conn.disconnectedAt);

  async function connectionOf(row) {
    const conn = await connections.get(row.shopId);
    if (!connected(conn)) {
      throw conn?.problem === "lost"
        ? new AccountingError(409, "disconnected", "QuickBooks stopped taking this shop's sales. Connect to QuickBooks again.")
        : new AccountingError(409, "not_connected", "This shop isn't connected to QuickBooks yet.");
    }
    return conn;
  }

  // The company stopped answering: stop sending, tell the owner once, and say so on the Bookkeeping page.
  async function markLost(row, conn, why) {
    const next = { ...conn, sealed: null, disconnectedAt: iso(), problem: "lost" };
    await connections.set(row.shopId, next);
    await logChange(row.shopId, `accounting-lost-${conn.realmId}-${Date.parse(next.disconnectedAt)}`, { kind: "accounting.lost", realmId: conn.realmId, why });
    await tell(row, {
      kind: "accounting-lost",
      subject: "QuickBooks stopped taking your sales",
      text: `Your shop can't send sales to QuickBooks${conn.companyName ? ` (${conn.companyName})` : ""} any more. Nothing new is being sent. Open your shop's admin, go to Settings, then Bookkeeping, and press Connect to QuickBooks. Days you missed are sent once you're connected again.`,
    });
    return new AccountingError(409, "disconnected", "QuickBooks stopped taking this shop's sales. Connect to QuickBooks again.");
  }

  async function freshToken(row, conn, force = false) {
    let value;
    try { value = unseal(sealKey(), bound(row.shopId, conn.mode, conn.realmId), conn.sealed); } catch (err) {
      if (err instanceof AccountingError) throw err;
      throw await markLost(row, conn, "unreadable");
    }
    if (!force && conn.accessExpiresAt && Date.parse(conn.accessExpiresAt) - now() > REFRESH_BEFORE_MS) return { token: value.accessToken, conn };
    let renewed;
    try {
      renewed = await qbo.refresh(conn.mode, value.refreshToken);
    } catch (err) {
      if (err instanceof QuickBooksError && err.grant === "invalid_grant") throw await markLost(row, conn, "invalid_grant");
      throw err;
    }
    const next = {
      ...conn,
      sealed: seal(sealKey(), bound(row.shopId, conn.mode, conn.realmId), { accessToken: renewed.accessToken, refreshToken: renewed.refreshToken }),
      accessExpiresAt: renewed.accessExpiresAt,
      refreshExpiresAt: renewed.refreshExpiresAt ?? conn.refreshExpiresAt ?? null,
      hardExpiresAt: renewed.hardExpiresAt ?? conn.hardExpiresAt ?? null,
    };
    await connections.set(row.shopId, next);
    return { token: renewed.accessToken, conn: next };
  }

  // One QuickBooks call with a fresh token; a 401 gets one more try with a new token, then the company counts as lost.
  async function withToken(row, conn, run) {
    let current = await freshToken(row, conn);
    try {
      return await run(current.token, current.conn);
    } catch (err) {
      if (!(err instanceof QuickBooksError) || err.status !== 401) throw err;
    }
    current = await freshToken(row, current.conn, true);
    try {
      return await run(current.token, current.conn);
    } catch (err) {
      if (err instanceof QuickBooksError && err.status === 401) throw await markLost(row, current.conn, "unauthorized");
      throw err;
    }
  }

  const endsAt = (conn) => conn?.hardExpiresAt ?? conn?.refreshExpiresAt ?? null;

  async function status(row) {
    if (!isOn(row)) return { enabled: false };
    const conn = await connections.get(row.shopId);
    const ends = endsAt(conn);
    return {
      enabled: true,
      mode: modeOf(row),
      connected: connected(conn),
      companyName: conn?.companyName ?? null,
      problem: connected(conn) ? null : conn?.problem ?? null,
      disconnectedAt: conn?.disconnectedAt ?? null,
      style: conn?.setup?.style ?? null,
      ready: Boolean(connected(conn) && conn.setup?.savedAt),
      taxCodes: conn?.setup?.taxCodes ? Object.fromEntries(Object.entries(conn.setup.taxCodes).map(([name, code]) => [name, code.codeId])) : {},
      noTaxCode: conn?.setup?.noTaxCode ?? null,
      lastSent: conn?.lastSent ?? null,
      endsAt: connected(conn) ? ends : null,
      endsSoon: Boolean(connected(conn) && ends && Date.parse(ends) - now() <= WARN_BEFORE_MS),
    };
  }

  async function connectLink(row, { returnUrl } = {}) {
    let url;
    try { url = new URL(returnUrl); } catch { throw bad("returnUrl must be an address"); }
    if (url.protocol !== "https:" || !shopHosts(row).has(url.hostname.toLowerCase())) throw bad("returnUrl must be one of the shop's own addresses");
    const mode = modeOf(row);
    const state = randomBytes(24).toString("hex");
    const expiresAt = now() + STATE_MS;
    await states.put(state, { shopId: row.shopId, mode, returnUrl: url.toString(), expiresAt });
    return { url: qbo.authorizeUrl(mode, { state }), expiresAt: Math.floor(expiresAt / 1000) };
  }

  const pick = (rows, test) => rows.find(test)?.Id ?? null;
  const shortAccount = (a) => ({ id: String(a.Id), name: a.FullyQualifiedName || a.Name, type: a.AccountType, subType: a.AccountSubType ?? null });

  async function options(row) {
    const conn = await connectionOf(row);
    return withToken(row, conn, async (token, c) => {
      const codes = await qbo.query(c.mode, c.realmId, token, "TaxCode", "select * from TaxCode where Active = true maxresults 200");
      const accounts = await qbo.query(c.mode, c.realmId, token, "Account", "select * from Account where Active = true maxresults 500");
      const of = (...types) => accounts.filter((a) => types.includes(a.AccountType));
      return {
        taxCodes: codes.map((code) => ({ id: String(code.Id), name: code.Name, description: code.Description ?? null })),
        accounts: {
          income: of(QB.income).map(shortAccount),
          clearing: of(QB.otherCurrentAsset, QB.bank).map(shortAccount),
          bank: of(QB.bank).map(shortAccount),
          fees: of(QB.expense).map(shortAccount),
          giftCards: of(QB.otherCurrentLiability).map(shortAccount),
        },
        suggested: {
          income: pick(accounts, (a) => a.AccountSubType === QB.salesOfProductIncome) ?? pick(accounts, (a) => a.AccountType === QB.income),
          clearing: pick(accounts, (a) => a.AccountSubType === QB.undepositedFunds),
          bank: pick(accounts, (a) => a.AccountType === QB.bank),
          fees: pick(accounts, (a) => a.AccountSubType === QB.bankCharges) ?? pick(accounts, (a) => a.AccountType === QB.expense),
          giftCards: pick(accounts, (a) => a.AccountType === QB.otherCurrentLiability && /gift/i.test(a.Name ?? "")) ?? pick(accounts, (a) => a.AccountType === QB.otherCurrentLiability),
        },
      };
    });
  }

  async function save(row, args) {
    const conn = await connectionOf(row);
    const style = args.style ?? "daily";
    if (!STYLES.includes(style)) throw bad("style must be daily or orders");
    const currency = String(args.currency ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw bad("currency must be a three-letter code");
    const chosen = args.taxCodes && typeof args.taxCodes === "object" && !Array.isArray(args.taxCodes) ? args.taxCodes : {};
    if (Object.keys(chosen).length > 50) throw bad("at most 50 tax names");
    if (!QB_ID.test(String(args.noTaxCode ?? ""))) throw bad("choose the tax code for sales with no tax");
    const accounts = {};
    for (const part of ["income", "clearing", "bank", "fees", "giftCards"]) {
      const id = String(args.accounts?.[part] ?? "");
      if (!QB_ID.test(id)) throw bad(`choose an account for ${part}`);
      accounts[part] = id;
    }
    return withToken(row, conn, async (token, c) => {
      // Each tax name keeps its code and the code's sales rates, which the receipt's tax lines name.
      const codes = await qbo.query(c.mode, c.realmId, token, "TaxCode", "select * from TaxCode maxresults 200");
      const byId = new Map(codes.map((code) => [String(code.Id), code]));
      if (!byId.has(String(args.noTaxCode))) throw bad("that tax code isn't in this QuickBooks company");
      const taxCodes = {};
      for (const [name, id] of Object.entries(chosen)) {
        const code = byId.get(String(id));
        if (!name.trim() || name.length > 60 || !code) throw bad(`the tax ${name} needs one of this company's tax codes`);
        const rates = (code.SalesTaxRateList?.TaxRateDetail ?? []).map((detail) => detail?.TaxRateRef?.value).filter((v) => QB_ID.test(String(v ?? "")));
        if (!rates.length) throw bad(`the tax code ${code.Name} has no sales rate; choose another for ${name}`);
        taxCodes[name.trim()] = { codeId: String(code.Id), rateIds: rates.map(String) };
      }
      const items = {};
      for (const [part, name] of Object.entries(ITEM_NAMES)) {
        const [found] = await qbo.query(c.mode, c.realmId, token, "Item", `select * from Item where Name = '${quote(name)}'`);
        const income = part === "giftCards" ? accounts.giftCards : accounts.income;
        const item = found ?? await qbo.call(c.mode, c.realmId, token, "POST", ENTITIES.item, {
          body: { Name: name, Type: QB.service, IncomeAccountRef: { value: income } },
          requestId: requestIdFor(`${row.shopId}/${c.realmId}/item/${part}`),
        });
        items[part] = String(item.Id);
      }
      const setup = { style, currency, taxCodes, noTaxCode: String(args.noTaxCode), accounts, items, savedAt: iso() };
      await connections.set(row.shopId, { ...(await connections.get(row.shopId)), setup });
      await logChange(row.shopId, `accounting-setup-${Date.parse(setup.savedAt)}`, { kind: "accounting.setup", style, taxNames: Object.keys(taxCodes) });
      return status(row);
    });
  }

  // ---- Writing a day, an order or a payout ----

  const sentKey = (shopId, realmId, kind, ref) => `${shopId}/${realmId}/${kind}/${ref}`;

  /** The line's tax code: the day's largest tax, or the press's "no tax" code. */
  function lineCode(s, setup) {
    const [biggest] = Object.entries(s.taxes).sort((a, b) => b[1] - a[1]);
    return biggest ? setup.taxCodes[biggest[0]].codeId : setup.noTaxCode;
  }

  function saleBody(s, setup, note) {
    const lines = [];
    const code = lineCode(s, setup);
    const item = (cents, itemId, description, taxCode) => {
      if (cents) lines.push({ DetailType: QB.salesLine, Amount: dollars(cents), Description: description, SalesItemLineDetail: { ItemRef: { value: itemId }, TaxCodeRef: { value: taxCode } } });
    };
    item(s.salesCents, setup.items.sales, "Book sales", code);
    item(s.shippingCents, setup.items.shipping, "Shipping", code);
    item(s.giftCardsSoldCents, setup.items.giftCards, "Gift cards sold", setup.noTaxCode);
    item(-s.giftCardsUsedCents, setup.items.giftCards, "Paid with gift cards", setup.noTaxCode);
    if (s.discountsCents) lines.push({ DetailType: QB.discountLine, Amount: dollars(s.discountsCents), Description: "Discounts", DiscountLineDetail: { PercentBased: false } });
    const taxLines = Object.entries(s.taxes).map(([name, cents]) => ({
      DetailType: QB.taxLine, Amount: dollars(cents), Description: name,
      TaxLineDetail: { TaxRateRef: { value: setup.taxCodes[name].rateIds[0] }, PercentBased: true },
    }));
    const totalTax = Object.values(s.taxes).reduce((sum, cents) => sum + cents, 0);
    return {
      TxnDate: s.date, PrivateNote: note, GlobalTaxCalculation: QB.taxExcluded, DepositToAccountRef: { value: setup.accounts.clearing },
      Line: lines,
      TxnTaxDetail: { TotalTax: dollars(totalTax), TaxLine: taxLines },
    };
  }

  const refundBody = (s, setup, cents, note) => ({
    TxnDate: s.date, PrivateNote: note, GlobalTaxCalculation: QB.taxExcluded, DepositToAccountRef: { value: setup.accounts.clearing },
    Line: [{ DetailType: QB.salesLine, Amount: dollars(cents), Description: "Refunds, tax included", SalesItemLineDetail: { ItemRef: { value: setup.items.sales }, TaxCodeRef: { value: setup.noTaxCode } } }],
  });

  const feeBody = (s, setup, cents, note) => ({
    TxnDate: s.date, PrivateNote: note, PaymentType: QB.cash, AccountRef: { value: setup.accounts.clearing },
    Line: [{ DetailType: QB.expenseLine, Amount: dollars(cents), Description: "Card fees", AccountBasedExpenseLineDetail: { AccountRef: { value: setup.accounts.fees }, TaxCodeRef: { value: setup.noTaxCode } } }],
  });

  const depositBody = (p, setup) => ({
    TxnDate: p.date, PrivateNote: `Payout ${p.id}`, DepositToAccountRef: { value: setup.accounts.bank },
    Line: [{ DetailType: QB.depositLine, Amount: dollars(p.amountCents), Description: `Payout ${p.id}`, DepositLineDetail: { AccountRef: { value: setup.accounts.clearing } } }],
  });

  // One day or order: the sales receipt once, then refunds and fees as whatever is new since the last send.
  async function postSummary(row, conn, setup, s, kind) {
    const ref = kind === "order" ? s.orderId : s.date;
    const key = sentKey(row.shopId, conn.realmId, kind, ref);
    const label = kind === "order" ? `Shop order ${s.orderId}` : `Shop sales ${s.date}`;
    if (s.currency !== setup.currency) return { kind, ref, outcome: "failed", code: "currency", message: `This shop sends ${setup.currency} to QuickBooks; this ${kind} is in ${s.currency}.` };
    const unmatched = Object.keys(s.taxes).find((name) => !setup.taxCodes[name]);
    if (unmatched) return { kind, ref, outcome: "failed", code: "tax_not_matched", message: `Match the tax "${unmatched}" to a QuickBooks tax code first.` };
    const record = (await sent.get(key)) ?? { shopId: row.shopId, realmId: conn.realmId, kind, ref, date: s.date, refunds: [], refundedCents: 0, fees: [], feesCents: 0 };
    const saveRecord = async () => sent.put(key, { ...record, updatedAt: iso() });
    const wrote = [];
    let changed = false;
    await withToken(row, conn, async (token, c) => {
      if (!record.saleId && (saleCents(s) || s.giftCardsUsedCents || Object.keys(s.taxes).length)) {
        const sale = await qbo.call(c.mode, c.realmId, token, "POST", ENTITIES.salesReceipt, {
          body: saleBody(s, setup, label),
          // After "Send again" replaced a deleted receipt, a new request id, or Intuit would answer with the old one.
          requestId: requestIdFor(`${key}/sale${record.goneSaleId ? `/after/${record.goneSaleId}` : ""}`),
        });
        Object.assign(record, { saleId: String(sale.Id), saleFingerprint: saleFingerprint(s), saleAt: iso() });
        await saveRecord();
        wrote.push("sale");
      } else if (record.saleId && record.saleFingerprint !== saleFingerprint(s)) {
        changed = true;
      }
      const newRefund = s.refundsCents - record.refundedCents;
      if (newRefund > 0) {
        const refund = await qbo.call(c.mode, c.realmId, token, "POST", ENTITIES.refundReceipt, { body: refundBody(s, setup, newRefund, `${label}: refunds`), requestId: requestIdFor(`${key}/refund/${s.refundsCents}`) });
        record.refunds.push({ id: String(refund.Id), cents: newRefund, at: iso() });
        record.refundedCents = s.refundsCents;
        await saveRecord();
        wrote.push("refund");
      }
      const newFees = s.feesCents - record.feesCents;
      if (newFees > 0) {
        const fee = await qbo.call(c.mode, c.realmId, token, "POST", ENTITIES.purchase, { body: feeBody(s, setup, newFees, `${label}: card fees`), requestId: requestIdFor(`${key}/fees/${s.feesCents}`) });
        record.fees.push({ id: String(fee.Id), cents: newFees, at: iso() });
        record.feesCents = s.feesCents;
        await saveRecord();
        wrote.push("fees");
      }
    });
    if (wrote.length) return { kind, ref, outcome: "sent", wrote, ...(changed ? { note: "changed" } : {}) };
    if (changed) return { kind, ref, outcome: "changed", message: "The sales for this day changed after they were sent. Fix the sales receipt in QuickBooks by hand." };
    return { kind, ref, outcome: record.saleId || record.refunds.length || record.fees.length ? "already" : "empty" };
  }

  async function postPayout(row, conn, setup, p) {
    const key = sentKey(row.shopId, conn.realmId, "payout", p.id);
    if (await sent.get(key)) return { kind: "payout", ref: p.id, outcome: "already" };
    // A payout that takes money back (a negative one) needs a person: QuickBooks gets nothing for it.
    if (p.amountCents <= 0) return { kind: "payout", ref: p.id, outcome: "failed", code: "negative_payout", message: "This payout took money back. Record it in QuickBooks by hand." };
    if (p.currency !== setup.currency) return { kind: "payout", ref: p.id, outcome: "failed", code: "currency", message: `This shop sends ${setup.currency} to QuickBooks; this payout is in ${p.currency}.` };
    const deposit = await withToken(row, conn, (token, c) => qbo.call(c.mode, c.realmId, token, "POST", ENTITIES.deposit, { body: depositBody(p, setup), requestId: requestIdFor(`${key}/deposit`) }));
    await sent.put(key, { shopId: row.shopId, realmId: conn.realmId, kind: "payout", ref: p.id, date: p.date, depositId: String(deposit.Id), cents: p.amountCents, at: iso() });
    return { kind: "payout", ref: p.id, outcome: "sent", wrote: ["deposit"] };
  }

  function readPayout(input) {
    if (!input || typeof input !== "object") throw bad("a payout is needed");
    if (typeof input.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(input.id)) throw bad("each payout needs its id");
    if (typeof input.date !== "string" || !DATE.test(input.date)) throw bad("each payout's date must be YYYY-MM-DD");
    if (!Number.isSafeInteger(input.amountCents)) throw bad("each payout's amountCents must be a whole number");
    const currency = String(input.currency ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw bad("each payout's currency must be a three-letter code");
    return { id: input.id, date: input.date, amountCents: input.amountCents, currency };
  }

  async function post(row, args) {
    const conn = await connectionOf(row);
    const setup = conn.setup;
    if (!setup?.savedAt) throw new AccountingError(409, "not_set_up", "Finish the three steps in Settings › Bookkeeping first.");
    const list = (value) => (Array.isArray(value) ? value : []);
    const daily = setup.style === "daily";
    const summaries = (daily ? list(args.days) : list(args.orders)).map((s) => readSummary(s, { order: !daily }));
    const payouts = list(args.payouts).map(readPayout);
    if (summaries.length + payouts.length > MAX_BATCH) throw bad(`send at most ${MAX_BATCH} days, orders and payouts at once`);
    const results = [];
    let stopped = null;
    // Oldest first, so a stop leaves no gap behind the last day sent.
    for (const s of [...summaries].sort((a, b) => a.date.localeCompare(b.date))) {
      try {
        results.push(await postSummary(row, await connections.get(row.shopId), setup, s, daily ? "day" : "order"));
      } catch (err) {
        if (err instanceof AccountingError && err.code === "disconnected") { stopped = "disconnected"; break; }
        results.push({ kind: daily ? "day" : "order", ref: daily ? s.date : s.orderId, outcome: "failed", code: "quickbooks", message: plainRefusal(err) });
      }
    }
    if (!stopped) {
      for (const p of payouts) {
        try {
          results.push(await postPayout(row, await connections.get(row.shopId), setup, p));
        } catch (err) {
          if (err instanceof AccountingError && err.code === "disconnected") { stopped = "disconnected"; break; }
          results.push({ kind: "payout", ref: p.id, outcome: "failed", code: "quickbooks", message: plainRefusal(err) });
        }
      }
    }
    const sentDates = results.filter((r) => r.outcome === "sent" || r.outcome === "already").map((r) => summaries.find((s) => (s.orderId ?? s.date) === r.ref)?.date).filter(Boolean).sort();
    if (sentDates.length && !stopped) {
      const latest = sentDates[sentDates.length - 1];
      const current = await connections.get(row.shopId);
      if (!current.lastSent || current.lastSent.date <= latest) await connections.set(row.shopId, { ...current, lastSent: { date: latest, at: iso() } });
    }
    if (results.some((r) => r.outcome === "sent")) {
      await logChange(row.shopId, `accounting-sent-${now()}`, { kind: "accounting.sent", sent: results.filter((r) => r.outcome === "sent").map((r) => `${r.kind}:${r.ref}`) });
    }
    return { results, ...(stopped ? { stopped } : {}) };
  }

  // "Send again" for one day or order: only when its sales receipt is gone from QuickBooks (the press deleted it);
  // otherwise the same as the nightly run, which sends nothing twice.
  async function resend(row, args) {
    const conn = await connectionOf(row);
    const setup = conn.setup;
    if (!setup?.savedAt) throw new AccountingError(409, "not_set_up", "Finish the three steps in Settings › Bookkeeping first.");
    const daily = setup.style === "daily";
    const s = readSummary(args.summary, { order: !daily });
    const key = sentKey(row.shopId, conn.realmId, daily ? "day" : "order", daily ? s.date : s.orderId);
    const record = await sent.get(key);
    if (record?.saleId) {
      const found = await withToken(row, conn, (token, c) => qbo.query(c.mode, c.realmId, token, "SalesReceipt", `select Id from SalesReceipt where Id = '${quote(record.saleId)}'`));
      if (!found.length) {
        await sent.put(key, { ...record, saleId: null, saleFingerprint: null, goneSaleId: record.saleId, updatedAt: iso() });
        await logChange(row.shopId, `accounting-resend-${key}-${record.saleId}`, { kind: "accounting.resend", ref: s.orderId ?? s.date, goneSaleId: record.saleId });
      }
    }
    return post(row, daily ? { days: [s] } : { orders: [s] });
  }

  async function disconnect(row) {
    const conn = await connections.get(row.shopId);
    if (!conn?.realmId || conn.disconnectedAt) return status(row);
    try {
      const value = unseal(sealKey(), bound(row.shopId, conn.mode, conn.realmId), conn.sealed);
      await qbo.revoke(conn.mode, value.refreshToken);
    } catch (err) {
      // The tokens are dropped either way; Intuit ends an unused connection by itself.
      console.error(`QuickBooks revoke for ${row.shopId} failed:`, err?.message || err);
    }
    await connections.set(row.shopId, { ...conn, sealed: null, disconnectedAt: iso(), problem: "disconnected" });
    await logChange(row.shopId, `accounting-disconnected-${conn.realmId}-${now()}`, { kind: "accounting.disconnected", realmId: conn.realmId });
    return status(row);
  }

  function plainRefusal(err) {
    if (err instanceof AccountingError) return err.message;
    if (err instanceof QuickBooksError) {
      if (err.status >= 500 || err.code === "connection") return "QuickBooks didn't answer. It will be tried again tonight.";
      return `QuickBooks refused it: ${String(err.message).slice(0, 200)}`;
    }
    console.error("Bookkeeping error:", err);
    return "Something went wrong sending this. It will be tried again tonight.";
  }

  const OPS = {
    "accounting.status": (row) => status(row),
    "accounting.connectLink": (row, args) => connectLink(row, args),
    "accounting.options": (row) => options(row),
    "accounting.save": (row, args) => save(row, args),
    "accounting.post": (row, args) => post(row, args),
    "accounting.resend": (row, args) => resend(row, args),
    "accounting.disconnect": (row) => disconnect(row),
  };

  const backTo = (returnUrl, outcome) => {
    const url = new URL(returnUrl);
    url.searchParams.set("quickbooks", outcome);
    return { status: 302, headers: { Location: url.toString() }, body: { quickbooks: outcome } };
  };

  /** The shop's Bookkeeping page, for Intuit's reconnect link. */
  const adminUrl = (row) => {
    const site = typeof row.siteUrl === "string" && /^https:\/\//.test(row.siteUrl) ? row.siteUrl.replace(/\/+$/, "") : `https://${row.projectId ?? row.shopId}.web.app`;
    return `${site}/admin#settings/bookkeeping`;
  };

  return {
    status, connectLink, options, save, post, resend, disconnect,

    /** The shop's door: `X-Shop-Id` + `Authorization: Bearer <service key>`, body { op, args }. */
    async shopCall({ headers, body } = {}) {
      try {
        const get = (name) => {
          const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
          return typeof found?.[1] === "string" ? found[1] : "";
        };
        const shopId = get("x-shop-id");
        const row = shopId ? await registry.getShop(shopId) : null;
        // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
        if (!row || !serviceKeyMatches(get("authorization").replace(/^Bearer\s+/i, ""), row.serviceKeyHash)) {
          throw new AccountingError(401, "unknown_shop", "This shop can't use the platform's bookkeeping link.");
        }
        if (row.status === "abandoned") throw new AccountingError(403, "shop_closed", "This shop is closed.");
        const op = body && typeof body === "object" && Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
        if (!op) throw bad("Unknown call.");
        if (body.op !== "accounting.status" && !isOn(row)) throw new AccountingError(409, "accounting_off", "Bookkeeping links aren't turned on yet.");
        const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
        return { status: 200, body: await op({ ...row, shopId }, args) };
      } catch (err) {
        if (err instanceof AccountingError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
        if (err instanceof QuickBooksError && err.status < 500 && err.status !== 401) {
          return { status: 422, body: { error: { code: "quickbooks_refused", message: plainRefusal(err) } } };
        }
        console.error("Bookkeeping service error:", err);
        return { status: 502, body: { error: { code: "quickbooks_error", message: "QuickBooks didn't answer. Try again in a minute." } } };
      }
    },

    /**
     * Intuit sends the press back here (GET /quickbooks/oauth) with `code`, `state` and `realmId`, or `error` when they
     * said no. Answers with a redirect to the shop's admin (`?quickbooks=connected|denied|in_use|other_company|failed`),
     * except for a state it doesn't know, which can't be sent anywhere safe.
     */
    async oauthCallback(query = {}) {
      const state = typeof query.state === "string" ? query.state : "";
      const saved = /^[0-9a-f]{48}$/.test(state) ? await states.take(state) : null;
      if (!saved || saved.expiresAt < now()) return { status: 400, body: { error: "This sign-in link has expired. Go back to your shop's admin and press Connect to QuickBooks again." } };
      const row = await registry.getShop(saved.shopId);
      if (!row || !isOn(row)) return backTo(saved.returnUrl, "failed");
      if (query.error || typeof query.code !== "string" || !query.code) return backTo(saved.returnUrl, "denied");
      const realmId = String(query.realmId ?? "");
      if (!QB_ID.test(realmId)) return backTo(saved.returnUrl, "failed");
      // One company per shop and one shop per company: anything else could put one press's sales in another's books.
      const holder = await connections.findByRealm(saved.mode, realmId);
      if (holder && holder.shopId !== row.shopId && connected(holder)) return backTo(saved.returnUrl, "in_use");
      const existing = await connections.get(row.shopId);
      if (connected(existing) && existing.realmId !== realmId) return backTo(saved.returnUrl, "other_company");
      let granted;
      try {
        granted = await qbo.exchangeCode(saved.mode, query.code);
      } catch (err) {
        console.error(`QuickBooks sign-in for ${saved.shopId} failed:`, err?.message || err);
        return backTo(saved.returnUrl, "failed");
      }
      let companyName = null;
      try {
        companyName = (await qbo.call(saved.mode, realmId, granted.accessToken, "GET", ENTITIES.companyInfo, { id: realmId }))?.CompanyName ?? null;
      } catch (err) {
        console.error(`QuickBooks company name for ${saved.shopId} couldn't be read:`, err?.message || err);
      }
      const sameCompany = existing?.realmId === realmId && existing?.mode === saved.mode;
      await connections.set(row.shopId, {
        shopId: row.shopId, mode: saved.mode, realmId, companyName,
        sealed: seal(sealKey(), bound(row.shopId, saved.mode, realmId), { accessToken: granted.accessToken, refreshToken: granted.refreshToken }),
        accessExpiresAt: granted.accessExpiresAt, refreshExpiresAt: granted.refreshExpiresAt, hardExpiresAt: granted.hardExpiresAt,
        connectedAt: iso(), disconnectedAt: null, problem: null, warnedFor: null,
        // Reconnecting the same company keeps the choices and the last day sent; another company starts over.
        setup: sameCompany ? existing.setup ?? null : null,
        lastSent: sameCompany ? existing.lastSent ?? null : null,
      });
      await logChange(row.shopId, `accounting-connected-${realmId}-${now()}`, { kind: "accounting.connected", realmId, mode: saved.mode });
      return backTo(saved.returnUrl, "connected");
    },

    /**
     * Intuit's reconnect link (GET /quickbooks/reconnect, the app's "Reconnect URL"): QuickBooks sends the press here
     * with their company id. Signing in again must start from their own shop's admin, so this only points the way there.
     */
    async reconnectPage(query = {}) {
      const realmId = String(query.realmId ?? "");
      if (QB_ID.test(realmId)) {
        for (const mode of ["live", "test"]) {
          const conn = await connections.findByRealm(mode, realmId);
          const row = conn ? await registry.getShop(conn.shopId) : null;
          if (row) return { status: 302, headers: { Location: adminUrl(row) }, body: { reconnect: row.shopId } };
        }
      }
      return {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: "To connect QuickBooks again, open your shop's admin, go to Settings, then Bookkeeping, and press Connect to QuickBooks.",
      };
    },

    /** Once a night: warn each owner 30 days before their connection's end, once per end date. */
    async nightly() {
      const warned = [];
      for (const conn of await connections.list()) {
        const ends = endsAt(conn);
        if (!connected(conn) || !ends || Date.parse(ends) - now() > WARN_BEFORE_MS || conn.warnedFor === ends) continue;
        const row = await registry.getShop(conn.shopId);
        if (!row || row.status === "abandoned") continue;
        await tell(row, {
          kind: "accounting-ending",
          subject: "Your QuickBooks connection ends soon",
          text: `Your shop's connection to QuickBooks${conn.companyName ? ` (${conn.companyName})` : ""} ends on ${ends.slice(0, 10)}. To keep sending your sales, open your shop's admin, go to Settings, then Bookkeeping, and press Connect to QuickBooks. It takes a minute.`,
        });
        await connections.set(conn.shopId, { ...conn, warnedFor: ends, warnedAt: iso() });
        await logChange(conn.shopId, `accounting-ending-${ends}`, { kind: "accounting.ending", endsAt: ends });
        warned.push(conn.shopId);
      }
      return { warned };
    },
  };
}
