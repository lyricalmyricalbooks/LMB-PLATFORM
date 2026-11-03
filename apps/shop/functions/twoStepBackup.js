// Backup codes for two-step sign-in (code plan 22.9). The admin's two-step sign-in (src/app/admin/adminTwoStep.ts)
// asks for a code from an authenticator app after Google. Someone who loses their phone types one of these codes
// instead: it takes their authenticator app off their sign-in, so Google alone lets them in, and Settings › Security
// asks them to set it up again.
//
// - Ten codes are made at a time, and each works once. Only their SHA-256 hashes are kept, in the server-only
//   `twoStepBackup/{uid}` (firestore.rules denies the browser). The person sees them once, when they are made.
// - Making codes needs a sign-in that was finished with the app's code. A brand-new setup counts too: the person
//   just typed a code to turn it on and signed in a few minutes ago.
// - Using a code needs Google's own proof of the first step: the Google sign-in token from the sign-in that asked for
//   the code. It must be checked by Google, for a verified address, and that address must belong to this person. So a
//   code alone never lets anyone in, and a Google password alone never does either.
// - Each use is written to the shop's audit log, and tries are rate-limited per connection.
const crypto = require("crypto");

const CODE_COUNT = 10;
// No 0/O, 1/I/L: a code copied from paper reads one way. 31 letters, 10 per code: about 49 bits each.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;
// A setup this recent, on a sign-in this recent, may make its first codes without signing in again with a code.
const FRESH_MS = 15 * 60 * 1000;
const TOTP = "totp";

/** The code as stored: capitals, no spaces or dashes ("abcde-fghjk" and "ABCDEFGHJK" are the same code). */
const cleanBackupCode = text => String(text || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
const hashCode = code => crypto.createHash("sha256").update(cleanBackupCode(code)).digest("hex");

/** Ten new codes, shown as "ABCDE-FGHJK". */
function makeBackupCodes(random = crypto.randomInt) {
  return Array.from({ length: CODE_COUNT }, () => {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[random(ALPHABET.length)];
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

const totpFactors = user => (user?.multiFactor?.enrolledFactors || []).filter(f => f.factorId === TOTP);

/**
 * May this signed-in person make new codes? Only with two-step on, and only from a sign-in finished with its code (or
 * the sign-in that set it up a moment ago). Returns null when they may, or the reason in plain words.
 */
function makeProblem(decoded, user, nowMs) {
  const apps = totpFactors(user);
  if (!apps.length) return "Turn on two-step sign-in first. Backup codes stand in for its code.";
  if (decoded?.firebase?.sign_in_second_factor === TOTP) return null;
  const setUp = Math.max(...apps.map(f => Date.parse(f.enrollmentTime) || 0));
  const signedIn = Number(decoded?.auth_time || 0) * 1000;
  if (nowMs - setUp <= FRESH_MS && nowMs - signedIn <= FRESH_MS) return null;
  return "For your safety, sign out and sign in again with your code, then make new backup codes.";
}

/** How many unused codes are left and when they were made: { left, madeAt } ({ left: 0, madeAt: null } if none). */
async function backupStatus(db, uid) {
  const snap = await db.collection("twoStepBackup").doc(uid).get();
  const data = snap.exists ? snap.data() : null;
  return { left: Array.isArray(data?.hashes) ? data.hashes.length : 0, madeAt: data?.madeAt || null };
}

/** Makes ten new codes (the old ones stop working) and returns them, the only time they are shown. */
async function makeBackup({ db, uid, email, nowIso, random }) {
  const codes = makeBackupCodes(random);
  await db.collection("twoStepBackup").doc(uid).set({ hashes: codes.map(hashCode), madeAt: nowIso, email: email || null });
  await db.collection("audit-log").add({ type: "security", message: `New two-step backup codes made for ${email || "a team member"}`, createdAt: nowIso })
    .catch(err => console.warn(`twoStepBackup: audit log not written: ${err.message}`));
  return { codes, madeAt: nowIso };
}

/**
 * Google's own check of the Google sign-in token: the verified address it was made for, or null. Google checks the
 * signature and expiry (tokeninfo); an ID token is preferred, and an access token is accepted when Google gave none.
 */
async function googleEmailOf({ idToken, accessToken }, fetchImpl = fetch) {
  const query = idToken ? `id_token=${encodeURIComponent(idToken)}` : accessToken ? `access_token=${encodeURIComponent(accessToken)}` : "";
  if (!query) return null;
  try {
    const res = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?${query}`);
    if (!res.ok) return null;
    const info = await res.json();
    const verified = info.email_verified === true || info.email_verified === "true";
    if (idToken && !["accounts.google.com", "https://accounts.google.com"].includes(info.iss)) return null;
    return verified && typeof info.email === "string" ? info.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

class BackupRefused extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const WRONG = "That backup code didn't work. Check it against your saved list: each code works once.";

/**
 * Uses one backup code: takes the authenticator app off this person's sign-in so Google alone lets them in.
 * `google` is { idToken, accessToken } from the Google sign-in that asked for the code. Returns { left }.
 */
async function spendBackup({ db, auth, google, code, nowIso, fetchImpl }) {
  const email = await googleEmailOf(google || {}, fetchImpl);
  if (!email) throw new BackupRefused("Sign in with Google again, then type your backup code.", 401);
  let user;
  try { user = await auth.getUserByEmail(email); } catch { throw new BackupRefused(WRONG); }
  const hash = hashCode(code);
  if (cleanBackupCode(code).length !== CODE_LENGTH) throw new BackupRefused(WRONG);
  const ref = db.collection("twoStepBackup").doc(user.uid);
  // The code is spent in a transaction first, so two tries with the same code can't both get in.
  const left = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const hashes = snap.exists && Array.isArray(snap.data().hashes) ? snap.data().hashes : [];
    if (!hashes.includes(hash)) throw new BackupRefused(WRONG);
    const rest = hashes.filter(h => h !== hash);
    tx.set(ref, { hashes: rest, lastUsedAt: nowIso }, { merge: true });
    return rest.length;
  });
  // Every other second step (a phone number) stays; only the authenticator app comes off.
  const others = (user.multiFactor?.enrolledFactors || []).filter(f => f.factorId !== TOTP && f.factorId === "phone")
    .map(f => ({ uid: f.uid, factorId: "phone", phoneNumber: f.phoneNumber, displayName: f.displayName || undefined }));
  await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: others.length ? others : null } });
  await db.collection("audit-log").add({
    type: "security",
    message: `${email} signed in with a two-step backup code, so their authenticator app was taken off (${left} code${left === 1 ? "" : "s"} left)`,
    createdAt: nowIso,
  }).catch(err => console.warn(`twoStepBackup: audit log not written: ${err.message}`));
  return { left };
}

module.exports = { CODE_COUNT, cleanBackupCode, hashCode, makeBackupCodes, makeProblem, backupStatus, makeBackup, googleEmailOf, spendBackup, BackupRefused, FRESH_MS };
