// Microsoft Clarity (heatmaps + session recordings) on the storefront. The project ID is set in Settings › General ›
// Microsoft Clarity and published as `settings/website.analytics.clarityProjectId`. Clarity's tag loads only when the
// visit may be counted (`googleTrackingAllowed`, the same rule as Google Analytics: analytics not declined, not the
// Studio preview or a share link, not the owner's browser, not a robot, not the shop owner signed in), never in the
// prerender (it declines analytics) and never on pages with personal details: admin, the Studio fixture, checkout,
// account and order tracking. Moving to one of those pages after Clarity started stops it (`clarity("stop")`);
// coming back starts it again (`clarity("start")`). Clarity is never told about Microsoft Ads (ad_Storage denied),
// and is told analytics storage is granted only when the shopper explicitly accepted analytics cookies.
import { CONSENT_EVENT, CONSENT_KEY, consentAllows } from "./consent";
import { googleTrackingAllowed } from "./trackingGuard";
import { afterPageLoad } from "./afterPageLoad";

const BASE = (import.meta.env?.BASE_URL || "/").replace(/\/$/, "");

let projectId = "";
let loaded = false;
let stopped = false;
let allowed: Promise<boolean> | null = null;
let listening = false;

/**
 * A Clarity project ID (letters and digits, as shown in the project's address, e.g. "abc12def34"), lower-cased; a
 * pasted project link (…/projects/view/<id>/…) is accepted too. "" when it isn't one.
 */
export function cleanClarityId(value: unknown): string {
  let v = String(value ?? "").trim();
  const fromLink = v.match(/\/projects\/view\/([A-Za-z0-9]+)(?:[/?#]|$)/);
  if (fromLink) v = fromLink[1];
  v = v.toLowerCase();
  return /^[a-z0-9]{6,20}$/.test(v) ? v : "";
}

/** Clarity's own pages for a project (admin links). */
export const clarityUrls = (id: string) => {
  const base = `https://clarity.microsoft.com/projects/view/${encodeURIComponent(id)}`;
  return { dashboard: `${base}/dashboard`, heatmaps: `${base}/heatmaps`, recordings: `${base}/impressions` };
};

/** Pages Clarity never records: they show addresses, order details or the admin. `path` may include the site base. */
const BLOCKED = /^\/(admin|studio-fixture|checkout|account|track)(\/|\.|$)/;
export function clarityAllowedPath(path: string, base = BASE): boolean {
  let p = String(path || "/");
  if (base && (p === base || p.startsWith(`${base}/`))) p = p.slice(base.length) || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  return !BLOCKED.test(p);
}

/** True only when the shopper explicitly accepted analytics cookies (not just "hasn't answered yet"). */
function analyticsAccepted(): boolean {
  try { return JSON.parse(window.localStorage.getItem(CONSENT_KEY) || "null")?.analytics === true; }
  catch { return false; }
}

function clarity(...args: unknown[]) {
  const w = window as any;
  w.clarity = w.clarity || function queued() { (w.clarity.q = w.clarity.q || []).push(arguments); };
  w.clarity(...args);
}

const consentSignal = () => ({ ad_Storage: "denied", ...(analyticsAccepted() ? { analytics_Storage: "granted" } : {}) });

function load(id: string) {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  clarity("consentv2", consentSignal());
  afterPageLoad(() => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  });
}

const here = () => (typeof window === "undefined" ? "/" : window.location.pathname);

async function maybeStart() {
  if (!projectId || typeof window === "undefined" || !clarityAllowedPath(here())) return;
  allowed = allowed || googleTrackingAllowed().catch(() => false);
  const ok = await allowed;
  // Re-check after the wait: the shopper may have declined or moved to checkout meanwhile.
  if (!ok || !consentAllows("analytics") || !clarityAllowedPath(here())) return;
  if (!loaded) load(projectId);
  else if (stopped) { stopped = false; clarity("start"); }
}

function stop() {
  if (!loaded || stopped) return;
  stopped = true;
  clarity("stop");
}

/** Called whenever the route changes (App.tsx): stops recording on private pages, resumes on public ones. */
export function clarityRoute() {
  if (!projectId || typeof window === "undefined") return;
  if (!clarityAllowedPath(here())) stop();
  else void maybeStart();
}

/** Called once the public settings are read. A missing or invalid ID keeps Clarity off. */
export function configureClarity(value: unknown) {
  const id = cleanClarityId(value);
  if (!id || projectId || typeof window === "undefined") return;
  projectId = id;
  if (!listening) {
    listening = true;
    window.addEventListener(CONSENT_EVENT, () => {
      allowed = null; // the earlier answer depended on the old choice
      if (!consentAllows("analytics")) {
        if (loaded) clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
        stop();
        return;
      }
      if (loaded) clarity("consentv2", consentSignal());
      clarityRoute();
    });
  }
  clarityRoute();
}

/** Test hook: forget the module state between tests. */
export function __resetClarityForTests() { projectId = ""; loaded = false; stopped = false; allowed = null; listening = false; }
