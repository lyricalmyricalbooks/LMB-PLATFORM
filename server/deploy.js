// Puts the hosted server live in the platform project: the same image as two Cloud Run services, then the Hosting
// rewrite that sends the platform's /api addresses to it. Prints every command first; only --apply runs them, in order,
// stopping at the first that fails. Every step is safe to run again (an account or image store already there is left
// as it is; a deploy of the same image changes nothing a press sees).
//
//   node server/deploy.js             # prints the plan and the settings each service gets; runs nothing
//   node server/deploy.js --apply     # does it (needs gcloud signed in as a project owner, and server/env.yaml)
//
// Settings that aren't secret come from server/env.yaml (copy server/env.example.yaml; it is never committed). Keys come
// from Secret Manager (SECRETS below), which Cloud Run reads into each service's environment; this script never sees
// one. Stripe stays in test mode: the services get BILLING_MODE=test, and server/world.js refuses a live key.
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { API_SERVICE, JOBS_SERVICE, REGION, schedulerAccount } from "./schedules.js";
import { DEFAULT_PROJECT } from "./world.js";
import { EMAIL_SECRETS } from "../services/email/index.js";
import { PAYMENTS_SECRETS } from "../services/payments/index.js";
import { BILLING_SECRETS } from "../services/billing/index.js";

/** The Firebase command line, pinned like the waitlist's README. */
export const FIREBASE_TOOLS = "firebase-tools@15.32.1";
export const IMAGE_STORE = "platform";
export const accountOf = (name, project) => `${name}@${project}.iam.gserviceaccount.com`;

/**
 * Each key the services read, the Secret Manager secret it comes from, and which service needs it. The email and Stripe
 * keys' names come from their own services, the only places that may name them.
 */
export const SECRETS = Object.freeze([
  ...EMAIL_SECRETS,
  ...PAYMENTS_SECRETS,
  ...BILLING_SECRETS,
  { env: "TRIAL_TIPS_SECRET", secret: "trial-tips-secret", api: true, jobs: true },
  { env: "CHECKUP_SECRET", secret: "checkup-secret", api: true, jobs: true },
]);

/** The services' own accounts and the roles each holds in the platform project. */
export const ACCOUNTS = Object.freeze([
  { name: API_SERVICE, words: "The platform's web door", roles: ["roles/datastore.user", "roles/firebaseauth.admin", "roles/secretmanager.secretAccessor"] },
  { name: JOBS_SERVICE, words: "The platform's scheduled jobs", roles: ["roles/datastore.user", "roles/secretmanager.secretAccessor"] },
  { name: "platform-scheduler", words: "Calls the platform's scheduled jobs", roles: [] },
]);

/** Set by this script for each service; server/env.yaml may not set them. */
const SET_HERE = new Set(["PLATFORM_ROLE", "PLATFORM_PROJECT", "BILLING_MODE", "PORT"]);
const LOOKS_SECRET = /(KEY|SECRET|TOKEN|PASSWORD)/;

/** Reads server/env.yaml: one `NAME: value` a line (quotes optional), # for notes. Refuses anything that looks secret. */
export function readEnvFile(text) {
  const env = {};
  for (const [i, raw] of String(text).split("\n").entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([A-Z][A-Z0-9_]*):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`server/env.yaml line ${i + 1} isn't NAME: value`);
    const [, name, rest] = m;
    if (SET_HERE.has(name)) throw new Error(`server/env.yaml can't set ${name}: the deploy sets it`);
    if (LOOKS_SECRET.test(name)) throw new Error(`${name} looks like a key: put it in Secret Manager, not server/env.yaml`);
    let value = rest.trim();
    if (/^".*"$/.test(value)) value = JSON.parse(value);
    else if (/^'.*'$/.test(value)) value = value.slice(1, -1);
    env[name] = value;
  }
  return env;
}

/** One service's environment file for gcloud (--env-vars-file): YAML with every value quoted. */
export const envYaml = (env) => `${Object.entries(env).map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`).join("\n")}\n`;

export function serviceEnv(role, settings, project) {
  return { ...settings, PLATFORM_ROLE: role, PLATFORM_PROJECT: project, BILLING_MODE: "test" };
}

const secretsFor = (role) => SECRETS.filter((s) => s[role]).map((s) => `${s.env}=${s.secret}:latest`).join(",");

/**
 * The plan: [{ title, command, args, cwd?, unless? }]. `unless` is a read-only command that, when it works, means the
 * step is already done (an account or image store that is there).
 */
export function deployPlan({ project = DEFAULT_PROJECT, region = REGION, version, envFiles }) {
  if (!/^[0-9a-f]{7,40}$/.test(version ?? "")) throw new Error("the version must be a commit id");
  const image = `${region}-docker.pkg.dev/${project}/${IMAGE_STORE}/server:${version}`;
  const at = [`--project=${project}`];
  const steps = [];
  for (const account of ACCOUNTS) {
    steps.push({
      title: `Make the ${account.name} account (once)`,
      command: "gcloud", args: ["iam", "service-accounts", "create", account.name, `--display-name=${account.words}`, ...at],
      unless: { command: "gcloud", args: ["iam", "service-accounts", "describe", accountOf(account.name, project), ...at] },
    });
    for (const role of account.roles) {
      steps.push({ title: `Give ${account.name} ${role}`, command: "gcloud", args: ["projects", "add-iam-policy-binding", project, `--member=serviceAccount:${accountOf(account.name, project)}`, `--role=${role}`, "--condition=None", "--quiet"] });
    }
  }
  for (const { secret } of SECRETS) {
    // Never made here: a secret's value is typed by a person (README.md). This only checks it is there.
    steps.push({ title: `Check the ${secret} secret is there`, command: "gcloud", args: ["secrets", "describe", secret, ...at] });
  }
  steps.push({
    title: "Make the image store (once)",
    command: "gcloud", args: ["artifacts", "repositories", "create", IMAGE_STORE, "--repository-format=docker", `--location=${region}`, ...at],
    unless: { command: "gcloud", args: ["artifacts", "repositories", "describe", IMAGE_STORE, `--location=${region}`, ...at] },
  });
  steps.push({ title: "Build the image", command: "gcloud", args: ["builds", "submit", ...at, `--region=${region}`, "--config=server/cloudbuild.yaml", "--ignore-file=server/.gcloudignore", `--substitutions=_IMAGE=${image}`, "."] });
  const common = (name) => ["run", "deploy", name, ...at, `--region=${region}`, `--image=${image}`, `--service-account=${accountOf(name, project)}`, "--cpu=1", "--memory=512Mi", "--min-instances=0"];
  steps.push({
    title: "Put the web door live (platform-api)",
    command: "gcloud",
    args: [...common(API_SERVICE), "--allow-unauthenticated", "--max-instances=10", "--concurrency=40", "--timeout=60", `--env-vars-file=${envFiles.api}`, `--set-secrets=${secretsFor("api")}`],
  });
  steps.push({
    title: "Put the jobs server live (platform-jobs, private)",
    command: "gcloud",
    args: [...common(JOBS_SERVICE), "--no-allow-unauthenticated", "--max-instances=3", "--concurrency=4", "--timeout=1800", `--env-vars-file=${envFiles.jobs}`, `--set-secrets=${secretsFor("jobs")}`],
  });
  steps.push({
    title: "Let only the scheduler call the jobs server",
    command: "gcloud", args: ["run", "services", "add-iam-policy-binding", JOBS_SERVICE, ...at, `--region=${region}`, `--member=serviceAccount:${schedulerAccount(project)}`, "--role=roles/run.invoker"],
  });
  // The whole platform site (site/build.js), now with its /api addresses sent to the web door.
  steps.push({ title: "Build the platform's pages with the server's addresses on", command: "node", args: ["site/build.js", "--api"] });
  steps.push({ title: "Send the platform's /api addresses to the web door (Hosting)", command: "npx", args: ["--yes", FIREBASE_TOOLS, "deploy", "--only", "hosting", "--project", project], cwd: "site/out" });
  return { image, steps };
}

const shellLine = ({ command, args, cwd }) => `${cwd ? `(cd ${cwd} && ` : ""}${[command, ...args].map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`)).join(" ")}${cwd ? ")" : ""}`;

/** `run(command, args, { cwd })` -> { ok, output }. The real one runs the program and never throws. */
export const commandRunner = () => async (command, args, { cwd } = {}) => {
  try {
    const { stdout, stderr } = await promisify(execFile)(command, args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, output: `${stdout}${stderr}` };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}${error.message}` };
  }
};

/**
 * Prints the plan, or with `apply` runs it. `settingsText` is server/env.yaml's text. Returns { ok, image, done }.
 */
export async function deploy({ project = DEFAULT_PROJECT, region = REGION, version, settingsText, apply = false, run = commandRunner(), print = console.log, writeEnv }) {
  const settings = readEnvFile(settingsText ?? "");
  for (const needed of ["PLATFORM_ADMIN_EMAILS", "HEALTH_ALERT_TO", "PLATFORM_URL"]) {
    if (!settings[needed]) throw new Error(`server/env.yaml needs ${needed} (see server/env.example.yaml)`);
  }
  const envs = { api: serviceEnv("api", settings, project), jobs: serviceEnv("jobs", settings, project) };
  const envFiles = writeEnv ? writeEnv(envs) : (() => {
    const dir = mkdtempSync(join(tmpdir(), "platform-env-"));
    const files = { api: join(dir, "api.yaml"), jobs: join(dir, "jobs.yaml") };
    writeFileSync(files.api, envYaml(envs.api));
    writeFileSync(files.jobs, envYaml(envs.jobs));
    return files;
  })();
  const { image, steps } = deployPlan({ project, region, version, envFiles });
  print(`${apply ? "Putting" : "Plan: put"} the platform's server live in ${project} (${region}), image ${image}`);
  for (const role of ["api", "jobs"]) print(`  ${role} settings: ${Object.keys(envs[role]).sort().join(", ")}; keys from Secret Manager: ${SECRETS.filter((s) => s[role]).map((s) => s.secret).join(", ")}`);
  const done = [];
  for (const [i, step] of steps.entries()) {
    print(`${i + 1}. ${step.title}${step.unless ? " (skipped when it is there already)" : ""}`);
    print(`   ${shellLine(step)}`);
    if (!apply) continue;
    if (step.unless && (await run(step.unless.command, step.unless.args, {})).ok) {
      print("   already there");
      done.push({ title: step.title, skipped: true });
      continue;
    }
    const result = await run(step.command, step.args, { cwd: step.cwd });
    if (!result.ok) {
      print(`   This step didn't work, so nothing after it ran:\n${result.output.trim()}`);
      return { ok: false, image, done, failed: step.title };
    }
    done.push({ title: step.title });
  }
  print(apply
    ? "Done. Next: node server/setup-schedules.js --apply, then node server/smoke.js --jobs-url <the platform-jobs address>."
    : "Nothing was changed. Run again with --apply to do it.");
  return { ok: true, image, done };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes("--apply");
  const run = commandRunner();
  try {
    let file = new URL("./env.yaml", import.meta.url);
    if (!existsSync(file)) {
      if (apply) throw new Error("Copy server/env.example.yaml to server/env.yaml and fill it in first.");
      console.log("(No server/env.yaml yet: showing the plan with server/env.example.yaml's made-up settings.)");
      file = new URL("./env.example.yaml", import.meta.url);
    }
    const head = await run("git", ["rev-parse", "--short=12", "HEAD"]);
    if (!head.ok) throw new Error("Run this from the platform's repository (git couldn't say which commit this is).");
    const result = await deploy({ project: process.env.PLATFORM_PROJECT || DEFAULT_PROJECT, version: head.output.trim(), settingsText: readFileSync(file, "utf8"), apply, run });
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
