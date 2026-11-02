// The bot check's token lifetime (code plan 15.18). The bot check (App Check with reCAPTCHA Enterprise) is free for the
// first 10,000 assessments a month across the whole organization, then costs money, and every new token is one assessment.
// A longer lifetime means fewer tokens: Google allows 30 minutes to 7 days and assumes 1 hour. Colophon's default is 12 hours.
// Set on each shop's own reCAPTCHA configuration; a shop with no configuration yet has nothing to set, and the step is
// done (the lifetime is set the first time it is run after the configuration exists). The setting is the platform's
// (`config.appCheckTokenMinutes`), not the press's.
import { WEB_APP_NAME } from "./steps.js";

export const MIN_TOKEN_MINUTES = 30;
export const MAX_TOKEN_MINUTES = 7 * 24 * 60;
export const DEFAULT_TOKEN_MINUTES = 12 * 60;

/** The lifetime to set, in minutes. A value outside what Google allows is refused rather than quietly changed. */
export function tokenMinutesOf(config) {
  const minutes = config?.appCheckTokenMinutes ?? DEFAULT_TOKEN_MINUTES;
  if (!Number.isInteger(minutes) || minutes < MIN_TOKEN_MINUTES || minutes > MAX_TOKEN_MINUTES) {
    throw new Error(`config.appCheckTokenMinutes must be a whole number from ${MIN_TOKEN_MINUTES} to ${MAX_TOKEN_MINUTES}`);
  }
  return minutes;
}

/** Setup step 19. Safe to run twice. */
export function botCheckStep({ number = 19, google, config }) {
  const minutes = tokenMinutesOf(config);
  const appOf = async (shop) => (await google.firebase.listWebApps(shop.shopId)).find((app) => app.displayName === WEB_APP_NAME);
  return {
    number,
    name: "Make the bot check's tokens last longer",
    async check({ shop }) {
      const app = await appOf(shop);
      if (!app) return true;
      const now = await google.appCheck.tokenMinutes(shop.shopId, app.appId);
      return now === null || now === minutes;
    },
    async act({ shop }) {
      const app = await appOf(shop);
      if (!app) return;
      const now = await google.appCheck.tokenMinutes(shop.shopId, app.appId);
      if (now !== null && now !== minutes) await google.appCheck.setTokenMinutes(shop.shopId, app.appId, minutes);
    },
  };
}
