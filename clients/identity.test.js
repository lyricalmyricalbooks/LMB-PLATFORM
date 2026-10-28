import { test } from "node:test";
import assert from "node:assert/strict";
import { CUSTOM_TOKEN_AUDIENCE, identityClient, testOwnerSession } from "./identity.js";
import { scriptedFetch, token } from "./fake-fetch.js";

const SA = "release-check@example.com";
const NOW = new Date("2026-10-28T12:00:00Z");
const IAT = NOW.getTime() / 1000;
const profile = { firebase: { apiKey: "AIzaFakeKey", projectId: "lmb-test-shop" } };
const shop = { shopId: "lmb-test-shop", ownerEmail: "owner@example.com", testShop: true };

const signJwt = (uid) => ({
  method: "POST",
  url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(SA)}:signJwt`,
  body: { payload: JSON.stringify({ iss: SA, sub: SA, aud: CUSTOM_TOKEN_AUDIENCE, iat: IAT, exp: IAT + 3600, uid }) },
  json: { keyId: "k", signedJwt: "signed.jwt" },
});
const signIn = {
  method: "POST",
  url: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaFakeKey",
  body: { token: "signed.jwt", returnSecureToken: true },
  auth: false,
  json: { idToken: "id.token", refreshToken: "refresh", expiresIn: "3600" },
};

test("the test owner is found, signed in through IAM and the shop's web key, and handed to the browser", async () => {
  const fetch = scriptedFetch([
    { method: "POST", url: "https://identitytoolkit.googleapis.com/v1/projects/lmb-test-shop/accounts:lookup", body: { email: ["owner@example.com"] }, json: { users: [{ localId: "u1", email: "owner@example.com", emailVerified: true }] } },
    signJwt("u1"),
    signIn,
  ]);
  const session = await testOwnerSession({ identity: identityClient({ fetch, token, now: () => NOW }), shop, profile, serviceAccount: SA, now: () => NOW });
  assert.equal(session.idToken, "id.token");
  assert.equal(session.user.uid, "u1");
  assert.equal(session.user.emailVerified, true);
  assert.deepEqual(session.user.stsTokenManager, { refreshToken: "refresh", accessToken: "id.token", expirationTime: NOW.getTime() + 3_600_000 });
  fetch.done();
});

test("a missing test owner is made with a verified email; an unverified one is verified", async () => {
  const fetch = scriptedFetch([
    { method: "POST", url: "https://identitytoolkit.googleapis.com/v1/projects/lmb-test-shop/accounts:lookup", body: { email: ["owner@example.com"] }, json: {} },
    { method: "POST", url: "https://identitytoolkit.googleapis.com/v1/projects/lmb-test-shop/accounts", body: { email: "owner@example.com", emailVerified: true }, json: { localId: "new" } },
    { method: "POST", url: "https://identitytoolkit.googleapis.com/v1/projects/lmb-test-shop/accounts:lookup", body: { email: ["owner@example.com"] }, json: { users: [{ localId: "u2", email: "Owner@example.com", emailVerified: false }] } },
    { method: "POST", url: "https://identitytoolkit.googleapis.com/v1/projects/lmb-test-shop/accounts:update", body: { localId: "u2", emailVerified: true }, json: {} },
  ]);
  const identity = identityClient({ fetch, token });
  assert.deepEqual(await identity.ensureUser("lmb-test-shop", "owner@example.com"), { uid: "new", email: "owner@example.com", created: true });
  assert.equal((await identity.ensureUser("lmb-test-shop", "owner@example.com")).uid, "u2");
  fetch.done();
});

test("only the test shop's owner is ever signed in by the platform", async () => {
  const fetch = scriptedFetch([]);
  await assert.rejects(testOwnerSession({ identity: identityClient({ fetch, token }), shop: { ...shop, testShop: false }, profile, serviceAccount: SA }), /not the platform's test shop/);
  fetch.done();
});

test("Google's own message comes through when a call is refused", async () => {
  const fetch = scriptedFetch([{ ...signJwt("u1"), status: 403, json: { error: { code: 403, status: "PERMISSION_DENIED", message: "Permission 'iam.serviceAccounts.signJwt' denied" } } }]);
  await assert.rejects(identityClient({ fetch, token, now: () => NOW }).customToken(SA, "u1"), /iam.serviceAccounts.signJwt' denied/);
});

test("a custom token can carry claims (a support visit) on the person's pass", async () => {
  const claims = { support: { by: "admin@example.com", reason: "help with tax", until: IAT + 1800 } };
  const fetch = scriptedFetch([{ ...signJwt("colophon-support"), body: { payload: JSON.stringify({ iss: SA, sub: SA, aud: CUSTOM_TOKEN_AUDIENCE, iat: IAT, exp: IAT + 3600, uid: "colophon-support", claims }) } }]);
  assert.equal(await identityClient({ fetch, token, now: () => NOW }).customToken(SA, "colophon-support", claims), "signed.jwt");
  fetch.done();
});
