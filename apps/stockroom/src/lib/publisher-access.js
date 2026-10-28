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
