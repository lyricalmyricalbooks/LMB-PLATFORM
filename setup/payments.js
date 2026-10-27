// Step 13 of the shop maker: connect the press's payments. The step takes a payment provider, so a press can take
// payments through Stripe (built first) or, later, Square (plan item 2.2b). Each provider is reached only through the
// platform's payment service (services/payments, docs/payments.md), which holds the platform keys; the shop maker never
// does.
//
// A provider client, one per provider, passed in as `providers[name]`:
//
//   findAccount(shopId)            -> { accountId } | null   the press's account the service already made, if any
//   createAccount(shopId, details) -> { accountId }          details: { pressName, ownerEmail, country, currency, testMode }
//
// `createAccount` must be safe to repeat: the service sends the shop id as the provider's idempotency key, so a retry
// after a lost answer finds the same account instead of making a second one. Nothing here can close or delete an
// account. The press finishes signing up with the provider from their admin (the "Connect" button, plan item 2.10);
// sign-up links expire within minutes, so none is made here.
//
// The registry row keeps `payments: { provider, accountId }`; the service checks every call against it.

/** The payment providers a press can choose, and whether the shop maker can connect each one yet. */
export const PAYMENT_PROVIDERS = Object.freeze({
  stripe: Object.freeze({ name: "Stripe", ready: true }),
  square: Object.freeze({ name: "Square", ready: false, planItem: "2.2b" }),
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

/**
 * Step 13: create the press's account with their chosen provider (through the payment service) and save its id in the
 * registry. `providers` maps a provider name to its client; only the ones built so far are passed.
 */
export function connectPaymentsStep({ number = 13, registry, providers }) {
  const clientFor = (shop) => {
    const provider = paymentProviderOf(shop);
    const problems = paymentProblems(shop);
    if (problems.length) throw new Error(problems[0]);
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
      const { saved, found } = await compare(shop);
      return Boolean(saved && found);
    },
    async act({ shop }) {
      const { provider, client, found } = await compare(shop);
      const account = found ?? (await client.createAccount(shop.shopId, {
        pressName: shop.pressName,
        ownerEmail: shop.ownerEmail,
        country: shop.country,
        currency: shop.currency,
        testMode: shop.testMode === true,
      }));
      if (!account?.accountId) throw new Error(`${PAYMENT_PROVIDERS[provider].name} gave no account id`);
      await registry.updateShop(shop.shopId, { payments: { provider, accountId: account.accountId } });
    },
  };
}
