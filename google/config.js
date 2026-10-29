// The Google link's settings, read only from its own service's environment (Secret Manager in the platform project).
// The Google app's keys are read here and nowhere else; no shop project ever holds them. **Off unless
// GOOGLE_CONNECT_ENABLED is "true"** (plan 6.17 waits on Julian: Google must approve Colophon's sign-in screen first).
//
//   GOOGLE_CONNECT_ENABLED      "true" shows Connect Google on every platform shop
//   GOOGLE_CLIENT_ID            the Google app's sign-in keys (Google Cloud console › Credentials, a Web client)
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URL         the sign-in answer address, exactly as listed on that client
//                               (https://<service>/google/oauth)
//   GOOGLE_TOKEN_KEY            32 random bytes in Base64: seals each press's Google tokens (../services/payments/tokenSeal.js)
//   GOOGLE_GMAIL_SENDING        "on": a shop's emails may go from the press's own Gmail through the same sign-in.
//                               Sending is a "sensitive" permission (not "restricted"), so it goes through Google's
//                               ordinary review of the sign-in screen with the rest; switched on by Julian once that
//                               review is passed. Until then the shop's own domain (services/email/ownDomain.js) or
//                               Colophon's sender
//   GOOGLE_MERCHANT_PROVIDER_ID the number of Colophon's own Merchant Center account. Google links every Shopping
//                               account made through the API to it (plan 15.14); without it Google Shopping waits
//   GOOGLE_LATER_EXTRAS         "on": offer the extras that join Google's review in a second round (YouTube, Calendar,
//                               and, with their own switches below, Business Profile and Ads). Off at launch so the
//                               first review asks for as few permissions as possible (plan 15.12)
//   GOOGLE_BUSINESS_PROFILE     "on": offer the Google Business Profile tick box. Switched on by Julian once Google
//                               grants Colophon access to its Business Profile tools
//   GOOGLE_ADS_ACCESS           the access level Google gave Colophon's project for Google Ads: explorer, basic or
//                               standard. Google ended developer tokens on 9 September 2026 (plan 15.13); "off" or
//                               unset: the Ads tick box isn't offered
import { sealingKey } from "../services/payments/tokenSeal.js";
import { assertGoogleReady } from "./readiness.js";

const text = (value) => (typeof value === "string" ? value.trim() : "");
const onOff = (env, name) => {
  const raw = text(env[name]).toLowerCase() || "off";
  if (!["on", "off"].includes(raw)) throw new Error(`${name} must be on or off`);
  return raw === "on";
};

export function readGoogleConfig(env = {}, { now = Date.now() } = {}) {
  const enabled = text(env.GOOGLE_CONNECT_ENABLED).toLowerCase() === "true";
  const clientId = text(env.GOOGLE_CLIENT_ID);
  const clientSecret = text(env.GOOGLE_CLIENT_SECRET);
  if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET go together");
  const redirectUrl = text(env.GOOGLE_REDIRECT_URL);
  if (redirectUrl && !/^https:\/\/[^/\s]+\/\S*$/.test(redirectUrl)) throw new Error("GOOGLE_REDIRECT_URL must be an https address");
  const keyText = text(env.GOOGLE_TOKEN_KEY);
  if (clientId && !keyText) throw new Error("GOOGLE_TOKEN_KEY is needed with the Google keys");
  if (clientId && !redirectUrl) throw new Error("GOOGLE_REDIRECT_URL is needed with the Google keys");
  if (enabled && !clientId) throw new Error("GOOGLE_CONNECT_ENABLED needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  const adsAccess = text(env.GOOGLE_ADS_ACCESS).toLowerCase() || "off";
  if (!["off", "explorer", "basic", "standard"].includes(adsAccess)) throw new Error("GOOGLE_ADS_ACCESS must be off, explorer, basic or standard");
  const merchantProviderId = text(env.GOOGLE_MERCHANT_PROVIDER_ID);
  if (merchantProviderId && !/^\d+$/.test(merchantProviderId)) throw new Error("GOOGLE_MERCHANT_PROVIDER_ID is the number of Colophon's Merchant Center account");
  const yes = (name) => text(env[name]).toLowerCase() === "yes";
  const readyChecks = onOff({ ...env, GOOGLE_READY_CHECKS: text(env.GOOGLE_READY_CHECKS) || "on" }, "GOOGLE_READY_CHECKS");
  const config = Object.freeze({
    enabled,
    app: clientId ? Object.freeze({ clientId, clientSecret }) : null,
    redirectUrl: redirectUrl || null,
    tokenKey: keyText ? sealingKey(keyText, "GOOGLE_TOKEN_KEY") : null,
    gmailSending: onOff(env, "GOOGLE_GMAIL_SENDING"),
    laterExtras: onOff(env, "GOOGLE_LATER_EXTRAS"),
    businessProfile: onOff(env, "GOOGLE_BUSINESS_PROFILE"),
    adsAccess,
    merchantProviderId: merchantProviderId || null,
    signInApproved: yes("GOOGLE_SIGNIN_APPROVED"),
    merchantRegistered: yes("GOOGLE_MERCHANT_REGISTERED"),
    testClientId: text(env.GOOGLE_TEST_CLIENT_ID) || null,
    readyChecks,
  });
  // Switching on is refused until everything outside the code is done (15.4); practice runs turn the check off.
  if (enabled && readyChecks) assertGoogleReady(config, now);
  return config;
}

/**
 * The optional extras a press may tick, given what the platform has switched on. At launch only the Drive folder is
 * offered; YouTube, Calendar, Business Profile and Ads wait for the second review (plan 15.12).
 */
export function offeredExtras(config) {
  if (!config.laterExtras) return ["drive"];
  return [
    "drive",
    "youtube",
    "calendar",
    ...(config.businessProfile ? ["businessProfile"] : []),
    ...(config.adsAccess !== "off" ? ["ads"] : []),
  ];
}
