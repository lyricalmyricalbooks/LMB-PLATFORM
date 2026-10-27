// Google Analytics 4 for the admin Overview (createStripeCheckoutSession `action: "ga4Report"`, admin only).
// The Functions' own service account reads the shop's GA4 property through the Analytics Data API: no key is
// stored anywhere. The owner adds that service account's email to the property as a Viewer once, and the GA4
// property id lives in admin-only adminSecrets/googleAnalytics. Nothing here writes to Firestore.
const DATA_API = "https://analyticsdata.googleapis.com/v1beta/properties/";
const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta/properties/";
const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TIMEOUT_MS = 20000;
const MAX_SPAN_DAYS = 800;
const DAY = 86_400_000;

/** "properties/123456789", "123456789" or a pasted property URL → "123456789"; "" when it isn't one. */
function cleanPropertyId(value) {
  const s = String(value || "").trim();
  const m = s.match(/(?:^|properties\/|\bp)(\d{6,15})(?:\/|$|\b)/);
  return m ? m[1] : "";
}

/** Plain-English refusal for a property id, or "" when it is fine (empty is fine: not connected). */
function propertyIdProblem(value) {
  if (!String(value || "").trim()) return "";
  return cleanPropertyId(value) ? "" : "That isn't a GA4 property ID. It is a number of 6–15 digits, shown in Google Analytics › Admin › Property details (not the G-… measurement ID).";
}

const isDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const spanDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY) + 1;

/** The current and comparison windows asked for, checked; null when they aren't usable. */
function cleanRange(input) {
  const r = input && typeof input === "object" ? input : {};
  const ranges = [[r.startDate, r.endDate], [r.prevStartDate, r.prevEndDate]];
  for (const [a, b] of ranges) {
    if (!isDay(a) || !isDay(b) || a > b || spanDays(a, b) > MAX_SPAN_DAYS) return null;
  }
  return { startDate: r.startDate, endDate: r.endDate, prevStartDate: r.prevStartDate, prevEndDate: r.prevEndDate };
}

const metric = name => ({ name });
const dim = name => ({ name });

/** What visitors do: enhanced measurement events plus the shop's own (lib/ga4.ts). */
const ACTION_EVENTS = ["scroll", "click", "file_download", "view_search_results", "search", "search_no_results",
  "form_start", "form_submit", "add_to_wishlist", "select_item", "view_item", "add_to_cart", "video_start", "share"];

/** Steps for "Phones vs computers, step by step": people who did each one, per device. */
const STEP_EVENTS = ["session_start", "view_item", "add_to_cart", "begin_checkout", "purchase"];

/** The shop's own storefront events (lib/ga4.ts, 20 October 2026) counted for Overview › Visitors. */
const SHOP_EVENTS = ["nav_click", "pdp_interact", "page_not_found", "filter_use", "view_cart", "scroll_depth", "view_item_list", "select_item"];

/**
 * Event parameters each custom-dimension report reads. GA4 refuses `customEvent:<name>` until the owner registers the
 * parameter (Admin › Custom definitions, event scope), so these reports sit in their own optional batch.
 */
const CUSTOM_DEFINITIONS = {
  navClicks: ["menu", "link_text"], pdpActions: ["action"], pdpTabs: ["tab"], filters: ["filter", "value"], scrollDepth: ["percent"],
};

const onlyEvent = value => ({ filter: { fieldName: "eventName", stringFilter: { value } } });

/** The reports the Overview shows, as seven batches (the API takes up to five reports per batch). */
function buildBatches(range) {
  const cur = { startDate: range.startDate, endDate: range.endDate, name: "current" };
  const prev = { startDate: range.prevStartDate, endDate: range.prevEndDate, name: "previous" };
  const engagement = ["sessions", "activeUsers", "engagementRate"].map(metric);
  return [
    [
      { key: "totals", dateRanges: [cur, prev], metrics: ["activeUsers", "newUsers", "sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "screenPageViews", "sessionsPerUser"].map(metric) },
      { key: "byDate", dateRanges: [cur, prev], dimensions: [dim("date")], metrics: ["activeUsers", "sessions", "screenPageViews"].map(metric), limit: 2000 },
      { key: "channels", dateRanges: [cur], dimensions: [dim("sessionDefaultChannelGroup")], metrics: engagement, limit: 20, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] },
      { key: "sources", dateRanges: [cur], dimensions: [dim("sessionSource"), dim("sessionMedium")], metrics: engagement, limit: 25, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] },
      { key: "landing", dateRanges: [cur], dimensions: [dim("landingPage")], metrics: engagement, limit: 25, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] },
    ],
    [
      { key: "countries", dateRanges: [cur], dimensions: [dim("country")], metrics: ["activeUsers", "sessions"].map(metric), limit: 15, orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }] },
      { key: "devices", dateRanges: [cur], dimensions: [dim("deviceCategory")], metrics: ["activeUsers", "sessions"].map(metric), limit: 5 },
      { key: "pages", dateRanges: [cur], dimensions: [dim("pagePath")], metrics: ["screenPageViews", "activeUsers"].map(metric), limit: 25, orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] },
      {
        key: "events", dateRanges: [cur, prev], dimensions: [dim("eventName")], metrics: [metric("eventCount")], limit: 10,
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: ["view_item", "add_to_cart", "begin_checkout", "purchase"] } } },
      },
      { key: "visitorType", dateRanges: [cur], dimensions: [dim("newVsReturning")], metrics: ["activeUsers", "sessions", "engagementRate"].map(metric), limit: 5 },
    ],
    [
      // Tagged links (utm_campaign) for Overview › Marketing › Campaigns and links that sell; "(not set)" and
      // "(direct)"/"(organic)"/"(referral)" are Google's names for untagged visits and are left out by the Overview.
      { key: "campaigns", dateRanges: [cur], dimensions: [dim("sessionCampaignName"), dim("sessionSource"), dim("sessionMedium")], metrics: engagement, limit: 50, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] },
    ],
    // Visitor widgets (19 October 2026). Optional: Google refusing this batch never fails the report (see OPTIONAL_BATCHES).
    [
      // Time spent per page (engagement seconds are summed by GA; the Overview divides by views).
      { key: "pageTime", dateRanges: [cur], dimensions: [dim("pagePath")], metrics: ["screenPageViews", "activeUsers", "userEngagementDuration"].map(metric), limit: 50, orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] },
      // When visitors come: dayOfWeek "0" (Sunday) … "6", hour "00"…"23", in the property's time zone.
      { key: "when", dateRanges: [cur], dimensions: [dim("dayOfWeek"), dim("hour")], metrics: ["activeUsers", "sessions"].map(metric), limit: 200 },
      {
        key: "actions", dateRanges: [cur, prev], dimensions: [dim("eventName")], metrics: ["eventCount", "activeUsers"].map(metric), limit: 40,
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: ACTION_EVENTS } } },
      },
      // Pages read to the end (scroll fires at 90%) and pages that put books in the bag.
      {
        key: "pageActions", dateRanges: [cur], dimensions: [dim("pagePath"), dim("eventName")], metrics: [metric("eventCount")], limit: 300,
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: ["scroll", "add_to_cart", "view_item"] } } },
      },
      // Links followed away from the shop (enhanced measurement outbound clicks).
      {
        key: "outbound", dateRanges: [cur], dimensions: [dim("linkDomain")], metrics: ["eventCount", "activeUsers"].map(metric), limit: 15,
        dimensionFilter: { andGroup: { expressions: [
          { filter: { fieldName: "eventName", stringFilter: { value: "click" } } },
          { filter: { fieldName: "outbound", stringFilter: { value: "true" } } },
        ] } },
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      },
    ],
    // How visitors move (20 October 2026). Optional like the batch before it.
    [
      // Page → page: the page a view came from (page_referrer; the storefront sends the previous page on in-app moves).
      { key: "moves", dateRanges: [cur], dimensions: [dim("pageReferrer"), dim("pagePath")], metrics: [metric("screenPageViews")], limit: 1000, orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] },
      // First page, then what: per landing page and channel, how far visits went and whether they bought.
      { key: "landingPaths", dateRanges: [cur], dimensions: [dim("landingPage"), dim("sessionDefaultChannelGroup")], metrics: ["sessions", "engagedSessions", "screenPageViews", "ecommercePurchases"].map(metric), limit: 300, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] },
      // Book-card lists (Studio sections, lib/ga4Lists.ts): cards seen and cards opened per list.
      { key: "lists", dateRanges: [cur], dimensions: [dim("itemListName")], metrics: ["itemsViewedInList", "itemsClickedInList"].map(metric), limit: 50, orderBys: [{ metric: { metricName: "itemsViewedInList" }, desc: true }] },
      {
        key: "deviceSteps", dateRanges: [cur], dimensions: [dim("deviceCategory"), dim("eventName")], metrics: [metric("activeUsers")], limit: 50,
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: STEP_EVENTS } } },
      },
    ],
    // The shop's own events (20 October 2026), standard dimensions only. Optional.
    [
      {
        key: "newEvents", dateRanges: [cur], dimensions: [dim("eventName")], metrics: [metric("eventCount")], limit: 20,
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: SHOP_EVENTS } } },
      },
      // Addresses that showed the missing page, and the page (full URL, "" for none) that sent people there.
      { key: "notFound", dateRanges: [cur], dimensions: [dim("pagePath"), dim("pageReferrer")], metrics: [metric("eventCount")], limit: 200, dimensionFilter: onlyEvent("page_not_found"), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }] },
      {
        key: "bagPeeks", dateRanges: [cur], dimensions: [dim("pagePath"), dim("eventName")], metrics: [metric("eventCount")], limit: 300,
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: ["view_cart", "begin_checkout"] } } },
      },
    ],
    // The same events' own parameters (custom dimensions, CUSTOM_DEFINITIONS). Optional: an unregistered parameter makes
    // Google refuse its report (400), and the one-by-one retry then leaves only that report's key out.
    [
      { key: "navClicks", dateRanges: [cur], dimensions: [dim("customEvent:menu"), dim("customEvent:link_text")], metrics: [metric("eventCount")], limit: 200, dimensionFilter: onlyEvent("nav_click"), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }] },
      { key: "pdpActions", dateRanges: [cur], dimensions: [dim("customEvent:action"), dim("pagePath")], metrics: [metric("eventCount")], limit: 300, dimensionFilter: onlyEvent("pdp_interact"), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }] },
      { key: "pdpTabs", dateRanges: [cur], dimensions: [dim("customEvent:tab")], metrics: [metric("eventCount")], limit: 20, dimensionFilter: onlyEvent("pdp_interact") },
      { key: "filters", dateRanges: [cur], dimensions: [dim("customEvent:filter"), dim("customEvent:value")], metrics: [metric("eventCount")], limit: 200, dimensionFilter: onlyEvent("filter_use"), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }] },
      { key: "scrollDepth", dateRanges: [cur], dimensions: [dim("customEvent:percent"), dim("pagePath")], metrics: [metric("eventCount")], limit: 500, dimensionFilter: onlyEvent("scroll_depth"), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }] },
    ],
  ];
}

/** Batches whose failure sets their keys to null ("Google didn't answer") instead of failing the whole report. */
const OPTIONAL_BATCHES = [3, 4, 5, 6];
const VISITOR_KEYS = ["pageTime", "when", "actions", "pageActions", "outbound"];
const NAVIGATION_KEYS = ["moves", "landingPaths", "lists", "deviceSteps"];
/** Batch 6 (standard dimensions) and batch 7 (custom dimensions): passed through as plain rows. */
const EVENT_KEYS = ["newEvents", "notFound", "bagPeeks"];
const CUSTOM_EVENT_KEYS = Object.keys(CUSTOM_DEFINITIONS);

/** One API report → plain rows: `{ <dimension>: "…", <metric>: number }`, with `dateRange` when there are two windows. */
function rowsOf(report) {
  const dims = (report?.dimensionHeaders || []).map(h => h.name);
  const mets = (report?.metricHeaders || []).map(h => h.name);
  return (report?.rows || []).map(row => {
    const out = {};
    dims.forEach((d, i) => { out[d] = String(row.dimensionValues?.[i]?.value ?? ""); });
    mets.forEach((m, i) => { const n = Number(row.metricValues?.[i]?.value); out[m] = Number.isFinite(n) ? n : 0; });
    return out;
  });
}

const inRange = (rows, name) => rows.filter(r => !("dateRange" in r) || r.dateRange === name || r.dateRange === (name === "current" ? "date_range_0" : "date_range_1"));
const strip = rows => rows.map(({ dateRange, ...rest }) => rest);
const gaDay = v => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v);

/** Realtime "pages open now" body → rows by page title, most people first; null when the call failed. */
function realtimePagesOf(body) {
  if (!body || typeof body !== "object") return null;
  return rowsOf(body)
    .map(r => ({ unifiedScreenName: r.unifiedScreenName || "", activeUsers: r.activeUsers || 0, screenPageViews: r.screenPageViews || 0 }))
    .sort((a, b) => b.activeUsers - a.activeUsers);
}

/** Realtime people-per-minute body → 30 rows, minutesAgo 0..29 ascending, missing minutes = 0; null when the call failed. */
function realtimeMinutesOf(body) {
  if (!body || typeof body !== "object") return null;
  const out = Array.from({ length: 30 }, (_, m) => ({ minutesAgo: m, activeUsers: 0 }));
  rowsOf(body).forEach(r => {
    const m = Number(r.minutesAgo);
    if (Number.isInteger(m) && m >= 0 && m < 30) out[m].activeUsers += r.activeUsers || 0;
  });
  return out;
}

/** Per-event `{ eventCount, activeUsers }` for one window of the actions report. */
const eventMap = rows => Object.fromEntries(rows.map(r => [r.eventName, { eventCount: r.eventCount || 0, activeUsers: r.activeUsers || 0 }]));

/**
 * The API's batch answers → the compact report the Overview draws (in buildBatches order). An optional batch with
 * `response: null` (refused or unanswered) sets its keys to null; `response: undefined` (not asked) leaves them out.
 * `extra = { pages, minutes, refused }`: the raw realtime bodies (or null when they failed) and the report keys Google
 * refused with a 400 on the one-by-one retry (sent as `refusedReports`).
 */
function shapeReport(batches, realtime, extra = {}) {
  // An optional batch Google refused or didn't answer (any status), or one of its reports refused on the one-by-one retry,
  // comes out as `<key>: null` ("Google didn't answer"); a key that is absent means a server older than that report.
  const reports = {};
  batches.forEach(({ requests, response }, b) => {
    const optional = OPTIONAL_BATCHES.includes(b);
    requests.forEach((req, i) => {
      if (response === undefined) return;
      if (response === null) { if (optional) reports[req.key] = null; return; }
      const one = response?.reports?.[i];
      if (one === null) { if (optional) reports[req.key] = null; return; } // a single report that failed on its own retry
      reports[req.key] = rowsOf(one);
    });
  });
  /** `{ key: value }` for an answered report, `{ key: null }` for one Google didn't answer, `{}` when it wasn't asked. */
  const pass = (key, shape = strip) => (key in reports ? { [key]: reports[key] === null ? null : shape(reports[key]) } : {});
  const totals = (name) => strip(inRange(reports.totals || [], name))[0] || {};
  const events = (name) => Object.fromEntries(strip(inRange(reports.events || [], name)).map(r => [r.eventName, r.eventCount]));
  const days = (name) => strip(inRange(reports.byDate || [], name)).map(r => ({ ...r, date: gaDay(r.date) })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    totals: { current: totals("current"), previous: totals("previous") },
    byDate: { current: days("current"), previous: days("previous") },
    channels: strip(reports.channels || []),
    sources: strip(reports.sources || []),
    landing: strip(reports.landing || []),
    countries: strip(reports.countries || []),
    devices: strip(reports.devices || []),
    pages: strip(reports.pages || []),
    visitorType: strip(reports.visitorType || []),
    campaigns: strip(reports.campaigns || []),
    events: { current: events("current"), previous: events("previous") },
    activeNow: realtime === null ? null : Number(rowsOf(realtime)[0]?.activeUsers) || 0,
    ...pass("pageTime"),
    ...pass("when"),
    ...pass("actions", rows => ({ current: eventMap(strip(inRange(rows, "current"))), previous: eventMap(strip(inRange(rows, "previous"))) })),
    ...pass("pageActions"),
    ...pass("outbound"),
    ...Object.assign({}, ...[...NAVIGATION_KEYS, ...EVENT_KEYS, ...CUSTOM_EVENT_KEYS].map(k => pass(k))),
    // Reports Google refused on the one-by-one retry with a request error (400): for a custom-dimension report that means
    // its event parameters aren't registered in Admin › Custom definitions yet.
    ...(Array.isArray(extra.refused) && extra.refused.length ? { refusedReports: [...extra.refused] } : {}),
    ...("pages" in extra ? { realtimePages: realtimePagesOf(extra.pages) } : {}),
    ...("minutes" in extra ? { realtimeMinutes: realtimeMinutesOf(extra.minutes) } : {}),
  };
}

/** A Google error → what the owner should do about it. */
function gaErrorMessage(status, body, serviceAccount) {
  const msg = String(body?.error?.message || "");
  const reason = JSON.stringify(body?.error?.details || "");
  if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(msg + reason)) {
    return { code: "api_disabled", error: "The Google Analytics Data API is switched off for this Firebase project. Open the link below, press Enable, wait a minute and check again." };
  }
  if (status === 403 || /permission|does not have sufficient/i.test(msg)) {
    return { code: "no_access", error: `Google Analytics hasn't given the shop access yet. In Google Analytics › Admin › Property access management, add ${serviceAccount || "the shop's service account"} as a Viewer.` };
  }
  if (status === 404 || /not found/i.test(msg)) return { code: "not_found", error: "Google Analytics doesn't know that property ID. Check the number in Admin › Property details." };
  if (status === 429 || /quota/i.test(msg)) return { code: "quota", error: "Google Analytics is busy (quota reached). Try again in an hour." };
  if (status === 400) return { code: "bad_request", error: "Google Analytics refused the request. Check the property ID." };
  return { code: "unavailable", error: "Google Analytics couldn't be reached just now. Try again in a minute." };
}

async function fetchJson(fetchImpl, url, init) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, { ...init, ...(ctrl ? { signal: ctrl.signal } : {}) });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, ok: res.ok, body };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The running service account's token (scoped to Analytics, read only) and email, from the metadata server. */
async function metadataCredentials(fetchImpl, scope = SCOPE) {
  const headers = { "Metadata-Flavor": "Google" };
  const token = await fetchJson(fetchImpl, `${METADATA}token?scopes=${encodeURIComponent(scope)}`, { headers });
  if (!token.ok || !token.body?.access_token) throw Object.assign(new Error("No service-account token"), { code: "no_token" });
  let email = "";
  try {
    const res = await fetchImpl(`${METADATA}email`, { headers });
    if (res.ok) email = String(await res.text()).trim();
  } catch { email = ""; }
  return { accessToken: token.body.access_token, email };
}

/**
 * The web streams' measurement IDs ("G-…") on the property, read through the Analytics Admin API with the same read-only
 * token; null when Google didn't answer (Admin API not switched on in the project, no access). Lets the admin say when the
 * property it reads doesn't hold the tag the storefront sends (settings/website.analytics.ga4MeasurementId).
 */
function streamIdsOf(res) {
  if (!res || !res.ok || !res.body || typeof res.body !== "object") return null;
  return (Array.isArray(res.body.dataStreams) ? res.body.dataStreams : [])
    .map(s => String(s?.webStreamData?.measurementId || "").toUpperCase())
    .filter(Boolean);
}

/**
 * The admin action. deps: `readSettings()` → { propertyId }, `allow()` → rate limit, `credentials()` → { accessToken, email },
 * `fetchImpl`, `projectId`. op "status" checks the connection with one tiny report; op "report" returns the Overview's figures.
 */
async function handleGa4Report(body, deps) {
  const op = body?.op === "status" ? "status" : "report";
  if (!(await deps.allow())) return { status: 429, body: { error: "Too many Google Analytics requests. Wait a few minutes." } };
  const saved = await deps.readSettings();
  const propertyId = cleanPropertyId(saved?.propertyId);
  let creds = { accessToken: "", email: "" };
  try { creds = await deps.credentials(); } catch {
    return { status: 200, body: { connected: false, code: "no_token", error: "The shop's server couldn't get a Google sign-in. This works only on the deployed Functions, not locally." } };
  }
  const base = { serviceAccount: creds.email, propertyId, enableApiUrl: `https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com?project=${encodeURIComponent(deps.projectId || "")}` };
  if (!propertyId) return { status: 200, body: { ...base, connected: false, code: "no_property", error: "Add your GA4 property ID first." } };

  const auth = { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" };
  const post = (path, payload) => fetchJson(deps.fetchImpl, `${DATA_API}${propertyId}:${path}`, { method: "POST", headers: auth, body: JSON.stringify(payload) });
  const fail = res => ({ status: 200, body: { ...base, connected: false, ...gaErrorMessage(res.status, res.body, creds.email) } });
  const streams = () => fetchJson(deps.fetchImpl, `${ADMIN_API}${propertyId}/dataStreams?pageSize=50`, { headers: auth })
    .then(streamIdsOf, () => null);

  if (op === "status") {
    const [res, streamIds] = await Promise.all([post("runRealtimeReport", { metrics: [{ name: "activeUsers" }] }), streams()]);
    if (!res.ok) return fail(res);
    return { status: 200, body: { ...base, connected: true, activeNow: Number(rowsOf(res.body)[0]?.activeUsers) || 0, streamIds } };
  }

  const range = cleanRange(body?.range);
  if (!range) return { status: 400, body: { error: "Choose a valid date range." } };
  const batches = buildBatches(range);
  const asBatch = requests => post("batchRunReports", { requests: requests.map(({ key, ...r }) => r) });
  // Asked together so the whole read stays well inside the endpoint's time limit.
  const [streamIds, realtime, livePages, liveMinutes, ...results] = await Promise.all([
    streams(),
    post("runRealtimeReport", { metrics: [{ name: "activeUsers" }] }),
    post("runRealtimeReport", { dimensions: [{ name: "unifiedScreenName" }], metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }], limit: 10 }),
    post("runRealtimeReport", { dimensions: [{ name: "minutesAgo" }], metrics: [{ name: "activeUsers" }], limit: 30 }),
    ...batches.map(asBatch),
  ]);
  const failed = results.find((res, i) => !OPTIONAL_BATCHES.includes(i) && !res.ok);
  if (failed) return fail(failed);
  const answers = batches.map((requests, i) => ({ requests, response: results[i].ok ? results[i].body : null }));
  // One refused report fails its whole batch: when an optional batch is refused for a request reason (not access or
  // quota, which the other batches would have hit too), ask its reports one by one and keep those Google accepts.
  const refused = [];
  await Promise.all(OPTIONAL_BATCHES.map(async b => {
    const optional = results[b];
    if (!optional || optional.ok || optional.status !== 400) return;
    const singles = await Promise.all(batches[b].map(req => asBatch([req]).catch(() => ({ ok: false }))));
    singles.forEach((res, i) => { if (!res.ok && res.status === 400) refused.push(batches[b][i].key); });
    answers[b] = { requests: batches[b], response: { reports: singles.map(res => (res.ok ? res.body?.reports?.[0] || {} : null)) } };
  }));
  const extra = { pages: livePages.ok ? livePages.body : null, minutes: liveMinutes.ok ? liveMinutes.body : null, refused };
  return { status: 200, body: { ...base, connected: true, range, streamIds, report: shapeReport(answers, realtime.ok ? realtime.body : null, extra) } };
}

module.exports = {
  cleanPropertyId, propertyIdProblem, cleanRange, buildBatches, rowsOf, shapeReport, streamIdsOf, realtimePagesOf, realtimeMinutesOf, ACTION_EVENTS, STEP_EVENTS, SHOP_EVENTS, CUSTOM_DEFINITIONS, VISITOR_KEYS, NAVIGATION_KEYS, EVENT_KEYS, CUSTOM_EVENT_KEYS, OPTIONAL_BATCHES, gaErrorMessage, handleGa4Report, metadataCredentials, fetchJson,
};
