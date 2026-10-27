import { consentAllows } from "./consent";
import { restoredUser } from "../../lib/authSession";
import { inThemePreview } from "../features/site/themePreview";
import { isOwnerDevice, looksAutomated, SHOP_OWNER_EMAIL } from "./ownerDevice";

/** The Studio preview iframe / new-tab preview runs the real storefront; it must not count as shopper traffic. */
export const inEditorPreview = () =>
  typeof window !== "undefined" && window.location.search.includes("preview=true");

/**
 * Never counted anywhere (shop counter or Google): the Studio preview and share links, a shopper who declined
 * analytics, a browser marked as the owner's (lib/ownerDevice.ts: set when the owner signs in to the admin, or by
 * Settings › General › Your own visits) and automated browsers (search-engine renderers, speed tests).
 */
function neverCounted(): boolean {
  // A shared preview link (Studio 3.4) is the owner's guests looking at an unpublished design, not shop traffic.
  return inEditorPreview() || inThemePreview() || !consentAllows("analytics") || isOwnerDevice() || looksAutomated();
}

/**
 * Whether this page view may be counted in the daily `analytics/<date>` doc: nothing in `neverCounted`, and
 * nobody is signed in in this browser (the owner clicking around their own shop is not traffic). Waits briefly for
 * Firebase Auth to restore a saved session so an admin is not counted just because auth had not finished loading.
 */
export async function trackingAllowed(): Promise<boolean> {
  if (neverCounted()) return false;
  try {
    // Guests with no saved sign-in skip loading Firebase Auth entirely.
    if (await restoredUser(1500)) return false;
  } catch {
    // Auth unavailable: count the visit rather than lose it.
  }
  return true;
}

export { SHOP_OWNER_EMAIL };

/**
 * Google Analytics' rule: the same preview and consent checks, but only the shop owner is left out — customers
 * signed in to their account are real shoppers and their visits and purchases count.
 */
export async function googleTrackingAllowed(): Promise<boolean> {
  if (neverCounted()) return false;
  try {
    const user = await restoredUser(1500);
    if (user && String(user.email || "").toLowerCase() === SHOP_OWNER_EMAIL) return false;
  } catch {
    // Auth unavailable: count the visit rather than lose it.
  }
  return true;
}
