// The Google client for the Google link: the press's sign-in and every Google service the connect and teardown jobs
// touch, over an injected `fetch` (tests use the pretend Google in fakes.js, which has the same calls). Every address is
// in endpoints.js. Each call takes the press's access token first; the service refreshes it (google/service.js).
import {
  ADS, ANALYTICS_ADMIN, ANALYTICS_ADMIN_ALPHA, AUTHORIZE_URL, BUSINESS_ACCOUNTS, CALENDAR, DRIVE, GMAIL, MERCHANT_ACCOUNTS, MERCHANT_DATASOURCES,
  REVOKE_URL, SEARCH_CONSOLE, SITE_VERIFICATION, TOKEN_URL, USERINFO_URL, YOUTUBE,
} from "./endpoints.js";

export class GoogleError extends Error {
  constructor(status, message, { reason = null, grant = null } = {}) {
    super(message);
    this.name = "GoogleError";
    this.status = status;
    this.reason = reason;
    this.grant = grant;
  }
}

const FOLDER = "application/vnd.google-apps.folder";
const enc = encodeURIComponent;

export function createGoogleApi({ fetch = globalThis.fetch, app, redirectUrl, now = () => Date.now(), timeoutMs = 30000 }) {
  async function call(method, url, token, { body, query, headers = {} } = {}) {
    const address = new URL(url);
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null) address.searchParams.set(key, String(value));
    const response = await fetch(address.toString(), {
      method,
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const answer = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = answer?.error ?? {};
      throw new GoogleError(response.status, error.message || `Google answered ${response.status}`, { reason: error.status ?? error.errors?.[0]?.reason ?? null });
    }
    return answer;
  }

  async function tokenCall(params) {
    if (!app) throw new GoogleError(503, "The Google link has no sign-in keys");
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, ...params }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw new GoogleError(response.status, answer.error_description || "Google refused the sign-in", { grant: answer.error ?? null });
    return {
      accessToken: answer.access_token,
      refreshToken: answer.refresh_token ?? null,
      accessExpiresAt: new Date(now() + Number(answer.expires_in ?? 3600) * 1000).toISOString(),
      scopes: String(answer.scope ?? "").split(/\s+/).filter(Boolean),
    };
  }

  return {
    // ---- Sign-in ----

    /** Google's Allow page. `access_type=offline` + `prompt=consent` gives a refresh token; earlier grants are kept. */
    authorizeUrl({ state, scopes, loginHint }) {
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: app?.clientId ?? "", redirect_uri: redirectUrl ?? "", response_type: "code", scope: scopes.join(" "),
        access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
        ...(loginHint ? { login_hint: loginHint } : {}),
      }).toString();
      return url.toString();
    },
    exchangeCode: (code) => tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUrl ?? "" }),
    refresh: (refreshToken) => tokenCall({ refresh_token: refreshToken, grant_type: "refresh_token" }),
    async revoke(token) {
      const response = await fetch(REVOKE_URL, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(), signal: AbortSignal.timeout(timeoutMs),
      });
      // 400 "invalid_token": already revoked or expired, which is what we wanted.
      if (!response.ok && response.status !== 400) throw new GoogleError(response.status, "Google didn't take the access back");
    },
    whoami: async (token) => ({ email: String((await call("GET", USERINFO_URL, token)).email ?? "").toLowerCase() }),

    // ---- Analytics ----
    accountSummaries: async (token) => (await call("GET", `${ANALYTICS_ADMIN}/accountSummaries`, token, { query: { pageSize: 200 } })).accountSummaries ?? [],
    createProperty: (token, { account, displayName, timeZone, currencyCode }) =>
      call("POST", `${ANALYTICS_ADMIN}/properties`, token, { body: { parent: account, displayName, timeZone, currencyCode, industryCategory: "BOOKS_AND_LITERATURE" } }),
    getProperty: (token, property) => call("GET", `${ANALYTICS_ADMIN}/${property}`, token),
    listStreams: async (token, property) => (await call("GET", `${ANALYTICS_ADMIN}/${property}/dataStreams`, token)).dataStreams ?? [],
    createWebStream: (token, property, { displayName, defaultUri }) =>
      call("POST", `${ANALYTICS_ADMIN}/${property}/dataStreams`, token, { body: { type: "WEB_DATA_STREAM", displayName, webStreamData: { defaultUri } } }),
    listAccessBindings: async (token, property) => (await call("GET", `${ANALYTICS_ADMIN_ALPHA}/${property}/accessBindings`, token)).accessBindings ?? [],
    createAccessBinding: (token, property, { user, roles }) => call("POST", `${ANALYTICS_ADMIN_ALPHA}/${property}/accessBindings`, token, { body: { user, roles } }),
    deleteAccessBinding: (token, binding) => call("DELETE", `${ANALYTICS_ADMIN_ALPHA}/${binding}`, token),

    // ---- Site verification and Search Console ----
    verificationToken: async (token, { type, identifier, method }) =>
      call("POST", `${SITE_VERIFICATION}/token`, token, { body: { site: { type, identifier }, verificationMethod: method } }),
    verifySite: (token, { type, identifier, method }) =>
      call("POST", `${SITE_VERIFICATION}/webResource`, token, { query: { verificationMethod: method }, body: { site: { type, identifier } } }),
    getWebResource: (token, id) => call("GET", `${SITE_VERIFICATION}/webResource/${enc(id)}`, token),
    setOwners: (token, id, resource) => call("PUT", `${SITE_VERIFICATION}/webResource/${enc(id)}`, token, { body: resource }),
    addSite: (token, siteUrl) => call("PUT", `${SEARCH_CONSOLE}/sites/${enc(siteUrl)}`, token),
    submitSitemap: (token, siteUrl, sitemapUrl) => call("PUT", `${SEARCH_CONSOLE}/sites/${enc(siteUrl)}/sitemaps/${enc(sitemapUrl)}`, token),

    // ---- Merchant Center ----
    listMerchantAccounts: async (token) => (await call("GET", `${MERCHANT_ACCOUNTS}/accounts`, token)).accounts ?? [],
    // An account made through the API is linked to its provider, which is Colophon's own Merchant Center account
    // (code plan 15.14). Google's reference page for this call was not readable when this was written, so the
    // `service` shape follows the service-provider guide; the first real run (15.7) confirms it.
    createMerchantAccount: (token, { accountName, ownerEmail, timeZone, languageCode, providerId }) =>
      call("POST", `${MERCHANT_ACCOUNTS}/accounts:createAndConfigure`, token, {
        body: {
          account: { accountName, timeZone: { id: timeZone }, languageCode },
          users: [{ userId: ownerEmail, user: { accessRights: ["ADMIN"] } }],
          service: [{ provider: `accounts/${providerId}`, accountManagement: {} }],
        },
      }),
    listDataSources: async (token, account) => (await call("GET", `${MERCHANT_DATASOURCES}/${account}/dataSources`, token)).dataSources ?? [],
    createDataSource: (token, account, { displayName, fileUri, feedLabel, contentLanguage, countries }) =>
      call("POST", `${MERCHANT_DATASOURCES}/${account}/dataSources`, token, {
        body: {
          displayName,
          primaryProductDataSource: { channel: "ONLINE_PRODUCTS", feedLabel, contentLanguage, countries },
          fileInput: { fetchSettings: { enabled: true, fileUri, frequency: "FREQUENCY_DAILY", timeZone: "America/Toronto" }, fileName: "books.xml" },
        },
      }),
    deleteDataSource: (token, name) => call("DELETE", `${MERCHANT_DATASOURCES}/${name}`, token),
    enableFreeListings: (token, account) => call("POST", `${MERCHANT_ACCOUNTS}/${account}/programs/free-listings:enable`, token, { body: {} }),

    // ---- Gmail (only once Julian switches sending on) ----
    sendGmail: (token, raw) => call("POST", `${GMAIL}/users/me/messages/send`, token, { body: { raw } }),

    // ---- Optional extras ----
    async findFolder(token, name) {
      const q = `mimeType='${FOLDER}' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
      return (await call("GET", `${DRIVE}/files`, token, { query: { q, fields: "files(id,name)" } })).files?.[0] ?? null;
    },
    createFolder: (token, name) => call("POST", `${DRIVE}/files`, token, { body: { name, mimeType: FOLDER }, query: { fields: "id,name" } }),
    myChannel: async (token) => (await call("GET", `${YOUTUBE}/channels`, token, { query: { part: "snippet", mine: "true" } })).items?.[0] ?? null,
    channelVideos: async (token, channelId) =>
      (await call("GET", `${YOUTUBE}/search`, token, { query: { part: "snippet", channelId, type: "video", order: "date", maxResults: 50 } })).items ?? [],
    getCalendar: (token, id) => call("GET", `${CALENDAR}/calendars/${enc(id)}`, token),
    createCalendar: (token, { summary, timeZone }) => call("POST", `${CALENDAR}/calendars`, token, { body: { summary, timeZone } }),
    listBusinessAccounts: async (token) => (await call("GET", `${BUSINESS_ACCOUNTS}/accounts`, token)).accounts ?? [],
    async listAdsCustomers(token) {
      const answer = await call("GET", `${ADS}/customers:listAccessibleCustomers`, token);
      return (answer.resourceNames ?? []).map((name) => name.replace(/^customers\//, ""));
    },
    createProductLink: (token, customerId, merchantId) =>
      call("POST", `${ADS}/customers/${enc(customerId)}/productLinks:create`, token, {
        body: { productLink: { merchantCenter: { merchantCenterId: merchantId } } },
      }),
    removeProductLink: (token, customerId, resourceName) =>
      call("POST", `${ADS}/customers/${enc(customerId)}/productLinks:remove`, token, { body: { resourceName } }),
  };
}
