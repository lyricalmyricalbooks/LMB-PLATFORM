// Readies a shared project for shops (docs/shared-system.md, phase 8): what every shop used to get in its own project,
// done once for the project every shop now shares. Each step only looks in `check` and only changes in `act`, as the
// shop maker's steps do, and `runProjectSteps` runs them in order: a dry run only looks, a real run acts where a step
// isn't done and checks again. Safe to run twice; nothing here deletes anything.
//
//   1–3  Firebase, the services, the databases and buckets (steps.js projectSteps, with the stockroom's pieces)
//   4    The web app called "Shop": every shop's profile names its settings (setup/real.js sharedMakerConfig)
//   5    Sign-in lists allowed: Identity Platform, each shop its own list (setup/shopTenant.js), and Google sign-in on
//        for the project, which every list copies. Google sign-in needs an OAuth client, so a person turns it on once
//        in the Firebase console; the step says so in plain words and the next run goes on.
//   6    The shared server's key (setup/serviceKey.js sharedServiceKeyHash): one PLATFORM_SERVICE_KEY for every shop
//   7    The nightly copy's permission (Google's Firestore service agent may write exports to the project's bucket)
//   8    Photos readable from the admin (bucket CORS, GET/HEAD only), so "Download your shop" can copy a shop's pictures
//   9    A one-day cleanup rule on the server code's old builds (setup/upkeep.js), once the first deploy made them
//
// `google` is clients/google.js (fakes.js has the shape). The project is passed to the steps as `{ shopId, plan }`, the
// shape projectSteps reads: a shared project holds both apps for every shop.
import { REGION, WEB_APP_NAME, projectSteps } from "./steps.js";
import { SERVICE_KEY_SECRET, sharedServiceKeyHash } from "./serviceKey.js";

const message = (error) => (error instanceof Error ? error.message : String(error));

/** Is this project's sign-in ready for shop lists: Identity Platform, lists allowed, Google sign-in on? */
export async function signInReady(google, projectId) {
  const config = await google.authConfig.get(projectId);
  if (config?.subtype !== "IDENTITY_PLATFORM" || config.multiTenant?.allowTenants !== true) return false;
  const googleSignIn = await google.authConfig.googleSignIn(projectId);
  return Boolean(googleSignIn?.enabled && googleSignIn.clientId && googleSignIn.clientSecret);
}

export function sharedProjectSteps({ google, region = REGION }) {
  const [firebase, services, stores] = projectSteps({ google, region });
  return [
    { ...firebase, number: 1 },
    { ...services, number: 2 },
    { ...stores, number: 3, name: `Create the databases and buckets in ${region}` },
    {
      number: 4,
      name: `Make the web app called "${WEB_APP_NAME}"`,
      check: async ({ shop }) => (await google.firebase.listWebApps(shop.shopId)).some((app) => app.displayName === WEB_APP_NAME),
      act: ({ shop }) => google.firebase.createWebApp(shop.shopId, WEB_APP_NAME),
    },
    {
      number: 5,
      name: "Let each shop have its own sign-in list",
      check: ({ shop }) => signInReady(google, shop.shopId),
      async act({ shop }) {
        const config = await google.authConfig.get(shop.shopId);
        if (config?.subtype !== "IDENTITY_PLATFORM") await google.authConfig.upgrade(shop.shopId);
        if (config?.multiTenant?.allowTenants !== true) await google.authConfig.allowTenants(shop.shopId);
        const googleSignIn = await google.authConfig.googleSignIn(shop.shopId);
        if (!googleSignIn?.enabled || !googleSignIn.clientId || !googleSignIn.clientSecret) {
          throw new Error(`Google sign-in isn't on in ${shop.shopId} yet: a person turns it on once in the Firebase console (Authentication, Sign-in method, Google), then this runs again`);
        }
      },
    },
    {
      number: 6,
      name: "Make the shared server's key",
      check: async ({ shop }) => {
        const key = await google.secrets.latest(shop.shopId, SERVICE_KEY_SECRET);
        return typeof key === "string" && key.length >= 32;
      },
      act: async ({ shop }) => {
        await sharedServiceKeyHash(google, shop.shopId);
      },
    },
    {
      number: 7,
      name: "Let Google write the nightly copy",
      check: ({ shop }) => google.backups.hasPermission(shop.shopId),
      act: ({ shop }) => google.backups.grantPermission(shop.shopId),
    },
    {
      number: 8,
      name: "Let the admin copy a shop's photos for its download",
      check: ({ shop }) => google.photoAccess.has(shop.shopId),
      act: ({ shop }) => google.photoAccess.set(shop.shopId),
    },
    {
      number: 9,
      name: "Keep only a day of the server's old builds",
      // No build repository yet (before the first deploy) counts as done: the next run after it sets the rule.
      check: async ({ shop }) => (await google.buildCleanup.has(shop.shopId, region)) !== false,
      act: ({ shop }) => google.buildCleanup.set(shop.shopId, region),
    },
  ];
}

/**
 * Runs the steps on one project. Returns `{ ok, ready?, ran: [{ step, name, status }], failedStep?, error? }` (`ready`:
 * every step is done, false after a dry run that found one to run); status is
 * "already-done", "done", "would-run" or "failed". A dry run (`apply` false) changes nothing: after the first step it
 * would run, the steps after it aren't looked at (they may need it), and the run says so.
 */
export async function runProjectSteps({ projectId, steps, apply = false, print = () => {} }) {
  const ctx = { shop: { shopId: projectId, plan: "both" } };
  const ran = [];
  let wouldRun = false;
  for (const step of steps) {
    const label = `${projectId} ${step.number}. ${step.name}`;
    if (wouldRun) {
      print(`${label}: would run after the steps before it`);
      ran.push({ step: step.number, name: step.name, status: "would-run" });
      continue;
    }
    try {
      if (await step.check(ctx)) {
        print(`${label}: already done`);
        ran.push({ step: step.number, name: step.name, status: "already-done" });
        continue;
      }
      if (!apply) {
        wouldRun = true;
        print(`${label}: would run`);
        ran.push({ step: step.number, name: step.name, status: "would-run" });
        continue;
      }
      await step.act(ctx);
      if (!(await step.check(ctx))) throw new Error("it ran, but its check still finds it not done");
      print(`${label}: done`);
      ran.push({ step: step.number, name: step.name, status: "done" });
    } catch (error) {
      print(`${label}: stopped (${message(error)})`);
      ran.push({ step: step.number, name: step.name, status: "failed" });
      return { ok: false, ran, failedStep: step.number, error: message(error) };
    }
  }
  return { ok: true, ready: !wouldRun, ran };
}
