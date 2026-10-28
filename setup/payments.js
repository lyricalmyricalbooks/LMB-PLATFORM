// Step 13 of the shop maker: connect the press's payments. The step takes a payment provider, so a press can take
// payments through Stripe (built first) or Square (plan item 2.2b). Each provider is reached only through the
// platform's payment service (services/payments, docs/payments.md), which holds the platform keys; the shop maker never
// does.
//
// A provider client, one per provider, passed in as `providers[name]`:
//
//   findAccount(shopId)            -> { accountId, mode? } | null   the press's account the service already made, if any
//   createAccount(shopId, details) -> { accountId, mode? }          details: { pressName, ownerEmail, country, currency, testMode }
//
// `mode` is the mode the account was made in ("live" or "test"); the payment service takes live payments only for an
// account made live, so a press in test mode (and the test shop) can never take real money.
//
// `createAccount` must be safe to repeat: the service sends the shop id as the provider's idempotency key, so a retry
// after a lost answer finds the same account instead of making a second one. Nothing here can close or delete an
// account. The press finishes signing up with the provider from their admin (the "Connect" button, plan item 2.10);
// sign-up links expire within minutes, so none is made here.
//
// The registry row keeps `payments: { provider, accountId, mode }`; the service checks every call against it.
//
// Square works the other way round: the platform can't make a Square account for a press. The press signs in to their
// own Square account from their admin (Settings › Payments › Connect Square), and the payment service saves its id in
// the registry then. So for Square this step needs no client: it records `payments: { provider: "square", mode }`
// (sandbox for a press in test mode) and the profile's `{ provider: "square", mode: "platform" }`, and leaves alone
// whatever account the press has connected since.
//
// The step also writes the shop profile's `payments` (code plan 2.2): the shop takes payments through the platform
// ("platform" mode), and its card form needs the press's account and the platform's publishable keys on the page
// (`config.stripePublishableKeys: { live, test }`, both public). The profile is saved to the registry and to the
// per-shop /shop-profile.js, like step 6.
import { isDeepStrictEqual } from "node:util";
import { profileProblems, profileScript } from "../profile/profile.js";

/** The payment providers a press can choose, and whether the shop maker can connect each one yet. */
export const PAYMENT_PROVIDERS = Object.freeze({
  stripe: Object.freeze({ name: "Stripe", ready: true }),
  square: Object.freeze({ name: "Square", ready: true, connectsLater: true }),
});

export const DEFAULT_PAYMENT_PROVIDER = "stripe";

/** The provider a shop chose at sign-up; Stripe when it chose none. */
export function paymentProviderOf(shop) {
  return shop.paymentProvider ?? DEFAULT_PAYMENT_PROVIDER;
}

/** Problems with a shop's payment choice, in plain words (checked with the rest of the sign-up details at step 1). */
export function paymentProblems(shop) {
  const provider = paymentProviderOf(shop);
  if (!Object.hasOwn(PAYMENT_PROVIDERS, provider)) {
    return [`the payment provider must be one of ${Object.keys(PAYMENT_PROVIDERS).join(", ")}`];
  }
  const known = PAYMENT_PROVIDERS[provider];
  if (!known.ready) return [`payments through ${known.name} aren't ready yet (plan item ${known.planItem}); choose ${PAYMENT_PROVIDERS[DEFAULT_PAYMENT_PROVIDER].name} for now`];
  return [];
}

/** The profile's `payments` for a shop on the platform's payments, with this account. */
export function profilePayments(provider, accountId, publishableKeys = {}) {
  if (provider !== "stripe") return { provider, mode: "platform" };
  const stripe = { accountId };
  if (publishableKeys.live) stripe.publishableKey = publishableKeys.live;
  if (publishableKeys.test) stripe.testPublishableKey = publishableKeys.test;
  return { provider, mode: "platform", stripe };
}

/**
 * Step 13: create the press's account with their chosen provider (through the payment service), save its id in the
 * registry and write the profile's `payments`. `providers` maps a provider name to its client; only the ones built so
 * far are passed. `profileFiles` and `config.stripePublishableKeys` as in steps.js and the header above.
 */
export function connectPaymentsStep({ number = 13, registry, providers, profileFiles, config = {} }) {
  const publishableKeys = config.stripePublishableKeys ?? {};
  // The saved profile with this account's payments, and whether the profile and its file already say so.
  const profileFor = async (shop, provider, accountId) => {
    const saved = await registry.getProfile(shop.shopId);
    if (!saved) throw new Error(`${shop.shopId} has no saved profile; step 6 writes it first`);
    const profile = { ...saved, payments: profilePayments(provider, accountId, publishableKeys) };
    const written = isDeepStrictEqual(saved, profile) && (await profileFiles.read(shop.shopId)) === profileScript(profile);
    return { profile, written };
  };
  const clientFor = (shop) => {
    const provider = paymentProviderOf(shop);
    const problems = paymentProblems(shop);
    if (problems.length) throw new Error(problems[0]);
    if (PAYMENT_PROVIDERS[provider].connectsLater) return { provider, client: null };
    const client = providers?.[provider];
    if (!client) throw new Error(`the shop maker has no ${PAYMENT_PROVIDERS[provider].name} connection`);
    return { provider, client };
  };

  // What the registry says, checked against what the provider has. Anything that disagrees needs a person: switching a
  // press's provider, or two accounts for one press, could send their money to the wrong place.
  const compare = async (shop) => {
    const { provider, client } = clientFor(shop);
    const saved = (await registry.getShop(shop.shopId))?.payments ?? null;
    if (saved && saved.provider !== provider) {
      throw new Error(`the registry has ${shop.shopId} on ${saved.provider}, but the shop chose ${provider}; a person decides which one stays`);
    }
    if (!client) return { provider, client, saved, found: null };
    const found = await client.findAccount(shop.shopId);
    if (saved && found && saved.accountId !== found.accountId) {
      throw new Error(`the registry and ${PAYMENT_PROVIDERS[provider].name} name different accounts for ${shop.shopId} (${saved.accountId}, ${found.accountId}); a person decides which one stays`);
    }
    if (saved && !found) {
      throw new Error(`the registry names ${PAYMENT_PROVIDERS[provider].name} account ${saved.accountId} for ${shop.shopId}, but the payment service can't find it; a person checks before a new one is made`);
    }
    return { provider, client, saved, found };
  };

  return {
    number,
    name: "Connect the press's payments",
    async check({ shop }) {
      const { provider, client, saved, found } = await compare(shop);
      if (!client) return Boolean(saved?.mode) && (await profileFor(shop, provider, null)).written;
      if (!(saved && found)) return false;
      return (await profileFor(shop, provider, saved.accountId)).written;
    },
    async act({ shop }) {
      const { provider, client, saved: before, found } = await compare(shop);
      if (!client) return connectsLater(shop, provider, before);
      const account = found ?? (await client.createAccount(shop.shopId, {
        pressName: shop.pressName,
        ownerEmail: shop.ownerEmail,
        country: shop.country,
        currency: shop.currency,
        testMode: shop.testMode === true,
      }));
      if (!account?.accountId) throw new Error(`${PAYMENT_PROVIDERS[provider].name} gave no account id`);
      const mode = account.mode === "live" || account.mode === "test" ? account.mode : shop.testMode === true ? "test" : "live";
      const saved = (await registry.getShop(shop.shopId))?.payments;
      const payments = { provider, accountId: account.accountId, mode };
      // Kept as it is when it already says so: the payment service adds the account's state to it.
      if (!(saved && saved.provider === provider && saved.accountId === account.accountId && saved.mode === mode)) {
        await registry.updateShop(shop.shopId, { payments: { ...(saved ?? {}), ...payments } });
      }
      const { profile, written } = await profileFor(shop, provider, account.accountId);
      if (!written) {
        const problems = profileProblems(profile);
        if (problems.length) throw new Error(`the shop profile has problems: ${problems.join("; ")}`);
        await registry.saveProfile(shop.shopId, profile);
        await profileFiles.write(shop.shopId, profileScript(profile));
      }
      return { detail: { payments: profile.payments } };
    },
  };

  // Square (and any provider the press connects from their admin): the registry says which provider and mode; the
  // account id arrives when the press connects, and a mode already saved is never changed here.
  async function connectsLater(shop, provider, saved) {
    if (!saved?.mode) {
      await registry.updateShop(shop.shopId, { payments: { ...(saved ?? {}), provider, mode: shop.testMode === true ? "test" : "live" } });
    }
    const { profile, written } = await profileFor(shop, provider, null);
    if (!written) {
      const problems = profileProblems(profile);
      if (problems.length) throw new Error(`the shop profile has problems: ${problems.join("; ")}`);
      await registry.saveProfile(shop.shopId, profile);
      await profileFiles.write(shop.shopId, profileScript(profile));
    }
    return { detail: { payments: profile.payments, connectsFromAdmin: true } };
  }
}
