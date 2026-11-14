// Delete my account (code plan 24.2). A person can remove their own Colophon sign-in and what the platform keeps about
// them, from the account page, without asking support. Canada's privacy law (PIPEDA, and Quebec's Law 25) expects a
// person to be able to withdraw and have their information deleted when it is no longer needed.
//
// What goes: the person's place on every shop's team (the platform's membership and the shop's own `members/<email>`,
// so the shop's rules drop them at once), their account record, their known devices, the sign-up rows of shops that
// were never made, and their sign-in itself. What stays, and the page says so: shops they don't solely own, invoices and
// billing records (tax law keeps them six years), support conversations and recovery requests (a record of what was
// asked), and each shop's activity log (who changed what in that shop). A sign-up row of a shop that exists loses the
// person's name and address.
//
// A shop always needs an owner: the person is refused, by press name, while they are the only owner of a shop that
// isn't closed. They hand it to someone or close it first. The request needs the caller's own verified sign-in (checked
// on the server) and their address typed again, so a slip of the mouse can't erase an account. There is no "signed in
// in the last few minutes" rule (Julian, 14 November 2026: "just let them delete, none of this sign in or sign out"):
// the deletion runs here with the platform's own access, so the person is never sent to sign out and back in.
//
// Clients passed in:
//   accounts     get(accountId) -> row | null; remove(accountId)
//   memberships  listByEmail(email) -> rows; listByShop(shopId) -> rows; remove(shopId, email)
//   registry     getShop(shopId) -> row | null; recordEvent(shopId, entry)
//   shopData     remove(projectId, path)
//   auditLog     ready(shopId); write(shopId, id, entry)
//   signups      listByAccount(accountId) -> rows; set(shopId, row); remove(shopId)
//   devices      remove(accountId)
//   authUsers    remove(uid): deletes the platform sign-in (Identity Toolkit accounts:delete)
//   email        sendPlatform({ kind, to, data, idempotencyKey }) (a goodbye note to the address, best effort)
import { createHash } from "node:crypto";
import { personOf, SignupError } from "../signup/signup.js";

const CLOSED = new Set(["closed", "deleted", "deleting"]);
const normal = (email) => String(email ?? "").trim().toLowerCase();

export function createAccountDeletion({ accounts, memberships, registry, shopData, auditLog, signups, devices, authUsers, email = null, now = () => new Date() }) {
  const at = () => now().toISOString();

  async function log(shopId, what, detail) {
    const entry = { id: `accounts-${at()}-${what}-${createHash("sha256").update(JSON.stringify(detail)).digest("hex").slice(0, 8)}`, source: "accounts", at: at(), what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  }

  /** Every shop the person is on, with their role, from the memberships and the registry's owner address. */
  async function shopsOf(person) {
    const account = (await accounts.get(person.accountId)) ?? {};
    const roles = new Map();
    for (const shopId of Object.keys(account.shops ?? {})) {
      const row = await registry.getShop(shopId);
      if (row && normal(row.ownerEmail) === person.email) roles.set(shopId, "owner");
    }
    for (const member of await memberships.listByEmail(person.email)) roles.set(member.shopId, member.role);
    const shops = [];
    for (const [shopId, role] of roles) {
      const row = await registry.getShop(shopId);
      shops.push({ shopId, role, pressName: row?.pressName || shopId, status: row?.status ?? null, row });
    }
    return shops;
  }

  /** True when someone else would still own the shop after this person goes. */
  async function anotherOwner(shop, person) {
    const others = (await memberships.listByShop(shop.shopId)).filter((m) => m.role === "owner" && normal(m.email) !== person.email);
    return others.length > 0 || (shop.row?.ownerEmail && normal(shop.row.ownerEmail) !== person.email);
  }

  /** What deleting would do, for the page to show before the person confirms. */
  async function preview(claims) {
    const person = personOf(claims);
    const shops = await shopsOf(person);
    const blockers = [];
    for (const shop of shops) {
      if (shop.role !== "owner" || CLOSED.has(shop.status)) continue;
      if (!(await anotherOwner(shop, person))) blockers.push({ shopId: shop.shopId, pressName: shop.pressName });
    }
    // A shop still being made: its trial began at sign-up, and the shop maker will make it with this person as its only
    // owner. Its registry row may not exist yet, so the teams above can't see it; deleting now would open it with
    // nobody to sign in. A sign-up whose trial never started (in line, or its country not open yet) simply goes.
    for (const signup of await signups.listByAccount(person.accountId)) {
      if (!signup.trialStartedAt || shops.some((s) => s.shopId === signup.shopId) || (await registry.getShop(signup.shopId))) continue;
      blockers.push({ shopId: signup.shopId, pressName: signup.pressName || signup.shopId, making: true });
    }
    return {
      email: person.email,
      leaving: shops.filter((s) => !blockers.some((b) => b.shopId === s.shopId)).map(({ shopId, pressName, role }) => ({ shopId, pressName, role })),
      blockers,
    };
  }

  async function deleteMe(claims, { confirmEmail } = {}) {
    const person = personOf(claims);
    if (normal(confirmEmail) !== person.email) throw new SignupError(400, "Type your email address exactly as it shows to confirm.");
    const { blockers } = await preview(claims);
    const making = blockers.filter((b) => b.making);
    if (making.length) {
      const names = making.map((b) => b.pressName).join(", ");
      throw new SignupError(409, `${names} ${making.length === 1 ? "is" : "are"} still being made, with you as the only owner. Wait until it's ready, then make someone else an owner from Team or close the shop, before deleting your account.`);
    }
    if (blockers.length) {
      const names = blockers.map((b) => b.pressName).join(", ");
      throw new SignupError(409, `You're the only owner of ${names}. Make someone else an owner from Team, or close the shop, before deleting your account.`);
    }

    // The teams first: once off a shop's members, the shop's own rules refuse this person.
    const shops = await shopsOf(person);
    for (const shop of shops) {
      await shopData.remove(shop.shopId, `members/${person.email}`);
      await memberships.remove(shop.shopId, person.email);
      await log(shop.shopId, "member-deleted-account", { email: person.email, role: shop.role });
    }

    // Sign-ups: a shop that was never made goes with the person; one that exists keeps its row without them.
    let signupsRemoved = 0;
    for (const signup of await signups.listByAccount(person.accountId)) {
      // A sign-up row's id is its shop id (signup/signup.js).
      const made = await registry.getShop(signup.shopId);
      if (made && !CLOSED.has(made.status)) {
        await signups.set(signup.shopId, { ...signup, ownerEmail: "", ownerName: "", accountDeletedAt: at() });
      } else {
        await signups.remove(signup.shopId);
        signupsRemoved += 1;
      }
    }

    await devices.remove(person.accountId);
    await accounts.remove(person.accountId);
    // Last: until this succeeds the person can sign in again and retry; every step above is safe to repeat.
    await authUsers.remove(person.accountId);

    if (email) {
      await email.sendPlatform({ kind: "account-deleted", to: person.email, data: { shops: shops.map((s) => s.pressName) }, idempotencyKey: `account-deleted/${person.accountId}` })
        .catch(() => {});
    }
    return { deleted: true, shopsLeft: shops.length, signupsRemoved };
  }

  return { preview, deleteMe };
}
