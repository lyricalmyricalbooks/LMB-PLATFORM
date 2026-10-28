// The settings sign-up reads at the moment it runs: whether sign-up is open, the daily cap on new shops, the founding
// offer and pay as you sell. The control room changes them without a redeploy through `liveSettings({ env, store })`
// in services/settings.js; this file only names what sign-up uses from there.
import { DEFAULT_SETTINGS, liveSettings } from "../services/settings.js";

export { liveSettings };

/** What sign-up falls back to when the live settings can't be read: closed, as the waitlist page is today. */
export const LIVE_DEFAULTS = DEFAULT_SETTINGS;
