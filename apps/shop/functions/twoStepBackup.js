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
// - Each use is written to the shop's audit log and emailed to the person and the shop owner (`backupUsedEmail`), so a
//   stolen code can't be used quietly. Tries are rate-limited per connection.
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

const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email after a backup code was used: { to, subject, html }. The owner gets a copy when it wasn't them. */
function backupUsedEmail({ email, ownerEmail, left, shopName, when, adminLink, language = "en" }) {
  const owner = String(ownerEmail || "").toLowerCase();
  const to = [...new Set([email, owner].filter(a => /^[^\s@<>,]+@[^\s@<>,]+$/.test(a || "")))];
  if (language === "fr") {
    const shop = shopName || "votre boutique";
    const codes = left === 1 ? "Il reste 1 code de secours." : `Il reste ${left} codes de secours.`;
    const html = [
      `<p>Quelqu'un s'est connecté à l'administration de ${esc(shop)} en tant que <strong>${esc(email)}</strong> avec un code de secours de la connexion en deux étapes le ${esc(when)}.</p>`,
      `<p>L'application d'authentification a été retirée de cette connexion : Google seul suffit pour entrer jusqu'à ce que la connexion en deux étapes soit configurée de nouveau. ${esc(codes)}</p>`,
      "<p><strong>Si c'était vous</strong>, configurez la connexion en deux étapes sur votre nouveau téléphone dans Paramètres, Sécurité.</p>",
      "<p><strong>Si ce n'était pas vous</strong>, changez tout de suite le mot de passe de ce compte Google, puis ouvrez Paramètres, Sécurité, configurez de nouveau la connexion en deux étapes et créez de nouveaux codes de secours. Les anciens ne fonctionneront plus.</p>",
      adminLink ? `<p><a href="${esc(adminLink)}">Ouvrir Paramètres, Sécurité</a></p>` : "",
    ].join("");
    return { to, subject: `Un code de secours a servi à se connecter à ${shop}`, html };
  }
  const shop = shopName || "your shop";
  const codes = left === 1 ? "1 backup code" : `${left} backup codes`;
  const html = [
    `<p>Someone signed in to ${esc(shop)}'s admin as <strong>${esc(email)}</strong> with a two-step backup code on ${esc(when)}.</p>`,
    `<p>The authenticator app was taken off that sign-in, so Google alone lets it in until two-step is set up again. ${esc(codes)} left.</p>`,
    "<p><strong>If this was you</strong>, set up two-step sign-in on your new phone in Settings, Security.</p>",
    "<p><strong>If it wasn't</strong>, change that Google account's password now, then open Settings, Security, set up two-step again and make new backup codes. That stops the old ones working.</p>",
    adminLink ? `<p><a href="${esc(adminLink)}">Open Settings, Security</a></p>` : "",
  ].join("");
  return { to, subject: `A backup code was used to sign in to ${shop}`, html };
}

/** The email when two-step sign-in was turned on or off for someone (code plan 25.4): { to, subject, html }. */
function twoStepChangedEmail({ email, ownerEmail, on, shopName, when, adminLink, language = "en" }) {
  const owner = String(ownerEmail || "").toLowerCase();
  const to = [...new Set([email, owner].filter(a => /^[^\s@<>,]+@[^\s@<>,]+$/.test(a || "")))];
  if (language === "fr") {
    const shop = shopName || "votre boutique";
    const html = [
      on
        ? `<p>La connexion en deux étapes a été activée pour <strong>${esc(email)}</strong> dans l'administration de ${esc(shop)} le ${esc(when)}. Pour se connecter, il faut maintenant un code d'une application d'authentification après Google.</p>`
        : `<p>La connexion en deux étapes a été désactivée pour <strong>${esc(email)}</strong> dans l'administration de ${esc(shop)} le ${esc(when)}. Pour se connecter, Google suffit maintenant.</p>`,
      "<p><strong>Si c'était vous</strong>, vous n'avez rien à faire.</p>",
      on
        ? "<p><strong>Si ce n'était pas vous</strong>, changez tout de suite le mot de passe de ce compte Google, puis ouvrez Paramètres, Sécurité et vérifiez la connexion.</p>"
        : "<p><strong>Si ce n'était pas vous</strong>, changez tout de suite le mot de passe de ce compte Google, puis ouvrez Paramètres, Sécurité et réactivez la connexion en deux étapes.</p>",
      adminLink ? `<p><a href="${esc(adminLink)}">Ouvrir Paramètres, Sécurité</a></p>` : "",
    ].join("");
    return { to, subject: `La connexion en deux étapes a été ${on ? "activée" : "désactivée"} pour ${shop}`, html };
  }
  const shop = shopName || "your shop";
  const html = [
    on
      ? `<p>Two-step sign-in was turned on for <strong>${esc(email)}</strong> in ${esc(shop)}'s admin on ${esc(when)}. Signing in now needs a code from an authenticator app after Google.</p>`
      : `<p>Two-step sign-in was turned off for <strong>${esc(email)}</strong> in ${esc(shop)}'s admin on ${esc(when)}. Signing in now needs only Google.</p>`,
    "<p><strong>If this was you</strong>, there's nothing to do.</p>",
    on
      ? "<p><strong>If it wasn't</strong>, change that Google account's password now, then open Settings, Security and check the sign-in.</p>"
      : "<p><strong>If it wasn't</strong>, change that Google account's password now, then open Settings, Security and turn two-step sign-in back on.</p>",
    adminLink ? `<p><a href="${esc(adminLink)}">Open Settings, Security</a></p>` : "",
  ].join("");
  return { to, subject: `Two-step sign-in was turned ${on ? "on" : "off"} for ${shop}`, html };
}

/**
 * After the admin turns two-step on or off, it asks the server to check. The server reads the sign-in's real state
 * (never the browser's word) and emails only when it changed since the last check, so a repeated or made-up call sends
 * nothing. Returns { on, changed }.
 */
async function noteTwoStepChange({ db, auth, uid, nowIso, notify }) {
  const user = await auth.getUser(uid);
  const on = (user.multiFactor?.enrolledFactors || []).some(f => f.factorId === TOTP);
  const ref = db.collection("twoStepState").doc(uid);
  const changed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const before = snap.exists ? snap.data().on : undefined;
    // Before this check existed nobody's state was kept: a first "off" can only follow an earlier "on".
    if (before === on || (before === undefined && !on)) {
      if (!snap.exists) tx.set(ref, { on, checkedAt: nowIso });
      return false;
    }
    tx.set(ref, { on, changedAt: nowIso, email: user.email || null });
    return true;
  });
  if (changed) {
    await db.collection("audit-log").add({ type: "security", message: `Two-step sign-in turned ${on ? "on" : "off"} for ${user.email || "a team member"}`, createdAt: nowIso })
      .catch(err => console.warn(`twoStepBackup: audit log not written: ${err.message}`));
    if (notify) await Promise.resolve().then(() => notify({ email: user.email, on })).catch(err => console.warn(`twoStepBackup: email not sent: ${err.message}`));
  }
  return { on, changed };
}

const WRONG = "That backup code didn't work. Check it against your saved list: each code works once.";

/**
 * Uses one backup code: takes the authenticator app off this person's sign-in so Google alone lets them in.
 * `google` is { idToken, accessToken } from the Google sign-in that asked for the code. Returns { left }.
 */
async function spendBackup({ db, auth, google, code, nowIso, fetchImpl, notify }) {
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
  // The backup-code email already says the app came off: the two-step check mustn't send a second "turned off".
  await db.collection("twoStepState").doc(user.uid).set({ on: false, changedAt: nowIso, email }).catch(err => console.warn(`twoStepBackup: state not kept: ${err.message}`));
  await db.collection("audit-log").add({
    type: "security",
    message: `${email} signed in with a two-step backup code, so their authenticator app was taken off (${left} code${left === 1 ? "" : "s"} left)`,
    createdAt: nowIso,
  }).catch(err => console.warn(`twoStepBackup: audit log not written: ${err.message}`));
  // The email never undoes the sign-in: a failed send is logged (the mailer's own retry queue keeps trying).
  if (notify) await Promise.resolve().then(() => notify({ email, left, nowIso })).catch(err => console.warn(`twoStepBackup: email not sent: ${err.message}`));
  return { left };
}

module.exports = { backupUsedEmail, twoStepChangedEmail, noteTwoStepChange, CODE_COUNT, cleanBackupCode, hashCode, makeBackupCodes, makeProblem, backupStatus, makeBackup, googleEmailOf, spendBackup, BackupRefused, FRESH_MS };
