// Sign-in safety in a shop's record (control room): for each person on the shop's team, whether two-step sign-in is on
// and how many backup codes are left (shop admin's Settings › Security, plan 22.6-22.11). So when a press writes "I'm
// locked out", the record already shows whether they had two-step and codes, and a team running low on codes or an
// owner without two-step can be spotted before it happens. Read only; the codes themselves are never read, only how
// many hashes are left.
//
// Clients passed in:
//   registry     getShop(shopId)
//   memberships  the accounts store: listByShop(shopId) -> [{ email, role }]
//   shopAccess   signInSafety(shopId, emails) -> [{ email, found, twoStep, codesLeft, codesMadeAt }]
//                (supportAccess.js, through the shop's own sign-in project and database)
import { ControlError, adminOf } from "./controlRoom.js";
import { ROLES, ROLE_NAMES } from "../accounts/roles.js";

/** At or below this many codes left, a person is shown as running low. */
export const LOW_CODES = 2;

/** One person's state: "safe", "low" (two-step on, few codes), "no-codes", "off" (no two-step) or "never" (not signed in yet). */
export function safetyOf(person) {
  if (!person.found) return "never";
  if (!person.twoStep) return "off";
  if (person.codesLeft === 0) return "no-codes";
  if (person.codesLeft !== null && person.codesLeft <= LOW_CODES) return "low";
  return "safe";
}

export function createSignInSafety({ admins, registry, memberships, shopAccess, now = () => new Date() }) {
  return {
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (row.status !== "live") return { shopId, people: [], summary: null, words: "Not live yet, so no one signs in to it." };
      if (!shopAccess?.signInSafety) throw new ControlError(503, "The control room can't reach the shop's sign-in yet.");
      // The team: the owner on the registry and every member, once each, the owner first.
      const team = new Map();
      if (row.ownerEmail) team.set(row.ownerEmail.toLowerCase(), "owner");
      for (const member of memberships ? await memberships.listByShop(shopId) : []) {
        const email = String(member.email ?? "").toLowerCase();
        if (email && !team.has(email)) team.set(email, member.role ?? "staff");
      }
      let found;
      try {
        found = await shopAccess.signInSafety(shopId, [...team.keys()]);
      } catch (failure) {
        // A piece not switched on yet keeps its own plain words (server/notConnected.js).
        if (failure.status === 503) throw new ControlError(503, failure.message);
        throw new ControlError(502, `Couldn't read the shop's sign-in: ${failure.message}`);
      }
      const rank = (role) => (ROLES.includes(role) ? ROLES.indexOf(role) : ROLES.length);
      const people = found.map((person) => {
        const role = team.get(person.email.toLowerCase()) ?? "staff";
        return { ...person, role, roleName: ROLE_NAMES[role] ?? role, state: safetyOf(person) };
      }).sort((a, b) => rank(a.role) - rank(b.role) || a.email.localeCompare(b.email));
      // The team by role, in the roles' own order (fair helpers included), for the drawer's one line.
      const roles = ROLES.map((role) => ({ role, name: ROLE_NAMES[role], count: people.filter((p) => p.role === role).length })).filter((r) => r.count);
      const signedIn = people.filter((p) => p.found);
      return {
        shopId,
        people,
        summary: {
          withTwoStep: signedIn.filter((p) => p.twoStep).length,
          signedIn: signedIn.length,
          ownerOff: people.some((p) => p.role === "owner" && p.state === "off"),
          lowOnCodes: people.filter((p) => p.state === "low" || p.state === "no-codes").length,
          roles,
        },
      };
    },
  };
}

//   POST /api/control/sign-in-safety  { shopId }: each team member's two-step and backup codes left (read only)
export function signInSafetyRoutes(safety) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return { "POST /api/control/sign-in-safety": (claims, request) => safety.forShop(claims, body(request)) };
}
