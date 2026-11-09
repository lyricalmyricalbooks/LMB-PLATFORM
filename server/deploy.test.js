import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPTIONAL_SECRETS, SECRETS, deploy, deployPlan, envYaml, readEnvFile, serviceEnv } from "./deploy.js";

const VERSION = "0123456789ab";
const SETTINGS = 'PLATFORM_ADMIN_EMAILS: "admin@example.com,second@example.com"\nHEALTH_ALERT_TO: alerts@example.com\n# a note\nPLATFORM_URL: \'https://platform.example\'\n';
const files = { api: "/tmp/api.yaml", jobs: "/tmp/jobs.yaml" };
const writeEnv = () => files;

test("the settings file is plain NAME: value lines, and never holds a key", () => {
  assert.deepEqual(readEnvFile(SETTINGS), { PLATFORM_ADMIN_EMAILS: "admin@example.com,second@example.com", HEALTH_ALERT_TO: "alerts@example.com", PLATFORM_URL: "https://platform.example" });
  assert.throws(() => readEnvFile("RESEND_API_KEY: re_x"), /Secret Manager/);
  assert.throws(() => readEnvFile("STRIPE_BILLING_WEBHOOK_SECRET: whsec"), /Secret Manager/);
  assert.throws(() => readEnvFile("BILLING_MODE: live"), /the deploy sets it/);
  assert.throws(() => readEnvFile("PLATFORM_ROLE: api"), /the deploy sets it/);
  assert.throws(() => readEnvFile("not a setting"), /line 1/);
  // The example the README points at reads cleanly.
  const example = readEnvFile(readFileSync(new URL("./env.example.yaml", import.meta.url), "utf8"));
  assert.ok(example.PLATFORM_ADMIN_EMAILS && example.HEALTH_ALERT_TO && example.PLATFORM_URL);
  assert.equal(envYaml({ A: "x,y", B: 'say "hi"' }), 'A: "x,y"\nB: "say \\"hi\\""\n');
});

test("each service is told its role and test mode, and gets only the keys it needs", () => {
  assert.deepEqual(serviceEnv("jobs", { HEALTH_ALERT_TO: "a@example.com" }, "lmb-platform-prod"), { HEALTH_ALERT_TO: "a@example.com", PLATFORM_ROLE: "jobs", PLATFORM_PROJECT: "lmb-platform-prod", BILLING_MODE: "test" });
  const { image, steps } = deployPlan({ version: VERSION, envFiles: files });
  assert.equal(image, `northamerica-northeast1-docker.pkg.dev/lmb-platform-prod/platform/server:${VERSION}`);
  const api = steps.find((s) => s.args.includes("platform-api") && s.args[1] === "deploy");
  const jobs = steps.find((s) => s.args.includes("platform-jobs") && s.args[1] === "deploy");
  assert.ok(api.args.includes("--allow-unauthenticated"));
  assert.ok(jobs.args.includes("--no-allow-unauthenticated"), "the jobs server is private");
  assert.ok(api.args.includes(`--image=${image}`) && jobs.args.includes(`--image=${image}`), "one image, two services");
  assert.ok(api.args.includes("--region=northamerica-northeast1"));
  assert.ok(api.args.includes("--service-account=platform-api@lmb-platform-prod.iam.gserviceaccount.com"));
  assert.ok(jobs.args.includes("--timeout=1800"));
  const secretsOf = (step) => step.args.find((a) => a.startsWith("--set-secrets=")).slice("--set-secrets=".length).split(",");
  assert.deepEqual(secretsOf(api), SECRETS.map((s) => `${s.env}=${s.secret}:latest`));
  assert.ok(!secretsOf(jobs).some((s) => s.startsWith("STRIPE_BILLING_WEBHOOK_SECRET")), "the jobs server takes no events");
  assert.ok(!steps.some((s) => s.args.includes("secrets") && s.args.includes("create")), "a secret's value is never made here");
  const invoker = steps.find((s) => s.args.includes("add-iam-policy-binding") && s.args.includes("platform-jobs"));
  assert.ok(invoker.args.includes("--member=serviceAccount:platform-scheduler@lmb-platform-prod.iam.gserviceaccount.com"));
  assert.ok(invoker.args.includes("--role=roles/run.invoker"));
  const hosting = steps.at(-1);
  assert.equal(hosting.cwd, "site/out");
  assert.deepEqual(steps.at(-2).args, ["site/build.js", "--api"]);
  assert.deepEqual(hosting.args.slice(-5), ["deploy", "--only", "hosting", "--project", "lmb-platform-prod"]);
  assert.throws(() => deployPlan({ version: "main", envFiles: files }), /commit id/);
});

test("without --apply it prints the plan and runs nothing", async () => {
  const lines = [];
  const ran = [];
  const result = await deploy({ version: VERSION, settingsText: SETTINGS, run: async (...call) => { ran.push(call); return { ok: true, output: "" }; }, print: (l) => lines.push(l), writeEnv });
  assert.equal(result.ok, true);
  assert.deepEqual(ran, []);
  const text = lines.join("\n");
  assert.match(text, /gcloud run deploy platform-api /);
  assert.match(text, /gcloud builds submit .*--config=server\/cloudbuild\.yaml --ignore-file=server\/\.gcloudignore --suppress-logs/);
  assert.match(text, /\(cd site\/out && npx --yes firebase-tools@15\.32\.1 deploy --only hosting --project lmb-platform-prod\)/);
  assert.match(lines.at(-1), /Nothing was changed/);
  await assert.rejects(deploy({ version: VERSION, settingsText: "HEALTH_ALERT_TO: a@example.com\nPLATFORM_URL: https://platform.example", writeEnv, print: () => {} }), /needs PLATFORM_ADMIN_EMAILS/);
});

test("with --apply it runs each step in order, skips what is there already, and stops at the first failure", async () => {
  const ran = [];
  const run = async (command, args, options) => {
    ran.push([command, ...args].join(" "));
    if (args[0] === "iam" && args[2] === "describe") return { ok: args[3].startsWith("platform-api@"), output: "" };
    if (args[0] === "artifacts" && args[2] === "describe") return { ok: true, output: "" };
    if (args[0] === "run" && args[1] === "deploy" && args[2] === "platform-jobs") return { ok: false, output: "ERROR: permission denied" };
    void options;
    return { ok: true, output: "" };
  };
  const lines = [];
  const result = await deploy({ version: VERSION, settingsText: SETTINGS, apply: true, run, print: (l) => lines.push(l), writeEnv });
  assert.equal(result.ok, false);
  assert.match(result.failed, /jobs server/);
  assert.ok(!ran.some((line) => line.startsWith("gcloud iam service-accounts create platform-api ")), "an account that is there is left alone");
  assert.ok(ran.some((line) => line.startsWith("gcloud iam service-accounts create platform-jobs ")));
  assert.ok(!ran.some((line) => line.startsWith("gcloud artifacts repositories create")));
  assert.ok(!ran.some((line) => line.includes("add-iam-policy-binding platform-jobs")), "nothing after the failure ran");
  assert.ok(!ran.some((line) => line.startsWith("npx")));
  assert.match(lines.join("\n"), /permission denied/);
});

test("the server goes live before Stripe and email are connected: a missing optional key is left out", async () => {
  assert.deepEqual([...OPTIONAL_SECRETS].sort(), ["resend-api-key", "stripe-billing-webhook-secret", "stripe-connect-webhook-secret-test", "stripe-platform-test-key"]);
  const ran = [];
  const run = async (command, args) => {
    ran.push([command, ...args].join(" "));
    if (args[0] === "secrets" && args[1] === "describe") return { ok: !OPTIONAL_SECRETS.has(args[2]), output: "" };
    return { ok: true, output: "" };
  };
  const lines = [];
  const result = await deploy({ version: VERSION, settingsText: SETTINGS, apply: true, run, print: (l) => lines.push(l), writeEnv });
  assert.equal(result.ok, true);
  const deployed = ran.filter((line) => line.startsWith("gcloud run deploy "));
  assert.equal(deployed.length, 2);
  for (const line of deployed) {
    assert.match(line, /--set-secrets=TRIAL_TIPS_SECRET=trial-tips-secret:latest,CHECKUP_SECRET=checkup-secret:latest/);
    assert.doesNotMatch(line, /RESEND|STRIPE/);
  }
  assert.match(lines.join("\n"), /Not connected yet \(no secret\): resend-api-key/);
  // The two link phrases are still checked, so a server never starts without them.
  assert.ok(ran.includes("gcloud secrets describe trial-tips-secret --project=lmb-platform-prod"));
  const required = deployPlan({ version: VERSION, envFiles: files }).steps.filter((s) => s.args[0] === "secrets").map((s) => s.args[2]);
  assert.deepEqual(required, ["trial-tips-secret", "checkup-secret"]);
});
