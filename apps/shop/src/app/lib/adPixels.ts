// Ad tracking codes (gap list 37, 13 November 2026): the Meta (Facebook and Instagram) pixel, the Pinterest tag and the
// TikTok pixel, set in Settings › General › Ad tracking and published as `settings/website.analytics.metaPixelId`,
// `pinterestTagId` and `tiktokPixelId`. Tied to the cookie banner: nothing loads or is sent until the shopper says yes
// to marketing cookies (consentAllows("marketing"); undecided counts as yes only when the owner switched the banner
// off), and never in the Studio preview or a share link, in the owner's browser, for robots, or on admin, account and
// order tracking pages. A shopper who later says no stops every further event (Meta is also told to forget consent).
// Each page sends a page view; a paid order sends one purchase (value and currency only, never names or addresses).
import { CONSENT_EVENT, consentAllows } from "./consent";
import { inEditorPreview } from "./trackingGuard";
import { inThemePreview } from "../features/site/themePreview";
import { isOwnerDevice, isShopOwner, looksAutomated } from "./ownerDevice";
import { restoredUser } from "../../lib/authSession";
import { afterPageLoad } from "./afterPageLoad";

export type AdIds = { meta: string; pinterest: string; tiktok: string };

/** A Meta pixel ID: digits only, as Events Manager shows it. "" when it isn't one. */
export function cleanMetaPixelId(value: unknown): string {
  const v = String(value ?? "").trim();
  return /^\d{10,20}$/.test(v) ? v : "";
}
/** A Pinterest tag ID: digits only (Ads › Conversions › Tag manager). "" when it isn't one. */
export function cleanPinterestTagId(value: unknown): string {
  const v = String(value ?? "").trim();
  return /^\d{10,16}$/.test(v) ? v : "";
}
/** A TikTok pixel ID: capital letters and digits (Events Manager › Web events). "" when it isn't one. */
export function cleanTiktokPixelId(value: unknown): string {
  const v = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{15,25}$/.test(v) ? v : "";
}

/** The saved IDs from a settings object (admin or public), cleaned. */
export function adIdsOf(settings: any): AdIds {
  const a = settings?.analytics || {};
  return { meta: cleanMetaPixelId(a.metaPixelId), pinterest: cleanPinterestTagId(a.pinterestTagId), tiktok: cleanTiktokPixelId(a.tiktokPixelId) };
}

const BASE = (import.meta.env?.BASE_URL || "/").replace(/\/$/, "");
const BLOCKED = /^\/(admin|studio-fixture|account|track)(\/|\.|$)/;
/** Pages that never send a page view to ad companies: the admin and pages with a shopper's own details. */
export function adsAllowedPath(path: string, base = BASE): boolean {
  let p = String(path || "/");
  if (base && (p === base || p.startsWith(`${base}/`))) p = p.slice(base.length) || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  return !BLOCKED.test(p);
}

let ids: AdIds = { meta: "", pinterest: "", tiktok: "" };
const loaded = { meta: false, pinterest: false, tiktok: false };
let listening = false;
let owner: Promise<boolean> | null = null;

/** Whether ad companies may hear about this shopper right now. */
async function adsAllowed(): Promise<boolean> {
  if (typeof window === "undefined" || inEditorPreview() || inThemePreview() || !consentAllows("marketing") || isOwnerDevice() || looksAutomated()) return false;
  owner = owner || restoredUser(1500).then(u => !!u && isShopOwner(u.email)).catch(() => false);
  if (await owner) return false;
  return consentAllows("marketing"); // the shopper may have changed their mind while we waited
}

function addScript(src: string) {
  afterPageLoad(() => {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  });
}

function loadMeta(id: string) {
  const w = window as any;
  if (!w.fbq) {
    const n: any = function fbq(...args: unknown[]) { n.callMethod ? n.callMethod(...args) : n.queue.push(args); };
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    w.fbq = n; if (!w._fbq) w._fbq = n;
    addScript("https://connect.facebook.net/en_US/fbevents.js");
  }
  w.fbq("consent", "grant");
  w.fbq("init", id);
}

function loadPinterest(id: string) {
  const w = window as any;
  if (!w.pintrk) {
    const p: any = function pintrk(...args: unknown[]) { p.queue.push(args); };
    p.queue = []; p.version = "3.0";
    w.pintrk = p;
    addScript("https://s.pinimg.com/ct/core.js");
  }
  w.pintrk("load", id);
}

const TIKTOK_METHODS = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
function loadTiktok(id: string) {
  const w = window as any;
  w.TiktokAnalyticsObject = "ttq";
  const ttq: any = (w.ttq = w.ttq || []);
  if (!ttq.methods) {
    ttq.methods = TIKTOK_METHODS;
    ttq.setAndDefer = (t: any, e: string) => { t[e] = (...args: unknown[]) => { t.push([e, ...args]); }; };
    for (const m of TIKTOK_METHODS) ttq.setAndDefer(ttq, m);
    ttq.instance = (t: string) => { const e = ttq._i[t] || []; for (const m of TIKTOK_METHODS) ttq.setAndDefer(e, m); return e; };
    ttq.load = (e: string, n?: unknown) => {
      const r = "https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r;
      ttq._t = ttq._t || {}; ttq._t[e] = +new Date();
      ttq._o = ttq._o || {}; ttq._o[e] = n || {};
      addScript(`${r}?sdkid=${encodeURIComponent(e)}&lib=ttq`);
    };
  }
  ttq.load(id);
}

/** Loads whichever codes are set and allowed (once each). True when at least one is ready. */
async function ready(): Promise<boolean> {
  if (!ids.meta && !ids.pinterest && !ids.tiktok) return false;
  if (!(await adsAllowed())) return false;
  if (ids.meta && !loaded.meta) { loaded.meta = true; loadMeta(ids.meta); }
  if (ids.pinterest && !loaded.pinterest) { loaded.pinterest = true; loadPinterest(ids.pinterest); }
  if (ids.tiktok && !loaded.tiktok) { loaded.tiktok = true; loadTiktok(ids.tiktok); }
  return true;
}

const here = () => (typeof window === "undefined" ? "/" : window.location.pathname);
let lastPage = "";

/** Called whenever the route changes (App.tsx): one page view per page, on public pages only. */
export async function adPixelsRoute(): Promise<void> {
  const path = here();
  if (!adsAllowedPath(path) || path === lastPage) return;
  if (!(await ready())) return;
  if (here() !== path) return;
  lastPage = path;
  const w = window as any;
  if (loaded.meta) w.fbq("track", "PageView");
  if (loaded.pinterest) w.pintrk("page");
  if (loaded.tiktok) w.ttq.page();
}

/** A paid order, once (commerce.ts trackPurchase decides that): the amount and currency, nothing about the shopper. */
export async function adPixelsPurchase(orderId: string, value: number, currency: string): Promise<void> {
  if (!orderId || !(value >= 0) || !(await ready())) return;
  const w = window as any;
  const cur = /^[A-Z]{3}$/.test(currency) ? currency : "CAD";
  if (loaded.meta) w.fbq("track", "Purchase", { value, currency: cur }, { eventID: orderId });
  if (loaded.pinterest) w.pintrk("track", "checkout", { value, currency: cur, order_id: orderId });
  if (loaded.tiktok) w.ttq.track("CompletePayment", { value, currency: cur, content_type: "product" }, { event_id: orderId });
}

/** Called once the public settings are read. Missing or invalid IDs keep that company's code off. */
export function configureAdPixels(settings: any) {
  if (typeof window === "undefined") return;
  const next = adIdsOf(settings);
  if (!next.meta && !next.pinterest && !next.tiktok) return;
  ids = { meta: ids.meta || next.meta, pinterest: ids.pinterest || next.pinterest, tiktok: ids.tiktok || next.tiktok };
  if (!listening) {
    listening = true;
    window.addEventListener(CONSENT_EVENT, () => {
      if (!consentAllows("marketing")) {
        if (loaded.meta) (window as any).fbq("consent", "revoke");
        lastPage = "";
        return;
      }
      if (loaded.meta) (window as any).fbq("consent", "grant");
      void adPixelsRoute();
    });
  }
  void adPixelsRoute();
}

/** Test hook: forget the module state between tests. */
export function __resetAdPixelsForTests() {
  ids = { meta: "", pinterest: "", tiktok: "" };
  loaded.meta = loaded.pinterest = loaded.tiktok = false;
  listening = false; owner = null; lastPage = "";
}
