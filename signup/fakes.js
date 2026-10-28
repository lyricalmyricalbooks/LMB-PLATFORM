// In-memory stand-ins for the sign-up stores, for tests. The real ones are Firestore collections in the platform
// project (`accounts`, `signups`, `throttle`) with the same calls.

export function fakeSignupStores() {
  const accounts = new Map();
  const signups = new Map();
  const hits = new Map();
  return {
    accounts: { rows: accounts, get: async (id) => (accounts.has(id) ? structuredClone(accounts.get(id)) : null), set: async (id, row) => void accounts.set(id, structuredClone(row)) },
    signups: {
      rows: signups,
      get: async (id) => (signups.has(id) ? structuredClone(signups.get(id)) : null),
      set: async (id, row) => void signups.set(id, structuredClone(row)),
      listByAccount: async (accountId) => structuredClone([...signups.values()].filter((row) => row.accountId === accountId)),
      list: async () => structuredClone([...signups.values()]),
    },
    throttle: {
      count: async (key, since) => (hits.get(key) ?? []).filter((at) => at >= since).length,
      add: async (key, at) => void hits.set(key, [...(hits.get(key) ?? []), at]),
    },
  };
}

/** Firebase Admin's sign-in link maker, pretend. */
export const fakeAuth = () => ({ signInLink: async (email, { url }) => `${url}&oobCode=fake-${encodeURIComponent(email)}` });

/** A pretend token check: the token is the JSON of the claims. */
export const fakeVerifyIdToken = async (token) => JSON.parse(token);

/**
 * Pretend waitlist invites (the control room's, waitlist/invites.js): `emails` are invited; `used` records each
 * markUsed(email, shopId).
 */
export function fakeInvites(emails = []) {
  const invited = new Set(emails.map((e) => e.toLowerCase()));
  const used = new Map();
  return {
    used,
    invite: (email) => void invited.add(email.toLowerCase()),
    isInvited: async (email) => invited.has(String(email).toLowerCase()) && !used.has(String(email).toLowerCase()),
    markUsed: async (email, shopId) => void (used.has(email.toLowerCase()) || used.set(email.toLowerCase(), shopId)),
  };
}
