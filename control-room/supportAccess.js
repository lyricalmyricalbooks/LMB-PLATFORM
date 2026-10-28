// The real "act as this shop" sign-in (controlRoom.js `shopAccess`). The platform makes a custom sign-in token for one
// support account in the shop's own project, carrying `support: { by, reason, until, mode }`, and opens the shop's admin
// at `#support=<token>`. The shop copy signs in with it, takes it out of the address, shows a banner, and until `until`
// treats a "view" visit (the default, plan 9.8) as read only and an "edit" visit as staff (apps/shop:
// functions/roles.js supportOf, isSupport() and isSupportViewer() in the rules, admin/supportSession.ts).
//
// The token is signed by the platform's service account through IAM (clients/identity.js); it works for one hour at
// most and `until` is never later than that. It is made only after the control room has logged the visit.
export const SUPPORT_UID = "colophon-support";
export const MAX_MINUTES = 60;

export function supportAccess({ identity, registry, serviceAccount, now = () => new Date() }) {
  return {
    async supportSignIn(shopId, { by, reason, minutes = 30, mode = "view" }) {
      if (!serviceAccount) throw new Error("the support sign-in needs the platform's service account");
      const profile = await registry.getProfile(shopId);
      if (!profile?.siteUrl || !profile.apps?.shop) throw new Error(`${shopId} has no shop admin to open`);
      const until = Math.floor(now().getTime() / 1000) + Math.min(MAX_MINUTES, Math.max(1, minutes)) * 60;
      // Kept short: a sign-in token's own claims must stay under 1,000 characters.
      const support = { by: String(by).slice(0, 120), reason: String(reason).slice(0, 200), until, mode: mode === "edit" ? "edit" : "view" };
      const token = await identity.customToken(serviceAccount, SUPPORT_UID, { support });
      return { url: `${profile.siteUrl}/admin/#support=${token}`, until };
    },
  };
}
