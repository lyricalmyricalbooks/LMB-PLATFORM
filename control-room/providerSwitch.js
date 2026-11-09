// Finishing a press's switch between Stripe and Square (code plan 27.6c). The press connects the new account and
// presses Switch in Settings › Payments (services/payments: `account.switch`), after which both accounts take sales.
// This moves the shop over, in this order, each part only when it differs, so it is safe to run again after a failure:
//   1. the shop's server settings file names the new provider, with the old one as SHOP_PAYMENT_EARLIER (older orders
//      keep their refunds there), and its server code is deployed again at the release it is on;
//   2. the profile's `payments` (what the admin and the storefront read), and its pages deployed again;
//   3. the registry: the new account takes sales alone and the old one joins `payments.earlier`
//      (services/payments/accountSlots.js `switched`); the switch is logged.
// Until step 3 nothing is lost: the shop's server sells through whichever provider it runs, and both accounts take it.
// Where deploys aren't connected (the hosted server, server/world.js), step 1 fails and the switch waits, shown in
// the control room with its reason, to be finished from there once they are.
//
// Once finished, the press hears ("payments-switched", to the shop's owner, in the shop's language): new sales and payouts
// go to the new account, and refunds for older orders still go through the old one, so it stays open. An email that
// fails never undoes the switch; its key holds the account, so finishing twice sends one.
//
// Clients passed in: registry (getShop, listShops, updateShop, getProfile, saveProfile), envFiles and profileFiles
// (read, write), deploy and build (emergencyPayments.js redeployShopServer), publish (controlRoom.js
// profilePublisher), log (the control room's, or the payment service's), now, publishableKeys (the platform's Stripe
// publishable keys for the profile, setup/payments.js profilePayments), email (sendPlatform; optional).
import { isDeepStrictEqual } from "node:util";
import { profileProblems, profileScript } from "../profile/profile.js";
import { profilePayments } from "../setup/payments.js";
import { switched } from "../services/payments/accountSlots.js";
import { envPayments, envWithPayments, redeployShopServer } from "./emergencyPayments.js";

/** A shop whose press pressed Switch and whose switch isn't finished yet, for the control room. */
export function switchWaiting(row) {
  const switching = row?.payments?.switching;
  if (!switching) return null;
  return { shopId: row.shopId, from: row.payments.provider, to: switching.to, since: switching.at, problem: row.paymentsSwitchProblem ?? null };
}

export const SWITCHED_EMAIL = "payments-switched";

export function providerSwitch({ registry, envFiles, profileFiles, deploy, build, publish, log, email = null, now = () => new Date(), publishableKeys = {} }) {
  const at = () => now().toISOString();

  /** Finishes one shop's switch. Resolves to { shopId, finished, server?, pages?, skipped?, error? }. */
  async function finish(shopId, { by }) {
    const row = await registry.getShop(shopId);
    const switching = row?.payments?.switching;
    const next = row?.payments?.next;
    if (!switching || !next || next.accountId !== switching.accountId) return { shopId, finished: false, skipped: "no switch is waiting" };
    try {
      const envText = await envFiles.read(shopId);
      if (!envText) throw new Error("its server settings file is missing from the registry (setup step 8)");
      const profile = await registry.getProfile(shopId);
      if (!profile) throw new Error("it has no saved profile (setup step 6)");
      const nextProfile = { ...profile, payments: profilePayments(next.provider, next.accountId, publishableKeys) };
      const problems = profileProblems(nextProfile);
      if (problems.length) throw new Error(`its profile would have problems: ${problems.join("; ")}`);

      const nextEnv = envWithPayments(envText, { provider: next.provider, mode: envPayments(envText).mode || "platform", earlier: row.payments.provider });
      let server = false;
      if (nextEnv !== envText) {
        // Deployed first, saved after: a deploy that fails leaves the file as it was, and the next run deploys again.
        server = await redeployShopServer({ deploy, build }, shopId, row, nextEnv);
        await envFiles.write(shopId, nextEnv);
      }
      let pages = [];
      if (!isDeepStrictEqual(profile, nextProfile)) await registry.saveProfile(shopId, nextProfile);
      const script = profileScript(nextProfile);
      if ((await profileFiles.read(shopId)) !== script) {
        await profileFiles.write(shopId, script);
        ({ apps: pages } = await publish(shopId));
      }

      await registry.updateShop(shopId, { payments: switched(row.payments, at()), paymentsSwitchProblem: null });
      await log(shopId, "payments-switched", { by, from: row.payments.provider, to: next.provider, accountId: next.accountId });
      const told = await tellPress(row, next, nextProfile);
      return { shopId, finished: true, server, pages, told };
    } catch (error) {
      const problem = { at: at(), message: String(error?.message ?? error).slice(0, 300) };
      await registry.updateShop(shopId, { paymentsSwitchProblem: problem });
      return { shopId, finished: false, error: problem.message };
    }
  }

  async function tellPress(row, next, profile) {
    if (!email || !row.ownerEmail) return false;
    try {
      await email.sendPlatform({
        kind: SWITCHED_EMAIL, to: row.ownerEmail, shopId: row.shopId, idempotencyKey: `${SWITCHED_EMAIL}-${row.shopId}-${next.accountId}`,
        data: { pressName: row.pressName ?? row.shopId, from: row.payments.provider, to: next.provider, link: profile?.siteUrl ? `${profile.siteUrl}/admin#settings/payments` : null },
      });
      return true;
    } catch (error) {
      console.error(`payments switch: couldn't email ${row.shopId}: ${error?.message ?? error}`);
      return false;
    }
  }

  return {
    finish,
    /** Every shop with a switch waiting, oldest first. */
    async waiting() {
      return (await registry.listShops()).map(switchWaiting).filter(Boolean).sort((a, b) => String(a.since).localeCompare(String(b.since)));
    },
    /** Tries every waiting switch once. One shop's trouble never stops the others. */
    async finishAll({ by }) {
      const shops = [];
      for (const { shopId } of await this.waiting()) shops.push(await finish(shopId, { by }));
      return { shops };
    },
  };
}
