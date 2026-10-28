// Who may open the admin. Each person the owner adds under Settings › Team is a members/{email} document with a role;
// syncMemberRole copies that role onto the person's sign-in pass (a custom claim), which Firestore rules, Storage
// rules and requireAdmin read. The owner address (SHOP_OWNER_EMAIL, shopConfig.js) always counts as owner, so the shop's first sign-in works
// before anyone is added, and nobody can lock the owner out by editing the list.
// "author" is a Team role for the stockroom only: its rules let an author read the settings their own books need, and
// which books stays in the stockroom's per-book list. It never opens this admin (adminRole answers owner or staff only).
const { shopConfig } = require("./shopConfig");

const OWNER_EMAILS = [shopConfig.ownerEmail];
const ROLES = ["owner", "staff", "author"];
const ADMIN_ROLES = ["owner", "staff"];

const normEmail = v => String(v || "").trim().toLowerCase();
const memberId = email => normEmail(email);
const isRole = v => ROLES.includes(v);

/**
 * Platform support on this pass ("act as this shop" in the platform's control room): { by, reason, until } while it
 * lasts, else null. Only a custom sign-in token can carry it, and only the platform makes those for a shop on it; the
 * platform logs each one in the shop's audit log first. `until` is in seconds. Same check as isSupport() in the rules.
 */
function supportOf(token, nowMs = Date.now()) {
  const support = token?.support;
  if (token?.firebase?.sign_in_provider !== "custom" || !support || typeof support !== "object") return null;
  if (typeof support.until !== "number" || support.until * 1000 <= nowMs) return null;
  return { by: String(support.by ?? ""), reason: String(support.reason ?? ""), until: support.until };
}

/** The admin role on a verified sign-in pass: "owner", "staff", or null for everyone else (authors included). */
function adminRole(token) {
  // Platform support gets staff access: never the Team, billing or secret keys.
  if (supportOf(token)) return "staff";
  if (!token || token.email_verified !== true) return null;
  if (OWNER_EMAILS.includes(normEmail(token.email))) return "owner";
  return ADMIN_ROLES.includes(token.role) ? token.role : null;
}

/** Checks one Team entry an owner writes. */
function memberProblem(email, data) {
  const id = memberId(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) || id.length > 254) return "That isn't an email address.";
  if (OWNER_EMAILS.includes(id)) return "The shop owner always has access.";
  if (!isRole(data?.role)) return `Role must be one of: ${ROLES.join(", ")}.`;
  return null;
}

/**
 * Makes the sign-in pass of the person with this email match their Team entry: the role is set, changed or taken away.
 * Other custom claims are kept. Someone who hasn't signed in yet has no account; their first sign-in calls this again.
 */
async function syncMemberRole({ auth, db, email }) {
  const id = memberId(email);
  if (!id) return { status: "no-email" };
  let user;
  try {
    user = await auth.getUserByEmail(id);
  } catch (err) {
    if (err?.code === "auth/user-not-found") return { status: "no-account" };
    throw err;
  }
  const snap = await db.collection("members").doc(id).get();
  const data = snap.exists ? snap.data() : null;
  const role = !OWNER_EMAILS.includes(id) && isRole(data?.role) ? data.role : null;
  const claims = { ...(user.customClaims || {}) };
  const before = claims.role ?? null;
  if (before === role) return { status: "unchanged", role };
  if (role) claims.role = role;
  else delete claims.role;
  await auth.setCustomUserClaims(user.uid, claims);
  // Older passes keep the old role for up to an hour; this makes them sign in again whenever a role is taken away or
  // changed to a smaller one (owner to staff, staff to author). Only a first role or a move up to owner keeps them in.
  if (before && role !== "owner") await auth.revokeRefreshTokens(user.uid);
  return { status: "updated", role };
}

module.exports = { OWNER_EMAILS, ROLES, ADMIN_ROLES, adminRole, supportOf, memberId, memberProblem, syncMemberRole };
