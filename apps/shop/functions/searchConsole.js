// Google Search Console for the admin Overview (createStripeCheckoutSession `action: "searchConsole"`, admin only):
// what people typed into Google before they saw or clicked the shop, and which pages Google showed. The Functions' own
// service account reads it, exactly like Google Analytics (functions/googleAnalytics.js): no key is stored. The owner
// adds that service account's email as a user of the Search Console property once and enables the Search Console API.
// The chosen property ("sc-domain:…" or "https://…/") lives in admin-only adminSecrets/googleAnalytics.searchConsoleSite.
// Nothing here writes to Firestore.
const { cleanRange, fetchJson } = require("./googleAnalytics");

const API = "https://searchconsole.googleapis.com/webmasters/v3/";
const INSPECT_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const MAX_INSPECT = 30;
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const SHOP_HOST = "lyricalmyricalbooks.com";

/** A Search Console property name as Google writes it, or "" when it isn't one. */
function cleanSite(value) {
  const s = String(value || "").trim();
  if (/^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return s.toLowerCase();
  if (/^https?:\/\/[^\s/]+\/(?:[^\s]*\/)?$/i.test(s) && s.length <= 300) return s;
  return "";
}

/**
 * Which property to read: the saved one when Google still lists it, else the shop's own domain, else the only one.
 * Null when there is nothing (or more than one unrelated property) to pick from.
 */
function pickSite(saved, sites) {
  const names = sites.map(s => s.siteUrl);
  const clean = cleanSite(saved);
  if (clean && names.includes(clean)) return clean;
  const own = [`sc-domain:${SHOP_HOST}`, `https://${SHOP_HOST}/`, `https://www.${SHOP_HOST}/`].find(n => names.includes(n));
  if (own) return own;
  return names.length === 1 ? names[0] : null;
}

/** A Google error → what the owner should do about it. */
function scErrorMessage(status, body, serviceAccount) {
  const msg = String(body?.error?.message || "");
  const reason = JSON.stringify(body?.error?.details || body?.error?.errors || "");
  if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(msg + reason)) {
    return { code: "api_disabled", error: "The Google Search Console API is switched off for this Firebase project. Open the link below, press Enable, wait a minute and check again." };
  }
  if (status === 403 || /permission|does not have sufficient/i.test(msg)) {
    return { code: "no_access", error: `Search Console hasn't given the shop access yet. In Search Console › Settings › Users and permissions › Add user, add ${serviceAccount || "the shop's service account"} with Restricted permission.` };
  }
  if (status === 429 || /quota/i.test(msg)) return { code: "quota", error: "Search Console is busy (quota reached). Try again in an hour." };
  if (status === 400) return { code: "bad_request", error: "Search Console refused the request. Pick the property again in Settings › General › Google Search Console." };
  return { code: "unavailable", error: "Search Console couldn't be reached just now. Try again in a minute." };
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** API rows → `{ key, clicks, impressions, ctr (0–100), position }`. */
function shapeRows(body) {
  return (body?.rows || []).map(r => ({
    key: String(r.keys?.[0] ?? ""),
    clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr) * 100, position: num(r.position),
  }));
}
function shapeTotals(body) {
  const r = body?.rows?.[0];
  return { clicks: num(r?.clicks), impressions: num(r?.impressions), ctr: num(r?.ctr) * 100, position: num(r?.position) };
}

/** Does this page belong to the property? ("sc-domain:shop.com" covers shop.com and its sub-domains.) */
function inSite(url, site) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  if (site.startsWith("sc-domain:")) {
    const host = site.slice(10);
    return u.hostname === host || u.hostname.endsWith(`.${host}`);
  }
  return u.href.startsWith(site);
}

/** URL Inspection API answer → what the Books › Google indexing list shows. Google's own words are kept. */
function shapeInspection(url, body) {
  const r = body?.inspectionResult || {};
  const idx = r.indexStatusResult || {};
  return {
    url,
    verdict: ["PASS", "PARTIAL", "FAIL", "NEUTRAL"].includes(idx.verdict) ? idx.verdict : "UNKNOWN",
    coverageState: String(idx.coverageState || ""),
    lastCrawlTime: String(idx.lastCrawlTime || ""),
    googleCanonical: String(idx.googleCanonical || ""),
    robotsTxtState: String(idx.robotsTxtState || ""),
    indexingState: String(idx.indexingState || ""),
    link: /^https:\/\/search\.google\.com\//.test(String(r.inspectionResultLink || "")) ? String(r.inspectionResultLink) : "",
  };
}

/** Runs `work` over `items`, `limit` at a time, keeping their order. */
async function eachLimited(items, limit, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await work(items[i], i); }
  }));
  return out;
}

/**
 * The admin action. deps: `readSettings()` → { searchConsoleSite }, `allow()` → rate limit, `credentials()` →
 * { accessToken, email }, `fetchImpl`, `projectId`. op "status" lists the properties the shop can read and the one in
 * use; op "report" returns totals for both windows plus the top searches and pages for the current one.
 */
async function handleSearchConsole(body, deps) {
  const op = body?.op === "status" ? "status" : body?.op === "inspect" ? "inspect" : "report";
  if (!(await deps.allow())) return { status: 429, body: { error: "Too many Search Console requests. Wait a few minutes." } };
  const saved = await deps.readSettings();
  let creds = { accessToken: "", email: "" };
  try { creds = await deps.credentials(); } catch {
    return { status: 200, body: { connected: false, code: "no_token", error: "The shop's server couldn't get a Google sign-in. This works only on the deployed Functions, not locally." } };
  }
  const base = { serviceAccount: creds.email, enableApiUrl: `https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=${encodeURIComponent(deps.projectId || "")}` };
  const headers = { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" };
  const fail = res => ({ status: 200, body: { ...base, connected: false, ...scErrorMessage(res.status, res.body, creds.email) } });

  const list = await fetchJson(deps.fetchImpl, `${API}sites`, { headers });
  if (!list.ok) return fail(list);
  const sites = (list.body?.siteEntry || [])
    .filter(s => s && s.siteUrl && s.permissionLevel !== "siteUnverifiedUser")
    .map(s => ({ siteUrl: String(s.siteUrl), permissionLevel: String(s.permissionLevel || "") }));
  const site = pickSite(saved?.searchConsoleSite, sites);
  if (!sites.length) {
    return { status: 200, body: { ...base, connected: false, sites, code: "no_access", error: `Search Console hasn't given the shop access yet. In Search Console › Settings › Users and permissions › Add user, add ${creds.email || "the shop's service account"} with Restricted permission.` } };
  }
  if (!site) return { status: 200, body: { ...base, connected: false, sites, code: "pick_site", error: "Pick which Search Console property is the shop." } };
  if (op === "status") return { status: 200, body: { ...base, connected: true, sites, site } };
  if (op === "inspect") {
    // Books › Google indexing: is each book page in Google's index? (URL Inspection API, 2,000 checks a day per property.)
    const urls = [...new Set((Array.isArray(body?.urls) ? body.urls : []).filter(u => typeof u === "string" && u.length <= 500))];
    if (!urls.length || urls.length > MAX_INSPECT) return { status: 400, body: { error: `Send between 1 and ${MAX_INSPECT} page addresses.` } };
    const outside = urls.filter(u => !inSite(u, site));
    if (outside.length) return { status: 200, body: { ...base, connected: true, sites, site, code: "outside_site", error: `These pages aren't in the Search Console property ${site}: open the admin on the shop's own address and try again.`, results: [] } };
    let refused = null;
    const results = await eachLimited(urls, 4, async url => {
      if (refused) return { url, verdict: "UNKNOWN", error: true };
      const res = await fetchJson(deps.fetchImpl, INSPECT_API, { method: "POST", headers, body: JSON.stringify({ inspectionUrl: url, siteUrl: site, languageCode: "en-US" }) })
        .catch(() => ({ ok: false, status: 0, body: null }));
      if (!res.ok) { refused = refused || res; return { url, verdict: "UNKNOWN", error: true }; }
      return shapeInspection(url, res.body);
    });
    if (refused && results.every(r => r.error)) {
      const out = fail(refused);
      if (out.body.code === "no_access") out.body.error += " If it is already there, change its permission to Full: some checks need it.";
      return out;
    }
    return { status: 200, body: { ...base, connected: true, sites, site, results, sitemapsUrl: `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(site)}` } };
  }

  const range = cleanRange(body?.range);
  if (!range) return { status: 400, body: { error: "Pick a valid date range." } };
  const query = payload => fetchJson(deps.fetchImpl, `${API}sites/${encodeURIComponent(site)}/searchAnalytics/query`, { method: "POST", headers, body: JSON.stringify(payload) });
  const cur = { startDate: range.startDate, endDate: range.endDate, dataState: "all" };
  const results = await Promise.all([
    query(cur),
    query({ startDate: range.prevStartDate, endDate: range.prevEndDate, dataState: "all" }),
    query({ ...cur, dimensions: ["query"], rowLimit: 25 }),
    query({ ...cur, dimensions: ["page"], rowLimit: 15 }),
  ]);
  const failed = results.find(r => !r.ok);
  if (failed) return fail(failed);
  const [now, before, queries, pages] = results;
  return {
    status: 200,
    body: {
      ...base, connected: true, sites, site, range,
      report: { totals: { current: shapeTotals(now.body), previous: shapeTotals(before.body) }, queries: shapeRows(queries.body), pages: shapeRows(pages.body) },
    },
  };
}

module.exports = { SCOPE, cleanSite, pickSite, scErrorMessage, shapeRows, handleSearchConsole, inSite, shapeInspection };
