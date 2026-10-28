// Closing a shop for abuse (code plan 8.4): a platform admin closes a shop's checkout and pages, with a reason, and can
// open them again. It reuses the shop's own pause (maintenance): `settings/website` `maintenance.enabled` shows the
// shop's pause page instead of the shop and closes checkout on the shop's server (apps/shop/functions/shopSettings.js
// checkoutClosed). The pause page shows the press's own words from Studio, so nothing here writes shopper-facing words.
//
// The registry row's `closure` ({ by, reason, at, pauseBefore }) is what says the shop is closed: the platform payment
// service refuses its calls while it is there, so a press who turns the pause off in their admin still can't take
// platform payments, and the self-check below puts the pause back on.
import { PLANS } from "../setup/steps.js";

export const SETTINGS_DOC = "settings/website";

/** True when the shop's pause page is on. */
export const isPaused = (settings) => settings?.maintenance?.enabled === true;

/** The shop's settings with its pause on, keeping the press's own message. */
export function pausedSettings(settings) {
  return { ...(settings ?? {}), maintenance: { message: "", ...(settings?.maintenance ?? {}), enabled: true } };
}

/** The shop's settings with its pause as it was before the shop was closed (none: no pause at all). */
export function restoredSettings(settings, pauseBefore) {
  const { maintenance: _, ...rest } = settings ?? {};
  return pauseBefore ? { ...rest, maintenance: pauseBefore } : rest;
}

/**
 * The self-check for a closed shop (selfChecks.js): its pause must be on. Fixed by turning it on again, the same
 * write the close made.
 */
export function closedShopCheck({ shopData }) {
  return {
    name: "closed",
    async run({ row }) {
      if (!row.closure) return { ok: true, skipped: "not closed" };
      if (!PLANS[row.plan]?.shop) return { ok: true, skipped: "a stockroom alone has no shop pages" };
      const settings = await shopData.get(row.shopId, SETTINGS_DOC);
      if (isPaused(settings)) return { ok: true };
      return {
        ok: false, problem: "the shop was closed by the platform, but its pause page is off",
        fix: async () => {
          await shopData.set(row.shopId, SETTINGS_DOC, pausedSettings(await shopData.get(row.shopId, SETTINGS_DOC)));
          return "turned the shop's pause page on again";
        },
      };
    },
  };
}
