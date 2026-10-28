// The bookkeeping service's settings, from its own environment only (Secret Manager in the platform project). The
// platform's QuickBooks keys are read here and nowhere else; no shop project ever holds them. **Off unless
// ACCOUNTING_ENABLED is "true"** (code plan 7.15 waits on Julian: an Intuit developer account and Intuit's app review).
//
//   ACCOUNTING_ENABLED                                       "true" turns the QuickBooks link on for every shop
//   QUICKBOOKS_CLIENT_ID_LIVE / QUICKBOOKS_CLIENT_SECRET_LIVE  the Intuit app's production keys (real companies)
//   QUICKBOOKS_CLIENT_ID_TEST / QUICKBOOKS_CLIENT_SECRET_TEST  its development keys (sandbox companies)
//   QUICKBOOKS_REDIRECT_URL     the sign-in answer address, exactly as listed in the Intuit app
//                               (https://<service>/quickbooks/oauth)
//   QUICKBOOKS_TOKEN_KEY        32 random bytes in Base64: seals each press's QuickBooks tokens (../payments/tokenSeal.js)
import { sealingKey } from "../payments/tokenSeal.js";

const text = (value) => (typeof value === "string" ? value.trim() : "");

function quickbooksApp(env, mode) {
  const suffix = mode === "live" ? "LIVE" : "TEST";
  const clientId = text(env[`QUICKBOOKS_CLIENT_ID_${suffix}`]);
  const clientSecret = text(env[`QUICKBOOKS_CLIENT_SECRET_${suffix}`]);
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) throw new Error(`QUICKBOOKS_CLIENT_ID_${suffix} and QUICKBOOKS_CLIENT_SECRET_${suffix} go together`);
  return Object.freeze({ clientId, clientSecret });
}

export function readAccountingConfig(env = {}) {
  const enabled = text(env.ACCOUNTING_ENABLED).toLowerCase() === "true";
  const apps = { live: quickbooksApp(env, "live"), test: quickbooksApp(env, "test") };
  const redirectUrl = text(env.QUICKBOOKS_REDIRECT_URL);
  if (redirectUrl && !/^https:\/\/[^/\s]+\/\S*$/.test(redirectUrl)) throw new Error("QUICKBOOKS_REDIRECT_URL must be an https address");
  const keyText = text(env.QUICKBOOKS_TOKEN_KEY);
  if (apps.live && apps.test && apps.live.clientId === apps.test.clientId) throw new Error("QUICKBOOKS_CLIENT_ID_LIVE and _TEST must be different keys");
  if ((apps.live || apps.test) && !keyText) throw new Error("QUICKBOOKS_TOKEN_KEY is needed with QuickBooks keys");
  if ((apps.live || apps.test) && !redirectUrl) throw new Error("QUICKBOOKS_REDIRECT_URL is needed with QuickBooks keys");
  return Object.freeze({
    enabled,
    apps: Object.freeze(apps),
    redirectUrl: redirectUrl || null,
    tokenKey: keyText ? sealingKey(keyText, "QUICKBOOKS_TOKEN_KEY") : null,
  });
}
