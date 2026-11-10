// The shop maker for the shared system (docs/shared-system.md, step 6). Every shop lives in one shared Firebase project,
// so making one is no longer a Google project, its services, databases, deploys and backups (steps 2–11 and 17–20 of
// later-steps.js shopSteps): it is a few writes in the shared project, done in seconds. The runner (runner.js) runs
// these as it runs the old ones: each step only looks in `check` and only changes in `act`, a re-run resumes at the
// first step not done, and nothing is ever deleted.
//
//    1  Reserve the shop id in the registry (the row names the shared project).
//    2  Make the shop's sign-in list (shopTenant.js), named in the registry row.
//    3  Write the shop's profile: the shared project's web app, the shop's address, both apps (every shop gets the shop
//       and the stockroom, Julian 10 November 2026), the stockroom's database and the shared stockroom bucket.
//    4  Write the shop's record in each store: `shops/<id>` in the database (tenant, owner, status, the server's
//       per-shop settings, the profile), and its copies in the stockroom's database and the Realtime Database.
//    5  Give the shop its free web address (`addresses/{host}`). An address another shop holds stops for a person.
//    6  Starter content and the owner's admin place     (later-steps.js step 12, inside the shop's folder)
//    7  Connect payments                                (step 13; the profile it writes goes into the record)
//    8  Email the owner their sign-in link              (step 14)
//    9  Put the free address on the shared Hosting site (`addresses`, the domain service), wait while Google secures
//       it (the run stops as waiting and the shop maker looks again in five minutes), then check the shop answers
//       there and mark it live.
//   10  Turn on the stockroom link                      (step 16)
//   11  Hand over what the press set up before opening  (step 21)
//
// Clients, as for shopSteps, plus `shared` (clients/shared.js sharedStores: records, stockroomRecords, liveRecords,
// addresses) and `google` with only `authConfig` and `tenants` (clients/google.js), and optionally `addresses`: the
// domain service (services/domains/hosted.js), which puts the free address on the shared Hosting site in step 9.
// `shopData`, `stockroom` and
// `inventoryLink` reach the shop's folder in the shared project (the caller builds them so). Config, as for shopSteps
// (`release`, `senderEmail`, `paymentsServiceUrl`, `stripePublishableKeys`, `switchDefaults`), plus:
//   sharedProject    the shared project's id
//   webApp           its web app's settings ({ apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId })
//   shopDomain       the shops' domain: a shop's free address is <shop id>.<shopDomain>
//   stockroomBucket  the shared stockroom bucket (each shop's files sit under shops/<id>/ in it)
import { isDeepStrictEqual } from "node:util";
import { profileProblems, profileScript } from "../profile/profile.js";
import { REGION, STOCKROOM_DATABASE, shopProblems, shopProfile } from "./steps.js";
import { envFileText, laterSteps } from "./later-steps.js";
import { ensureShopTenant, tenantIdOf } from "./shopTenant.js";
import { StepWaiting } from "./runner.js";
import { domainOrigins, normalDomain } from "../services/domains/names.js";

/**
 * The per-shop server settings a record carries (apps/shop/functions/shopConfig.js SHOP_KEYS; sharedSteps.test.js keeps
 * the two lists equal). Written out here because the hosted server runs this file and its image holds no `apps/`.
 */
export const SHOP_KEYS = Object.freeze([
  "SHOP_SENDER_NAME", "SHOP_SENDER_EMAIL", "SHOP_SITE_URL", "SHOP_EXTRA_ORIGINS", "SHOP_PAYMENT_PROVIDER",
  "SHOP_PAYMENT_MODE", "SHOP_PAYMENT_EARLIER", "SHOP_TEST_SHOP", "SHOP_STOCKROOM_DATABASE",
]);

/** Every shop gets the shop and the stockroom: the plan the steps build is always "both". */
export const everything = (shop) => ({ ...shop, plan: "both" });

/** What each step is doing, in the press's words (signup/shopMaker.js shows them). */
export const SHARED_STEP_WORDS = Object.freeze({
  1: "saving your shop's name",
  2: "setting up your shop's sign-in",
  3: "writing your shop's settings",
  4: "making your shop's own space",
  5: "giving your shop its web address",
  6: "adding your starter pages",
  7: "connecting your payments",
  8: "emailing you the way in",
  9: "checking everything works",
  10: "linking your shop and stockroom",
  11: "bringing over your look and your books",
});

/**
 * The shop maker's view of these steps (signup/shopMaker.js `steps`): their words, the steps a plan change runs again
 * (the profile, payments, the welcome email and the stockroom link), and after which step each row of "Setting up your
 * store" is done (signup/making.js).
 */
export const SHARED_STEP_PLAN = Object.freeze({
  words: SHARED_STEP_WORDS,
  planSteps: Object.freeze([3, 4, 7, 8, 10]),
  marks: Object.freeze({ address: 5, store: 9 }),
});

// The later steps these reuse, by their number in later-steps.js, and the number each gets here.
const REUSED = Object.freeze({ 12: 6, 13: 7, 14: 8, 16: 10, 21: 11 });

/** The shop's free address: the registry's `freeAddress` (the platform's, e.g. the test shop's) or <id>.<shopDomain>. */
export function freeHost(shopId, row, shopDomain) {
  const given = normalDomain(row?.freeAddress ?? "");
  if (given) return given;
  const domain = normalDomain(shopDomain ?? "");
  if (!domain) throw new Error("config.shopDomain must be the shops' domain, like shops.example");
  return `${shopId}.${domain}`;
}

/** The shop's main address: the press's own domain once made main (services/domains), else its free address. */
export function sharedSiteUrl(shopId, row, shopDomain) {
  const main = normalDomain(row?.mainDomain ?? "");
  const domains = Array.isArray(row?.domains) ? row.domains : [];
  return `https://${main && domains.some((d) => normalDomain(d?.name) === main) ? main : freeHost(shopId, row, shopDomain)}`;
}

/** The server's per-shop settings (`record.server`): the SHOP_… lines of the env file a shop's own project had. */
export function serverSettings(shop, { senderEmail, paymentsServiceUrl, siteUrl, extraOrigins = [] }) {
  const text = envFileText(shop, { senderEmail, paymentsServiceUrl, siteUrl, extraOrigins });
  const server = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match && SHOP_KEYS.includes(match[1])) server[match[1]] = match[2];
  }
  return server;
}

/** The profile file the payments step reads and writes, kept as the record's `profile` (the front door serves it). */
export function recordProfileFiles(records) {
  return {
    async read(shopId) {
      const profile = (await records.get(shopId))?.profile;
      return profile ? profileScript(profile) : null;
    },
    async write(shopId, text) {
      const json = String(text).match(/window\.__SHOP_PROFILE__\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)?.[1];
      if (!json) throw new Error("the profile file has no profile in it");
      const profile = JSON.parse(json);
      if (profile.shopId !== shopId) throw new Error(`the profile names ${profile.shopId}, not ${shopId}`);
      await records.set(shopId, { profile }, { fields: ["profile"] });
    },
  };
}

export function sharedShopSteps({ google, shared, registry, shopData, stockroom, inventoryLink, providers, email, siteCheck, presses = null, stagedFiles = null, addresses = null, config, now = () => new Date() }) {
  const { sharedProject, webApp, shopDomain, stockroomBucket, serviceKeyHash } = config ?? {};
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(sharedProject ?? "")) throw new Error("config.sharedProject must be the shared project's id");
  if (webApp?.projectId !== sharedProject) throw new Error("config.webApp must be the shared project's web app settings");
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(stockroomBucket ?? "")) throw new Error("config.stockroomBucket must name the shared stockroom bucket");
  const region = config.region ?? REGION;
  const valid = (shop) => {
    const problems = shopProblems(shop);
    if (problems.length) throw new Error(`The shop details have problems: ${problems.join("; ")}`);
    return everything(shop);
  };
  const rowOf = (shop) => registry.getShop(shop.shopId);
  const siteUrlFor = async (shop) => sharedSiteUrl(shop.shopId, await rowOf(shop), shopDomain);

  const profileFiles = recordProfileFiles(shared.records);
  const profileFor = async (shop) => {
    const saved = await registry.getProfile(shop.shopId);
    const base = shopProfile(shop, webApp, region, saved?.switches, saved?.payments, config.switchDefaults, await siteUrlFor(shop));
    return { ...base, stockroom: { firestoreDatabase: STOCKROOM_DATABASE, storageBucket: stockroomBucket } };
  };
  const recordFor = async (shop) => {
    const row = await rowOf(shop);
    if (!row?.tenant) throw new Error("the shop has no sign-in list yet (step 2)");
    const siteUrl = sharedSiteUrl(shop.shopId, row, shopDomain);
    return {
      tenant: row.tenant,
      ownerEmail: shop.ownerEmail.toLowerCase(),
      server: serverSettings(shop, { senderEmail: config.senderEmail, paymentsServiceUrl: config.paymentsServiceUrl, siteUrl, extraOrigins: domainOrigins(row.domains) }),
    };
  };
  const copyOf = (record) => ({ tenant: record.tenant, ownerEmail: record.ownerEmail });
  const sameFields = (have, want) => Boolean(have) && Object.keys(want).every((key) => isDeepStrictEqual(have[key], want[key]));

  // The later steps that work the same in the shared system. Their page addresses are the shop's own (the front door
  // serves every shop's pages from one site; the stockroom sits under /stockroom/), and nothing is deployed per shop.
  const deploy = {
    async deployed(shopId, part) {
      const url = sharedSiteUrl(shopId, await registry.getShop(shopId), shopDomain);
      return { version: config.release?.version, url: part === "pages:stockroom" ? `${url}/stockroom` : url };
    },
  };
  const later = laterSteps({ deploy, shopData, providers, email, siteCheck, inventoryLink, stockroom, registry, profileFiles, presses, stagedFiles, config, now });
  const reused = (number) => {
    const step = later.find((s) => s.number === number);
    return { ...step, number: REUSED[number], check: (ctx) => step.check({ ...ctx, shop: everything(ctx.shop) }), act: (ctx) => step.act({ ...ctx, shop: everything(ctx.shop) }) };
  };

  return [
    {
      number: 1,
      name: "Reserve the shop id in the registry",
      async check({ shop }) {
        const row = await registry.getShop(valid(shop).shopId);
        if (!row) return false;
        if (row.ownerEmail !== shop.ownerEmail) throw new Error(`the shop id ${shop.shopId} already belongs to another press`);
        if (row.projectId !== sharedProject) throw new Error(`the shop id ${shop.shopId} has a project of its own (${row.projectId}); a person moves it into the shared system`);
        return !serviceKeyHash || row.serviceKeyHash === serviceKeyHash;
      },
      async act({ shop }) {
        const { shopId, pressName, ownerEmail, country, currency, language } = valid(shop);
        // The shared server's key (setup/serviceKey.js sharedServiceKeyHash): the platform's payment, email and domain
        // services take its calls for this shop.
        const key = serviceKeyHash ? { serviceKeyHash } : {};
        if (await registry.getShop(shopId)) return registry.updateShop(shopId, key);
        await registry.createShop(shopId, {
          shopId, projectId: sharedProject, shared: true, pressName, ownerEmail, plan: "both", country, currency, region,
          testMode: shop.testMode === true, testShop: shop.testShop === true, status: "creating", createdAt: now().toISOString(),
          ...(language === "fr" ? { language } : {}), ...key,
          // The test shop answers at the shared test project's own Firebase address (setup/make-test-shop.js), which
          // the platform gives it here; every other shop's free address is <id>.<shops' domain> (step 5).
          ...(shop.testShop === true && normalDomain(shop.freeAddress ?? "") ? { freeAddress: normalDomain(shop.freeAddress) } : {}),
        });
      },
    },
    {
      number: 2,
      name: "Make the shop's sign-in list",
      async check({ shop }) {
        const tenant = (await rowOf(shop))?.tenant;
        return Boolean(tenant) && (await google.tenants.list(sharedProject)).some((list) => tenantIdOf(list) === tenant);
      },
      async act({ shop }) {
        const row = await rowOf(shop);
        const { tenant, created, changed } = await ensureShopTenant({ google, projectId: sharedProject, shopId: shop.shopId, record: row });
        await registry.updateShop(shop.shopId, { tenant });
        return { detail: { tenant, created, changed } };
      },
    },
    {
      number: 3,
      name: "Write the shop profile",
      async check({ shop }) {
        const profile = await profileFor(valid(shop));
        return isDeepStrictEqual(await registry.getProfile(shop.shopId), profile) && isDeepStrictEqual((await shared.records.get(shop.shopId))?.profile, profile);
      },
      async act({ shop }) {
        const profile = await profileFor(valid(shop));
        const problems = profileProblems(profile);
        if (problems.length) throw new Error(`the shop profile has problems: ${problems.join("; ")}`);
        await registry.saveProfile(shop.shopId, profile);
        await profileFiles.write(shop.shopId, profileScript(profile));
        return { detail: { switches: profile.switches } };
      },
    },
    {
      number: 4,
      name: "Write the shop's record in each store",
      async check({ shop }) {
        const want = await recordFor(valid(shop));
        const record = await shared.records.get(shop.shopId);
        if (!record?.status || !sameFields(record, want)) return false;
        if (!sameFields(await shared.stockroomRecords.get(shop.shopId), copyOf(want))) return false;
        return !shared.liveRecords || sameFields(await shared.liveRecords.get(shop.shopId), copyOf(want));
      },
      async act({ shop }) {
        const want = await recordFor(valid(shop));
        const record = await shared.records.get(shop.shopId);
        // A new shop opens; a status the platform set since (paused, closed) is kept.
        const fields = { ...want, ...(record?.status ? {} : { status: "open" }) };
        await shared.records.set(shop.shopId, fields, { fields: Object.keys(fields) });
        await shared.stockroomRecords.set(shop.shopId, copyOf(want), { fields: ["tenant", "ownerEmail"] });
        if (shared.liveRecords) await shared.liveRecords.set(shop.shopId, copyOf(want));
      },
    },
    {
      number: 5,
      name: "Give the shop its free web address",
      async check({ shop }) {
        const host = freeHost(shop.shopId, await rowOf(shop), shopDomain);
        const taken = await shared.addresses.get(host);
        if (!taken) return false;
        if (taken.shopId !== shop.shopId) throw new Error(`the address ${host} already belongs to the shop ${taken.shopId}; a person decides`);
        return (await rowOf(shop))?.freeAddress === host;
      },
      async act({ shop }) {
        const host = freeHost(shop.shopId, await rowOf(shop), shopDomain);
        if (!(await shared.addresses.create(host, { shopId: shop.shopId, kind: "free", createdAt: now().toISOString() }))) {
          const taken = await shared.addresses.get(host);
          if (taken?.shopId !== shop.shopId) throw new Error(`the address ${host} already belongs to the shop ${taken?.shopId}; a person decides`);
        }
        await registry.updateShop(shop.shopId, { freeAddress: host });
        return { detail: { address: host } };
      },
    },
    reused(12),
    reused(13),
    reused(14),
    {
      number: 9,
      name: "Check the shop answers at its address and mark it live",
      async check({ shop }) {
        const row = await rowOf(shop);
        if (row?.status === "abandoned") throw new Error(`${shop.shopId} is marked abandoned in the registry; a person decides before it goes live`);
        return row?.status === "live";
      },
      async act({ shop }) {
        // The free address goes on the shared Hosting site (and its lines in the platform's zone); Google then secures
        // it, which takes minutes to hours: the run waits for that instead of failing (setup/runner.js StepWaiting).
        if (addresses) {
          const free = await addresses.connectFreeAddress(shop.shopId);
          if (!free?.skipped && free?.state !== "live") {
            if (free?.state === "conflict") throw new Error(`the address ${free.name} is held by another Firebase project; a person looks at it`);
            throw new StepWaiting(`the shop's address ${free?.name ?? ""} is still being secured (${free?.state ?? "unknown"})`);
          }
        }
        const url = await siteUrlFor(shop);
        const failures = [];
        for (const page of [url, `${url}/admin`, `${url}/shop-profile.js`, `${url}/stockroom/`, `${url}/stockroom/shop-profile.js`]) {
          const { status, problems = [] } = await siteCheck.get(page);
          if (status !== 200 || problems.length) failures.push(`${page} answered ${status}${problems.length ? ` (${problems.join("; ")})` : ""}`);
        }
        if (failures.length) throw new Error(`the shop check failed: ${failures.join("; ")}`);
        await registry.updateShop(shop.shopId, { status: "live", liveAt: now().toISOString() });
      },
    },
    reused(16),
    reused(21),
  ];
}
