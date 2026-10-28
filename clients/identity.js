// Signing the test owner in without a person: the release check opens the test shop's admin and stockroom as the test
// owner, and both apps only offer Google sign-in in a pop-up, which a scripted browser can't use. Instead the platform
// makes a sign-in for that one account itself and hands it to the browser (release-check/browser.js puts it where
// Firebase keeps a signed-in user).
//
// Endpoints, from Google's discovery documents:
//   IAM Credentials v1  projects.serviceAccounts.signJwt   POST https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{email}:signJwt
//                       body { payload } -> { keyId, signedJwt }
//   Identity Toolkit v1 projects.accounts.lookup  POST https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts:lookup
//                       body { email: [..] } -> { users: [{ localId, email, emailVerified, ... }] }
//                       projects.accounts          POST https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts
//                       body { email, emailVerified } -> { localId }
//                       projects.accounts.update   POST https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts:update
//                       body { localId, emailVerified }
//                       accounts.signInWithCustomToken POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={web key}
//                       body { token, returnSecureToken: true } -> { idToken, refreshToken, expiresIn }
// The custom token's claims (iss, sub, aud, iat, exp, uid) follow Firebase's "create custom tokens using a third-party
// JWT library" guide; it is signed by the platform's service account, which needs "Service Account Token Creator" on
// itself and must be allowed to manage the test shop's users.
//
// Only the test shop's owner is ever signed in this way: `testOwnerSession` refuses any shop not marked as the test shop.
import { googleHttp } from "./http.js";

export const IDENTITY = "https://identitytoolkit.googleapis.com/v1";
export const IAM_CREDENTIALS = "https://iamcredentials.googleapis.com/v1";
export const CUSTOM_TOKEN_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

export function identityClient({ fetch, token, now = () => new Date() }) {
  const call = googleHttp({ fetch, token });

  /** The account for `email` on the shop's project, made (email verified) when missing. */
  async function ensureUser(projectId, email) {
    const { users = [] } = await call("POST", `${IDENTITY}/projects/${projectId}/accounts:lookup`, { body: { email: [email] } });
    const found = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      // Both apps refuse an owner whose email isn't verified.
      if (!found.emailVerified) await call("POST", `${IDENTITY}/projects/${projectId}/accounts:update`, { body: { localId: found.localId, emailVerified: true } });
      return { uid: found.localId, email: found.email, created: false };
    }
    const made = await call("POST", `${IDENTITY}/projects/${projectId}/accounts`, { body: { email, emailVerified: true } });
    return { uid: made.localId, email, created: true };
  }

  /**
   * A custom sign-in token for `uid`, signed by `serviceAccount` through IAM (no key file anywhere). `claims` are
   * added to the person's sign-in pass (control-room/supportAccess.js uses them for a support visit).
   */
  async function customToken(serviceAccount, uid, claims = undefined) {
    const iat = Math.floor(now().getTime() / 1000);
    const payload = { iss: serviceAccount, sub: serviceAccount, aud: CUSTOM_TOKEN_AUDIENCE, iat, exp: iat + 3600, uid, ...(claims ? { claims } : {}) };
    const { signedJwt } = await call("POST", `${IAM_CREDENTIALS}/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signJwt`, { body: { payload: JSON.stringify(payload) } });
    if (!signedJwt) throw new Error("IAM gave no signed token");
    return signedJwt;
  }

  /** Signs in with the custom token through the shop's public web key, as the apps' own sign-in would. */
  async function signIn(apiKey, customTokenText) {
    const result = await call("POST", `${IDENTITY}/accounts:signInWithCustomToken`, { query: { key: apiKey }, body: { token: customTokenText, returnSecureToken: true }, auth: false });
    if (!result.idToken || !result.refreshToken) throw new Error("the sign-in gave no tokens");
    return result;
  }

  return { ensureUser, customToken, signIn };
}

/**
 * The test owner's signed-in user, ready for the browser: `{ apiKey, user }`, where `user` is what Firebase's web SDK
 * keeps for a signed-in user. `shop` is the registry row (`testShop` must be true), `profile` its public profile.
 */
export async function testOwnerSession({ identity, shop, profile, serviceAccount, now = () => new Date() }) {
  if (shop?.testShop !== true) throw new Error(`${shop?.shopId ?? "this shop"} is not the platform's test shop; only the test owner is ever signed in by the platform`);
  const { apiKey, projectId } = profile.firebase;
  const { uid, email } = await identity.ensureUser(projectId, shop.ownerEmail);
  const signed = await identity.signIn(apiKey, await identity.customToken(serviceAccount, uid));
  const at = now().getTime();
  return {
    apiKey,
    idToken: signed.idToken,
    user: {
      uid,
      email,
      emailVerified: true,
      isAnonymous: false,
      providerData: [],
      stsTokenManager: { refreshToken: signed.refreshToken, accessToken: signed.idToken, expirationTime: at + Number(signed.expiresIn ?? 3600) * 1000 },
      createdAt: String(at),
      lastLoginAt: String(at),
      apiKey,
      appName: "[DEFAULT]",
    },
  };
}
