// Bank feed (beta, 13 November 2026). A paid add-on: a shop's owner connects the shop's bank in the bank's own window
// (Plaid), and the shop's bank transactions arrive in Bookkeeping › Transactions to be matched to card payouts and
// expenses. Read-only: the only Plaid product asked for is "transactions", so nothing here can move money.
//
// The platform's part: it holds the Plaid keys (config.js) and each bank's access, sealed for its shop
// (../payments/tokenSeal.js), on the shop's registry row. The shop's own server (apps/shop/functions/bankFeed.js) asks
// through the shop door below and keeps the transactions, and where it has read up to, in the shop's own folder.
//
//   bankFeed: { on, onSince, offAt?, banks: [{ id, itemId, sealed, name, accounts, connectedAt, needsSignIn? }],
//               months: { "2026-11": 2 } }      the most banks connected in each month: what the bill is made from
//
// **Plaid bills the platform for every month a bank stays connected**, so a bank is disconnected at Plaid (not just
// forgotten here) the moment the add-on is turned off, and by the daily sweep when a shop is paused or closed.
// `disconnectAll` is safe to run again: a bank Plaid no longer knows counts as gone, and one that couldn't be reached
// stays on the row for the next run.
//
// The wall between shops: a bank's access opens only with its own shop's id (the seal is bound to it), and every call
// reads the banks from the calling shop's own row.
//
// Off until BANK_FEED=on with the Plaid keys (Julian's steps: server/README.md, "Bank feed").
//
// The shop door: POST /api/bank-feed/shop, `X-Shop-Id` + `Authorization: Bearer <service key>`, body { op, args }.
//
//   bank.status                              { available, addOn: { on, price, extraPrice, included, offSince? }, banks }
//   bank.linkToken  { bankId? }              { token }       opens the bank's sign-in window; bankId signs in again
//   bank.connect    { publicToken, bankName, by }   status   the bank is connected
//   bank.signedIn   { bankId, by }                  status   the owner signed in again
//   bank.pull       { cursors: { [bankId]: cursor } }   { banks: [{ bankId, lines, removed, cursor, more }], needsSignIn, failed }
//   bank.disconnect { bankId, by }                  status
import { randomBytes } from "node:crypto";
import { serviceKeyMatches } from "../email/http.js";
import { seal, unseal } from "../payments/tokenSeal.js";
import { platformSettings } from "../settings.js";
import { SignupError } from "../../signup/signup.js";
import { MAX_BANKS, monthCents, priceText, readBankFeedConfig } from "./config.js";
import { alreadyGone, needsSignIn, plaidClient } from "./plaid.js";

export { BANK_FEED_SETTING, BANK_FEED_SECRETS } from "./config.js";

const TOKEN = /^[A-Za-z0-9_-]{8,200}$/;
const text = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const monthOf = (date) => date.toISOString().slice(0, 7);

/** One Plaid transaction as the shop keeps it. Plaid counts money out as positive; the shop counts money in. Pure. */
export function bankLine(tx, bank) {
  const account = bank.accounts.find((a) => a.id === tx.account_id);
  return {
    id: String(tx.transaction_id || ""), bankId: bank.id, date: String(tx.date || "").slice(0, 10),
    cents: -Math.round(Number(tx.amount) * 100), currency: String(tx.iso_currency_code || tx.unofficial_currency_code || "").toUpperCase(),
    name: text(tx.merchant_name && tx.name && !String(tx.name).toLowerCase().includes(String(tx.merchant_name).toLowerCase()) ? `${tx.merchant_name} ${tx.name}` : tx.name || tx.merchant_name || "Bank transaction", 160),
    account: account ? `${account.name}${account.mask ? ` ••${account.mask}` : ""}` : bank.name,
    ...(tx.pending === true ? { pending: true } : {}),
  };
}

export function createBankFeed({ env = process.env, fetch = globalThis.fetch, registry, auditLog = null, plaid = null, plusTax = false, random = randomBytes, now = () => new Date() } = {}) {
  if (!registry?.getShop || !registry?.updateShop || !registry?.listShops) throw new Error("The bank feed needs the shop registry");
  const config = readBankFeedConfig(env);
  const settings = platformSettings(env);
  const available = config.on;
  const client = plaid ?? (config.clientId ? plaidClient({ fetch, host: config.host, clientId: config.clientId, secret: config.secret }) : null);
  const bound = (shopId) => `bank-feed:${shopId}`;
  const currencyOf = (row) => (String(row?.billing?.currency ?? "").toUpperCase() === "USD" ? "USD" : "CAD");
  const stateOf = (row) => ({ on: false, banks: [], months: {}, ...(row?.bankFeed ?? {}) });
  /** Paused or closed (services/billing ACCESS), or given up on: no bank may stay connected. */
  const stopped = (row) => row?.status === "abandoned" || ["paused", "closed"].includes(row?.billing?.access);

  async function record(shopId, kind, detail = {}) {
    const at = now().toISOString();
    const entry = { id: `${at}-${kind}`, source: "bank-feed", kind, at, ...detail };
    try { if (auditLog && (await auditLog.ready(shopId))) await auditLog.write(shopId, entry.id, entry); }
    catch (error) { console.error(`bank feed: the audit log entry for ${shopId} wasn't written: ${error?.message ?? error}`); }
  }

  function addOn(row) {
    if (!available) return null;
    const state = stateOf(row);
    const currency = currencyOf(row);
    const price = config.prices[currency];
    return { on: state.on === true, price: priceText(price.base, currency), extraPrice: priceText(price.extra, currency), included: config.included, banks: state.banks.length, ...(plusTax ? { plusTax: true } : {}), ...(state.on !== true && state.offAt ? { offSince: state.offAt } : {}) };
  }
  const publicBank = (bank) => ({ id: bank.id, name: bank.name, accounts: bank.accounts.map((a) => `${a.name}${a.mask ? ` ••${a.mask}` : ""}`), connectedAt: bank.connectedAt, ...(bank.needsSignIn ? { needsSignIn: true } : {}) });
  function view(row) {
    const state = stateOf(row);
    const { banks: _count, plusTax: _tax, ...words } = addOn(row) ?? { on: false, price: "", extraPrice: "", included: config.included };
    return { available, addOn: words, banks: available && state.on ? state.banks.map(publicBank) : [] };
  }

  /** Saves the shop's bank feed, counting the most banks this month has seen (what its bill is made from). */
  async function save(shopId, state) {
    const month = monthOf(now());
    const months = { ...(state.months ?? {}) };
    if (state.banks.length > (months[month] ?? 0)) months[month] = state.banks.length;
    const next = { ...state, months };
    await registry.updateShop(shopId, { bankFeed: next });
    return next;
  }
  const fresh = async (shopId) => registry.getShop(shopId);
  const access = (shopId, bank) => unseal(config.tokenKey, bound(shopId), bank.sealed).accessToken;

  /**
   * Disconnects every bank of a shop at Plaid. Safe to run again: a bank Plaid no longer knows is gone, one that
   * couldn't be reached stays for the next run. -> { removed, left }
   */
  async function disconnectAll(shopId, reason, { only = null } = {}) {
    const row = await fresh(shopId);
    const state = stateOf(row);
    const kept = [];
    let removed = 0;
    for (const bank of state.banks) {
      if (only && bank.id !== only) { kept.push(bank); continue; }
      try {
        if (!client) throw new Error("the Plaid keys aren't set");
        await client.remove(access(shopId, bank));
        removed += 1;
      } catch (error) {
        if (alreadyGone(error)) { removed += 1; continue; }
        console.error(`bank feed: ${shopId}'s bank ${bank.id} couldn't be disconnected (${reason}): ${error?.message ?? error}`);
        kept.push(bank);
      }
    }
    if (removed) {
      await save(shopId, { ...state, banks: kept });
      await record(shopId, "bank-disconnected", { reason, banks: removed });
    }
    return { removed, left: only ? kept.filter((b) => b.id === only).length : kept.length };
  }

  const needOpen = (row) => {
    if (!available) throw new SignupError(409, "The bank feed isn't open yet.");
    if (stopped(row)) throw new SignupError(403, "This shop is paused, so its banks are disconnected.");
    if (stateOf(row).on !== true) throw new SignupError(409, "Add the bank feed to your plan first, under Settings › Plan.");
  };

  const OPS = {
    "bank.status": async (shopId, _args, row) => view(row),
    "bank.linkToken": async (shopId, args, row) => {
      needOpen(row);
      const state = stateOf(row);
      const again = args.bankId ? state.banks.find((b) => b.id === args.bankId) : null;
      if (args.bankId && !again) throw new SignupError(404, "That bank is no longer connected.");
      if (!again && state.banks.length >= MAX_BANKS) throw new SignupError(409, `A shop can connect up to ${MAX_BANKS} banks.`);
      return { token: await client.linkToken({ userId: shopId, clientName: settings.platformName, accessToken: again ? access(shopId, again) : null }) };
    },
    "bank.connect": async (shopId, args, row) => {
      needOpen(row);
      if (!TOKEN.test(String(args.publicToken ?? ""))) throw new SignupError(400, "The bank's window didn't finish. Try connecting again.");
      if (stateOf(row).banks.length >= MAX_BANKS) throw new SignupError(409, `A shop can connect up to ${MAX_BANKS} banks.`);
      const { accessToken, itemId } = await client.exchange(args.publicToken);
      let bank;
      try {
        const accounts = (await client.accounts(accessToken)).slice(0, 20);
        bank = { id: random(6).toString("hex"), itemId, sealed: seal(config.tokenKey, bound(shopId), { accessToken }), name: text(args.bankName, 80) || "Bank", accounts, connectedAt: now().toISOString() };
        // Read again just before saving, and once more after: two banks connected at the same moment must both be kept,
        // because a bank left out of the row would stay connected (and billed) at Plaid with nothing to disconnect it.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const state = stateOf(await fresh(shopId));
          if (state.banks.some((b) => b.itemId === itemId)) break;
          await save(shopId, { ...state, banks: [...state.banks, bank] });
        }
        if (!stateOf(await fresh(shopId)).banks.some((b) => b.itemId === itemId)) throw new Error("the bank wasn't saved");
      } catch (error) {
        await client.remove(accessToken).catch(() => {});
        throw error;
      }
      await record(shopId, "bank-connected", { bank: bank.name, ...(args.by ? { by: text(args.by, 200) } : {}) });
      return view(await fresh(shopId));
    },
    "bank.signedIn": async (shopId, args, row) => {
      needOpen(row);
      const state = stateOf(row);
      if (!state.banks.some((b) => b.id === args.bankId)) throw new SignupError(404, "That bank is no longer connected.");
      await save(shopId, { ...state, banks: state.banks.map((b) => (b.id === args.bankId ? (({ needsSignIn: _flag, ...rest }) => rest)(b) : b)) });
      return view(await fresh(shopId));
    },
    "bank.pull": async (shopId, args, row) => {
      needOpen(row);
      const state = stateOf(row);
      const cursors = args.cursors && typeof args.cursors === "object" ? args.cursors : {};
      const banks = [], asked = [], failed = [];
      for (const bank of state.banks) {
        try {
          const cursor = typeof cursors[bank.id] === "string" ? cursors[bank.id].slice(0, 400) : "";
          const page = await client.sync(access(shopId, bank), cursor);
          banks.push({
            bankId: bank.id, cursor: page.cursor, more: page.more,
            lines: [...page.added, ...page.modified].map((tx) => bankLine(tx, bank)).filter((line) => line.id && line.date && Number.isFinite(line.cents) && line.cents !== 0),
            removed: page.removed.map((tx) => String(tx.transaction_id || "")).filter(Boolean),
          });
        } catch (error) {
          if (needsSignIn(error)) asked.push(bank.id);
          else { failed.push(bank.id); console.error(`bank feed: ${shopId}'s bank ${bank.id} couldn't be read: ${error?.message ?? error}`); }
        }
      }
      const flagged = state.banks.filter((b) => asked.includes(b.id) && !b.needsSignIn);
      if (flagged.length) await save(shopId, { ...state, banks: state.banks.map((b) => (asked.includes(b.id) ? { ...b, needsSignIn: true } : b)) });
      return { banks, needsSignIn: asked, failed };
    },
    "bank.disconnect": async (shopId, args) => {
      const { left } = await disconnectAll(shopId, `by ${text(args.by, 200) || "the owner"}`, { only: String(args.bankId ?? "") });
      if (left) throw new SignupError(502, "The bank couldn't be disconnected just now. Try again in a minute.");
      return view(await fresh(shopId));
    },
  };

  const header = (headers, name) => {
    const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
    return typeof found?.[1] === "string" ? found[1] : "";
  };

  return {
    available,
    config,
    disconnectAll,
    /** The add-on as the Plan page shows it, or null while the bank feed isn't open. */
    async addOnView(shopId) {
      return addOn(await fresh(shopId));
    },
    /** Turns the add-on on or off for a shop. Off disconnects every bank first, so nothing more is billed. */
    async setAddOn(shopId, on, by = "") {
      const row = await fresh(shopId);
      if (!row) throw new SignupError(404, "No such shop.");
      const state = stateOf(row);
      if (on) {
        if (!available) throw new SignupError(409, "The bank feed isn't open yet.");
        if (stopped(row)) throw new SignupError(403, "This shop is paused. Bring the plan back first.");
        if (state.on !== true) {
          const { offAt: _off, ...rest } = state;
          await save(shopId, { ...rest, on: true, onSince: now().toISOString() });
          await record(shopId, "bank-feed-on", by ? { by: text(by, 200) } : {});
        }
      } else if (state.on === true || state.banks.length) {
        const { left } = await disconnectAll(shopId, "the add-on was turned off");
        if (left) throw new SignupError(502, "A bank couldn't be disconnected just now, so the bank feed is still on. Try again in a minute.");
        await save(shopId, { ...stateOf(await fresh(shopId)), on: false, offAt: now().toISOString() });
        await record(shopId, "bank-feed-off", by ? { by: text(by, 200) } : {});
      }
      return addOn(await fresh(shopId));
    },
    /**
     * The daily sweep: a paused or closed shop's banks are disconnected (its add-on goes off), and every shop with a
     * bank has this month counted. Safe to run any number of times.
     */
    async sweep() {
      const disconnected = [], failed = [];
      let connected = 0;
      for (const row of await registry.listShops()) {
        const state = stateOf(row);
        if (!state.banks.length) continue;
        try {
          // Also when the bank feed itself was switched off for everyone: a connected bank is billed either way.
          if (stopped(row) || !available) {
            const { left } = await disconnectAll(row.shopId, available ? "the shop is paused or closed" : "the bank feed was switched off");
            if (left) { failed.push(row.shopId); continue; }
            await save(row.shopId, { ...stateOf(await fresh(row.shopId)), on: false, offAt: now().toISOString() });
            disconnected.push(row.shopId);
          } else {
            connected += 1;
            if (state.banks.length > (state.months?.[monthOf(now())] ?? 0)) await save(row.shopId, state);
          }
        } catch (error) {
          failed.push(row.shopId);
          console.error(`bank feed: the sweep had trouble with ${row.shopId}: ${error?.message ?? error}`);
        }
      }
      return { connected, disconnected, failed };
    },
    /** { [shopId]: the most banks connected in `month` }, for the bill (services/billing billBankFeed). */
    async monthBanks(month) {
      const out = {};
      for (const row of await registry.listShops()) {
        const n = stateOf(row).months?.[month];
        if (n > 0) out[row.shopId] = n;
      }
      return out;
    },
    cents: (currency, banks) => monthCents(config, currency, banks),
    /** For the control room: a shop's add-on and its banks by name (never their access). */
    async forShop(shopId) {
      const row = await fresh(shopId);
      const state = stateOf(row);
      return { available, on: state.on === true, onSince: state.onSince ?? "", offAt: state.offAt ?? "", banks: state.banks.map(publicBank), months: state.months ?? {} };
    },
    async shopCall(request = {}) {
      const shopId = header(request.headers, "x-shop-id");
      const row = shopId ? await registry.getShop(shopId) : null;
      // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
      if (!row || !serviceKeyMatches(header(request.headers, "authorization").replace(/^Bearer\s+/i, ""), row.serviceKeyHash)) {
        throw new SignupError(401, "This shop can't reach its bank feed.");
      }
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const op = Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
      if (!op) throw new SignupError(400, "Unknown call.");
      const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
      return op(shopId, args, row);
    },
  };
}

export function bankFeedShopDoorRoutes(bankFeed) {
  return { "POST /api/bank-feed/shop": async (request) => bankFeed.shopCall(request) };
}

/**
 * The daily job (job "bank-feed"): disconnect paused and closed shops' banks, then put last month's add-on on each
 * shop's next bill (once per shop and month). Safe to run any number of times a day.
 */
export async function runBankFeed({ bankFeed, billing, now = () => new Date() }) {
  const swept = await bankFeed.sweep();
  const today = now();
  const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const billed = await billing.billBankFeed({ month, banks: await bankFeed.monthBanks(month), cents: bankFeed.cents });
  if (swept.failed.length) throw new Error(`Bank feed: ${swept.failed.length} shop${swept.failed.length > 1 ? "s" : ""} had a bank that couldn't be disconnected or counted (${swept.failed.join(", ")}); it is tried again tomorrow.`);
  return { summary: `${swept.connected} shop${swept.connected === 1 ? "" : "s"} with a bank connected; disconnected ${swept.disconnected.length}; ${month}: billed ${billed.billed.length}`, swept, billed };
}
