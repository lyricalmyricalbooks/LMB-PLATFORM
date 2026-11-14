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
//                       body { localId, emailVerified }; body { localId, mfa: {} } takes every second step off (what the
//                       Admin SDK sends for `multiFactor: { enrolledFactors: null }`; a lookup lists them as `mfaInfo`)
//                       accounts.signInWithCustomToken POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={web key}
//                       body { token, returnSecureToken: true } -> { idToken, refreshToken, expiresIn }
//   Resource Manager v1 projects.getIamPolicy / projects.setIamPolicy  POST https://cloudresourcemanager.googleapis.com/v1/projects/{project}:getIamPolicy
//                       body { options: { requestedPolicyVersion: 3 } } -> policy; :setIamPolicy body { policy }
// The custom token's claims (iss, sub, aud, iat, exp, uid) follow Firebase's "create custom tokens using a third-party
// JWT library" guide. Firebase takes it only when it is signed by a service account of the sign-in's own project, so
// the test owner's pass is signed by that project's Firebase admin account (`projectSigner`); the caller needs
// "Service Account Token Creator" on it, which `allowSigning` gives (IAM v1 serviceAccounts getIamPolicy/setIamPolicy).
//
// Only the test shop's owner is ever signed in this way: `testOwnerSession` refuses any shop not marked as the test shop.
//
// The shared system (docs/shared-system.md): every shop has its own sign-in list (an Identity Platform tenant) in the
// shared project. Each call takes `{ tenantId }` (the profile's `tenant`): the account calls send it as the request's
// `tenantId`, a custom token carries it as `tenant_id`, and the sign-in sends it too, so the pass belongs to that shop's
// list. No tenant: the project's own list (a project with one shop, such as the demo).
import { googleHttp } from "./http.js";

export const IDENTITY = "https://identitytoolkit.googleapis.com/v1";
export const IAM_CREDENTIALS = "https://iamcredentials.googleapis.com/v1";
export const IAM = "https://iam.googleapis.com/v1";
export const RESOURCE_MANAGER = "https://cloudresourcemanager.googleapis.com/v1";
/** Lets the platform's server read a test shop's sign-in list and add its owner there (Firebase Authentication Admin). */
export const AUTH_ADMIN = "roles/firebaseauth.admin";
export const TOKEN_CREATOR = "roles/iam.serviceAccountTokenCreator";
/** The Firebase admin account every Firebase project has: the one whose signature that project's sign-in accepts. */
export const projectSigner = (projectId) => `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com`;
export const CUSTOM_TOKEN_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

export function identityClient({ fetch, token, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), signRetries = 8 }) {
  const call = googleHttp({ fetch, token });

  /** `tenantId` in a request body, when the shop has its own sign-in list. */
  const inList = (tenantId) => (tenantId ? { tenantId } : {});

  /** The account for `email` on the shop's sign-in list, made (email verified) when missing. */
  async function ensureUser(projectId, email, { tenantId = null } = {}) {
    const { users = [] } = await call("POST", `${IDENTITY}/projects/${projectId}/accounts:lookup`, { body: { email: [email], ...inList(tenantId) } });
    const found = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      // Both apps refuse an owner whose email isn't verified.
      if (!found.emailVerified) await call("POST", `${IDENTITY}/projects/${projectId}/accounts:update`, { body: { localId: found.localId, emailVerified: true, ...inList(tenantId) } });
      return { uid: found.localId, email: found.email, created: false };
    }
    const made = await call("POST", `${IDENTITY}/projects/${projectId}/accounts`, { body: { email, emailVerified: true, ...inList(tenantId) } });
    return { uid: made.localId, email, created: true };
  }

  /**
   * A custom sign-in token for `uid`, signed by `serviceAccount` through IAM (no key file anywhere). `claims` are
   * added to the person's sign-in pass (control-room/supportAccess.js uses them for a support visit).
   */
  async function customToken(serviceAccount, uid, claims = undefined, { tenantId = null } = {}) {
    const iat = Math.floor(now().getTime() / 1000);
    const payload = { iss: serviceAccount, sub: serviceAccount, aud: CUSTOM_TOKEN_AUDIENCE, iat, exp: iat + 3600, uid, ...(tenantId ? { tenant_id: tenantId } : {}), ...(claims ? { claims } : {}) };
    // A signing permission just given takes a minute or two to reach IAM: a refusal is asked again for a while.
    let signedJwt;
    for (let attempt = 0; ; attempt += 1) {
      try {
        ({ signedJwt } = await call("POST", `${IAM_CREDENTIALS}/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signJwt`, { body: { payload: JSON.stringify(payload) } }));
        break;
      } catch (error) {
        if (error?.status !== 403 || attempt >= signRetries) throw error;
        await sleep(15_000);
      }
    }
    if (!signedJwt) throw new Error("IAM gave no signed token");
    return signedJwt;
  }

  /**
   * Lets `member` (e.g. "serviceAccount:deploy@…") sign as `signer`: Service Account Token Creator on that one account.
   * Safe to run again: { changed: false } when it is already there.
   */
  async function allowSigning(signer, member) {
    const resource = `${IAM}/projects/-/serviceAccounts/${encodeURIComponent(signer)}`;
    const policy = await call("POST", `${resource}:getIamPolicy`, { body: {} });
    const bindings = structuredClone(policy.bindings ?? []);
    const binding = bindings.find((b) => b.role === TOKEN_CREATOR && !b.condition);
    if (binding?.members?.includes(member)) return { changed: false };
    if (binding) binding.members = [...(binding.members ?? []), member];
    else bindings.push({ role: TOKEN_CREATOR, members: [member] });
    await call("POST", `${resource}:setIamPolicy`, { body: { policy: { ...policy, bindings } } });
    return { changed: true };
  }

  /**
   * Gives `member` the project role `role` on `projectId` (Resource Manager v1 getIamPolicy/setIamPolicy). Safe to run
   * again: { changed: false } when it is already there. Used to let the platform's server open the test shops' admins.
   */
  async function allowProjectRole(projectId, role, member) {
    const resource = `${RESOURCE_MANAGER}/projects/${projectId}`;
    const policy = await call("POST", `${resource}:getIamPolicy`, { body: { options: { requestedPolicyVersion: 3 } } });
    const bindings = structuredClone(policy.bindings ?? []);
    const binding = bindings.find((b) => b.role === role && !b.condition);
    if (binding?.members?.includes(member)) return { changed: false };
    if (binding) binding.members = [...(binding.members ?? []), member];
    else bindings.push({ role, members: [member] });
    await call("POST", `${resource}:setIamPolicy`, { body: { policy: { ...policy, bindings, version: 3 } } });
    return { changed: true };
  }

  /** Signs in with the custom token through the shop's public web key, as the apps' own sign-in would. */
  async function signIn(apiKey, customTokenText, { tenantId = null } = {}) {
    const result = await call("POST", `${IDENTITY}/accounts:signInWithCustomToken`, { query: { key: apiKey }, body: { token: customTokenText, returnSecureToken: true, ...inList(tenantId) }, auth: false });
    if (!result.idToken || !result.refreshToken) throw new Error("the sign-in gave no tokens");
    return result;
  }

  /**
   * Takes every second step (authenticator app, phone) off the sign-in of `email` on the shop's project, for someone
   * who lost both their phone and their backup codes (control room, plan 22.11). { found, removed }: removed counts them.
   */
  async function removeSecondSteps(projectId, email, { tenantId = null } = {}) {
    const { users = [] } = await call("POST", `${IDENTITY}/projects/${projectId}/accounts:lookup`, { body: { email: [email], ...inList(tenantId) } });
    const found = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (!found) return { found: false, removed: 0 };
    const removed = Array.isArray(found.mfaInfo) ? found.mfaInfo.length : 0;
    if (removed) await call("POST", `${IDENTITY}/projects/${projectId}/accounts:update`, { body: { localId: found.localId, mfa: {}, ...inList(tenantId) } });
    return { found: true, removed };
  }

  /**
   * Who has a second step on the shop's project, for the control room's sign-in safety (read only):
   * [{ email, found, uid, steps }] in the order asked. One lookup call for every address.
   */
  async function secondStepsOf(projectId, emails, { tenantId = null } = {}) {
    if (!emails.length) return [];
    const { users = [] } = await call("POST", `${IDENTITY}/projects/${projectId}/accounts:lookup`, { body: { email: emails, ...inList(tenantId) } });
    return emails.map((email) => {
      const found = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
      const last = Number(found?.lastLoginAt);
      return found
        ? { email, found: true, uid: found.localId, steps: Array.isArray(found.mfaInfo) ? found.mfaInfo.length : 0, lastSignInAt: Number.isFinite(last) && last > 0 ? new Date(last).toISOString() : null }
        : { email, found: false, uid: null, steps: 0, lastSignInAt: null };
    });
  }

  return { ensureUser, customToken, allowSigning, allowProjectRole, signIn, removeSecondSteps, secondStepsOf };
}

/**
 * A custom sign-in token for a test shop's owner, on that shop's own sign-in list: `{ uid, email, list, customToken }`.
 * The release check signs in with it (testOwnerSession), and the control room's "Open admin" hands it to the owner's
 * browser (control-room/supportAccess.js testShopOwnerAccess), which signs in with it as the owner. Refuses any shop that
 * isn't one of the platform's own test shops.
 */
export async function testOwnerToken({ identity, shop, profile, serviceAccount }) {
  if (shop?.testShop !== true) throw new Error(`${shop?.shopId ?? "this shop"} is not the platform's test shop; only the test owner is ever signed in by the platform`);
  const { projectId } = profile.firebase;
  // The shop's own sign-in list: a shop in the shared system names it on its registry row (setup/sharedSteps.js step 2);
  // its served profile carries it too, but the registry's copy of the profile doesn't.
  const list = { tenantId: profile.tenant ?? (shop.shared === true ? shop.tenant : null) ?? null };
  const { uid, email } = await identity.ensureUser(projectId, shop.ownerEmail, list);
  const signer = serviceAccount || projectSigner(projectId);
  return { uid, email, list, customToken: await identity.customToken(signer, uid, undefined, list) };
}

/**
 * The test owner's signed-in user, ready for the browser: `{ apiKey, user }`, where `user` is what Firebase's web SDK
 * keeps for a signed-in user. `shop` is the registry row (`testShop` must be true), `profile` its public profile.
 */
export async function testOwnerSession({ identity, shop, profile, serviceAccount, now = () => new Date() }) {
  const { apiKey } = profile.firebase;
  const { uid, email, list, customToken } = await testOwnerToken({ identity, shop, profile, serviceAccount });
  const signed = await identity.signIn(apiKey, customToken, list);
  const at = now().getTime();
  return {
    apiKey,
    idToken: signed.idToken,
    user: {
      uid,
      email,
      emailVerified: true,
      isAnonymous: false,
      tenantId: list.tenantId,
      providerData: [],
      stsTokenManager: { refreshToken: signed.refreshToken, accessToken: signed.idToken, expirationTime: at + Number(signed.expiresIn ?? 3600) * 1000 },
      createdAt: String(at),
      lastLoginAt: String(at),
      apiKey,
      appName: "[DEFAULT]",
    },
  };
}

/**
 * The platform's own sign-ins (Delete my account, accounts/deleteAccount.js). Identity Toolkit v1
 * projects.accounts.delete: POST {IDENTITY}/projects/{project}/accounts:delete, body { localId }. A sign-in that is
 * already gone counts as deleted, so a retry after a half-finished deletion succeeds.
 */
export function platformAuthUsers({ fetch, token, projectId }) {
  const call = googleHttp({ fetch, token });
  return {
    async remove(uid) {
      if (typeof uid !== "string" || !uid) throw new Error("Which sign-in?");
      try {
        await call("POST", `${IDENTITY}/projects/${projectId}/accounts:delete`, { body: { localId: uid } });
      } catch (error) {
        if (/USER_NOT_FOUND/.test(String(error?.message ?? ""))) return;
        throw error;
      }
    },
  };
}
