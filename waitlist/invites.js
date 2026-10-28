// Waitlist invites (code plan 9.5): a platform admin invites someone from the waitlist in the control room. The invite
// emails them the sign-up link and is recorded as invites/<id> in the platform project, so sign-up's daily cap (6.13)
// lets them straight in. Inviting the same address twice sends nothing new.
//
// Clients passed in (fakes in control-room/fakes.js):
//   invites   get(id) -> { email, by, at, usedAt?, shopId? } | null; set(id, row)
//   email     sendPlatform({ kind, to, data, idempotencyKey }) (services/email)
import { createHash } from "node:crypto";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The record's id: the same address always lands on the same record (the waitlist's own id, waitlist/signup.js). */
export const inviteId = (address) => createHash("sha256").update(String(address).trim().toLowerCase()).digest("hex").slice(0, 32);

/** Has this address been invited? Sign-up (6.13) asks before applying the daily cap. */
export async function isInvited({ invites }, address) {
  if (typeof address !== "string" || !EMAIL.test(address.trim())) return false;
  return Boolean(await invites.get(inviteId(address)));
}

export function createInvites({ invites, email, settings, now = () => new Date() }) {
  return {
    isInvited: (address) => isInvited({ invites }, address),

    /** Invites one address. Returns { email, invited: true, sent } where `sent` is false for a repeat. */
    async invite({ by, to }) {
      const address = typeof to === "string" ? to.trim().toLowerCase() : "";
      if (!EMAIL.test(address) || address.length > 254) throw Object.assign(new Error("That isn't an email address."), { status: 400 });
      const id = inviteId(address);
      const before = await invites.get(id);
      if (before) return { email: address, invited: true, sent: false, at: before.at };
      const at = now().toISOString();
      await invites.set(id, { email: address, by, at, usedAt: null, shopId: null });
      await email.sendPlatform({ kind: "waitlist-invite", to: address, data: { link: `${settings.platformUrl}/signup/` }, idempotencyKey: `waitlist-invite/${id}` });
      return { email: address, invited: true, sent: true, at };
    },

    /** Sign-up marks the invite used once the shop is queued (6.13). Safe to repeat. */
    async markUsed(address, shopId) {
      const id = inviteId(address);
      const row = await invites.get(id);
      if (!row || row.usedAt) return { used: Boolean(row?.usedAt) };
      await invites.set(id, { ...row, usedAt: now().toISOString(), shopId: shopId ?? null });
      return { used: true };
    },
  };
}
