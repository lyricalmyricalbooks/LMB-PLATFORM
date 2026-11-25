// Straight into the admin, signed in (sign-up plan move 3, 25 November 2026). When the account page's switcher or the
// front door's "Go to my store" sends a person to a shop's admin, the platform hands them a one-time sign-in for their
// own account on that shop's sign-in list, as `#support=<token>`, which the admin already signs in with
// (apps/shop admin/supportSession.ts: a token with no support visit in it is an ordinary sign-in as that person). So the
// person who signed in to Colophon with Google or an emailed code never signs in a second time, and a person who
// signed up with an emailed code is never stranded at a Google-only door.
//
//   const signedInUrl = shopSignIn({ identity, registry });
//   await signedInUrl(shopId, email, adminUrl) -> the admin address with the sign-in on it, or null
//
// Null means "send them to the plain admin address", and the person signs in there as before. It is null when:
//   - the person uses two-step sign-in on that shop: a sign-in from here must never skip their authenticator code;
//   - the platform can't sign for that shop's project yet (Service Account Token Creator on its Firebase admin account
//     and Firebase Authentication Admin, as for the control room's support visits): logged, never shown.
// `email` must already be the signed-in person's confirmed address and on the shop's team (accounts.js switchTo checks).
import { projectSigner } from "../clients/identity.js";

export function shopSignIn({ identity, registry, signer = null, log = console.error }) {
  return async function signedInUrl(shopId, email, adminUrl) {
    try {
      const shop = await registry.getShop(shopId);
      const profile = await registry.getProfile(shopId);
      const projectId = profile?.firebase?.projectId;
      if (!projectId || !adminUrl) return null;
      // The shop's own sign-in list (the shared system names it on the registry row, setup/sharedSteps.js step 2).
      const list = { tenantId: profile.tenant ?? (shop?.shared === true ? shop.tenant : null) ?? null };
      const [person] = await identity.secondStepsOf(projectId, [email], list);
      if (person?.steps > 0) return null;
      const { uid } = await identity.ensureUser(projectId, email, list);
      const token = await identity.customToken(signer || projectSigner(projectId), uid, undefined, list);
      return `${String(adminUrl).replace(/#.*$/, "")}#support=${token}`;
    } catch (error) {
      log(`straight-in sign-in for ${shopId} isn't available, so the plain admin address is used: ${error?.message ?? error}`);
      return null;
    }
  };
}
