// Makes the platform's own test shop for real, in the shared system (docs/shared-system.md, phase 8): the test shop is
// one folder in the shared test project `lmb-test-shop`, which every release reaches first. GitHub runs it
// (.github/workflows/test-shop.yml), signed in as the deploy account.
//
//   TEST_SHOP_OWNER_EMAIL=<owner> node setup/make-test-shop.js            # the plan: prints each step, changes nothing
//   TEST_SHOP_OWNER_EMAIL=<owner> node setup/make-test-shop.js --apply    # does it (safe to run again; it resumes)
//
// Run from the repository's root after building the apps there: the deploy reads apps/shop/dist, apps/shop/functions
// (its packages installed) and apps/stockroom/dist (clients/deploy.js).
//
// In order, each part safe to run again:
//   1. The project, readied for shops once (setup/sharedProject.js). Google sign-in for the project is turned on by a
//      person in the Firebase console; the run says so and stops there until it is.
//   2. The test shop from before the shared system (`lmb-test-shop`, the project to itself) is marked abandoned, so
//      the per-project release runner never sends its old rules over the shared ones. Its data is left where it is.
//   3. The project's first release (services/release-runner/shared.js firstSharedRelease): the rules, the shared server
//      and the one site, while it has no live shop. Every later release goes through run-shared.js, this project first.
//   4. The test shop, made by the shared shop maker's steps (setup/sharedSteps.js) as `test-press`, answering at the
//      project's own address (lmb-test-shop.web.app). Steps 7 (payments, in Stripe's test mode) and 8 (the owner's
//      welcome email) run when the workflow hands this script the platform's test keys, and wait otherwise; they are
//      looked at again on every run.
//   5. Its pages drawn from its books (setup/shopSite.js), as every release does for every shop.
//
// It only ever touches `lmb-test-shop`. The release check (release-check/run.js) then buys from the test shop in test
// mode; the staged update runs it on every release.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { runSteps } from "./runner.js";
import { sharedShopSteps } from "./sharedSteps.js";
import { PLATFORM_PROJECT, realSharedClients, sharedMakerConfig } from "./real.js";
import { runProjectSteps, sharedProjectSteps } from "./sharedProject.js";
import { REGION } from "./steps.js";
import { buildAndPublish } from "./shopSite.js";
import { deployClient } from "../clients/deploy.js";
import { firstSharedRelease, sharedProjectProfile } from "../services/release-runner/shared.js";
import { commandTail } from "../services/release-runner/run.js";
import { TEST_PROJECT, TEST_SHOP_ADDRESS, TEST_SHOP_ID } from "./testShopPlace.js";
import { firestoreClient } from "../clients/firestore.js";
import { identityClient, projectSigner } from "../clients/identity.js";
import { firestoreAuditLog, firestoreRegistry } from "../clients/registry.js";
import { firestoreAccounts, firestoreSentLog } from "../clients/stores.js";
import { createEmailService, hasEmailSending } from "../services/email/index.js";
import { createPaymentsFromEnv, hasTestKey, refuseLiveKeys, setupClient } from "../services/payments/index.js";

// The shared test project, and the test shop: a folder in it, at the project's own address.
export { TEST_PROJECT, TEST_SHOP_ADDRESS, TEST_SHOP_ID };
/** The test shop's id when it had the project to itself (before the shared system). */
export const OLD_TEST_SHOP_ID = TEST_PROJECT;
export const PLATFORM_URL = "https://lmb-platform-prod.web.app";
export const SENDER_EMAIL = "notifications@colophon.example";
// The release the project is first sent. Later updates go out with the staged update (services/release-runner).
export const FIRST_RELEASE = "1.0.0";
// Steps whose part may only be connected after the first run.
export const LATER_STEPS = Object.freeze({ 7: "payments (the platform payment service)", 8: "the owner's welcome email (the platform email service)" });

const message = (error) => (error instanceof Error ? error.message : String(error));

/** The test shop as the shop maker gets it. */
export function testShop(ownerEmail) {
  const email = String(ownerEmail ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("TEST_SHOP_OWNER_EMAIL must be the owner's Google address");
  return {
    shopId: TEST_SHOP_ID,
    pressName: "Test Press",
    ownerEmail: email,
    plan: "both",
    country: "CA",
    currency: "CAD",
    paymentProvider: "stripe",
    testMode: true,
    testShop: true,
    freeAddress: TEST_SHOP_ADDRESS,
  };
}

/**
 * The shared shop maker's steps, with any step whose part isn't connected yet standing in as "waiting" (checked as
 * done, so the run goes on; `again` makes the next run look at it anew). `connected` is { 7: bool, 8: bool }. The free
 * address is the project's own, so no web address is put on the site (no domain service).
 */
export function testShopSteps({ clients, config, connected }) {
  return sharedShopSteps({ ...clients, addresses: null, config }).map((step) => {
    if (!(step.number in LATER_STEPS) || connected[step.number]) return step;
    return { number: step.number, name: `${step.name} (waits for ${LATER_STEPS[step.number]})`, check: async () => true, act: async () => {} };
  });
}

/**
 * Marks the test shop from before the shared system abandoned (registry only; its data stays). Without this the
 * per-project release runner would still count it as the test shop and send its old rules to the shared project.
 */
export async function retireOldTestShop({ registry, apply, print = () => {}, now = () => new Date() }) {
  const row = await registry.getShop(OLD_TEST_SHOP_ID);
  if (!row || row.shared === true || row.status === "abandoned") return { changed: false };
  if (!apply) {
    print(`The old test shop ${OLD_TEST_SHOP_ID} (${row.status ?? "no status"}) would be marked abandoned; its data stays.`);
    return { changed: false, would: true };
  }
  await registry.updateShop(OLD_TEST_SHOP_ID, { status: "abandoned", abandonedAt: now().toISOString(), abandonedWhy: `moved into the shared system as ${TEST_SHOP_ID}` });
  print(`The old test shop ${OLD_TEST_SHOP_ID} is marked abandoned (it is ${TEST_SHOP_ID} in the shared system now); its data stays.`);
  return { changed: true };
}

/**
 * The whole run, with its clients passed in (tests use fakes): `google`, `registry`, `auditLog`, `stepClients` (what
 * sharedShopSteps takes), `deploy` and `builder` (the first release), `makerConfig()` (sharedMakerConfig) and
 * `publishPages(shopId)`. Returns `{ ok, stage, ready?, dryRun?, error? }`: `stage` is where it ended.
 */
export async function makeTestShopWith({
  apply, ownerEmail, version = FIRST_RELEASE, google, registry, auditLog, stepClients, deploy, builder, makerConfig, publishPages,
  allowOwnerSigning = null, connected = {}, platformUrl = PLATFORM_URL, region = REGION, print = () => {}, now = () => new Date(),
}) {
  const shop = testShop(ownerEmail);
  print(`The shared test project ${TEST_PROJECT}:`);
  const project = await runProjectSteps({ projectId: TEST_PROJECT, steps: sharedProjectSteps({ google, region }), apply, print });
  if (!project.ok) return { ok: false, stage: "project", error: project.error };
  if (!project.ready) {
    print("The rest waits until the project is ready.");
    return { ok: true, stage: "project", dryRun: true };
  }

  await retireOldTestShop({ registry, apply, print, now });

  const first = await firstSharedRelease({ version, projectId: TEST_PROJECT, registry, builder, deploy, platformUrl, region, dryRun: !apply, print, now });
  if (!first.ok) return { ok: false, stage: "first-release", error: first.error ?? "another release is running" };
  if (!apply && !first.skipped) {
    print(`The test shop ${TEST_SHOP_ID} is made once the project has its first release.`);
    return { ok: true, stage: "first-release", dryRun: true };
  }

  // Steps 6 and 10 reach the shop's server as the test owner, whose pass only the project's own Firebase admin account
  // may sign: the deploy account is let sign as it (it owns the project, so it can grant this itself).
  if (allowOwnerSigning && apply) {
    try {
      const { changed } = await allowOwnerSigning();
      print(changed ? "The deploy account may now sign the test owner's sign-in." : "The deploy account may sign the test owner's sign-in.");
    } catch (error) {
      return { ok: false, stage: "owner-signing", error: `the deploy account couldn't be let sign the test owner's sign-in (${message(error)}); give it Service Account Token Creator on ${projectSigner(TEST_PROJECT)}` };
    }
  }

  for (const [number, words] of Object.entries(LATER_STEPS)) if (!connected[number]) print(`Step ${number} waits for ${words}.`);
  print(`The test shop ${TEST_SHOP_ID}, at ${TEST_SHOP_ADDRESS}:`);
  const made = await runSteps({
    shop,
    steps: testShopSteps({ clients: stepClients, config: await makerConfig(), connected }),
    registry,
    auditLog,
    dryRun: !apply,
    print,
    again: Object.keys(LATER_STEPS).map(Number).filter((n) => connected[n]),
  });
  if (!made.ok) return { ok: false, stage: "shop", error: made.error, ...(made.waiting ? { waiting: true } : {}) };
  if (!apply) return { ok: true, stage: "shop", dryRun: true };

  // Its own pages, as every release draws them. A failure keeps the app's own pages and is said, not fatal.
  try {
    await publishPages(TEST_SHOP_ID);
    print(`${TEST_SHOP_ID}: its pages were drawn from its books.`);
  } catch (error) {
    print(`${TEST_SHOP_ID}: its pages weren't drawn (${message(error)}); the next release draws them.`);
  }
  print(`The test shop is ready at https://${TEST_SHOP_ADDRESS}. Run the release check (node release-check/run.js) for a test purchase.`);
  return { ok: true, stage: "done" };
}

const exec = promisify(execFile);

/** The deploy account's access token from gcloud, renewed every 30 minutes. */
function gcloudToken() {
  let cached = null;
  return async () => {
    if (!cached || Date.now() - cached.at > 30 * 60 * 1000) {
      const { stdout } = await exec("gcloud", ["auth", "print-access-token"]);
      cached = { value: stdout.trim(), at: Date.now() };
    }
    return cached.value;
  };
}

/** The account this run is signed in as (the workflow names it; else gcloud's). */
async function deployAccount(env) {
  const named = String(env.DEPLOY_ACCOUNT ?? "").trim();
  if (named) return named;
  const { stdout } = await exec("gcloud", ["config", "get-value", "account"]);
  return stdout.trim();
}

const runCommand = async (command, args, { cwd, env } = {}) => {
  try {
    const { stdout, stderr } = await exec(command, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
    return `${stdout}${stderr}`;
  } catch (error) {
    // execFile says only "Command failed: …": keep what the command printed, so the run log names the cause.
    const said = commandTail(`${error.stdout ?? ""}\n${error.stderr ?? ""}`);
    if (said) error.message = `${error.message}\n${said}`;
    throw error;
  }
};

/**
 * The platform's payment and email services for steps 7 and 8, built here in test mode when the workflow hands this
 * script their keys (from Secret Manager). Only the services read the keys;
 * a live Stripe key is refused. Without a key the step waits, as before.
 */
export function platformServices({ env, fetch, token, platform = firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT }) }) {
  refuseLiveKeys(env);
  const registry = firestoreRegistry(platform);
  const email = hasEmailSending(env) ? createEmailService({ env, fetch, token, registry, sentLog: firestoreSentLog(platform) }) : null;
  const payments = hasTestKey(env)
    ? setupClient(createPaymentsFromEnv({ env, fetch, registry, auditLog: firestoreAuditLog(() => platform), accounts: firestoreAccounts(platform), email }))
    : null;
  return { platform, payments, email };
}

/** The real clients for `makeTestShopWith`: Google, the platform's registry and the shared test project. */
export async function makeTestShop({ apply, ownerEmail, serviceAccount, root = process.cwd(), print = console.log, env = process.env }) {
  const token = gcloudToken();
  const region = String(env.SHOP_FUNCTIONS_REGION ?? "").trim() || REGION;
  const services = platformServices({ env, fetch, token });
  serviceAccount ||= projectSigner(TEST_PROJECT);
  const clients = realSharedClients({
    fetch, token, projectId: TEST_PROJECT, env, region, serviceAccount, registryFirestore: services.platform,
    paymentService: services.payments, emailService: services.email,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  const version = env.TEST_SHOP_RELEASE || FIRST_RELEASE;
  return makeTestShopWith({
    apply, ownerEmail, version, region, print,
    google: clients.google, registry: clients.registry, auditLog: clients.auditLog, stepClients: clients,
    // The workflow builds the apps in the checkout before this runs, so the build is the checkout itself.
    builder: { build: async () => {}, dir: () => root },
    deploy: deployClient({
      fetch, token, run: runCommand, buildDir: () => root,
      // The rules name no owner (each shop's record does), and the project's own profile is never served.
      ownerEmailOf: async () => "", profileScriptOf: async (projectId) => sharedProjectProfile(projectId, { region }),
    }),
    makerConfig: () => sharedMakerConfig({ google: clients.google, projectId: TEST_PROJECT, shopDomain: "", platformUrl: PLATFORM_URL, senderEmail: SENDER_EMAIL, version }),
    async publishPages(shopId) {
      const record = await clients.shared.records.get(shopId);
      if (!record) throw new Error("its record is missing from the shared project");
      await buildAndPublish({ shop: { id: shopId, record, tenant: record.tenant }, siteFiles: clients.google.siteFiles, projectId: TEST_PROJECT, appDir: join(root, "apps", "shop"), print });
    },
    async allowOwnerSigning() {
      const account = await deployAccount(env);
      if (!account) throw new Error("this run's own account isn't known (DEPLOY_ACCOUNT)");
      const member = `${account.endsWith(".gserviceaccount.com") ? "serviceAccount" : "user"}:${account}`;
      return identityClient({ fetch, token }).allowSigning(serviceAccount, member);
    },
    // Payments and email join when the workflow hands this script their keys (platformServices).
    connected: { 7: Boolean(clients.providers.stripe), 8: Boolean(clients.email) },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await makeTestShop({
      apply: process.argv.includes("--apply"),
      ownerEmail: process.env.TEST_SHOP_OWNER_EMAIL,
      serviceAccount: process.env.PLATFORM_SERVICE_ACCOUNT,
    });
    if (!result.ok) console.error(`Stopped at ${result.stage}: ${result.error}`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
