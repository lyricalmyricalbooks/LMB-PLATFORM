// In-memory stand-ins for the bookkeeping service's tests: a pretend QuickBooks behind `fetch` (sign-in, tokens and
// the company calls the service makes) and the service's own stores. Nothing here reaches Intuit.
import { API_HOSTS, REVOKE_URL, TOKEN_URL } from "./endpoints.js";

const fault = (status, message, code = "2000") => ({ status, body: { Fault: { Error: [{ Message: message, Detail: message, code }], type: "ValidationFault" } } });

/**
 * A pretend QuickBooks. `world.companies` maps a company id to its data (made with `world.addCompany`); `world.codes`
 * maps a sign-in code to the company that gave it. `world.cutOff(realmId)` plays the owner disconnecting the app in
 * QuickBooks (every token stops working). `answers` (`{ status, body }` or "network") are used first, in order.
 * `requests` keeps every call; `writes` every entity created.
 */
export function fakeQuickBooksFetch({ apps, answers = [] } = {}) {
  const queue = [...answers];
  const requests = [];
  const writes = [];
  let next = 100;
  const world = { companies: new Map(), codes: new Map(), access: new Map(), refresh: new Map(), byRequestId: new Map(), revoked: [] };

  world.addCompany = (realmId, mode, name = "Moth Press Ltd") => {
    world.companies.set(realmId, {
      mode, name,
      TaxCode: [
        { Id: "2", Name: "Exempt", Active: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "3" } }] } },
        { Id: "5", Name: "GST", Active: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "7" } }] } },
        { Id: "6", Name: "HST ON", Active: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "9" } }] } },
        { Id: "8", Name: "Out of scope", Active: true },
      ],
      Account: [
        { Id: "40", Name: "Sales of Product Income", AccountType: "Income", AccountSubType: "SalesOfProductIncome", Active: true },
        { Id: "4", Name: "Undeposited Funds", AccountType: "Other Current Asset", AccountSubType: "UndepositedFunds", Active: true },
        { Id: "35", Name: "Chequing", AccountType: "Bank", AccountSubType: "Checking", Active: true },
        { Id: "8", Name: "Bank charges", AccountType: "Expense", AccountSubType: "BankCharges", Active: true },
        { Id: "90", Name: "Gift card liability", AccountType: "Other Current Liability", Active: true },
      ],
      Item: [],
      SalesReceipt: [], RefundReceipt: [], Purchase: [], Deposit: [],
    });
  };
  world.cutOff = (realmId) => {
    for (const [token, realm] of world.access) if (realm === realmId) world.access.delete(token);
    for (const [token, realm] of world.refresh) if (realm === realmId) world.refresh.delete(token);
  };
  world.remove = (realmId, entity, id) => {
    const company = world.companies.get(realmId);
    company[entity] = company[entity].filter((row) => row.Id !== id);
  };

  const newTokens = (realmId) => {
    const access = `access-${next++}`;
    const refresh = `refresh-${next++}`;
    world.access.set(access, realmId);
    world.refresh.set(refresh, realmId);
    return { status: 200, body: { token_type: "bearer", access_token: access, refresh_token: refresh, expires_in: 3600, x_refresh_token_expires_in: 8726400, x_refresh_token_hard_expires_in: 157680000 } };
  };

  function tokenAnswer(headers, form) {
    const app = Object.values(apps ?? {}).find((a) => a && headers.Authorization === `Basic ${Buffer.from(`${a.clientId}:${a.clientSecret}`).toString("base64")}`);
    if (!app) return { status: 401, body: { error: "invalid_client" } };
    if (headers["Content-Type"] !== "application/x-www-form-urlencoded") return { status: 400, body: { error: "invalid_request" } };
    if (form.get("grant_type") === "authorization_code") {
      const realmId = world.codes.get(form.get("code"));
      if (!realmId) return { status: 400, body: { error: "invalid_grant" } };
      world.codes.delete(form.get("code"));
      return newTokens(realmId);
    }
    if (form.get("grant_type") === "refresh_token") {
      const realmId = world.refresh.get(form.get("refresh_token"));
      if (!realmId) return { status: 400, body: { error: "invalid_grant", error_description: "Incorrect or invalid refresh token" } };
      world.refresh.delete(form.get("refresh_token"));
      return newTokens(realmId);
    }
    return { status: 400, body: { error: "unsupported_grant_type" } };
  }

  // Just enough of Intuit's query language for the service's own statements.
  function runQuery(company, statement) {
    const m = statement.match(/^select (\*|Id) from (\w+)(?: where (\w+) = (?:'((?:[^'\\]|\\.)*)'|(true|false)))?(?: maxresults \d+)?$/i);
    if (!m) return fault(400, `QueryParserError: ${statement}`, "4000");
    const [, , entity, field, text, flag] = m;
    let rows = company[entity] ?? [];
    if (field) {
      const wanted = text !== undefined ? text.replace(/\\(.)/g, "$1") : flag === "true";
      rows = rows.filter((row) => (row[field] ?? (field === "Active" ? true : undefined)) === wanted);
    }
    return { status: 200, body: { QueryResponse: rows.length ? { [entity]: structuredClone(rows), startPosition: 1, maxResults: rows.length } : {}, time: "2026-10-28T12:00:00Z" } };
  }

  const has = (company, entity, id) => (company[entity] ?? []).some((row) => row.Id === id);

  function check(company, entity, body) {
    const lines = Array.isArray(body.Line) ? body.Line : [];
    const transaction = ["SalesReceipt", "RefundReceipt", "Purchase", "Deposit"].includes(entity);
    if (transaction && !body.TxnDate) return "TxnDate is required";
    if (entity === "Item" && (!body.Name || !body.Type)) return "Name and Type are required";
    for (const line of lines) {
      if (typeof line.Amount !== "number") return "Amount is required";
      const sales = line.SalesItemLineDetail;
      if (sales && !has(company, "Item", sales.ItemRef?.value)) return "Invalid Reference Id : Item";
      if (sales && !has(company, "TaxCode", sales.TaxCodeRef?.value)) return "Invalid Reference Id : TaxCode";
      const expense = line.AccountBasedExpenseLineDetail;
      if (expense && !has(company, "Account", expense.AccountRef?.value)) return "Invalid Reference Id : Account";
      if (line.DepositLineDetail && !has(company, "Account", line.DepositLineDetail.AccountRef?.value)) return "Invalid Reference Id : Account";
    }
    for (const field of ["DepositToAccountRef", "AccountRef", "IncomeAccountRef"]) {
      if (body[field] && !has(company, "Account", body[field].value)) return `Invalid Reference Id : ${field}`;
    }
    if (transaction && !lines.length) return "Line is required";
    return null;
  }

  function answer(mode, method, path, headers, query, body) {
    const realmId = world.access.get(String(headers.Authorization ?? "").replace(/^Bearer /, ""));
    const m = path.match(/^\/v3\/company\/(\d+)\/(\w+)(?:\/(\d+))?$/);
    if (!m || !realmId || realmId !== m[1]) return { status: 401, body: { fault: { error: [{ message: "message=AuthenticationFailed", code: "3200" }] } } };
    const company = world.companies.get(realmId);
    if (!company || company.mode !== mode) return { status: 401, body: {} };
    if (query.minorversion !== "75") return fault(400, "minorversion missing");
    const [, , entity, id] = m;
    if (entity === "companyinfo" && method === "GET") return { status: 200, body: { CompanyInfo: { Id: id, CompanyName: company.name, Country: "CA" } } };
    if (entity === "query" && method === "GET") return runQuery(company, query.query);
    const names = { salesreceipt: "SalesReceipt", refundreceipt: "RefundReceipt", purchase: "Purchase", deposit: "Deposit", item: "Item" };
    const name = names[entity];
    if (!name || method !== "POST") return fault(400, `Unsupported ${method} ${entity}`);
    const seenKey = `${realmId}/${query.requestid}`;
    if (query.requestid && world.byRequestId.has(seenKey)) return world.byRequestId.get(seenKey);
    const problem = check(company, name, body);
    if (problem) return fault(400, problem);
    const row = { ...structuredClone(body), Id: String(next++), SyncToken: "0" };
    company[name].push(row);
    writes.push({ realmId, entity: name, row });
    const result = { status: 200, body: { [name]: row, time: "2026-10-28T12:00:00Z" } };
    if (query.requestid) world.byRequestId.set(seenKey, result);
    return result;
  }

  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const headers = { ...(init.headers ?? {}) };
    const query = Object.fromEntries(parsed.searchParams);
    let body;
    let result;
    const queued = queue.shift();
    if (url === TOKEN_URL) {
      const form = new URLSearchParams(init.body);
      requests.push({ kind: "token", method, headers, form: Object.fromEntries(form) });
      if (queued === "network") throw new Error("socket hang up");
      result = queued ?? tokenAnswer(headers, form);
    } else if (url === REVOKE_URL) {
      body = JSON.parse(init.body);
      requests.push({ kind: "revoke", method, headers, body });
      if (queued === "network") throw new Error("socket hang up");
      world.revoked.push(body.token);
      const realmId = world.refresh.get(body.token) ?? world.access.get(body.token);
      if (realmId) world.cutOff(realmId);
      result = queued ?? { status: 200, body: {} };
    } else {
      const mode = parsed.origin === API_HOSTS.live ? "live" : parsed.origin === API_HOSTS.test ? "test" : null;
      body = init.body ? JSON.parse(init.body) : undefined;
      requests.push({ kind: "api", mode, method, path: parsed.pathname, headers, query, body });
      if (queued === "network") throw new Error("socket hang up");
      result = queued ?? (mode ? answer(mode, method, parsed.pathname, headers, query, body) : { status: 404, body: {} });
    }
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => structuredClone(result.body) };
  };
  return { fetch, requests, writes, world };
}

/** The presses' QuickBooks connections (a platform-project collection in the real service). */
export function fakeConnections() {
  const rows = new Map();
  return {
    rows,
    get: async (shopId) => (rows.has(shopId) ? structuredClone(rows.get(shopId)) : null),
    set: async (shopId, record) => void rows.set(shopId, structuredClone({ ...record, shopId })),
    list: async () => [...rows.values()].map((row) => structuredClone(row)),
    findByRealm: async (mode, realmId) => structuredClone([...rows.values()].find((row) => row.mode === mode && row.realmId === realmId) ?? null),
  };
}

/** Connect to QuickBooks's one-use states. */
export function fakeStates() {
  const rows = new Map();
  return {
    rows,
    put: async (state, record) => void rows.set(state, { ...record }),
    async take(state) {
      const record = rows.get(state) ?? null;
      rows.delete(state);
      return record;
    },
  };
}

/** What the service has sent to each company. */
export function fakeSent() {
  const rows = new Map();
  return { rows, get: async (key) => (rows.has(key) ? structuredClone(rows.get(key)) : null), put: async (key, record) => void rows.set(key, structuredClone(record)) };
}

/** The owner emails the service would send. */
export function fakeNotifier() {
  const sent = [];
  return { sent, notifyOwner: async (row, message) => void sent.push({ shopId: row.shopId, to: row.ownerEmail, ...message }) };
}
