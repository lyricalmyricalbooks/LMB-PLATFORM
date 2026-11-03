import { describe, expect, it } from "vitest";
import backup from "./twoStepBackup.js";

const { cleanBackupCode, hashCode, makeBackupCodes, makeProblem, backupStatus, makeBackup, googleEmailOf, spendBackup, BackupRefused, FRESH_MS } = backup;

// A small Firestore stand-in: docs by "collection/id", audit-log entries in a list, transactions run straight through.
function fakeDb() {
  const docs = new Map();
  const audit = [];
  const ref = (col, id) => ({
    get: async () => ({ exists: docs.has(`${col}/${id}`), data: () => docs.get(`${col}/${id}`) }),
    set: async (data, opts) => { docs.set(`${col}/${id}`, opts?.merge ? { ...(docs.get(`${col}/${id}`) || {}), ...data } : data); },
  });
  return {
    docs,
    audit,
    collection: col => ({ doc: id => ({ col, id, ...ref(col, id) }), add: async entry => { audit.push(entry); } }),
    runTransaction: async fn => fn({ get: r => r.get(), set: (r, data, opts) => r.set(data, opts) }),
  };
}

function fakeAuth(users) {
  const updates = [];
  return {
    updates,
    getUserByEmail: async email => {
      const user = users.find(u => u.email === email);
      if (!user) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
      return user;
    },
    updateUser: async (uid, change) => { updates.push({ uid, change }); },
  };
}

const googleSays = info => async url => ({ ok: !info.bad, json: async () => ({ iss: "https://accounts.google.com", email_verified: "true", ...info, url }) });
const NOW = Date.parse("2026-11-03T16:00:00Z");
const totp = (when = "2026-10-01T00:00:00Z") => ({ uid: "f1", factorId: "totp", enrollmentTime: when });

describe("backup codes", () => {
  it("makes ten different codes from letters that can't be misread", () => {
    const codes = makeBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
  });

  it("reads a code the same however it was typed", () => {
    expect(cleanBackupCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    expect(hashCode("abcde fghjk")).toBe(hashCode("ABCDE-FGHJK"));
  });

  it("keeps only hashes, and says how many are left", async () => {
    const db = fakeDb();
    const { codes } = await makeBackup({ db, uid: "u1", email: "owner@example.com", nowIso: "2026-11-03T16:00:00.000Z" });
    const stored = db.docs.get("twoStepBackup/u1");
    expect(JSON.stringify(stored)).not.toContain(codes[0]);
    expect(stored.hashes).toContain(hashCode(codes[0]));
    expect(await backupStatus(db, "u1")).toEqual({ left: 10, madeAt: "2026-11-03T16:00:00.000Z" });
    expect(await backupStatus(db, "nobody")).toEqual({ left: 0, madeAt: null });
    expect(db.audit[0].message).toMatch(/backup codes made for owner@example.com/);
  });
});

describe("who may make codes", () => {
  it("needs two-step turned on", () => {
    expect(makeProblem({ firebase: { sign_in_second_factor: "totp" } }, { multiFactor: { enrolledFactors: [] } }, NOW)).toMatch(/Turn on two-step/);
  });

  it("allows a sign-in finished with the code", () => {
    expect(makeProblem({ firebase: { sign_in_second_factor: "totp" }, auth_time: 1 }, { multiFactor: { enrolledFactors: [totp()] } }, NOW)).toBeNull();
  });

  it("allows the sign-in that just set it up, and refuses an old one", () => {
    const user = { multiFactor: { enrolledFactors: [totp(new Date(NOW - 60_000).toISOString())] } };
    expect(makeProblem({ firebase: {}, auth_time: (NOW - 5 * 60_000) / 1000 }, user, NOW)).toBeNull();
    expect(makeProblem({ firebase: {}, auth_time: (NOW - FRESH_MS - 60_000) / 1000 }, user, NOW)).toMatch(/sign in again/);
    const oldSetup = { multiFactor: { enrolledFactors: [totp()] } };
    expect(makeProblem({ firebase: {}, auth_time: NOW / 1000 }, oldSetup, NOW)).toMatch(/sign in again/);
  });
});

describe("Google's check of the first step", () => {
  it("returns the verified address", async () => {
    expect(await googleEmailOf({ idToken: "t" }, googleSays({ email: "Owner@Example.com" }))).toBe("owner@example.com");
  });

  it("refuses an unverified address, a token Google rejects, a stranger issuer, and no token", async () => {
    expect(await googleEmailOf({ idToken: "t" }, googleSays({ email: "a@example.com", email_verified: "false" }))).toBeNull();
    expect(await googleEmailOf({ idToken: "t" }, googleSays({ bad: true }))).toBeNull();
    expect(await googleEmailOf({ idToken: "t" }, googleSays({ email: "a@example.com", iss: "https://evil.example" }))).toBeNull();
    expect(await googleEmailOf({}, googleSays({ email: "a@example.com" }))).toBeNull();
  });

  it("accepts an access token when Google gave no ID token", async () => {
    let asked = "";
    const fetchImpl = async url => { asked = url; return { ok: true, json: async () => ({ email: "a@example.com", email_verified: "true" }) }; };
    expect(await googleEmailOf({ accessToken: "x" }, fetchImpl)).toBe("a@example.com");
    expect(asked).toContain("access_token=x");
  });
});

describe("using a code", () => {
  async function setUp() {
    const db = fakeDb();
    const { codes } = await makeBackup({ db, uid: "u1", email: "owner@example.com", nowIso: "2026-11-03T10:00:00.000Z" });
    const auth = fakeAuth([{ uid: "u1", email: "owner@example.com", multiFactor: { enrolledFactors: [totp()] } }]);
    return { db, auth, codes };
  }

  it("takes the authenticator app off, spends the code, and logs it", async () => {
    const { db, auth, codes } = await setUp();
    const result = await spendBackup({ db, auth, google: { idToken: "t" }, code: codes[3].toLowerCase(), nowIso: "2026-11-03T16:00:00.000Z", fetchImpl: googleSays({ email: "owner@example.com" }) });
    expect(result).toEqual({ left: 9 });
    expect(auth.updates).toEqual([{ uid: "u1", change: { multiFactor: { enrolledFactors: null } } }]);
    expect(db.audit.at(-1).message).toMatch(/owner@example.com signed in with a two-step backup code.*9 codes left/);
  });

  it("works once per code", async () => {
    const { db, auth, codes } = await setUp();
    const args = { db, auth, google: { idToken: "t" }, code: codes[0], nowIso: "x", fetchImpl: googleSays({ email: "owner@example.com" }) };
    await spendBackup(args);
    await expect(spendBackup(args)).rejects.toThrow(/didn't work/);
  });

  it("refuses a wrong code without touching the sign-in", async () => {
    const { db, auth } = await setUp();
    await expect(spendBackup({ db, auth, google: { idToken: "t" }, code: "AAAAA-AAAAA", nowIso: "x", fetchImpl: googleSays({ email: "owner@example.com" }) })).rejects.toThrow(BackupRefused);
    expect(auth.updates).toEqual([]);
    expect((await backupStatus(db, "u1")).left).toBe(10);
  });

  it("refuses a good code without Google's proof, or with someone else's", async () => {
    const { db, auth, codes } = await setUp();
    await expect(spendBackup({ db, auth, google: {}, code: codes[0], nowIso: "x", fetchImpl: googleSays({ email: "owner@example.com" }) })).rejects.toMatchObject({ status: 401 });
    const stranger = fakeAuth([{ uid: "u2", email: "someone@example.com", multiFactor: { enrolledFactors: [totp()] } }]);
    await expect(spendBackup({ db, auth: stranger, google: { idToken: "t" }, code: codes[0], nowIso: "x", fetchImpl: googleSays({ email: "someone@example.com" }) })).rejects.toThrow(/didn't work/);
    expect(auth.updates).toEqual([]);
    expect(stranger.updates).toEqual([]);
  });

  it("keeps a phone second step when only the app comes off", async () => {
    const db = fakeDb();
    const { codes } = await makeBackup({ db, uid: "u1", email: "owner@example.com", nowIso: "x" });
    const phone = { uid: "p1", factorId: "phone", phoneNumber: "+15555550100", displayName: "Phone" };
    const auth = fakeAuth([{ uid: "u1", email: "owner@example.com", multiFactor: { enrolledFactors: [totp(), phone] } }]);
    await spendBackup({ db, auth, google: { idToken: "t" }, code: codes[0], nowIso: "x", fetchImpl: googleSays({ email: "owner@example.com" }) });
    expect(auth.updates[0].change.multiFactor.enrolledFactors).toEqual([phone]);
  });
});
