// Checks a Firebase sign-in (an ID token) the way Firebase Admin's verifyIdToken does, with no package: the token is a
// JWT signed RS256 by Google's "securetoken" keys, which Google publishes as JSON Web Keys at
//
//   https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com
//
// (the same keys as the X.509 list Firebase's guide names; this form needs no certificate parsing). The keys are fetched
// with the injected `fetch` and kept for as long as Google's Cache-Control max-age says. A token passes when:
//
//   header  alg RS256, and its kid is one of Google's current keys (an unknown kid fetches the keys again, at most
//           once a minute, since Google rotates them)
//   claims  aud is the project id, iss is https://securetoken.google.com/<project>, sub is a non-empty string of at most
//           128 characters, exp is in the future, iat and auth_time are not in the future (a small clock allowance)
//   signature  verified against that key
//
// It returns the token's claims with `uid` (= sub) added, the shape signup/fakes.js fakeVerifyIdToken returns:
// { uid, email, email_verified, name?, auth_time, firebase: { sign_in_provider, sign_in_second_factor? }, … }.
// Anything else throws; signup/api.js turns any throw into "Your sign-in has run out. Sign in again."
import { createPublicKey, createVerify } from "node:crypto";

export const SECURETOKEN_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const REFETCH_GAP_MS = 60_000;
const DEFAULT_MAX_AGE_S = 3600;

export class TokenError extends Error {
  constructor(message) {
    super(message);
    this.name = "TokenError";
  }
}

const part = (text) => {
  try {
    return JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
  } catch {
    throw new TokenError("the sign-in isn't a readable token");
  }
};

/** Seconds from a Cache-Control header's max-age, or the default. */
export function maxAgeOf(cacheControl) {
  const m = /max-age=(\d+)/i.exec(String(cacheControl ?? ""));
  return m ? Number(m[1]) : DEFAULT_MAX_AGE_S;
}

/**
 * `createIdTokenVerifier({ projectId, fetch, now })` -> async verifyIdToken(token) -> claims. `now()` gives the time
 * in milliseconds (tests move it); `skewSeconds` is the clock allowance for iat and auth_time.
 */
export function createIdTokenVerifier({ projectId, fetch, now = () => Date.now(), skewSeconds = 30, keysUrl = SECURETOKEN_KEYS }) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId ?? "")) throw new Error("the sign-in check needs the platform's project id");
  if (typeof fetch !== "function") throw new Error("the sign-in check needs a fetch");
  let keys = null; // Map kid -> KeyObject
  let expiresAt = 0;
  let fetchedAt = -Infinity;
  let pending = null;

  async function load() {
    const response = await fetch(keysUrl, { method: "GET" });
    if (!response.ok) throw new TokenError(`Google's sign-in keys answered ${response.status}`);
    const body = await response.json();
    const next = new Map();
    for (const jwk of body?.keys ?? []) {
      if (jwk?.kty !== "RSA" || typeof jwk.kid !== "string") continue;
      next.set(jwk.kid, createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" }));
    }
    if (!next.size) throw new TokenError("Google gave no sign-in keys");
    keys = next;
    fetchedAt = now();
    expiresAt = fetchedAt + maxAgeOf(response.headers?.get?.("cache-control")) * 1000;
    return keys;
  }

  // One fetch at a time, however many sign-ins arrive together.
  const refresh = () => (pending ??= load().finally(() => { pending = null; }));

  async function keyFor(kid) {
    if (!keys || now() >= expiresAt) await refresh();
    if (!keys.has(kid) && now() - fetchedAt >= REFETCH_GAP_MS) await refresh();
    const key = keys.get(kid);
    if (!key) throw new TokenError("the sign-in was signed with a key Google doesn't list");
    return key;
  }

  return async function verifyIdToken(token) {
    if (typeof token !== "string" || token.length > 8192) throw new TokenError("no sign-in token");
    const pieces = token.split(".");
    if (pieces.length !== 3 || pieces.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw new TokenError("the sign-in isn't a token");
    const [head, body, signature] = pieces;
    const header = part(head);
    const claims = part(body);
    if (header.alg !== "RS256") throw new TokenError("the sign-in isn't signed the way Firebase signs");
    if (typeof header.kid !== "string" || !header.kid) throw new TokenError("the sign-in names no key");
    const nowS = Math.floor(now() / 1000);
    if (claims.aud !== projectId) throw new TokenError("the sign-in is for another project");
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new TokenError("the sign-in wasn't made by this project's sign-in");
    if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) throw new TokenError("the sign-in names no person");
    if (!Number.isFinite(claims.exp) || claims.exp <= nowS) throw new TokenError("the sign-in has run out");
    if (!Number.isFinite(claims.iat) || claims.iat > nowS + skewSeconds) throw new TokenError("the sign-in is dated in the future");
    if (!Number.isFinite(claims.auth_time) || claims.auth_time > nowS + skewSeconds) throw new TokenError("the sign-in's time is in the future");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${head}.${body}`);
    if (!verifier.verify(await keyFor(header.kid), Buffer.from(signature, "base64url"))) throw new TokenError("the sign-in's signature doesn't match");
    return { ...claims, uid: claims.sub };
  };
}
