// How a shopper found the shop, saved on their order as `acquisition` (Order detail › Customer › How they found you,
// Orders CSV). Recorded when a page loads (App.tsx) and kept in localStorage for 30 days, so a shopper who came from
// Instagram and returned by typing the address later still credits Instagram ("last non-direct click", Google
// Analytics' default). Only the referring page's host + path and the landing page's path are kept: query strings
// carry emailed tokens, order keys and sign-in codes. The order stores it as one JSON string of at most
// ACQUISITION_JSON_MAX characters (`encodeAcquisition`; firestore.rules checks only that, because a per-key check
// of a map went past the rules' expression budget). functions/acquisition.js is the server's copy.
import { referralSourceOf } from "./referralSource";

export type Acquisition = {
  source: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  referrer?: string;
  landingPage?: string;
  clickId?: string;
  firstSeenAt: string;
};

export const ACQUISITION_KEYS = ["source", "medium", "campaign", "term", "content", "referrer", "landingPage", "clickId", "firstSeenAt"] as const;
export const ACQUISITION_MAX = 200;
export const ACQUISITION_JSON_MAX = 2000;
export const VISIT_SOURCE_KEY = "lm:visit-source";
export const VISIT_SOURCE_DAYS = 30;

const SEARCH = ["google", "bing", "duckduckgo", "yahoo", "ecosia", "baidu", "yandex", "qwant", "startpage", "brave"];
const SOCIAL = ["instagram", "facebook", "twitter", "tiktok", "pinterest", "linkedin", "reddit", "threads", "bsky", "youtube", "x.com", "lnkd", "messenger", "whatsapp"];
// Ad click ids: which ad network the click came from when no utm tags say so.
const CLICK_IDS: Array<[string, string, string]> = [
  ["gclid", "google", "cpc"], ["gbraid", "google", "cpc"], ["wbraid", "google", "cpc"],
  ["fbclid", "facebook", "social"], ["msclkid", "bing", "cpc"], ["ttclid", "tiktok", "cpc"], ["li_fat_id", "linkedin", "cpc"],
];

const clip = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, ACQUISITION_MAX);
const lower = (v: unknown) => clip(v).toLowerCase();

const mediumOf = (source: string) =>
  SEARCH.some(s => source.includes(s)) ? "organic" : SOCIAL.some(s => source.includes(s)) ? "social" : "referral";

/**
 * The source of one page load, or null when it says nothing new (a link from the shop's own pages).
 * A visit with no referrer and no tags is `direct`.
 */
export function visitSourceFrom(href: string, referrer: string, now: Date = new Date()): Acquisition | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const params = url.searchParams;
  let ref: URL | null = null;
  try { ref = referrer ? new URL(referrer) : null; } catch { ref = null; }
  const external = ref && ref.hostname !== url.hostname ? ref : null;
  const base: Pick<Acquisition, "landingPage" | "firstSeenAt" | "referrer"> = {
    landingPage: clip(url.pathname || "/"),
    firstSeenAt: now.toISOString(),
    ...(external ? { referrer: clip(external.hostname + (external.pathname === "/" ? "" : external.pathname)) } : {}),
  };
  const tidy = (a: Acquisition): Acquisition =>
    Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === "string" && v !== "")) as Acquisition;
  const clickId = CLICK_IDS.find(([key]) => params.get(key));

  const utmSource = lower(params.get("utm_source"));
  if (utmSource) {
    return tidy({
      ...base, source: utmSource,
      medium: lower(params.get("utm_medium")) || (clickId ? clickId[2] : ""),
      campaign: clip(params.get("utm_campaign")), term: clip(params.get("utm_term")), content: clip(params.get("utm_content")),
      clickId: clickId ? clickId[0] : "",
    });
  }
  if (clickId) {
    const fromRef = external ? referralSourceOf(external.href, url.hostname) : null;
    return tidy({ ...base, source: clickId[1] === "facebook" && fromRef ? fromRef : clickId[1], medium: clickId[2], clickId: clickId[0], campaign: clip(params.get("utm_campaign")) });
  }
  const tag = lower(params.get("ref"));
  if (tag) return tidy({ ...base, source: tag, medium: "referral" });
  if (external) {
    const source = referralSourceOf(external.href, url.hostname) || lower(external.hostname);
    return tidy({ ...base, source, medium: mediumOf(source) });
  }
  if (ref) return null; // came from one of the shop's own pages
  return tidy({ ...base, source: "direct", medium: "(none)" });
}

/** What to keep after this page load: a tagged or referred visit replaces the saved one; a direct one never does. */
export function nextVisitSource(saved: Acquisition | null, fresh: Acquisition | null, now: Date = new Date()): Acquisition | null {
  const live = saved && now.getTime() - Date.parse(saved.firstSeenAt) < VISIT_SOURCE_DAYS * 86_400_000 ? saved : null;
  if (!fresh) return live;
  if (fresh.source === "direct") return live || fresh;
  return fresh;
}

/** Keeps only the known keys as bounded strings; null when there is no source. Takes the map or its JSON string. */
export function cleanAcquisition(value: unknown): Acquisition | null {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const key of ACQUISITION_KEYS) {
    const v = (value as any)[key];
    if (typeof v === "string" && v.trim()) out[key] = clip(v);
  }
  return out.source ? (out as Acquisition) : null;
}

/** The JSON string saved on an order, shortened (longest value first) until it fits the rules' limit. */
export function encodeAcquisition(value: unknown): string | null {
  const a = cleanAcquisition(value) as Record<string, string> | null;
  if (!a) return null;
  let text = JSON.stringify(a);
  while (text.length > ACQUISITION_JSON_MAX) {
    const longest = Object.keys(a).reduce((x, y) => (a[y].length > a[x].length ? y : x));
    a[longest] = a[longest].slice(0, Math.max(0, a[longest].length - 50));
    text = JSON.stringify(a);
  }
  return text;
}

function readSaved(): Acquisition | null {
  try { return cleanAcquisition(JSON.parse(window.localStorage.getItem(VISIT_SOURCE_KEY) || "null")); } catch { return null; }
}

/** Run once per page load (App.tsx), after the caller has checked consent and that this isn't a preview. */
export function recordVisitSource(): void {
  if (typeof window === "undefined") return;
  const next = nextVisitSource(readSaved(), visitSourceFrom(window.location.href, document.referrer));
  try {
    if (next) window.localStorage.setItem(VISIT_SOURCE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the order simply carries no source.
  }
}

/** The saved source for a new order, as the order's JSON string, or null. */
export function orderAcquisition(): string | null {
  if (typeof window === "undefined") return null;
  return encodeAcquisition(readSaved());
}
