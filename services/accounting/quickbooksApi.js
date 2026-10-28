// The QuickBooks Online Accounting API, reached through an injected `fetch`. No Intuit package: the service makes a
// handful of calls, every address comes from endpoints.js, and tests hand in a pretend QuickBooks (fakes.js).
//
// "live" is a real QuickBooks company (the platform's production keys), "test" a sandbox company (its development
// keys). The keys come from the environment only (config.js); a press's tokens are handed in per call by
// accounting.js, which keeps them sealed.
import {
  ACCOUNTING_SCOPE, API_HOSTS, AUTHORIZE_URL, ENTITIES, ENTITY_NAMES, HARD_EXPIRY_HEADER, MINOR_VERSION, REVOKE_URL, TOKEN_URL, companyPath,
} from "./endpoints.js";

/** A refusal from Intuit. `grant` is the OAuth error (`invalid_grant` means the press must connect again). */
export class QuickBooksError extends Error {
  constructor({ message, status, code = null, grant = null, detail = null }) {
    super(message || "QuickBooks refused the request.");
    this.name = "QuickBooksError";
    this.status = status || 502;
    this.code = code;
    this.grant = grant;
    this.detail = detail;
  }
}

const modeOf = (mode) => {
  if (mode !== "live" && mode !== "test") throw new QuickBooksError({ message: `unknown mode ${mode}`, status: 400 });
  return mode;
};

/** Seconds from now as an ISO time; null when Intuit didn't say. */
const after = (now, seconds) => (Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? new Date(now + Number(seconds) * 1000).toISOString() : null);

/**
 * @param {object} deps
 * @param {typeof fetch} deps.fetch
 * @param {{ live?: { clientId, clientSecret } | null, test?: { clientId, clientSecret } | null }} deps.apps
 * @param {string} deps.redirectUrl the service's sign-in answer address, exactly as set in the Intuit app
 */
export function createQuickBooksApi({ fetch, apps, redirectUrl, now = () => Date.now() }) {
  if (typeof fetch !== "function") throw new Error("the QuickBooks client needs a fetch");
  const appFor = (mode) => {
    const app = apps?.[modeOf(mode)];
    if (!app?.clientId || !app?.clientSecret) {
      throw new QuickBooksError({ message: `The platform has no QuickBooks ${mode === "live" ? "production" : "development"} keys.`, status: 503, code: "platform_app_missing" });
    }
    return app;
  };
  const basic = (app) => `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`;

  async function send(url, init) {
    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      throw new QuickBooksError({ message: `QuickBooks could not be reached: ${err?.message || err}`, status: 502, code: "connection" });
    }
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (response.ok) return data ?? {};
    const fault = Array.isArray(data?.Fault?.Error) ? data.Fault.Error[0] : null;
    throw new QuickBooksError({
      message: fault?.Message || data?.error_description || `QuickBooks answered ${response.status}.`,
      status: response.status,
      code: fault?.code ?? data?.error ?? null,
      grant: typeof data?.error === "string" ? data.error : null,
      detail: fault?.Detail ?? null,
    });
  }

  function tokens(answer) {
    const at = now();
    if (typeof answer?.access_token !== "string" || typeof answer?.refresh_token !== "string") {
      throw new QuickBooksError({ message: "QuickBooks gave no tokens.", status: 502, code: "no_tokens" });
    }
    return {
      accessToken: answer.access_token,
      refreshToken: answer.refresh_token,
      accessExpiresAt: after(at, answer.expires_in),
      refreshExpiresAt: after(at, answer.x_refresh_token_expires_in),
      hardExpiresAt: after(at, answer.x_refresh_token_hard_expires_in),
    };
  }

  async function tokenRequest(mode, form) {
    const app = appFor(mode);
    const answer = await send(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: basic(app), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", [HARD_EXPIRY_HEADER]: "true" },
      body: new URLSearchParams(form).toString(),
    });
    return tokens(answer);
  }

  return {
    /** Has the platform keys for this mode? */
    hasMode: (mode) => Boolean(apps?.[mode]?.clientId && apps?.[mode]?.clientSecret),

    /** The press's sign-in page. It holds no secret. */
    authorizeUrl(mode, { state }) {
      const app = appFor(mode);
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set("client_id", app.clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", ACCOUNTING_SCOPE);
      url.searchParams.set("redirect_uri", redirectUrl);
      url.searchParams.set("state", state);
      return url.toString();
    },

    /** The sign-in answer's code → tokens. */
    exchangeCode: (mode, code) => tokenRequest(mode, { grant_type: "authorization_code", code, redirect_uri: redirectUrl }),

    /** New tokens from the refresh token. Intuit may hand back a new refresh token; keep whichever comes back. */
    refresh: (mode, refreshToken) => tokenRequest(mode, { grant_type: "refresh_token", refresh_token: refreshToken }),

    /** Ends the connection on Intuit's side. */
    async revoke(mode, token) {
      const app = appFor(mode);
      await send(REVOKE_URL, {
        method: "POST",
        headers: { Authorization: basic(app), "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token }),
      });
    },

    /**
     * One call on a press's company. `entity` is an ENTITIES value; a write sends `body` and a `requestId` (Intuit's
     * `requestid` parameter, kept the same when a write is tried again). Returns the entity from the answer.
     */
    async call(mode, realmId, accessToken, method, entity, { id, body, requestId } = {}) {
      if (typeof accessToken !== "string" || !accessToken) throw new QuickBooksError({ message: "No access token for this press.", status: 409, code: "not_connected" });
      const url = new URL(`${API_HOSTS[modeOf(mode)]}${companyPath(realmId, entity, id)}`);
      if (requestId) url.searchParams.set("requestid", requestId);
      url.searchParams.set("minorversion", MINOR_VERSION);
      const answer = await send(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return answer?.[ENTITY_NAMES[entity]] ?? answer;
    },

    /** A read through Intuit's query language; returns the rows of `name` (an entity's answer key, like "TaxCode"). */
    async query(mode, realmId, accessToken, name, statement) {
      if (typeof accessToken !== "string" || !accessToken) throw new QuickBooksError({ message: "No access token for this press.", status: 409, code: "not_connected" });
      const url = new URL(`${API_HOSTS[modeOf(mode)]}${companyPath(realmId, ENTITIES.query)}`);
      url.searchParams.set("query", statement);
      url.searchParams.set("minorversion", MINOR_VERSION);
      const answer = await send(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
      const rows = answer?.QueryResponse?.[name];
      return Array.isArray(rows) ? rows : [];
    },
  };
}
