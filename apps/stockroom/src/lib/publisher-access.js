// Who opens the stockroom as the publisher. Must match isPublisher() in firestore.rules, storage.rules and
// database.rules.json, or the publisher screens would open for an account the backend then refuses.
// The owner address, or the "owner" role the shop's server copies onto the sign-in pass from the owner's
// Team list. Staff are not publishers here (the stockroom holds secret keys and the books' money).

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

/** The publisher check for a signed-in user; the owner address answers without reading the pass. */
export async function isPublisherUser(user) {
  if (!user || user.emailVerified !== true) return false;
  if (isOwnerEmail(user)) return true;
  return isPublisherPass(user, await readPassClaims(user));
}
