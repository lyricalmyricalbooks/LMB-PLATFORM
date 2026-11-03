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

/** Pretend front door records (signup/frontDoor.js), the shape of clients/platformStores.js firestoreFrontDoorStores. */
export function fakeFrontDoorStores() {
  const presses = new Map();
  const codes = new Map();
  const copy = (row) => (row ? structuredClone(row) : null);
  // Read, decide and write with no wait between, like the real store's transaction.
  const atOnce = (rows, key, change) => {
    const { row, result } = change(copy(rows.get(key)));
    if (row) rows.set(key, structuredClone(row));
    return result;
  };
  return {
    presses: {
      rows: presses,
      get: async (id) => copy(presses.get(id)),
      set: async (id, row) => void presses.set(id, structuredClone(row)),
      create: async (id, row) => (presses.has(id) ? false : (presses.set(id, structuredClone(row)), true)),
      listByOwner: async (ownerUid) => [...presses.values()].filter((row) => row.ownerUid === ownerUid).map(copy),
      list: async () => [...presses.values()].map(copy),
      update: async (id, change) => atOnce(presses, id, change),
    },
    codes: {
      rows: codes,
      get: async (key) => copy(codes.get(key)),
      update: async (key, change) => atOnce(codes, key, change),
    },
  };
}

/**
 * A pretend store for kept product files (signup/frontDoor.js `stagedFiles`). An upload link is `${uploadBase}/<token>`
 * and works once, for its own path and size, until it expires; `put(token, bytes)` is what the upload does (the
 * walkthrough's server calls it for a PUT to that link). `files` holds what was kept, by path.
 */
export function fakeStagedFiles({ uploadBase = "https://uploads.example", now = () => new Date() } = {}) {
  const files = new Map();
  const links = new Map();
  let n = 0;
  return {
    files,
    links,
    uploadUrl: async (path, { contentType, size, expiresAt }) => {
      const token = `up${(n += 1)}`;
      links.set(token, { path, size, contentType, expiresAt: expiresAt.getTime() });
      return { url: `${uploadBase}/${token}`, method: "PUT", headers: { "Content-Type": contentType } };
    },
    put: async (token, bytes) => {
      const link = links.get(token);
      if (!link || link.expiresAt < now().getTime()) return { ok: false, status: 403 };
      if (bytes.length !== link.size) return { ok: false, status: 400 };
      links.delete(token);
      files.set(link.path, Buffer.from(bytes));
      return { ok: true, status: 200 };
    },
    stat: async (path) => (files.has(path) ? { size: files.get(path).length } : null),
    read: async (path) => files.get(path) ?? null,
    remove: async (path) => void files.delete(path),
  };
}

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

/** A throttle store on its own (the fair-use limits, limits.js), in memory: `hits` by key; `fail` makes calls throw. */
export function fakeThrottle() {
  const hits = new Map();
  const store = {
    hits,
    fail: false,
    count: async (key, since) => {
      if (store.fail) throw new Error("the counter is down (pretend error)");
      return (hits.get(key) ?? []).filter((at) => at >= since).length;
    },
    add: async (key, at) => {
      if (store.fail) throw new Error("the counter is down (pretend error)");
      hits.set(key, [...(hits.get(key) ?? []), at]);
    },
    // Counts and adds with no wait between, like the real store's transaction.
    addIfUnder: async (key, since, at, max) => {
      if (store.fail) throw new Error("the counter is down (pretend error)");
      const kept = hits.get(key) ?? [];
      if (kept.filter((hit) => hit >= since).length >= max) return false;
      hits.set(key, [...kept, at]);
      return true;
    },
  };
  return store;
}
