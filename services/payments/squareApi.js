// Square's REST API (https://developer.squareup.com/reference/square), reached through an injected `fetch`. No Square
// package: the service makes a handful of calls, each named in square.js, and tests hand in a fake fetch so nothing
// reaches Square. Every path below is from Square's API reference (looked up 28 October 2026):
//
//   OAuth      GET  /oauth2/authorize (the press's browser)    POST /oauth2/token    POST /oauth2/revoke
//   Locations  GET  /v2/locations
//   Checkout   POST /v2/online-checkout/payment-links          GET/DELETE /v2/online-checkout/payment-links/{id}
//   Orders     GET  /v2/orders/{order_id}
//   Payments   GET  /v2/payments/{payment_id}                  POST /v2/payments/{payment_id}/cancel
//   Refunds    POST /v2/refunds                                GET  /v2/refunds/{refund_id}
//   Disputes   GET  /v2/disputes
//
// "live" is Square's production (connect.squareup.com) and "test" its Sandbox (connect.squareupsandbox.com), each with
// its own application. The platform's application secrets come from the environment only (config.js); a press's access
// token is handed in per call by square.js, which keeps it sealed (tokenSeal.js).

export const SQUARE_HOSTS = Object.freeze({ live: "https://connect.squareup.com", test: "https://connect.squareupsandbox.com" });
/** The API version the service was written against (the reference's examples, 28 October 2026). */
export const SQUARE_VERSION = "2026-09-16";

/** A refusal from Square, with Square's first error kept for the caller. */
export class SquareApiError extends Error {
  constructor({ message, category, code, field, statusCode }) {
    super(message || "Square refused the request.");
    this.name = "SquareApiError";
    this.category = category || "API_ERROR";
    this.code = code || null;
    this.field = field || null;
    this.statusCode = statusCode || 500;
  }
}

const modeOf = (mode) => {
  if (mode !== "live" && mode !== "test") throw new SquareApiError({ message: `unknown mode ${mode}`, category: "INVALID_REQUEST_ERROR", statusCode: 400 });
  return mode;
};

/**
 * @param {object} deps
 * @param {typeof fetch} deps.fetch
 * @param {{ live?: { applicationId, applicationSecret } | null, test?: { applicationId, applicationSecret } | null }} deps.apps
 *   the platform's Square applications (production and Sandbox), from the environment only
 * @param {string} [deps.version] the Square-Version header
 */
export function createSquareApi({ fetch, apps, version = SQUARE_VERSION }) {
  if (typeof fetch !== "function") throw new Error("the Square client needs a fetch");
  const appFor = (mode) => {
    const app = apps?.[modeOf(mode)];
    if (!app?.applicationId || !app?.applicationSecret) {
      throw new SquareApiError({ message: `The platform has no Square ${mode === "live" ? "production" : "Sandbox"} application.`, code: "platform_app_missing", statusCode: 503 });
    }
    return app;
  };

  async function send(mode, method, path, { headers = {}, body, query } = {}) {
    const url = new URL(`${SQUARE_HOSTS[modeOf(mode)]}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    const sent = { "Square-Version": version, ...headers };
    if (body !== undefined) sent["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetch(url.toString(), { method, headers: sent, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch (err) {
      throw new SquareApiError({ message: `Square could not be reached: ${err?.message || err}`, category: "API_ERROR", code: "connection", statusCode: 502 });
    }
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    const first = Array.isArray(data?.errors) ? data.errors[0] : null;
    if (!response.ok) {
      throw new SquareApiError({
        message: first?.detail || data?.message || `Square answered ${response.status}.`,
        category: first?.category, code: first?.code || data?.type, field: first?.field,
        statusCode: response.status,
      });
    }
    return data ?? {};
  }

  return {
    /** Has the platform an application for this mode? */
    hasMode: (mode) => Boolean(apps?.[mode]?.applicationId && apps?.[mode]?.applicationSecret),

    /** One call on a press's account with their access token. */
    async call(mode, method, path, { accessToken, body, query } = {}) {
      if (typeof accessToken !== "string" || !accessToken) throw new SquareApiError({ message: "No access token for this press.", code: "not_connected", statusCode: 409 });
      return send(mode, method, path, { headers: { Authorization: `Bearer ${accessToken}` }, body, query });
    },

    /**
     * The press's sign-in page (code flow). `session=false` in production, as Square asks; scopes joined by spaces.
     * The address goes to the press's browser; it holds no secret.
     */
    authorizeUrl(mode, { scopes, state, locale }) {
      const app = appFor(mode);
      const url = new URL(`${SQUARE_HOSTS[mode]}/oauth2/authorize`);
      url.searchParams.set("client_id", app.applicationId);
      url.searchParams.set("scope", scopes.join(" "));
      if (mode === "live") url.searchParams.set("session", "false");
      url.searchParams.set("state", state);
      if (locale) url.searchParams.set("locale", locale);
      return url.toString();
    },

    /** ObtainToken: `{ code }` for a new connection, `{ refreshToken }` to renew. */
    obtainToken(mode, { code, refreshToken }) {
      const app = appFor(mode);
      const body = code
        ? { client_id: app.applicationId, client_secret: app.applicationSecret, grant_type: "authorization_code", code }
        : { client_id: app.applicationId, client_secret: app.applicationSecret, grant_type: "refresh_token", refresh_token: refreshToken };
      return send(mode, "POST", "/oauth2/token", { body });
    },

    /** RevokeToken for every token of one press (merchant). */
    revokeToken(mode, merchantId) {
      const app = appFor(mode);
      return send(mode, "POST", "/oauth2/revoke", { headers: { Authorization: `Client ${app.applicationSecret}` }, body: { client_id: app.applicationId, merchant_id: merchantId } });
    },
  };
}
