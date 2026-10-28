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
//                               Switched on by Julian once Google's yearly security review of sending is passed; until
//                               then the shop's own domain (services/email/ownDomain.js) or Colophon's sender
//   GOOGLE_BUSINESS_PROFILE     "on": offer the Google Business Profile tick box. Switched on by Julian once Google
//                               grants Colophon access to its Business Profile tools
//   GOOGLE_ADS_DEVELOPER_TOKEN  the Google Ads developer token; without it the Ads tick box isn't offered
import { sealingKey } from "../services/payments/tokenSeal.js";

const text = (value) => (typeof value === "string" ? value.trim() : "");
const onOff = (env, name) => {
  const raw = text(env[name]).toLowerCase() || "off";
  if (!["on", "off"].includes(raw)) throw new Error(`${name} must be on or off`);
  return raw === "on";
};

export function readGoogleConfig(env = {}) {
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
  const adsDeveloperToken = text(env.GOOGLE_ADS_DEVELOPER_TOKEN);
  return Object.freeze({
    enabled,
    app: clientId ? Object.freeze({ clientId, clientSecret }) : null,
    redirectUrl: redirectUrl || null,
    tokenKey: keyText ? sealingKey(keyText, "GOOGLE_TOKEN_KEY") : null,
    gmailSending: onOff(env, "GOOGLE_GMAIL_SENDING"),
    businessProfile: onOff(env, "GOOGLE_BUSINESS_PROFILE"),
    adsDeveloperToken: adsDeveloperToken || null,
  });
}

/** The optional extras a press may tick, given what the platform has switched on. */
export function offeredExtras(config) {
  return [
    "drive",
    "youtube",
    "calendar",
    ...(config.businessProfile ? ["businessProfile"] : []),
    ...(config.adsDeveloperToken ? ["ads"] : []),
  ];
}
