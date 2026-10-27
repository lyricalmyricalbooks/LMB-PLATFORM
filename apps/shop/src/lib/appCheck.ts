import type { FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

import { shopProfile } from "./shopProfile";

type AppCheckEnvironment = {
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string;
  VITE_APP_CHECK_MODE?: string;
  VITE_APP_CHECK_DEBUG_TOKEN?: string;
  DEV?: boolean;
};

/** Must run before Firestore/Auth are initialized, including in the Studio preview. */
/** The shop profile's site key wins; the build setting is the fallback for a profile without one. */
export function initializeBrowserAppCheck(
  app: FirebaseApp,
  env: AppCheckEnvironment = import.meta.env,
  profileSiteKey: string | undefined = shopProfile.appCheckSiteKey,
): AppCheck | null {
  const siteKey = profileSiteKey?.trim() || env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?.trim();
  if (typeof window === "undefined" || !siteKey || env.VITE_APP_CHECK_MODE === "off") return null;

  // Explicit local-only debug credentials; never enable a production debug bypass.
  if (env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) && env.VITE_APP_CHECK_DEBUG_TOKEN) {
    (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APP_CHECK_DEBUG_TOKEN;
  }
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
