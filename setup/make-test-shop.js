// Makes the platform's own test shop for real (plan 9.10, owner 10 November 2026): the shop maker's steps
// (later-steps.js shopSteps) with the real clients (real.js), run against the Firebase project `lmb-test-shop`, which
// the owner made once by hand. GitHub runs it (.github/workflows/test-shop.yml), signed in as the deploy account.
//
//   TEST_SHOP_OWNER_EMAIL=<owner> node setup/make-test-shop.js            # the plan: prints each step, changes nothing
//   TEST_SHOP_OWNER_EMAIL=<owner> node setup/make-test-shop.js --apply    # does it (safe to run again; it resumes)
//
// Run from the repository's root after building the apps there: the deploys read apps/shop/dist,
// apps/shop/functions (its packages installed) and apps/stockroom/dist (clients/deploy.js).
//
// It only ever touches `lmb-test-shop`: the shop is the test shop (`testShop: true`, test mode), and its Google project
// is the one the owner made, whatever folder and billing account it sits in. Every other shop waits for the real shop
// maker and the shops folder (code plan 15.5).
//
// Not connected yet, so done later without redoing the rest:
// - step 13 (payments) waits for the platform payment service;
// - step 14 (the owner's welcome email) waits for the platform email service.
// Both are looked at again on every run, so they happen on the first run after their key is there.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { runSteps } from "./runner.js";
import { shopSteps } from "./later-steps.js";
import { realSetupClients } from "./real.js";
import { TEST_STARTER_CONTENT } from "./test-shop.js";

export const TEST_SHOP_ID = "lmb-test-shop";
export const PLATFORM_URL = "https://lmb-platform-prod.web.app";
// The release the test shop is first made with. Later updates go out with the release runner (services/release-runner).
export const FIRST_RELEASE = "1.0.0";
// Steps whose part may only be connected after the first run.
export const LATER_STEPS = Object.freeze({ 13: "payments (the Stripe test key)", 14: "the owner's welcome email (the email key)" });

/** The test shop's registry row as the shop maker gets it. */
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
  };
}

/**
 * The steps, with any step whose part isn't connected yet standing in as "waiting" (checked as done, so the run goes
 * on; `again` makes the next run look at it anew). `connected` is { 13: bool, 14: bool }.
 */
export function testShopSteps({ clients, config, connected }) {
  return shopSteps({ ...clients, config }).map((step) => {
    if (!(step.number in LATER_STEPS) || connected[step.number]) return step;
    return {
      number: step.number,
      name: `${step.name} (waits for ${LATER_STEPS[step.number]})`,
      check: async () => true,
      act: async () => {},
    };
  });
}

/** The shop maker's config for the test shop: the folder and billing account its project already has. */
export async function testShopConfig({ google, version = FIRST_RELEASE }) {
  const project = await google.projects.get(TEST_SHOP_ID);
  if (!project) throw new Error(`The Google project ${TEST_SHOP_ID} doesn't exist. Make it once in the Firebase console (site/README.md).`);
  const billing = await google.billing.get(TEST_SHOP_ID);
  if (!billing?.billingEnabled) {
    throw new Error(`${TEST_SHOP_ID} has no billing account. Link one: https://console.cloud.google.com/billing/linkedaccount?project=${TEST_SHOP_ID}`);
  }
  return {
    folder: project.parent,
    billingAccount: billing.billingAccountName,
    senderEmail: "notifications@colophon.example",
    paymentsServiceUrl: `${PLATFORM_URL}/api/payments`,
    platformEmailUrl: `${PLATFORM_URL}/api/email/shop`,
    stripePublishableKeys: { live: "", test: "" },
    release: { version, starterContent: TEST_STARTER_CONTENT },
  };
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

const runCommand = async (command, args, { cwd, env } = {}) => {
  const { stdout, stderr } = await exec(command, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  return `${stdout}${stderr}`;
};

export async function makeTestShop({ apply, ownerEmail, serviceAccount, root = process.cwd(), print = console.log, env = process.env }) {
  const shop = testShop(ownerEmail);
  const clients = realSetupClients({
    fetch,
    token: gcloudToken(),
    run: runCommand,
    buildDir: () => root,
    serviceAccount,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  // Payments and email join once their services are handed to the shop maker here (a later change).
  const connected = { 13: Boolean(clients.providers.stripe), 14: Boolean(clients.email) };
  const config = await testShopConfig({ google: clients.google, version: env.TEST_SHOP_RELEASE || FIRST_RELEASE });
  for (const [number, words] of Object.entries(LATER_STEPS)) if (!connected[number]) print(`Step ${number} waits for ${words}.`);
  return runSteps({
    shop,
    steps: testShopSteps({ clients, config, connected }),
    registry: clients.registry,
    auditLog: clients.auditLog,
    dryRun: !apply,
    print,
    again: Object.keys(LATER_STEPS).map(Number).filter((n) => connected[n]),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await makeTestShop({
      apply: process.argv.includes("--apply"),
      ownerEmail: process.env.TEST_SHOP_OWNER_EMAIL,
      serviceAccount: process.env.PLATFORM_SERVICE_ACCOUNT,
    });
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
