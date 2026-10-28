// The service's settings, from its own environment only (Secret Manager in the platform project). The Stripe platform
// keys are read here and nowhere else in the repo; no shop project ever holds them.
//
//   STRIPE_PLATFORM_LIVE_KEY / STRIPE_PLATFORM_TEST_KEY   the platform's secret keys (sk_live_… / sk_test_…)
//   STRIPE_CONNECT_WEBHOOK_SECRET_LIVE / _TEST            the signing secrets of the one Connect events address;
//                                                         several, comma-separated, while one is being rolled
//   PLATFORM_FEE_BASIS_POINTS / PLATFORM_FEE_REFUNDED     the platform's default per-order fee (fees.js), 0% by default
import { readFeeSettings } from "./fees.js";

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
  });
}
