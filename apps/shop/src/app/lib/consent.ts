/**
 * The shopper's cookie choice (written by components/CookieConsent.tsx).
 * Returns false only when they explicitly declined that category; before
 * they answer (or when the banner is turned off) behaviour is unchanged.
 */
export type ConsentKind = "analytics" | "marketing";
export const CONSENT_KEY = "lm:cookie-consent";
export const CONSENT_EVENT = "lm:consent-change";

export function consentAllows(kind: ConsentKind): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return true;
    return JSON.parse(raw)?.[kind] !== false;
  } catch {
    return true;
  }
}
