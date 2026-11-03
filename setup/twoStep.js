// Authenticator codes on the shop's own sign-in (code plan 22.6). A press on a paid plan confirms big changes (its card,
// its plan, cancelling, its team) with a code from an authenticator app, and since 22.6 it does that in its own shop
// admin, which signs in to the shop's own Firebase project. So that project's sign-in must allow authenticator codes:
//   - Firebase Auth is upgraded to Identity Platform, which is what offers a second step (free for a shop's handful of
//     admins: Google bills it past 50,000 people a month),
//   - the TOTP second step is turned on, next to anything else already set there.
// Nobody is made to use it: an owner sets it up from Settings › Security, and the platform asks for it only on paid
// plans (accounts/twoStep.js). Safe to run twice; an existing shop gets it the next time its steps run.

/** How many 30-second codes either side of now still count: a phone clock a little off still works. */
export const ADJACENT_INTERVALS = 5;

/** Is the TOTP second step on in this sign-in config (Identity Toolkit v2 projects.getConfig)? */
export function totpOn(config) {
  if (config?.mfa?.state !== "ENABLED") return false;
  return (config.mfa.providerConfigs ?? []).some((p) => p?.state === "ENABLED" && p.totpProviderConfig);
}

/** The `mfa` part with TOTP turned on, keeping any other second step already there. */
export function withTotp(mfa = {}) {
  const others = (mfa.providerConfigs ?? []).filter((p) => !p?.totpProviderConfig);
  return { ...mfa, state: "ENABLED", providerConfigs: [...others, { state: "ENABLED", totpProviderConfig: { adjacentIntervals: ADJACENT_INTERVALS } }] };
}

/** Setup step 19: authenticator codes allowed on the shop's own sign-in. */
export function twoStepSignInStep({ number = 19, google }) {
  return {
    number,
    name: "Allow authenticator codes on the shop admin's sign-in",
    async check({ shop }) {
      return totpOn(await google.authConfig.get(shop.shopId));
    },
    async act({ shop }) {
      const config = await google.authConfig.get(shop.shopId);
      if (config?.subtype !== "IDENTITY_PLATFORM") await google.authConfig.upgrade(shop.shopId);
      if (!totpOn(config)) await google.authConfig.setMfa(shop.shopId, withTotp(config?.mfa));
      return { detail: { totp: true } };
    },
  };
}
