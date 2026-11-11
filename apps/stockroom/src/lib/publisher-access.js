// Who opens the stockroom as the publisher. Must match isPublisher() in firestore.rules, storage.rules and
// database.rules.json, or the publisher screens would open for an account the backend then refuses.
// The owner address, or the "owner" role the shop's server copies onto the sign-in pass from the owner's
// Team list. Staff are not publishers here (the stockroom holds secret keys and the books' money).
// The rules hold a slot for the owner address, filled per shop at deploy (scripts/deployConfig.mjs from the platform
// registry's owner); OWNER_EMAIL below is the placeholder, and the page never learns the real address. So when the
// pass carries no owner role (the shop's own owner, and every owner of a shop without the shop app, which has no
// server to put a role on the pass), the page asks the rules themselves (askRules: firestore.rules publisherCheck).

export const OWNER_EMAIL = 'owner@example.com';

// How long to wait for the sign-in pass's role before treating it as none (offline with an expired pass).
const CLAIMS_WAIT_MS = 2500;

export function isOwnerEmail(user) {
  return !!user && user.emailVerified === true && (user.email || '').toLowerCase().trim() === OWNER_EMAIL;
}

/** The publisher check from a user and the claims on their sign-in pass. */
export function isPublisherPass(user, claims) {
  if (!user || user.emailVerified !== true) return false;
  return isOwnerEmail(user) || claims?.role === 'owner';
}

/** The claims on the user's sign-in pass, or {} when they can't be read in time. Never throws. */
export async function readPassClaims(user, waitMs = CLAIMS_WAIT_MS) {
  if (!user || typeof user.getIdTokenResult !== 'function') return {};
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({}), waitMs); });
  try {
    const read = user.getIdTokenResult().then(r => r?.claims || {}, () => ({}));
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const REMEMBER_KEY = 'lm-publisher-uid';
const browserStore = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

/**
 * The publisher check for a signed-in user; the owner address answers without reading the pass. With `askRules`
 * (firebase.js _fbAskRulesIfPublisher: true, false, or null when the server can't be asked), an account the pass
 * doesn't name is let in when the rules allow it. The answer is remembered for this account on this device only for
 * the offline start; a refusal forgets it at once, and the rules still guard every read and write.
 */
export async function isPublisherUser(user, { askRules = null, store = browserStore() } = {}) {
  if (!user || user.emailVerified !== true) return false;
  if (isOwnerEmail(user)) return true;
  if (isPublisherPass(user, await readPassClaims(user))) return true;
  if (typeof askRules !== 'function' || !user.uid) return false;
  let answer = null;
  try { answer = await askRules(); } catch { answer = null; }
  try {
    if (answer === true) store?.setItem(REMEMBER_KEY, user.uid);
    else if (answer === false && store?.getItem(REMEMBER_KEY) === user.uid) store.removeItem(REMEMBER_KEY);
  } catch { /* storage blocked: decide from the answer alone */ }
  if (answer !== null) return answer;
  try { return store?.getItem(REMEMBER_KEY) === user.uid; } catch { return false; }
}

// How long to wait for the shop's server to name a Team role before carrying on without one.
const ROLE_ASK_WAIT_MS = 5000;

/**
 * The address of one of the shop server's functions, on the plan with both apps only (the shop app brings the server:
 * the Team, payments). '' when there is no shop server to ask, or on the demo shop.
 */
export function shopFunctionUrl(profile, name, { emulators = false } = {}) {
  if (emulators || profile?.apps?.shop !== true || profile?.apps?.stockroom !== true) return '';
  const project = profile?.firebase?.projectId;
  const region = profile?.functionsRegion;
  if (!project || !region || !/^[A-Za-z]+$/.test(String(name || ''))) return '';
  // Every shop shares one server (the shared system), so the address names the shop, as the shop's own pages do.
  const shop = typeof profile?.shopId === 'string' && profile.shopId ? `?${new URLSearchParams({ shop: profile.shopId })}` : '';
  return `https://${region}-${project}.cloudfunctions.net/${name}${shop}`;
}

/** The shop server's "what is my role" address (it keeps the Team and puts each person's role on their pass). */
export function shopRoleUrl(profile, options) {
  return shopFunctionUrl(profile, 'refreshMyRole', options);
}

/**
 * Calls a shop function as the signed-in person: their answer as JSON, or { error } with the server's sentence.
 * Throws only when the server can't be reached (no signal), so the caller can say so.
 */
export async function callShopFunction(user, url, body, { fetchFn = globalThis.fetch } = {}) {
  if (!url || !user || typeof user.getIdToken !== 'function') return { error: 'This needs the shop app.' };
  const token = await user.getIdToken();
  const res = await fetchFn(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const answer = await res.json().catch(() => ({}));
  return res.ok ? answer : { error: typeof answer?.error === 'string' ? answer.error : 'The shop couldn\'t do that just now.' };
}

/**
 * Someone the owner added to the Team before they ever signed in has no role on their pass yet: the shop's server can
 * only add it once the account exists. This asks it to (the shop admin does the same after sign-in), then reads the
 * renewed pass. The fresh claims, or null when nothing changed or the server couldn't be reached. Never throws.
 */
export async function askShopForRole(user, { url, fetchFn = globalThis.fetch, waitMs = ROLE_ASK_WAIT_MS } = {}) {
  if (!url || !user || user.emailVerified !== true || typeof fetchFn !== 'function') return null;
  if (typeof user.getIdToken !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
  try {
    const token = await user.getIdToken();
    const res = await fetchFn(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: controller?.signal });
    if (!res?.ok) return null;
    const body = await res.json().catch(() => null);
    if (!body?.role || body.role === 'owner') return null;
    // The role is on the pass now; a fresh pass carries it.
    await user.getIdToken(true);
    const fresh = await readPassClaims(user, waitMs);
    return fresh?.role ? fresh : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
