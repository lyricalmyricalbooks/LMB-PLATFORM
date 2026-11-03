/**
 * The shopper's cookie choice (written by components/CookieConsent.tsx).
 *
 * Opt-in: analytics and marketing run only once the shopper has said yes to that kind. Before they answer, nothing
 * that isn't needed for the shop to work runs (EU/UK cookie rules, and Quebec's "off until asked" rule). The one
 * exception is a shop whose owner switched the cookie banner off (Studio › Pop-overs › Cookie banner): no one can be
 * asked there, so the owner has chosen to run without asking, and undecided shoppers count as yes, as before.
 */
export type ConsentKind = "analytics" | "marketing";
export const CONSENT_KEY = "lm:cookie-consent";
export const CONSENT_EVENT = "lm:consent-change";

/** Fired by the footer's "Cookie settings" link: the banner opens again so the shopper can change their answer. */
export const COOKIE_SETTINGS_EVENT = "lm:cookie-settings";
export function openCookieSettings() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT));
}

let bannerOff = false;

/**
 * Called with the shop's published design as soon as it is read (useSiteData) and by the banner. Tells listeners when
 * the answer for undecided shoppers changes, so trackers start or stop.
 */
export function noteCookieBanner(design: { showCookieBanner?: boolean } | null | undefined) {
  const off = design?.showCookieBanner === false;
  if (off === bannerOff) return;
  bannerOff = off;
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try { window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null })); } catch { /* no events here */ }
  }
}

export function consentAllows(kind: ConsentKind): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return bannerOff;
    return JSON.parse(raw)?.[kind] === true;
  } catch {
    return bannerOff;
  }
}
