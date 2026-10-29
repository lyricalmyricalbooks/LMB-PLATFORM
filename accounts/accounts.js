// One platform account, many shops (code plan 2.7). A person signs in once on the platform (signup/: Google or an
// email link) and sees every shop they belong to, with their role in each, and a switcher that takes them to that
// shop's admin or stockroom. Owners invite people by email with a role.
//
// Roles are the shop's own (apps/shop/functions/roles.js): `owner` and `staff` open the shop's admin; `bookkeeper` opens
// its read-only Bookkeeping page (or the stockroom's tax centre when there is no admin); `author` opens the
// stockroom's pages for their own books only. A role given here is written to the shop's own `members/<email>`
// document, which the shop copies onto the person's sign-in pass, so the shop's rules stay the one judge of access.
//
// Clients passed in (fakes.js has in-memory ones):
//   accounts      get(accountId) -> { accountId, email, shops: { [shopId]: role } } | null; set(accountId, row)
//   memberships   get(shopId, email) -> row | null; set(shopId, email, row); remove(shopId, email);
//                 listByShop(shopId) -> rows; listByEmail(email) -> rows
//   invites       get(id) -> row | null; set(id, row); listByShop(shopId) -> rows
//   registry      getShop(shopId) -> row | null; getProfile(shopId) -> profile | null; recordEvent(shopId, entry)
//   shopData      set(projectId, path, data) / remove(projectId, path): the shop's own database (the same client as
//                 setup's, with writes that may replace or delete a document). A shop's project id is its shop id.
//   auditLog      ready(shopId); write(shopId, id, entry)
//   email         sendPlatform({ kind, to, data, idempotencyKey, shopId }) (services/email)
import { createHash, randomBytes } from "node:crypto";
import { personOf, SignupError } from "../signup/signup.js";
import { ROLES, ROLE_WORDS } from "./roles.js";

export { ROLES, ROLE_WORDS };
export const INVITE_DAYS = 7;
export const MAX_PENDING_INVITES = 20;

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const hash = (token) => createHash("sha256").update(String(token)).digest("hex");
const normal = (email) => String(email ?? "").trim().toLowerCase();

export function createAccounts({ accounts, memberships, invites, registry, shopData, auditLog, email, settings, now = () => new Date(), token = () => randomBytes(32).toString("base64url") }) {
  const at = () => now().toISOString();

  async function log(shopId, what, detail) {
    const entry = { id: `accounts-${at()}-${what}-${hash(JSON.stringify(detail)).slice(0, 8)}`, source: "accounts", at: at(), what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  /**
   * The person's role in a shop: their membership, or "owner" for the shop's own owner address. Null: no role. The
   * account's own list of shops is only a hint of where to look: it is never trusted for a role, so someone taken off
   * a team loses it at once.
   */
  async function roleIn(person, shopId) {
    const member = await memberships.get(shopId, person.email);
    if (member) return member.role;
    const row = await registry.getShop(shopId);
    return row && normal(row.ownerEmail) === person.email ? "owner" : null;
  }

  async function ownerOnly(claims, shopId) {
    const person = personOf(claims);
    if (typeof shopId !== "string" || (await roleIn(person, shopId)) !== "owner") throw new SignupError(403, "Only the shop's owner can do that.");
    return person;
  }

  // The addresses a person uses for a shop: its admin and, when the plan has it, its stockroom.
  const planSummary = (billing) => ({
    status: billing.status ?? null, trialEnd: billing.trialEnd ?? null, currentPeriodEnd: billing.currentPeriodEnd ?? null,
    hasCard: Boolean(billing.hasCard), cancelAtPeriodEnd: Boolean(billing.cancelAtPeriodEnd),
  });

  async function placesOf(shopId) {
    const row = await registry.getShop(shopId);
    const profile = await registry.getProfile(shopId);
    const projectId = profile?.firebase?.projectId;
    return {
      pressName: row?.pressName ?? shopId,
      plan: row?.plan ?? null,
      status: row?.status ?? "creating",
      access: row?.billing?.access ?? null,
      siteUrl: profile?.siteUrl ?? null,
      adminUrl: profile?.siteUrl && profile.apps?.shop ? `${profile.siteUrl}/admin` : null,
      // The stockroom is its own Hosting site in the shop's project, `<project id>-stockroom` (docs/shop-setup.md).
      stockroomUrl: projectId && profile.apps?.stockroom ? `https://${projectId}-stockroom.web.app` : null,
    };
  }

  return {
    roleIn,

    /** Every shop the signed-in person belongs to, for the shop switcher. */
    async myShops(claims) {
      const person = personOf(claims);
      const account = (await accounts.get(person.accountId)) ?? { shops: {} };
      const ids = new Set(Object.keys(account.shops ?? {}));
      for (const member of await memberships.listByEmail(person.email)) ids.add(member.shopId);
      const shops = [];
      for (const shopId of ids) {
        const role = await roleIn(person, shopId);
        if (!role) continue;
        // The plan's dates show on the owner's shop card (trial days left, the next bill); only owners see them.
        const billing = role === "owner" ? (await registry.getShop(shopId))?.billing : null;
        shops.push({ shopId, role, ...(await placesOf(shopId)), ...(billing ? { billing: planSummary(billing) } : {}) });
      }
      return { email: person.email, shops: shops.sort((a, b) => a.pressName.localeCompare(b.pressName)) };
    },

    /** Where the switcher sends the person for one shop. They sign in there with the same Google or email. */
    async switchTo(claims, shopId) {
      const person = personOf(claims);
      const role = typeof shopId === "string" ? await roleIn(person, shopId) : null;
      if (!role) throw new SignupError(404, "You're not on that shop's team.");
      const places = await placesOf(shopId);
      // An author has no place in the shop's admin, only in the stockroom.
      const url = role === "author" ? places.stockroomUrl : places.adminUrl ?? places.stockroomUrl;
      if (!url) throw new SignupError(409, "That shop isn't ready yet.");
      return { shopId, role, url };
    },

    /** The shop's team and open invites, for its owner. */
    async team(claims, shopId) {
      await ownerOnly(claims, shopId);
      const row = await registry.getShop(shopId);
      const members = (await memberships.listByShop(shopId)).map(({ email: address, role, addedAt }) => ({ email: address, role, addedAt }));
      if (row?.ownerEmail && !members.some((m) => m.email === normal(row.ownerEmail))) members.unshift({ email: normal(row.ownerEmail), role: "owner", addedAt: row.createdAt ?? null });
      const open = (await invites.listByShop(shopId)).filter((i) => !i.acceptedAt && !i.cancelledAt && i.expiresAt > at());
      return { members, invites: open.map(({ id, email: address, role, expiresAt }) => ({ id, email: address, role, expiresAt })) };
    },

    /** Invites someone by email with a role. Inviting the same address again replaces the open invite. */
    async invite(claims, { shopId, email: address, role }) {
      const person = await ownerOnly(claims, shopId);
      const to = normal(address);
      if (!EMAIL.test(to) || to.length > 254) throw new SignupError(400, "Enter the email address to invite.", { email: "Enter the email address to invite." });
      if (!ROLES.includes(role)) throw new SignupError(400, "Choose a role: owner, staff, author or bookkeeper.", { role: "Choose a role." });
      const shopRow = await registry.getShop(shopId);
      // The shop's own owner address always counts as owner in the shop (apps/shop/functions/roles.js); it needs no invite.
      if (to === normal(shopRow?.ownerEmail)) throw new SignupError(409, "That's the shop's own owner address. It always has full access.");
      if (await memberships.get(shopId, to)) throw new SignupError(409, "That person is already on the team. Change their role instead.");
      const open = (await invites.listByShop(shopId)).filter((i) => !i.acceptedAt && !i.cancelledAt && i.expiresAt > at());
      for (const old of open.filter((i) => i.email === to)) await invites.set(old.id, { ...old, cancelledAt: at(), cancelledBy: "replaced" });
      if (open.filter((i) => i.email !== to).length >= MAX_PENDING_INVITES) throw new SignupError(429, `A shop can have ${MAX_PENDING_INVITES} open invites at once. Cancel some first.`);

      const secret = token();
      const id = hash(secret).slice(0, 40);
      const invite = { id, shopId, email: to, role, invitedBy: person.email, createdAt: at(), expiresAt: new Date(now().getTime() + INVITE_DAYS * 86400_000).toISOString(), tokenHash: hash(secret) };
      await invites.set(id, invite);
      const { pressName } = await placesOf(shopId);
      await email.sendPlatform({
        kind: "invite", to, shopId, idempotencyKey: `invite/${id}`,
        data: { pressName, invitedBy: person.email, roleWords: ROLE_WORDS[role], link: `${settings.platformUrl}/accounts/?invite=${encodeURIComponent(secret)}`, days: INVITE_DAYS },
      });
      await log(shopId, "invite-sent", { email: to, role, by: person.email });
      return { id, email: to, role, expiresAt: invite.expiresAt };
    },

    /** Cancels an open invite. */
    async cancelInvite(claims, { shopId, id }) {
      const person = await ownerOnly(claims, shopId);
      const invite = await invites.get(id);
      if (!invite || invite.shopId !== shopId) throw new SignupError(404, "That invite isn't there.");
      if (invite.acceptedAt || invite.cancelledAt) return { id, cancelled: false };
      await invites.set(id, { ...invite, cancelledAt: at(), cancelledBy: person.email });
      await log(shopId, "invite-cancelled", { email: invite.email, by: person.email });
      return { id, cancelled: true };
    },

    /**
     * Accepts an invite from its emailed link. Only the invited address can accept it, signed in with that address
     * confirmed. Safe to repeat: a second accept by the same person changes nothing.
     */
    async accept(claims, secret) {
      const person = personOf(claims);
      const invite = typeof secret === "string" && secret ? await invites.get(hash(secret).slice(0, 40)) : null;
      if (!invite || invite.tokenHash !== hash(secret)) throw new SignupError(404, "That invite link isn't right. Ask for a new one.");
      if (invite.cancelledAt) throw new SignupError(410, "That invite was cancelled. Ask the shop's owner for a new one.");
      if (invite.acceptedAt) {
        if (invite.acceptedBy === person.accountId) return { shopId: invite.shopId, role: invite.role };
        throw new SignupError(410, "That invite has already been used.");
      }
      if (invite.expiresAt <= at()) throw new SignupError(410, "That invite has run out. Ask the shop's owner for a new one.");
      if (invite.email !== person.email) throw new SignupError(403, `This invite is for ${invite.email}. Sign in with that address to accept it.`);

      // The shop's own team list first (its rules decide access), then the platform's copy.
      await shopData.set(invite.shopId, `members/${invite.email}`, { role: invite.role, addedBy: "invite", invitedBy: invite.invitedBy, addedAt: at() });
      await memberships.set(invite.shopId, invite.email, { shopId: invite.shopId, email: invite.email, accountId: person.accountId, role: invite.role, addedBy: invite.invitedBy, addedAt: at() });
      await invites.set(invite.id, { ...invite, acceptedAt: at(), acceptedBy: person.accountId });
      await log(invite.shopId, "invite-accepted", { email: invite.email, role: invite.role });
      return { shopId: invite.shopId, role: invite.role };
    },

    /** Changes a team member's role. The shop always keeps at least one owner. */
    async setRole(claims, { shopId, email: address, role }) {
      const person = await ownerOnly(claims, shopId);
      const who = normal(address);
      if (!ROLES.includes(role)) throw new SignupError(400, "Choose a role: owner, staff, author or bookkeeper.");
      const member = await memberships.get(shopId, who);
      if (!member) throw new SignupError(404, "That person isn't on the team.");
      if (member.role === role) return { email: who, role, changed: false };
      if (member.role === "owner") await keepAnOwner(shopId, who);
      await shopData.set(shopId, `members/${who}`, { role, addedBy: member.addedBy ?? "invite", changedBy: person.email, changedAt: at() });
      await memberships.set(shopId, who, { ...member, role });
      await log(shopId, "role-changed", { email: who, from: member.role, to: role, by: person.email });
      return { email: who, role, changed: true };
    },

    /** Takes someone off the team. The shop's sign-up owner and the last owner can't be removed. */
    async remove(claims, { shopId, email: address }) {
      const person = await ownerOnly(claims, shopId);
      const who = normal(address);
      const member = await memberships.get(shopId, who);
      if (!member) throw new SignupError(404, "That person isn't on the team.");
      if (member.role === "owner") await keepAnOwner(shopId, who);
      await shopData.remove(shopId, `members/${who}`);
      await memberships.remove(shopId, who);
      await log(shopId, "member-removed", { email: who, role: member.role, by: person.email });
      return { email: who, removed: true };
    },
  };

  async function keepAnOwner(shopId, leaving) {
    const row = await registry.getShop(shopId);
    const others = (await memberships.listByShop(shopId)).filter((m) => m.role === "owner" && m.email !== leaving);
    if (!others.length && (!row?.ownerEmail || normal(row.ownerEmail) === leaving)) throw new SignupError(409, "A shop always needs an owner. Make someone else an owner first.");
  }
}
