// Pretend outside world for the server's tests: one `fetch` that sends Firestore calls to a pretend Firestore
// (clients/fake-firestore.js), answers Google's sign-in keys from a key made here, and refuses everything else (Stripe,
// Resend, Google's other APIs) by recording it and failing, so a test sees any call it didn't expect. A sign-in made
// with `signIn(claims)` passes the real check (server/verifyIdToken.js). Nothing reaches the network.
import { createSign, generateKeyPairSync } from "node:crypto";
import { fakeFirestore } from "../clients/fake-firestore.js";
import { SECURETOKEN_KEYS } from "./verifyIdToken.js";
import { pretendEmailEnv } from "../services/email/fakes.js";
import { pretendPaymentsEnv } from "../services/payments/fakes.js";

// Not the real platform project, so a test sees any call that goes to the default project instead of the server's own.
export const TEST_PROJECT = "demo-lmb-platform";

export function fakeOutside({ projectId = TEST_PROJECT, nowMs = () => Date.now() } = {}) {
  const firestore = fakeFirestore();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "test-key";
  const other = [];
  const fetch = async (url, init = {}) => {
    if (String(url).startsWith("https://firestore.googleapis.com/")) return firestore.fetch(url, init);
    if (url === SECURETOKEN_KEYS) {
      const body = { keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }] };
      return { ok: true, status: 200, headers: new Headers({ "cache-control": "max-age=3600" }), json: async () => body, text: async () => JSON.stringify(body) };
    }
    other.push({ url: String(url), method: init.method ?? "GET" });
    throw new Error(`the test didn't expect a call to ${url}`);
  };

  /** A Firebase sign-in for this project that the real check accepts. */
  function signIn({ uid, email, emailVerified = true, secondFactor = null, name } = {}) {
    const at = Math.floor(nowMs() / 1000);
    const claims = {
      iss: `https://securetoken.google.com/${projectId}`, aud: projectId, sub: uid, user_id: uid, email, email_verified: emailVerified,
      auth_time: at - 10, iat: at - 10, exp: at + 3000, firebase: { sign_in_provider: "password", ...(secondFactor ? { sign_in_second_factor: secondFactor } : {}) },
      ...(name ? { name } : {}),
    };
    const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const head = `${b64({ alg: "RS256", kid, typ: "JWT" })}.${b64(claims)}`;
    const signer = createSign("RSA-SHA256");
    signer.update(head);
    return `${head}.${signer.sign(privateKey).toString("base64url")}`;
  }

  return { fetch, firestore, other, signIn, token: async () => "test-token" };
}

/** The settings a hosted test server runs with: nothing secret, sign-up open, one admin, a test Stripe key. */
export const TEST_ENV = Object.freeze({
  PLATFORM_PROJECT: TEST_PROJECT,
  PLATFORM_ADMIN_EMAILS: "admin@example.com",
  HEALTH_ALERT_TO: "alerts@example.com",
  ...pretendEmailEnv(),
  ...pretendPaymentsEnv(),
  STRIPE_BILLING_WEBHOOK_SECRET: "whsec_pretend_billing",
  TRIAL_TIPS_SECRET: "tips-signing-phrase-123",
  CHECKUP_SECRET: "checkup-signing-phrase-123",
  SIGNUP_OPEN: "true",
  PLATFORM_URL: "https://platform.example",
});
