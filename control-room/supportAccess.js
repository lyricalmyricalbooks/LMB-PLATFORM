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

export function supportAccess({ identity, registry, serviceAccount, shopData = null, now = () => new Date() }) {
  return {
    async supportSignIn(shopId, { by, reason, minutes = 30, mode = "view" }) {
      if (!serviceAccount) throw new Error("the support sign-in needs the platform's service account");
      const profile = await registry.getProfile(shopId);
      if (!profile?.siteUrl || !profile.apps?.shop) throw new Error(`${shopId} has no shop admin to open`);
      const until = Math.floor(now().getTime() / 1000) + Math.min(MAX_MINUTES, Math.max(1, minutes)) * 60;
      // Kept short: a sign-in token's own claims must stay under 1,000 characters.
      const support = { by: String(by).slice(0, 120), reason: String(reason).slice(0, 200), until, mode: mode === "edit" ? "edit" : "view" };
      // On the shop's own sign-in list (the shared system), so the visit counts in that shop only.
      const token = await identity.customToken(serviceAccount, SUPPORT_UID, { support }, { tenantId: profile.tenant ?? null });
      return { url: `${profile.siteUrl}/admin/#support=${token}`, until };
    },

    /** Two-step sign-in off for one person on the shop's own project (plan 22.11): { found, removed }. */
    async removeTwoStep(shopId, email) {
      const profile = await registry.getProfile(shopId);
      const projectId = profile?.firebase?.projectId;
      if (!projectId) throw new Error(`${shopId} has no sign-in project yet`);
      return identity.removeSecondSteps(projectId, email, { tenantId: profile.tenant ?? null });
    },

    /**
     * Each person's sign-in safety on the shop (read only): whether two-step is on, and how many backup codes are left
     * (the shop's server-only `twoStepBackup/<uid>`, which holds only hashes; only their count is read here).
     * [{ email, found, twoStep, codesLeft, codesMadeAt, lastSignInAt }]
     */
    async signInSafety(shopId, emails) {
      const profile = await registry.getProfile(shopId);
      const projectId = profile?.firebase?.projectId;
      if (!projectId) throw new Error(`${shopId} has no sign-in project yet`);
      const people = await identity.secondStepsOf(projectId, emails, { tenantId: profile.tenant ?? null });
      const out = [];
      for (const person of people) {
        const backup = person.uid && shopData ? await shopData.get(shopId, `twoStepBackup/${person.uid}`).catch(() => null) : null;
        out.push({ email: person.email, found: person.found, twoStep: person.steps > 0,
          codesLeft: backup ? (Array.isArray(backup.hashes) ? backup.hashes.length : 0) : person.found && shopData ? 0 : null, codesMadeAt: backup?.madeAt ?? null, lastSignInAt: person.lastSignInAt ?? null });
      }
      return out;
    },
  };
}
