// Steps 7–16 of the shop maker (docs/shop-setup.md): rules, server code, pages, backup, private storage check, starter
// content, payments, the owner's email, the shop check and (test shop only) the stockroom link. As in steps.js, `check` only looks and `act` only changes;
// runner.js runs them. Each step stops for a person when what it finds is neither "done" nor "not started".
//
// Everything is reached through clients passed in. There is no real client in this folder yet, so nothing here can
// deploy, back up, charge or email for real; fakes.js has pretend ones.
//
//   deploy      deployed(projectId, part) -> { version, region?, apps?, url? } | null
//                 part is "rules", "functions", "pages:shop" or "pages:stockroom". The real client reads the release
//                 version it stamped on what it deployed (ruleset and hosting release labels, function labels).
//               rules(projectId, { version, apps })                Firestore and Storage rules and indexes for those apps
//               functions(projectId, { version, region, envFile })  the shop's server code, in `region`
//               pages(projectId, { version, app }) -> { url }       one app's pages; the client picks the Hosting site
//   envFiles    read(projectId) -> text | null; write(projectId, text)    functions/.env.<project id> for the deploy
//   google.backups       hasPermission(projectId); grantPermission(projectId); latest(projectId) -> { name } | null;
//                        run(projectId) -> { name }
//   google.storageProbe  hasTestFile(projectId); writeTestFile(projectId); readUnsigned(projectId) -> { status }
//   google.secrets       latest(projectId, name) -> value | null; add(projectId, name, value)   the shop's Functions
//                        secrets (only PLATFORM_SERVICE_KEY, serviceKey.js)
//   shopData    get(projectId, path) -> data | null; create(projectId, path, data)   create refuses a document that exists
//   providers   payment providers by name (payments.js)
//   email       wasSent(shopId, kind) -> boolean; send(shopId, { kind, to, pressName, links, idempotencyKey })
//   siteCheck   get(url) -> { status, problems: [text] }
//   inventoryLink  the shop's link to its stockroom, through the shop's own admin calls (functions/inventoryLinkAdmin.js):
//                  state(projectId) -> { startDay?, connection?, links? } | null (op "status");
//                  check(projectId) -> { ok, problem? } (op "check"); startSales(projectId, { startDay }) (op "startSales");
//                  saveLinks(projectId, links) -> { links, errors } (op "saveLinks": the whole map, checked by the shop)
//   stockroom   the stockroom's own data: books(projectId) -> { [id]: book } (its catalogue);
//               addBooks(projectId, [book]) adds the books its catalogue lacks and never changes one already there
//
// `config.release` is the release being set up: `{ version, starterContent(shop) -> [{ path, data }] }`. The starter
// documents come from the release because the shop copy owns their shape. `config.senderEmail` is the platform address
// shop email is sent from (the email service adds the press's name and reply-to). `config.paymentsServiceUrl` is the
// platform payment service's address, which every shop's server code calls (payments through the platform, plan 2.2);
// `config.stripePublishableKeys` ({ live, test }, public) go in the profile for the card form (payments.js).
import { PLANS, REGION, STOCKROOM_DATABASE, firstSteps } from "./steps.js";
import { connectPaymentsStep, paymentProviderOf } from "./payments.js";
import { ensureServiceKey, hasServiceKey } from "./serviceKey.js";
import { testCatalogue } from "./test-catalogue.js";
import { domainOrigins } from "../services/domains/names.js";

export const OWNER_WELCOME = "owner-welcome";

/** The apps a shop's plan includes, as a list: ["shop"], ["stockroom"] or ["shop", "stockroom"]. */
export function appsOf(shop) {
  return Object.entries(PLANS[shop.plan] ?? {}).filter(([, on]) => on).map(([app]) => app);
}

/** The sign-up answer for the first-week list (signup/form.js QUESTION ids), or null when skipped or unknown. */
export const sellingToday = (shop) => (typeof shop.sellingToday === "string" && /^[a-z]{2,20}$/.test(shop.sellingToday) ? shop.sellingToday : null);

/** "What do you publish?" (signup/form.js, plan 6.2), for the theme suggestions (plan 6.3), or null when skipped. */
export const publishes = (shop) => (typeof shop.publishes === "string" && /^[a-z]{2,20}$/.test(shop.publishes) ? shop.publishes : null);

/** The country the press signed up from (two capital letters), for the setup guide's shipping starter, or null. */
const countryOf = (shop) => (typeof shop.country === "string" && /^[A-Z]{2}$/.test(shop.country) ? shop.country : null);

/**
 * The release's starter documents, with a press's new shop starting private (plan 6.9): the under-construction wall
 * is up in the starting design until the owner presses Open your shop in the setup guide. The platform's test shop
 * stays open, since the release check buys on it.
 */
export function privateStart(shop, docs) {
  if (shop.testShop === true) return docs;
  return docs.map((doc) => (doc.path === "settings/website"
    ? { ...doc, data: { ...doc.data, design: { ...(doc.data?.design ?? {}), showUnderConstruction: true } } }
    : doc));
}

/** The shop's functions/.env.<project id>, read by the shop's server code (apps/shop/functions/shopConfig.js). */
export function envFileText(shop, { senderEmail, paymentsServiceUrl, region = REGION, platformEmailUrl = "", platformDomainsUrl = "", extraOrigins = [] }) {
  // Quotes and line breaks would end the value early; shopConfig.js drops the same characters from the sender name.
  const quote = (value) => `"${String(value).replace(/[\r\n"\\<>]+/g, " ").replace(/\s+/g, " ").trim()}"`;
  return [
    `SHOP_OWNER_EMAIL=${quote(shop.ownerEmail.toLowerCase())}`,
    `SHOP_SENDER_NAME=${quote(shop.pressName)}`,
    `SHOP_SENDER_EMAIL=${quote(senderEmail)}`,
    `SHOP_SITE_URL=${quote(`https://${shop.shopId}.web.app`)}`,
    // Set even when empty: unset keeps the shop copy's placeholder addresses. The press's own addresses (plan 2.9,
    // services/domains, which rewrites this line when one is added) come from the registry row's `domains`.
    `SHOP_EXTRA_ORIGINS=${quote(extraOrigins.join(","))}`,
    // The provider the press chose (payments.js). The shop's server refuses to start on a name it hasn't built, so a
    // provider step 1 let through but the release can't use stops at deploy instead of at a shopper's checkout.
    `SHOP_PAYMENT_PROVIDER=${quote(paymentProviderOf(shop))}`,
    // Every shop the platform makes takes payments through the platform's payment service (plan 2.2), with no provider
    // key of its own; the shop refuses to start in this mode without the service's address.
    `SHOP_PAYMENT_MODE="platform"`,
    `SHOP_PAYMENTS_SERVICE_URL=${quote(paymentsServiceUrl)}`,
    // Where the server code runs (step 8 deploys it there); the shop reads it for its function addresses.
    `SHOP_FUNCTIONS_REGION=${quote(region)}`,
    // "true" only for the platform's own test shop (docs/test-shop.md): its test-card checkouts then move stock like
    // real ones, for the release check. Every other shop gets "false", so the shop never guesses.
    `SHOP_TEST_SHOP=${quote(shop.testShop === true)}`,
    // The stockroom's named database in this project (step 5), where the shop's link to it reads and writes
    // (apps/shop/functions/inventoryLinkStore.js, plan 1.21). Written for every shop so the server never guesses.
    `SHOP_STOCKROOM_DATABASE=${quote(STOCKROOM_DATABASE)}`,
    // The platform email service's shop door (services/email/http.js): the backup sender for a shop that hasn't
    // connected its own Gmail. Written only once the platform has one (config.platformEmailUrl).
    ...(platformEmailUrl ? [`PLATFORM_EMAIL_URL=${quote(platformEmailUrl)}`] : []),
    // The platform domain service (services/domains, plan 2.9): the press's own web address from the shop's settings.
    // Written only once the platform hosts it (config.platformDomainsUrl).
    ...(platformDomainsUrl ? [`PLATFORM_DOMAINS_URL=${quote(platformDomainsUrl)}`] : []),
    "",
  ].join("\n");
}

/** Toronto's calendar day (YYYY-MM-DD), the day the shop's link counts sales by. */
export function torontoDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Only the platform's test shop with both apps turns its stockroom link on during setup (docs/test-shop.md check 4). */
export const needsStockroomLink = (shop) => shop.testShop === true && appsOf(shop).includes("shop") && appsOf(shop).includes("stockroom");

/** Steps 7–16. */
export function laterSteps({ deploy, envFiles, google, shopData, providers, email, siteCheck, inventoryLink, stockroom, registry, profileFiles, config, now = () => new Date() }) {
  // The press's own web addresses (services/domains), so writing the server settings again never drops one.
  const originsOf = async (shop) => domainOrigins((await registry.getShop(shop.shopId))?.domains);
  const release = config?.release;
  if (typeof release?.version !== "string" || !release.version) throw new Error("config.release.version must name the release being set up");
  if (typeof release.starterContent !== "function") throw new Error("config.release.starterContent must list the starter documents");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.senderEmail ?? "")) throw new Error("config.senderEmail must be the platform's sending address");
  if (!/^https:\/\/[^/\s"]+(\/[^\s"]*)?$/.test(config.paymentsServiceUrl ?? "")) throw new Error("config.paymentsServiceUrl must be the payment service's https:// address");
  const region = config.region ?? REGION;
  const { version } = release;

  // Is this part of the shop on the release being set up? Not deployed: no. Another release: a person decides, since
  // putting an older release over a newer one (or the reverse) mid-setup could break the shop.
  const isCurrent = (deployed, what) => {
    if (!deployed) return false;
    if (deployed.version !== version) throw new Error(`${what} from release ${deployed.version} is live, not ${version}; a person decides which release this shop gets`);
    return true;
  };
  const sameApps = (a = [], b = []) => [...a].sort().join() === [...b].sort().join();
  // The test shop also gets its starter catalogue (test-catalogue.js); its stockroom side and links are below.
  const starterDocs = (shop) => [
    { path: `members/${shop.ownerEmail.toLowerCase()}`, data: { role: "owner", addedBy: "setup" } },
    // Overview › Choose your look and Set up your shop (plans 6.3, 6.9): the sign-up answers shape the theme suggestions
    // and the steps. Written once; the owner's ticks and choice stay.
    ...(appsOf(shop).includes("shop")
      ? [{ path: "firstWeek/start", data: { sellingToday: sellingToday(shop), publishes: publishes(shop), country: countryOf(shop), plan: shop.plan } }]
      : []),
    ...privateStart(shop, release.starterContent(shop)),
    ...(needsStockroomLink(shop) ? testCatalogue(shop).shopDocs : []),
  ];
  const pageUrls = async (shop) => {
    const urls = {};
    for (const app of appsOf(shop)) urls[app] = (await deploy.deployed(shop.shopId, `pages:${app}`))?.url;
    return urls;
  };

  return [
    {
      number: 7,
      name: "Deploy the security rules and indexes",
      async check({ shop }) {
        const deployed = await deploy.deployed(shop.shopId, "rules");
        return isCurrent(deployed, "The rules") && sameApps(deployed.apps, appsOf(shop));
      },
      act: ({ shop }) => deploy.rules(shop.shopId, { version, apps: appsOf(shop) }),
    },
    {
      number: 8,
      name: `Write the server details and deploy the server code in ${region}`,
      async check({ shop }) {
        if (!appsOf(shop).includes("shop")) return true; // the stockroom alone has no server code
        const deployed = await deploy.deployed(shop.shopId, "functions");
        // Functions in the wrong region can't be moved, and removing them is a person's call.
        if (deployed && deployed.region !== region) throw new Error(`the server code is in ${deployed.region}, not ${region}; a person decides how to move it`);
        return isCurrent(deployed, "The server code") && (await envFiles.read(shop.shopId)) === envFileText(shop, { ...config, region, extraOrigins: await originsOf(shop) })
          && (await hasServiceKey({ google, registry }, shop.shopId));
      },
      async act({ shop }) {
        const envFile = envFileText(shop, { ...config, region, extraOrigins: await originsOf(shop) });
        if ((await envFiles.read(shop.shopId)) !== envFile) await envFiles.write(shop.shopId, envFile);
        // The shop's key for the platform's payment and email services (serviceKey.js), before the deploy pins it. Never
        // rotated once the shop has one.
        const serviceKey = await ensureServiceKey({ google, registry }, shop.shopId);
        await deploy.functions(shop.shopId, { version, region, envFile });
        // Logged with the step's entry in the registry and the shop's audit log (never the key itself).
        return { detail: { serviceKey } };
      },
    },
    {
      number: 9,
      name: "Deploy the pages",
      async check({ shop }) {
        for (const app of appsOf(shop)) {
          if (!isCurrent(await deploy.deployed(shop.shopId, `pages:${app}`), `The ${app} pages`)) return false;
        }
        return true;
      },
      async act({ shop }) {
        for (const app of appsOf(shop)) {
          if (!(await deploy.deployed(shop.shopId, `pages:${app}`))) await deploy.pages(shop.shopId, { version, app });
        }
      },
    },
    {
      number: 10,
      name: "Allow the nightly backup and make the first one",
      check: async ({ shop }) => Boolean((await google.backups.hasPermission(shop.shopId)) && (await google.backups.latest(shop.shopId))),
      async act({ shop }) {
        if (!(await google.backups.hasPermission(shop.shopId))) await google.backups.grantPermission(shop.shopId);
        if (!(await google.backups.latest(shop.shopId))) await google.backups.run(shop.shopId);
      },
    },
    {
      number: 11,
      name: "Check the shop's stored files are private",
      async check({ shop }) {
        if (!(await google.storageProbe.hasTestFile(shop.shopId))) return false;
        const { status } = await google.storageProbe.readUnsigned(shop.shopId);
        if (status === 401 || status === 403) return true;
        if (status >= 200 && status < 300) throw new Error("anyone can read the shop's stored files; the storage rules must be fixed before the shop opens");
        throw new Error(`reading the test file without signing in gave ${status}, not a refusal; a person checks the storage rules`);
      },
      act: ({ shop }) => google.storageProbe.writeTestFile(shop.shopId),
    },
    {
      number: 12,
      name: "Write the starter content and the owner's admin place",
      async check({ shop }) {
        // A document that is there counts, whatever it holds now: the press may already have changed it.
        for (const { path } of starterDocs(shop)) if (!(await shopData.get(shop.shopId, path))) return false;
        if (!needsStockroomLink(shop)) return true;
        // The test shop's catalogue: its stockroom books are there and each printed book is linked to one.
        const { stockroomBooks, links } = testCatalogue(shop);
        const have = (await stockroom.books(shop.shopId)) ?? {};
        if (stockroomBooks.some((book) => !have[book.id])) return false;
        const saved = (await inventoryLink.state(shop.shopId))?.links ?? {};
        return links.every((link) => linkProblem(saved, link) === "linked");
      },
      async act({ shop }) {
        const created = [];
        for (const { path, data } of starterDocs(shop)) {
          if (!(await shopData.get(shop.shopId, path))) {
            await shopData.create(shop.shopId, path, { ...data, createdAt: now().toISOString() });
            created.push(path);
          }
        }
        if (!needsStockroomLink(shop)) return { detail: { created } };

        const { stockroomBooks, links } = testCatalogue(shop);
        const have = (await stockroom.books(shop.shopId)) ?? {};
        const missing = stockroomBooks.filter((book) => !have[book.id]);
        if (missing.length) await stockroom.addBooks(shop.shopId, missing);

        const saved = (await inventoryLink.state(shop.shopId))?.links ?? {};
        const toLink = [];
        for (const link of links) {
          const state = linkProblem(saved, link);
          if (state === "linked") continue;
          if (state !== "free") throw new Error(state);
          toLink.push(link);
        }
        if (toLink.length) {
          // The shop checks every link against both catalogues, so it must reach the stockroom first.
          const { ok, problem } = await inventoryLink.check(shop.shopId);
          if (!ok) throw new Error(`the shop can't reach its stockroom${problem ? ` (${problem})` : ""}, so its books can't be linked; a person checks the link`);
          // The whole map is saved: the links already there are sent back unchanged.
          const map = structuredClone(saved);
          for (const { shopBookId, stockroomBookId } of toLink) map[shopBookId] = { ...(map[shopBookId] ?? {}), _: stockroomBookId };
          const { errors = [] } = await inventoryLink.saveLinks(shop.shopId, map);
          if (errors.length) throw new Error(`the shop refused the test books' links: ${errors.map((e) => `${e.bookId}: ${e.reason}`).join("; ")}`);
        }
        return { detail: { created, stockroomBooks: missing.map((book) => book.id), linked: toLink.map((link) => link.shopBookId) } };
      },
    },
    shopOnly(connectPaymentsStep({ number: 13, registry, providers, profileFiles, config })),
    {
      number: 14,
      name: "Email the owner their sign-in link",
      check: async ({ shop }) => Boolean(await email.wasSent(shop.shopId, OWNER_WELCOME)),
      async act({ shop }) {
        const urls = await pageUrls(shop);
        const links = {};
        if (urls.shop) links.shopAdmin = `${urls.shop}/admin`;
        if (urls.stockroom) links.stockroom = urls.stockroom;
        if (Object.keys(links).length !== appsOf(shop).length) throw new Error("a page address is missing, so the email would have a broken link");
        // The key lets the email service send it once even if this step is retried after a lost answer.
        await email.send(shop.shopId, { kind: OWNER_WELCOME, to: shop.ownerEmail, pressName: shop.pressName, links, idempotencyKey: `${shop.shopId}-${OWNER_WELCOME}` });
      },
    },
    {
      number: 15,
      name: "Check the shop works and mark it live",
      async check({ shop }) {
        const row = await registry.getShop(shop.shopId);
        if (row?.status === "abandoned") throw new Error(`${shop.shopId} is marked abandoned in the registry; a person decides before it goes live`);
        return row?.status === "live";
      },
      async act({ shop }) {
        const urls = await pageUrls(shop);
        const failures = appsOf(shop).filter((app) => !urls[app]).map((app) => `the ${app} pages have no address`);
        const pages = [];
        if (urls.shop) pages.push(urls.shop, `${urls.shop}/admin`, `${urls.shop}/shop-profile.js`);
        if (urls.stockroom) pages.push(urls.stockroom);
        for (const url of pages) {
          const { status, problems = [] } = await siteCheck.get(url);
          if (status !== 200 || problems.length) failures.push(`${url} answered ${status}${problems.length ? ` (${problems.join("; ")})` : ""}`);
        }
        if (failures.length) throw new Error(`the shop check failed: ${failures.join("; ")}`);
        await registry.updateShop(shop.shopId, { status: "live", liveAt: now().toISOString() });
      },
    },
    {
      number: 16,
      name: "Turn on the test shop's stockroom link",
      // Every other shop: nothing to do (the owner turns the link on in the admin when they want it).
      async check({ shop }) {
        if (!needsStockroomLink(shop)) return true;
        const startDay = (await inventoryLink.state(shop.shopId))?.startDay;
        return typeof startDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDay);
      },
      async act({ shop }) {
        if (!needsStockroomLink(shop)) return;
        // The shop refuses to start sending sales before its own check reaches the stockroom.
        const { ok, problem } = await inventoryLink.check(shop.shopId);
        if (!ok) throw new Error(`the shop can't reach its stockroom${problem ? ` (${problem})` : ""}; a person checks the link`);
        // Sales count from today (Toronto), so the test purchases after setup are sent and earlier days are not.
        await inventoryLink.startSales(shop.shopId, { startDay: torontoDay(now()) });
      },
    },
  ];
}

// Whether one test-catalogue link is in the shop's saved links: "linked", "free" (nothing there yet) or, when the shop
// book is linked elsewhere, the problem in words. Another link is the press's or a person's choice, never overwritten.
function linkProblem(saved, { shopBookId, stockroomBookId }) {
  const entry = saved?.[shopBookId];
  if (!entry || !Object.values(entry).some(Boolean)) return "free";
  if (entry._ === stockroomBookId) return "linked";
  return `the shop book ${shopBookId} is already linked to another stockroom book; a person decides which link stays`;
}

// The stockroom alone takes no payments, so the payments step has nothing to do for it.
function shopOnly(step) {
  return {
    ...step,
    check: async (ctx) => !appsOf(ctx.shop).includes("shop") || step.check(ctx),
    act: async (ctx) => (appsOf(ctx.shop).includes("shop") ? step.act(ctx) : undefined),
  };
}

/** All sixteen steps, in order. One `config` holds the platform settings both halves read (see each for its keys). */
export function shopSteps({ config, ...clients }) {
  return [...firstSteps({ ...clients, config }), ...laterSteps({ ...clients, config })];
}
