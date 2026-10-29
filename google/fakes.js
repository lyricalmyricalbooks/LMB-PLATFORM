// In-memory stand-ins for the Google link's tests: a pretend Google with the same calls as googleApi.js, the shop's
// own Firebase project, the domain service's bridge and the two stores. Nothing here reaches Google.
//
// `calls` lists every change asked of Google (never the looks), so a test can prove a re-run changed nothing and that
// nothing in the press's accounts was ever deleted. `failOnce` names calls (like "createProperty") that throw once;
// `refuse` names calls Google answers 403 to every time.
import { GoogleError } from "./googleApi.js";
import { SCOPES } from "./endpoints.js";

const ALL_SCOPES = Object.values(SCOPES).flat();

export function fakeGoogle({ failOnce = [], refuse = [] } = {}) {
  const world = {
    codes: new Map(), // code -> { email, scopes }
    tokens: new Map(), // access token -> { email, scopes, refresh }
    refreshTokens: new Map(), // refresh token -> { email, scopes }
    revoked: new Set(),
    analyticsAccounts: ["accounts/100"],
    properties: new Map(), // "properties/n" -> { displayName, parent }
    streams: new Map(), // property -> [stream]
    bindings: new Map(), // property -> [binding]
    webResources: new Map(), // id -> { id, site, owners }
    scSites: new Set(),
    sitemaps: new Set(),
    spreadsheets: new Map(), // id -> { title, values }
    productProblems: new Map(), // "accounts/n" -> [{ offerId, title, issues }]
    merchantAccounts: new Map(), // "accounts/n" -> { name, accountName }
    dataSources: new Map(), // name -> { name, displayName, fileUri }
    freeListings: new Set(),
    gmail: [],
    folders: new Map(),
    channel: { id: "UCmothpress", snippet: { title: "Moth Press" } },
    calendars: new Map(),
    businessAccounts: [{ name: "accounts/555" }],
    adsCustomers: ["1234567890"],
    productLinks: new Map(),
  };
  const calls = [];
  const failures = [...failOnce];
  let counter = 0;
  const next = () => (counter += 1);
  const change = (name, ...args) => {
    calls.push([name, ...args]);
    if (refuse.includes(name)) throw new GoogleError(403, `${name} refused (pretend Google)`);
    const at = failures.indexOf(name);
    if (at >= 0) {
      failures.splice(at, 1);
      throw new GoogleError(503, `${name} failed (pretend Google error)`);
    }
  };
  const look = (name) => {
    if (refuse.includes(name)) throw new GoogleError(403, `${name} refused (pretend Google)`);
  };
  const who = (token, part) => {
    const grant = world.tokens.get(token);
    if (!grant || world.revoked.has(grant.refresh)) throw new GoogleError(401, "Invalid Credentials");
    if (part && !SCOPES[part].every((s) => grant.scopes.includes(s))) throw new GoogleError(403, "Request had insufficient authentication scopes");
    return grant;
  };
  const issue = (email, scopes, refresh) => {
    const accessToken = `ya29.access-${next()}`;
    world.tokens.set(accessToken, { email, scopes, refresh });
    return { accessToken, refreshToken: refresh, accessExpiresAt: "2100-01-01T00:00:00.000Z", scopes };
  };

  const google = {
    world,
    calls,
    /** The press signs in and allows `scopes` (all by default); returns the code Google sends back. */
    allow({ email = "owner@example.com", scopes = ALL_SCOPES } = {}) {
      const code = `code-${next()}`;
      world.codes.set(code, { email, scopes });
      return code;
    },
    authorizeUrl: ({ state, scopes }) => `https://accounts.google.example/allow?state=${state}&scope=${encodeURIComponent(scopes.join(" "))}`,
    async exchangeCode(code) {
      const found = world.codes.get(code);
      if (!found) throw new GoogleError(400, "Bad code", { grant: "invalid_grant" });
      world.codes.delete(code);
      const refresh = `1//refresh-${next()}`;
      world.refreshTokens.set(refresh, found);
      return issue(found.email, found.scopes, refresh);
    },
    async refresh(refreshToken) {
      const found = world.refreshTokens.get(refreshToken);
      if (!found || world.revoked.has(refreshToken)) throw new GoogleError(400, "Token has been expired or revoked.", { grant: "invalid_grant" });
      return { ...issue(found.email, found.scopes, refreshToken), refreshToken: null };
    },
    async revoke(token) {
      calls.push(["revoke"]);
      world.revoked.add(token);
    },
    whoami: async (token) => ({ email: who(token).email }),

    accountSummaries: async (token) => {
      who(token, "analytics");
      return world.analyticsAccounts.map((account) => ({
        account,
        propertySummaries: [...world.properties].filter(([, p]) => p.parent === account).map(([property, p]) => ({ property, displayName: p.displayName })),
      }));
    },
    async createProperty(token, { account, displayName }) {
      who(token, "analytics");
      change("createProperty", displayName);
      const name = `properties/${400000000 + next()}`;
      world.properties.set(name, { displayName, parent: account });
      return { name, displayName };
    },
    async getProperty(token, property) {
      who(token, "analytics");
      if (!world.properties.has(property)) throw new GoogleError(404, "not found");
      return { name: property, ...world.properties.get(property) };
    },
    listStreams: async (token, property) => (who(token, "analytics"), structuredClone(world.streams.get(property) ?? [])),
    async createWebStream(token, property, { displayName, defaultUri }) {
      who(token, "analytics");
      change("createWebStream", property);
      const stream = { name: `${property}/dataStreams/${next()}`, type: "WEB_DATA_STREAM", displayName, webStreamData: { defaultUri, measurementId: `G-MOTH${next()}` } };
      world.streams.set(property, [...(world.streams.get(property) ?? []), stream]);
      return structuredClone(stream);
    },
    listAccessBindings: async (token, property) => (who(token, "analytics"), look("listAccessBindings"), structuredClone(world.bindings.get(property) ?? [])),
    async createAccessBinding(token, property, { user, roles }) {
      who(token, "analytics");
      change("createAccessBinding", property, user);
      const binding = { name: `${property}/accessBindings/${next()}`, user, roles };
      world.bindings.set(property, [...(world.bindings.get(property) ?? []), binding]);
      return binding;
    },
    async deleteAccessBinding(token, name) {
      who(token, "analytics");
      change("deleteAccessBinding", name);
      for (const [property, list] of world.bindings) world.bindings.set(property, list.filter((b) => b.name !== name));
      return {};
    },

    verificationToken: async (token, { type, identifier, method }) => {
      who(token, "searchConsole");
      return { method, token: method === "FILE" ? `google${identifier.length}abc.html` : `google-site-verification=${type}-${identifier}` };
    },
    async verifySite(token, { type, identifier }) {
      const { email } = who(token, "searchConsole");
      change("verifySite", identifier);
      const id = type === "SITE" ? identifier : `dns://${identifier}`;
      const found = world.webResources.get(id) ?? { id, site: { type, identifier }, owners: [email] };
      world.webResources.set(id, found);
      return structuredClone(found);
    },
    async getWebResource(token, id) {
      who(token, "searchConsole");
      if (!world.webResources.has(id)) throw new GoogleError(404, "not found");
      return structuredClone(world.webResources.get(id));
    },
    async setOwners(token, id, resource) {
      who(token, "searchConsole");
      change("setOwners", id, resource.owners);
      world.webResources.set(id, structuredClone(resource));
      return resource;
    },
    async addSite(token, siteUrl) { who(token, "searchConsole"); change("addSite", siteUrl); world.scSites.add(siteUrl); return {}; },
    async submitSitemap(token, siteUrl, sitemap) { who(token, "searchConsole"); change("submitSitemap", siteUrl, sitemap); world.sitemaps.add(sitemap); return {}; },

    listMerchantAccounts: async (token) => (who(token, "merchantCenter"), [...world.merchantAccounts.values()].map((a) => ({ ...a }))),
    async createMerchantAccount(token, { accountName }) {
      who(token, "merchantCenter");
      change("createMerchantAccount", accountName);
      const name = `accounts/${7000 + next()}`;
      world.merchantAccounts.set(name, { name, accountName });
      return { name, accountName };
    },
    listDataSources: async (token, account) => (who(token, "merchantCenter"), [...world.dataSources.values()].filter((d) => d.name.startsWith(`${account}/`)).map((d) => ({ ...d }))),
    async createDataSource(token, account, { displayName, fileUri }) {
      who(token, "merchantCenter");
      change("createDataSource", account, fileUri);
      const name = `${account}/dataSources/${next()}`;
      world.dataSources.set(name, { name, displayName, fileUri });
      return { name, displayName };
    },
    async deleteDataSource(token, name) {
      who(token, "merchantCenter");
      change("deleteDataSource", name);
      if (!world.dataSources.delete(name)) throw new GoogleError(404, "not found");
      return {};
    },
    listProductProblems: async (token, account) => (who(token, "merchantCenter"), structuredClone(world.productProblems.get(account) ?? [])),
    async enableFreeListings(token, account) { who(token, "merchantCenter"); change("enableFreeListings", account); world.freeListings.add(account); return {}; },

    async sendGmail(token, raw) { who(token, "email"); change("sendGmail"); world.gmail.push(raw); return { id: `gmail-${next()}` }; },

    findFolder: async (token, name) => (who(token, "drive"), world.folders.has(name) ? { id: world.folders.get(name), name } : null),
    async createFolder(token, name) { who(token, "drive"); change("createFolder", name); const id = `folder-${next()}`; world.folders.set(name, id); return { id, name }; },
    async createSpreadsheet(token, title) {
      who(token, "drive");
      change("createSpreadsheet", title);
      const spreadsheetId = `sheet-${next()}`;
      world.spreadsheets.set(spreadsheetId, { title, values: [] });
      return { spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
    },
    async writeStockSheet(token, id, values) {
      who(token, "drive");
      if (!world.spreadsheets.has(id)) throw new GoogleError(404, "not found");
      change("writeStockSheet", id, values.length);
      world.spreadsheets.get(id).values = structuredClone(values);
      return {};
    },
    myChannel: async (token) => (who(token, "youtube"), world.channel ? structuredClone(world.channel) : null),
    channelVideos: async (token) => (who(token, "youtube"), [{ id: { videoId: "trailer1" }, snippet: { title: "Trailer" } }]),
    async getCalendar(token, id) { who(token, "calendar"); if (!world.calendars.has(id)) throw new GoogleError(404, "not found"); return { id }; },
    async createCalendar(token, { summary }) { who(token, "calendar"); change("createCalendar", summary); const id = `cal-${next()}@group.calendar.google.com`; world.calendars.set(id, summary); return { id, summary }; },
    listBusinessAccounts: async (token) => (who(token, "businessProfile"), [...world.businessAccounts]),
    listAdsCustomers: async (token) => (who(token, "ads"), [...world.adsCustomers]),
    async createProductLink(token, customerId, merchantId) {
      who(token, "ads");
      change("createProductLink", customerId, merchantId);
      const resourceName = `customers/${customerId}/productLinks/${next()}`;
      world.productLinks.set(resourceName, merchantId);
      return { resourceName };
    },
    async removeProductLink(token, customerId, resourceName) { who(token, "ads"); change("removeProductLink", resourceName); world.productLinks.delete(resourceName); return {}; },
  };
  return google;
}

/** The shop's own Firebase project: what the platform writes there, and the project's deletion. */
export function fakeShopFirebase() {
  const docs = new Map(); // projectId -> { settingsWebsite, adminSecretsGoogleAnalytics, hostingFiles }
  const calls = [];
  const of = (projectId) => {
    if (!docs.has(projectId)) docs.set(projectId, { analytics: {}, secrets: {}, files: new Map(), deleted: false });
    return docs.get(projectId);
  };
  return {
    docs,
    calls,
    serviceAccount: async (projectId) => `${projectId}@appspot.gserviceaccount.com`,
    async writeAnalytics(projectId, { measurementId, propertyId }) {
      calls.push(["writeAnalytics", projectId, measurementId]);
      of(projectId).analytics.ga4MeasurementId = measurementId;
      of(projectId).secrets.propertyId = propertyId;
    },
    async writeSearchConsoleSite(projectId, site) { calls.push(["writeSearchConsoleSite", projectId, site]); of(projectId).secrets.searchConsoleSite = site; },
    async publishVerificationFile(projectId, { name, content }) { calls.push(["publishVerificationFile", projectId, name]); of(projectId).files.set(name, content); },
    async clearTag(projectId) { calls.push(["clearTag", projectId]); of(projectId).analytics.ga4MeasurementId = ""; },
    async deleteProject(projectId) { calls.push(["deleteProject", projectId]); of(projectId).deleted = true; },
  };
}

/**
 * The domain service through domainBridge.js. `addRecords` answers `{ done: true }` unless `waiting` (plan 6.15's
 * Allow step isn't built yet); `calls` keeps every call.
 */
export function fakeDomainsCall({ waiting = false } = {}) {
  const calls = [];
  const domainsCall = async (op, row, args = {}) => {
    calls.push([op, row.shopId, args]);
    if (op === "liveDomain") return (row.domains ?? []).find((d) => d.state === "live")?.name ?? null;
    return waiting ? { waiting: true } : { done: true };
  };
  return { domainsCall, calls };
}

/** The sealed-token store (`googleConnections/<shop id>` in the platform project). */
export function fakeConnections() {
  const map = new Map();
  return { map, get: async (shopId) => structuredClone(map.get(shopId) ?? null), set: async (shopId, value) => void map.set(shopId, structuredClone(value)) };
}

/** One-use sign-in states (`googleStates/<state>`). */
export function fakeStates() {
  const map = new Map();
  return {
    map,
    put: async (state, value) => void map.set(state, { ...value }),
    take: async (state) => {
      const found = map.get(state) ?? null;
      map.delete(state);
      return found;
    },
  };
}
