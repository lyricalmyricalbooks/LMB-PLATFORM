// Builds one shop's Firebase deploy files from the templates in this folder (plan 1.14b).
//
// firestore.rules and storage.rules never name a real owner: they hold OWNER_PLACEHOLDER where the owner's sign-in
// address goes. Deployed as they are, the placeholder matches nobody's verified address, so they fail closed (only a
// Team "owner" role gets in). This step writes the shop's own copies, with the owner address filled in, to `.deploy/`,
// and a `firebase.deploy.json` that points at them and at the shop's own Hosting site. Deploy with
//   node scripts/deployConfig.mjs --project <project id>
//   npx firebase-tools deploy --config firebase.deploy.json --project <project id> --only …
// The owner address is the one the Cloud Functions use (functions/shopConfig.js SHOP_OWNER_EMAIL): taken from the
// SHOP_OWNER_EMAIL environment variable, else from functions/.env.<project id>. Without a valid one nothing is written
// and the step fails, so a deploy never goes out with rules that lock the owner out by accident.
// Generated files are git-ignored. firebase.json stays the template (the test shop's values), which the emulators,
// scripts/hosting-smoke.mjs and scripts/hostingConfig.test.ts read.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OWNER_PLACEHOLDER = "__SHOP_OWNER_EMAIL__";
export const OUT_DIR = ".deploy";
export const CONFIG_FILE = "firebase.deploy.json";
const RULE_FILES = ["firestore.rules", "storage.rules"];

const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
// Stricter than an email address needs to be: the value is written inside a quoted rules string, so quotes,
// backslashes, spaces and braces are refused outright rather than escaped.
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** The owner address in the form the rules compare against (lower case), or "" when it isn't a safe, valid one. */
export function ownerAddress(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v.length <= 254 && EMAIL.test(v) ? v : "";
}

/** SHOP_OWNER_EMAIL from a functions/.env.<project> file's text (KEY=value lines, optional quotes), or "". */
export function ownerFromEnvFile(text) {
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*SHOP_OWNER_EMAIL\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^(["'])(.*)\1$/, "$2");
  }
  return "";
}

/** One rules file with the owner address filled in. Throws when the address or the template is wrong. */
export function fillRules(template, owner) {
  const address = ownerAddress(owner);
  if (!address) throw new Error("The shop owner's address is missing or not a plain email address.");
  if (!template.includes(`"${OWNER_PLACEHOLDER}"`)) throw new Error(`The rules template doesn't name the owner as "${OWNER_PLACEHOLDER}".`);
  const filled = template.replaceAll(OWNER_PLACEHOLDER, address);
  if (filled.includes(OWNER_PLACEHOLDER)) throw new Error("The owner placeholder is still in the rules.");
  return filled;
}

/** firebase.json for one project: its own Hosting site and the filled-in rules. Everything else as the template. */
export function buildFirebaseConfig(template, projectId) {
  if (!PROJECT.test(projectId || "")) throw new Error(`"${projectId}" isn't a Firebase project id.`);
  const config = JSON.parse(JSON.stringify(template));
  if (!config.firestore || !config.storage || !config.hosting) throw new Error("firebase.json needs firestore, storage and hosting.");
  config.firestore.rules = `${OUT_DIR}/firestore.rules`;
  config.storage.rules = `${OUT_DIR}/storage.rules`;
  // A project's default Hosting site has the project's id as its name.
  config.hosting.site = projectId;
  return config;
}

/** Writes .deploy/*.rules and firebase.deploy.json under `root`. Returns the paths written. */
export function writeDeployFiles({ root, projectId, owner }) {
  const config = buildFirebaseConfig(JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")), projectId);
  const rules = RULE_FILES.map(file => [file, fillRules(readFileSync(join(root, file), "utf8"), owner)]);
  mkdirSync(join(root, OUT_DIR), { recursive: true });
  const written = [];
  for (const [file, text] of rules) {
    writeFileSync(join(root, OUT_DIR, file), text);
    written.push(join(OUT_DIR, file));
  }
  writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
  written.push(CONFIG_FILE);
  return written;
}

function main(argv, env) {
  const at = argv.indexOf("--project");
  const projectId = at >= 0 ? argv[at + 1] : "";
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const envFile = join(root, "functions", `.env.${projectId}`);
  const owner = env.SHOP_OWNER_EMAIL || (existsSync(envFile) ? ownerFromEnvFile(readFileSync(envFile, "utf8")) : "");
  if (!ownerAddress(owner)) {
    console.error(`No shop owner address: set SHOP_OWNER_EMAIL, or put SHOP_OWNER_EMAIL=… in functions/.env.${projectId || "<project id>"}. Nothing was written.`);
    return 1;
  }
  try {
    const written = writeDeployFiles({ root, projectId, owner });
    console.log(`Deploy files for ${projectId}: ${written.join(", ")}`);
    return 0;
  } catch (err) {
    console.error(`${err.message} Nothing usable was written; don't deploy.`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2), process.env));
