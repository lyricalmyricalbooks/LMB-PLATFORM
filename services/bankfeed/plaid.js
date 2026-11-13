// The few Plaid calls the bank feed makes (Transactions, read-only): no package, plain fetch. Every call is a POST of
// JSON with the platform's client id and secret in the body, as Plaid's API takes them. Nothing here can move money:
// the only product asked for is "transactions".
export class PlaidError extends Error {
  constructor(message, { status = 502, code = "", type = "" } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.type = type;
  }
}

/** The bank wants its owner to sign in again (a changed password, a consent that ran out). */
export const needsSignIn = (error) => error instanceof PlaidError && ["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "PENDING_DISCONNECT"].includes(error.code);
/** Plaid no longer knows this bank login: it is already gone on their side. */
export const alreadyGone = (error) => error instanceof PlaidError && ["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"].includes(error.code);

export function plaidClient({ fetch = globalThis.fetch, host, clientId, secret, timeoutMs = 20_000 }) {
  async function call(path, body) {
    let response;
    try {
      response = await fetch(`${host}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, secret, ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new PlaidError(`Plaid didn't answer: ${error?.message ?? error}`);
    }
    let answer = null;
    try { answer = await response.json(); } catch { answer = null; }
    if (!response.ok || !answer) {
      // Plaid's own words are for us, never for a shop: callers show their own.
      throw new PlaidError(String(answer?.error_message || `Plaid answered ${response.status}`), { status: response.status, code: String(answer?.error_code || ""), type: String(answer?.error_type || "") });
    }
    return answer;
  }
  return {
    /** A one-use token that opens the bank's sign-in window. With `accessToken` it signs in again to that bank. */
    async linkToken({ userId, clientName, accessToken = null, days = 90 }) {
      const answer = await call("/link/token/create", {
        client_name: clientName, language: "en", country_codes: ["CA", "US"], user: { client_user_id: userId },
        ...(accessToken ? { access_token: accessToken } : { products: ["transactions"], transactions: { days_requested: days } }),
      });
      return String(answer.link_token || "");
    },
    async exchange(publicToken) {
      const answer = await call("/item/public_token/exchange", { public_token: publicToken });
      return { accessToken: String(answer.access_token || ""), itemId: String(answer.item_id || "") };
    },
    async accounts(accessToken) {
      const answer = await call("/accounts/get", { access_token: accessToken });
      return (answer.accounts ?? []).map((a) => ({ id: String(a.account_id || ""), name: String(a.name || a.official_name || "Account"), mask: String(a.mask || ""), type: String(a.subtype || a.type || "") }));
    },
    /** One page of what changed since `cursor` ("" the first time). */
    async sync(accessToken, cursor = "", count = 250) {
      const answer = await call("/transactions/sync", { access_token: accessToken, count, ...(cursor ? { cursor } : {}) });
      return { added: answer.added ?? [], modified: answer.modified ?? [], removed: answer.removed ?? [], cursor: String(answer.next_cursor || ""), more: answer.has_more === true };
    },
    /** Disconnects the bank at Plaid, which is the only thing that stops its monthly fee. */
    async remove(accessToken) {
      await call("/item/remove", { access_token: accessToken });
    },
  };
}
