// A pretend Plaid for the bank feed's tests and the walkthrough: the five calls the bank feed makes, over banks kept
// in memory. `fetch` answers like Plaid's API; `banks` is what is connected there right now (what Plaid would bill).
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fail = (code, message = code) => response(400, { error_type: "ITEM_ERROR", error_code: code, error_message: message });

/** One transaction as Plaid returns it. Plaid counts money out as positive. */
export const plaidTx = (id, { date = "2026-11-10", out = 0, name = "PAPER SUPPLY CO", account = "acc-1", pending = false, currency = "CAD" } = {}) =>
  ({ transaction_id: id, account_id: account, date, amount: out, name, pending, iso_currency_code: currency });

export function fakePlaid({ transactions = [] } = {}) {
  /** access token -> { itemId, added: [tx], removed: [id], broken?: error code } */
  const banks = new Map();
  const calls = [];
  let n = 0;
  const fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body);
    calls.push({ path, body });
    if (body.client_id !== "plaid-client" || body.secret !== "plaid-sandbox-secret") return response(400, { error_code: "INVALID_API_KEYS", error_message: "invalid client_id or secret provided" });
    if (path === "/link/token/create") return response(200, { link_token: `link-sandbox-${(n += 1)}` });
    if (path === "/item/public_token/exchange") {
      n += 1;
      const accessToken = `access-sandbox-${n}`;
      banks.set(accessToken, { itemId: `item-${n}`, added: [...transactions], removed: [] });
      return response(200, { access_token: accessToken, item_id: `item-${n}` });
    }
    const bank = banks.get(body.access_token);
    if (!bank) return fail("ITEM_NOT_FOUND");
    if (path === "/item/remove") {
      if (bank.broken === "DOWN") return response(500, { error_code: "INTERNAL_SERVER_ERROR", error_message: "try again" });
      banks.delete(body.access_token);
      return response(200, { request_id: "r" });
    }
    if (bank.broken) return fail(bank.broken);
    if (path === "/accounts/get") return response(200, { accounts: [{ account_id: "acc-1", name: "Chequing", mask: "1234", subtype: "checking" }] });
    if (path === "/transactions/sync") {
      const from = Number(body.cursor || 0);
      const added = bank.added.slice(from, from + body.count);
      const removed = from >= bank.added.length ? [] : bank.removed.splice(0).map((id) => ({ transaction_id: id }));
      return response(200, { added, modified: [], removed, next_cursor: String(from + added.length), has_more: from + added.length < bank.added.length });
    }
    return response(404, { error_code: "NOT_FOUND", error_message: path });
  };
  return { fetch, banks, calls };
}
