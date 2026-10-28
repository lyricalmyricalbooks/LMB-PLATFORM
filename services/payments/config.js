// The service's settings, from its own environment only (Secret Manager in the platform project). The Stripe platform
// keys are read here and nowhere else in the repo; no shop project ever holds them.
//
//   STRIPE_PLATFORM_LIVE_KEY / STRIPE_PLATFORM_TEST_KEY   the platform's secret keys (sk_live_… / sk_test_…)
//   STRIPE_CONNECT_WEBHOOK_SECRET_LIVE / _TEST            the signing secrets of the one Connect events address;
//                                                         several, comma-separated, while one is being rolled
//   PLATFORM_FEE_BASIS_POINTS / PLATFORM_FEE_REFUNDED     the platform's default per-order fee (fees.js), 0% by default
//
// Square (code plan 2.2b), each optional; without an environment's application, Square shops there are refused:
//   SQUARE_APPLICATION_ID_LIVE / SQUARE_APPLICATION_SECRET_LIVE   the platform's production Square application
//   SQUARE_APPLICATION_ID_TEST / SQUARE_APPLICATION_SECRET_TEST   its Sandbox application (ids start "sandbox-")
//   SQUARE_WEBHOOK_URL_LIVE / _TEST            each webhook subscription's notification URL, exactly as set in Square
//                                              (https://<service>/square/events/live or …/test)
//   SQUARE_WEBHOOK_SIGNATURE_KEY_LIVE / _TEST  their signature keys; several, comma-separated, while one is rolled
//   SQUARE_TOKEN_KEY                           32 random bytes in Base64: seals each press's Square tokens (tokenSeal.js)
import { readFeeSettings } from "./fees.js";
import { sealingKey } from "./tokenSeal.js";

function squareApp(env, mode) {
  const suffix = mode === "live" ? "LIVE" : "TEST";
  const applicationId = text(env[`SQUARE_APPLICATION_ID_${suffix}`]);
  const applicationSecret = text(env[`SQUARE_APPLICATION_SECRET_${suffix}`]);
  if (!applicationId && !applicationSecret) return null;
  if (!applicationId || !applicationSecret) throw new Error(`SQUARE_APPLICATION_ID_${suffix} and SQUARE_APPLICATION_SECRET_${suffix} go together`);
  // Square's Sandbox ids and secrets start "sandbox-"; one in the wrong slot would send test payments to production.
  const sandbox = (value) => value.startsWith("sandbox-");
  if (mode === "test" && !(sandbox(applicationId) && sandbox(applicationSecret))) throw new Error("SQUARE_APPLICATION_ID_TEST and _SECRET_TEST must be Square Sandbox values");
  if (mode === "live" && (sandbox(applicationId) || sandbox(applicationSecret))) throw new Error("SQUARE_APPLICATION_ID_LIVE and _SECRET_LIVE must be Square production values");
  return Object.freeze({ applicationId, applicationSecret });
}

function squareHook(env, mode) {
  const suffix = mode === "live" ? "LIVE" : "TEST";
  const url = text(env[`SQUARE_WEBHOOK_URL_${suffix}`]);
  if (url && !/^https:\/\/[^/\s]+\/\S*$/.test(url)) throw new Error(`SQUARE_WEBHOOK_URL_${suffix} must be an https address`);
  return Object.freeze({ url: url || null, keys: Object.freeze(list(env[`SQUARE_WEBHOOK_SIGNATURE_KEY_${suffix}`])) });
}

function readSquareConfig(env) {
  const apps = { live: squareApp(env, "live"), test: squareApp(env, "test") };
  const tokenKeyText = text(env.SQUARE_TOKEN_KEY);
  if ((apps.live || apps.test) && !tokenKeyText) throw new Error("SQUARE_TOKEN_KEY is needed with a Square application");
  return Object.freeze({
    apps: Object.freeze(apps),
    webhooks: Object.freeze({ live: squareHook(env, "live"), test: squareHook(env, "test") }),
    tokenKey: tokenKeyText ? sealingKey(tokenKeyText) : null,
  });
}

const text = (value) => (typeof value === "string" ? value.trim() : "");
const list = (value) => text(value).split(",").map((item) => item.trim()).filter(Boolean);

export function readServiceConfig(env = {}) {
  const live = text(env.STRIPE_PLATFORM_LIVE_KEY);
  const test = text(env.STRIPE_PLATFORM_TEST_KEY);
  // A key in the wrong slot would take real money in test mode, or the reverse.
  if (live && !/^(sk|rk)_live_/.test(live)) throw new Error("STRIPE_PLATFORM_LIVE_KEY is not a live secret key");
  if (test && !/^(sk|rk)_test_/.test(test)) throw new Error("STRIPE_PLATFORM_TEST_KEY is not a test secret key");
  return Object.freeze({
    keys: Object.freeze({ live: live || null, test: test || null }),
    webhookSecrets: Object.freeze({ live: list(env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE), test: list(env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST) }),
    fee: readFeeSettings(env),
    square: readSquareConfig(env),
  });
}
