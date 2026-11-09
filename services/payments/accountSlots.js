// A shop's payment accounts when it switches between Stripe and Square after opening (code plan, switch-plan.md S1–S3).
//
// The registry's `payments` stays the account that takes new sales. Two more fields sit inside it:
//   earlier        [{ provider, accountId, mode, locationId?, currency?, until }], newest first: accounts the shop sold
//                  through before a switch. Older orders still refund, sync and track payouts through them.
//   next           { provider, accountId, mode, ... }: the account being connected for a switch. It takes no sales yet.
//   otherAccounts  ["stripe:acct_…", "square:MLR…"]: the keys of `earlier` and `next`, so the registry can find a shop
//                  by any of its accounts (Firestore can't search inside a list of objects).
//   switching      { to, accountId, at }: the press pressed Switch. Until the shop's server runs the new provider and
//                  the platform finishes the switch (control-room/providerSwitch.js), both accounts take sales.
// Pure functions; service.js and square.js do the reading and writing.

export const accountKey = (provider, accountId) => `${provider}:${accountId}`;

const SLOT_FIELDS = ["earlier", "next", "otherAccounts", "switching"];

/** The account itself, without the switch fields (what a view of one account carries as its `payments`). */
export function accountOnly(payments) {
  const out = { ...(payments ?? {}) };
  for (const field of SLOT_FIELDS) delete out[field];
  return out;
}

const earlierOf = (payments) => (Array.isArray(payments?.earlier) ? payments.earlier.filter((a) => a && a.provider && a.accountId) : []);
const nextOf = (payments) => (payments?.next && payments.next.provider && payments.next.accountId ? payments.next : null);

/** `payments` with `otherAccounts` worked out again from `earlier` and `next` (empty fields left out). */
export function withOtherAccounts(payments) {
  const earlier = earlierOf(payments);
  const next = nextOf(payments);
  const switching = next && payments?.switching?.accountId === next.accountId ? payments.switching : null;
  const out = { ...accountOnly(payments), ...(earlier.length ? { earlier } : {}), ...(next ? { next } : {}), ...(switching ? { switching } : {}) };
  const keys = [...new Set([...(next ? [next] : []), ...earlier].map((a) => accountKey(a.provider, a.accountId)))];
  if (keys.length) out.otherAccounts = keys;
  return out;
}

/** Whether this row names the account anywhere: as its current account, the next one or an earlier one. */
export function namesAccount(payments, provider, accountId) {
  return findSlot(payments, provider, accountId) !== null;
}

/**
 * Where an account sits in a shop's payments: `{ slot: "current" | "next" | "earlier", index?, account }`, or null.
 * `account` is the plain account record (no switch fields).
 */
export function findSlot(payments, provider, accountId) {
  if (!payments || !accountId) return null;
  if (payments.provider === provider && payments.accountId === accountId) return { slot: "current", account: accountOnly(payments) };
  const next = nextOf(payments);
  if (next && next.provider === provider && next.accountId === accountId) return { slot: "next", account: next };
  const index = earlierOf(payments).findIndex((a) => a.provider === provider && a.accountId === accountId);
  return index >= 0 ? { slot: "earlier", index, account: earlierOf(payments)[index] } : null;
}

/**
 * The account a call for this provider uses: the current one when the shop sells through that provider, otherwise
 * the newest earlier one (orders taken before a switch). `{ slot, account }` or null when the shop never had one.
 */
export function accountFor(payments, provider) {
  if (payments?.provider === provider) return { slot: "current", account: accountOnly(payments) };
  const index = earlierOf(payments).findIndex((a) => a.provider === provider);
  return index >= 0 ? { slot: "earlier", index, account: earlierOf(payments)[index] } : null;
}

/** The next account while a switch to it is under way (it takes sales too until the switch is finished), or null. */
export function switchingTo(payments, provider) {
  const next = nextOf(payments);
  return next && next.provider === provider && payments?.switching?.accountId === next.accountId ? { slot: "next", account: next } : null;
}

/** Whether the next account is ready to take sales: Square connected, or Stripe's checks passed. */
export function nextReady(payments) {
  const next = nextOf(payments);
  if (!next || next.disconnectedAt) return false;
  return next.provider === "square" ? Boolean(next.locationId) : next.chargesEnabled === true;
}

/**
 * The switch, finished: the next account takes sales alone, and the current one joins `earlier` (newest first), so
 * the orders it took keep their refunds. An earlier entry for the account switched to is dropped.
 */
export function switched(payments, until) {
  const next = nextOf(payments);
  if (!next) return payments;
  const earlier = [{ ...accountOnly(payments), until }, ...earlierOf(payments).filter((a) => !(a.provider === next.provider && a.accountId === next.accountId))];
  return withOtherAccounts({ ...accountOnly(next), earlier });
}

/** `payments` with the account at `found` (from findSlot / accountFor) replaced by `account`. */
export function replaceSlot(payments, found, account) {
  if (found.slot === "current") return withOtherAccounts({ ...accountOnly(account), earlier: payments?.earlier, next: payments?.next, switching: payments?.switching });
  if (found.slot === "next") return withOtherAccounts({ ...(payments ?? {}), next: accountOnly(account) });
  const earlier = earlierOf(payments).slice();
  earlier[found.index] = accountOnly(account);
  return withOtherAccounts({ ...(payments ?? {}), earlier });
}

/** `payments` with `next` set to this account (or taken away with null). */
export function withNext(payments, next) {
  const { next: _old, ...rest } = payments ?? {};
  return withOtherAccounts(next ? { ...rest, next: accountOnly(next) } : rest);
}

/** A row whose `payments` is one account, for code written for a shop's single account. */
export const viewOf = (row, account) => ({ ...row, payments: accountOnly(account) });
