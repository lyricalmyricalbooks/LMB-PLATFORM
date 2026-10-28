// Builds one shop's stockroom deploy files from the templates in this folder (plan 1.20).
//
// Inside a shop's Firebase project the stockroom has its own pieces, each with its own rules, so nothing it deploys
// touches the shop's:
//   - Hosting site    <project id>-stockroom   (the shop keeps the project's default site)
//   - Firestore       the named database the profile gives (`stockroom`); the shop keeps `(default)`
//   - Storage         the bucket the profile gives (<project id>-stockroom); the shop keeps the default bucket
//   - Realtime Database  the project's default instance (only the stockroom uses one)
// The rules never name a real owner: they hold OWNER_PLACEHOLDER, which matches nobody if deployed unfilled (fails
// closed; the shop's Team "owner" role still gets in). This step writes the shop's own copies, owner filled in, to
// `.deploy/`, and a `firebase.deploy.json` that points at them. Deploy with
//   node scripts/deployConfig.mjs --project <project id>
//   npx firebase-tools deploy --config firebase.deploy.json --project <project id> --only firestore,database,storage,hosting
// The owner address comes from SHOP_OWNER_EMAIL (the same value the shop's Cloud Functions use). The project must be
// the one public/shop-profile.js names (the pages built here call that one), and the profile must name the stockroom's
// own database and bucket. Without all of that nothing is written and the step fails.
// Generated files are git-ignored. firebase.json stays the template (the test stockroom's values).
// GitHub Pages (.github/workflows/deploy.yml) keeps serving the stockroom until a shop moves to its Hosting site.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const OWNER_PLACEHOLDER = "__SHOP_OWNER_EMAIL__";
export const OUT_DIR = ".deploy";
export const CONFIG_FILE = "firebase.deploy.json";
export const RULE_FILES = ["firestore.rules", "storage.rules", "database.rules.json"];
// Storage rules read the author list from Firestore; the template names the default database, the deploy names the
// stockroom's own.
const DEFAULT_DATABASE_PATH = "/databases/(default)/documents/";

const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DATABASE_ID = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;
const BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;
// As strict as the shop's: the value goes inside quoted rules strings, so quotes, backslashes and spaces are refused.
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** The stockroom's Hosting site in a shop's project. */
export const stockroomSite = (projectId) => `${projectId}-stockroom`;

/** The owner address in the form the rules compare against (lower case), or "" when it isn't a safe, valid one. */
export function ownerAddress(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v.length <= 254 && EMAIL.test(v) ? v : "";
}

/** One rules file with the owner filled in and, for Storage, the stockroom's database named. Throws on anything wrong. */
export function fillRules(file, template, { owner, database }) {
  const address = ownerAddress(owner);
  if (!address) throw new Error("The shop owner's address is missing or not a plain email address.");
  if (!DATABASE_ID.test(database || "")) throw new Error(`"${database}" isn't a Firestore database id.`);
  if (!template.includes(OWNER_PLACEHOLDER)) throw new Error(`${file} doesn't name the owner as "${OWNER_PLACEHOLDER}".`);
  let filled = template.replaceAll(OWNER_PLACEHOLDER, address);
  if (file === "storage.rules") {
    if (!filled.includes(DEFAULT_DATABASE_PATH)) throw new Error("storage.rules doesn't read the author list from Firestore.");
    filled = filled.replaceAll(DEFAULT_DATABASE_PATH, `/databases/${database}/documents/`);
  }
  if (filled.includes(OWNER_PLACEHOLDER) || filled.includes("(default)")) throw new Error(`${file} still has a slot left.`);
  return filled;
}

/** The profile's stockroom place ({ firestoreDatabase, storageBucket }), checked. Throws when it is missing or wrong. */
export function stockroomPlace(profile, projectId) {
  if (profile?.firebase?.projectId !== projectId) {
    throw new Error(`The shop profile is for "${profile?.firebase?.projectId}", not "${projectId}"; its pages would call another project.`);
  }
  const place = profile.stockroom;
  if (!place || !DATABASE_ID.test(place.firestoreDatabase || "") || !BUCKET.test(place.storageBucket || "")) {
    throw new Error("The shop profile doesn't name the stockroom's own database and bucket.");
  }
  return { firestoreDatabase: place.firestoreDatabase, storageBucket: place.storageBucket };
}

/** firebase.json for one project: the stockroom's own site, database and bucket, and the filled-in rules. */
export function buildFirebaseConfig(template, projectId, place) {
  if (!PROJECT.test(projectId || "")) throw new Error(`"${projectId}" isn't a Firebase project id.`);
  const config = JSON.parse(JSON.stringify(template));
  const firestore = config.firestore?.[0];
  const storage = config.storage?.[0];
  if (config.firestore?.length !== 1 || config.storage?.length !== 1 || !config.database || !config.hosting) {
    throw new Error("firebase.json needs one firestore database, one storage bucket, the database rules and hosting.");
  }
  firestore.database = place.firestoreDatabase;
  firestore.rules = `${OUT_DIR}/firestore.rules`;
  storage.bucket = place.storageBucket;
  storage.rules = `${OUT_DIR}/storage.rules`;
  config.database.rules = `${OUT_DIR}/database.rules.json`;
  config.hosting.site = stockroomSite(projectId);
  return config;
}

/** The profile in public/shop-profile.js (the file Hosting serves), or null. */
export function readServedProfile(text) {
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(text, sandbox, { timeout: 1000 });
  } catch {
    return null;
  }
  return sandbox.window.__SHOP_PROFILE__ ?? null;
}

/** Writes .deploy/* and firebase.deploy.json under `root`. Returns the paths written. Writes nothing on a problem. */
export function writeDeployFiles({ root, projectId, owner, profile }) {
  const place = stockroomPlace(profile, projectId);
  const config = buildFirebaseConfig(JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")), projectId, place);
  const rules = RULE_FILES.map((file) => [file, fillRules(file, readFileSync(join(root, file), "utf8"), { owner, database: place.firestoreDatabase })]);
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
  try {
    const profile = readServedProfile(readFileSync(join(root, "public", "shop-profile.js"), "utf8"));
    const written = writeDeployFiles({ root, projectId, owner: env.SHOP_OWNER_EMAIL, profile });
    console.log(`Stockroom deploy files for ${projectId}: ${written.join(", ")}`);
    return 0;
  } catch (err) {
    console.error(`${err.message} Nothing usable was written; don't deploy.`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2), process.env));
