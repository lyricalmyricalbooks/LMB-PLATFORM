import { test } from "node:test";
import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { SECURETOKEN_KEYS, createIdTokenVerifier, maxAgeOf } from "./verifyIdToken.js";

const PROJECT = "lmb-platform-prod";
const NOW_S = 1_793_000_000;
const pair = (kid) => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" } };
};
const A = pair("key-a");
const B = pair("key-b");
const STRANGER = pair("key-a"); // same kid, a key Google never published

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function sign(claims, { key = A, header = {} } = {}) {
  const head = b64({ alg: "RS256", kid: key.kid, typ: "JWT", ...header });
  const body = b64(claims);
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${signer.sign(key.privateKey).toString("base64url")}`;
}
const goodClaims = (over = {}) => ({
  iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: "uid-owner", user_id: "uid-owner",
  email: "owner@example.com", email_verified: true, auth_time: NOW_S - 100, iat: NOW_S - 50, exp: NOW_S + 3000,
  firebase: { sign_in_provider: "password", sign_in_second_factor: "totp" }, ...over,
});

/** Google's key list behind a fake fetch: `published` is what it lists now; `calls` counts fetches. */
function keyServer(published = [A], cacheControl = "public, max-age=19800, must-revalidate, no-transform") {
  const server = { published, calls: 0 };
  server.fetch = async (url, init) => {
    assert.equal(url, SECURETOKEN_KEYS);
    assert.equal(init.method, "GET");
    server.calls += 1;
    const body = { keys: server.published.map((k) => k.jwk) };
    return { ok: true, status: 200, headers: new Headers({ "cache-control": cacheControl }), json: async () => body };
  };
  return server;
}

const clockAt = (seconds) => {
  const clock = { ms: seconds * 1000 };
  clock.now = () => clock.ms;
  return clock;
};

test("a good Firebase sign-in gives its claims with uid, like the pretend check", async () => {
  const keysOf = keyServer();
  const verify = createIdTokenVerifier({ projectId: PROJECT, fetch: keysOf.fetch, now: clockAt(NOW_S).now });
  const claims = await verify(sign(goodClaims()));
  assert.equal(claims.uid, "uid-owner");
  assert.equal(claims.email, "owner@example.com");
  assert.equal(claims.email_verified, true);
  assert.equal(claims.firebase.sign_in_second_factor, "totp");
  assert.equal(claims.auth_time, NOW_S - 100);
});

test("each wrong part of a sign-in is refused", async () => {
  const verify = createIdTokenVerifier({ projectId: PROJECT, fetch: keyServer().fetch, now: clockAt(NOW_S).now });
  const refused = {
    "another project": sign(goodClaims({ aud: "lmb-test-shop" })),
    "another issuer": sign(goodClaims({ iss: "https://securetoken.google.com/lmb-test-shop" })),
    "no person": sign(goodClaims({ sub: "" })),
    "a person id that is too long": sign(goodClaims({ sub: "x".repeat(129) })),
    "run out": sign(goodClaims({ exp: NOW_S - 1 })),
    "runs out this second": sign(goodClaims({ exp: NOW_S })),
    "made in the future": sign(goodClaims({ iat: NOW_S + 3600 })),
    "signed in in the future": sign(goodClaims({ auth_time: NOW_S + 3600 })),
    "no sign-in time": sign(goodClaims({ auth_time: undefined })),
    "another algorithm": sign(goodClaims(), { header: { alg: "HS256" } }),
    "no key named": sign(goodClaims(), { header: { kid: "" } }),
    "a key Google doesn't list": sign(goodClaims(), { key: B }),
    "signed by someone else's key": sign(goodClaims(), { key: STRANGER }),
    "changed after signing": (() => {
      const [h, , s] = sign(goodClaims()).split(".");
      return `${h}.${b64(goodClaims({ sub: "uid-someone-else" }))}.${s}`;
    })(),
    "not a token": "not-a-token",
    "too many parts": `${sign(goodClaims())}.x`,
    "nothing": "",
  };
  for (const [why, token] of Object.entries(refused)) await assert.rejects(verify(token), Error, why);
  await assert.rejects(verify(undefined), /no sign-in token/);
});

test("a small clock difference is allowed for when the sign-in was made, never for when it runs out", async () => {
  const verify = createIdTokenVerifier({ projectId: PROJECT, fetch: keyServer().fetch, now: clockAt(NOW_S).now });
  assert.equal((await verify(sign(goodClaims({ iat: NOW_S + 20, auth_time: NOW_S + 20 })))).uid, "uid-owner");
  await assert.rejects(verify(sign(goodClaims({ iat: NOW_S + 31 }))), /future/);
});

test("Google's keys are fetched once and kept for their max-age, then fetched again", async () => {
  const keysOf = keyServer([A], "public, max-age=600");
  const clock = clockAt(NOW_S);
  const verify = createIdTokenVerifier({ projectId: PROJECT, fetch: keysOf.fetch, now: clock.now });
  await Promise.all([verify(sign(goodClaims())), verify(sign(goodClaims())), verify(sign(goodClaims()))]);
  assert.equal(keysOf.calls, 1, "three sign-ins at once share one fetch");
  clock.ms += 599_000;
  await verify(sign(goodClaims({ exp: NOW_S + 3000 })));
  assert.equal(keysOf.calls, 1);
  clock.ms += 2_000;
  await verify(sign(goodClaims()));
  assert.equal(keysOf.calls, 2, "past max-age the keys are fetched again");
  assert.equal(maxAgeOf("no-cache"), 3600);
  assert.equal(maxAgeOf("public, max-age=19800"), 19800);
});

test("a newly rotated key is fetched when a sign-in names it, but unknown keys can't make it fetch over and over", async () => {
  const keysOf = keyServer([A]);
  const clock = clockAt(NOW_S);
  const verify = createIdTokenVerifier({ projectId: PROJECT, fetch: keysOf.fetch, now: clock.now });
  await verify(sign(goodClaims()));
  clock.ms += 61_000;
  keysOf.published = [A, B];
  assert.equal((await verify(sign(goodClaims(), { key: B }))).uid, "uid-owner");
  assert.equal(keysOf.calls, 2);
  const nobody = pair("key-unknown");
  for (let i = 0; i < 5; i += 1) await assert.rejects(verify(sign(goodClaims(), { key: nobody })), /doesn't list/);
  assert.equal(keysOf.calls, 2, "within a minute of the last fetch an unknown key doesn't fetch again");
});

test("Google not answering is a refused sign-in, and the check needs its project and fetch", async () => {
  const verify = createIdTokenVerifier({ projectId: PROJECT, fetch: async () => ({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) }), now: clockAt(NOW_S).now });
  await assert.rejects(verify(sign(goodClaims())), /answered 503/);
  assert.throws(() => createIdTokenVerifier({ projectId: "", fetch: async () => {} }), /project id/);
  assert.throws(() => createIdTokenVerifier({ projectId: PROJECT }), /fetch/);
});
