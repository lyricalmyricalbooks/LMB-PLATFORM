// Builds one shop's stockroom deploy files from the templates in this folder (plan 1.20).
//
// Inside a shop's Firebase project the stockroom has its own pieces, each with its own rules, so nothing it deploys
// touches the shop's:
//   - Hosting site    <project id>-stockroom   (the shop keeps the project's default site)
//   - Firestore       the named database the profile gives (`stockroom`); the shop keeps `(default)`
//   - Storage         the bucket the profile gives (<project id>-stockroom); the shop keeps the default bucket
//   - Realtime Database  the project's default instance (only the stockroom uses one)
// The rules name no owner (the shared system: each shop's owner and sign-in list come from its record). This step writes
// the deployed copies to `.deploy/`, refusing any that name an address, and a `firebase.deploy.json` that points at them. Deploy with
//   node scripts/deployConfig.mjs --project <project id>
//   npx firebase-tools deploy --config firebase.deploy.json --project <project id> --only firestore,database,storage,hosting
// The project must be
// the one public/shop-profile.js names (the pages built here call that one), and the profile must name the stockroom's
// own database and bucket. Without all of that nothing is written and the step fails.
// Generated files are git-ignored. firebase.json stays the template (the test stockroom's values).
// GitHub Pages (.github/workflows/deploy.yml) keeps serving the stockroom until a shop moves to its Hosting site.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// The old per-shop owner slot (before the shared system). A rules file still holding it is refused.
export const OWNER_PLACEHOLDER = "__SHOP_OWNER_EMAIL__";
export const OUT_DIR = ".deploy";
export const CONFIG_FILE = "firebase.deploy.json";
export const RULE_FILES = ["firestore.rules", "storage.rules", "database.rules.json"];
// Storage rules read the author list from Firestore; the template names the default database, the deploy names the
// stockroom's own. The shop's record stays in the default database.
const AUTHOR_LIST_PATH = "/databases/(default)/documents/shops/$(shopId)/settings/bookOwners";
const ADDRESS = /[\w.+-]+@[\w-]+\.[\w.-]+/;

const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DATABASE_ID = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;
const BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

/** The stockroom's Hosting site in a shop's project. */
export const stockroomSite = (projectId) => `${projectId}-stockroom`;

/**
 * One rules file as it is deployed. The shared system (LMB-PLATFORM docs/shared-system.md): the rules name no owner,
 * since each shop's owner address and sign-in list come from its record, so nothing is filled in per shop. For Storage,
 * the author list is read from the stockroom's own database, named here. Throws on a rules file that names an address
 * or still holds the old owner slot.
 */
export function fillRules(file, template, { database } = {}) {
  if (!DATABASE_ID.test(database || "")) throw new Error(`"${database}" isn't a Firestore database id.`);
  if (template.includes(OWNER_PLACEHOLDER)) throw new Error(`${file} still holds the old per-shop owner slot.`);
  if (ADDRESS.test(template.replace(/\/\/.*$/gm, ""))) throw new Error(`${file} names an email address; the owner comes from the shop's record.`);
  if (file !== "storage.rules") return template;
  if (!template.includes(AUTHOR_LIST_PATH)) throw new Error("storage.rules doesn't read the author list from Firestore.");
  return template.replaceAll(AUTHOR_LIST_PATH, AUTHOR_LIST_PATH.replace("(default)", database));
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
export function writeDeployFiles({ root, projectId, profile }) {
  const place = stockroomPlace(profile, projectId);
  const config = buildFirebaseConfig(JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")), projectId, place);
  const rules = RULE_FILES.map((file) => [file, fillRules(file, readFileSync(join(root, file), "utf8"), { database: place.firestoreDatabase })]);
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

function main(argv) {
  const at = argv.indexOf("--project");
  const projectId = at >= 0 ? argv[at + 1] : "";
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const profile = readServedProfile(readFileSync(join(root, "public", "shop-profile.js"), "utf8"));
    const written = writeDeployFiles({ root, projectId, profile });
    console.log(`Stockroom deploy files for ${projectId}: ${written.join(", ")}`);
    return 0;
  } catch (err) {
    console.error(`${err.message} Nothing usable was written; don't deploy.`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
