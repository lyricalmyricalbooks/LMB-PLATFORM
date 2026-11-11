// Builds the deploy files for the shared shops project from the templates in this folder (plan 1.14b; the shared system,
// LMB-PLATFORM docs/shared-system.md).
//
// The rules name no owner: every shop lives in its own folder, shops/<id>, and the rules read the owner's address and the
// shop's sign-in list from that shop's record, which only the platform writes. So one set of rules serves every shop and
// nothing is filled in per shop. This step copies them to `.deploy/`, refusing any that still name an address, and writes a
// `firebase.deploy.json` that points at them and at the project's Hosting site, whose front door addresses go to the
// functions' own region. Deploy with
//   node scripts/deployConfig.mjs --project <project id> [--region <functions region>]
//   npx firebase-tools deploy --config firebase.deploy.json --project <project id> --only …
// Generated files are git-ignored. firebase.json stays the template (the test shop's values), which the emulators,
// scripts/hosting-smoke.mjs and scripts/hostingConfig.test.ts read.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { profileValue } from "./shopProfile.mjs";

export const OUT_DIR = ".deploy";
export const CONFIG_FILE = "firebase.deploy.json";
const RULE_FILES = ["firestore.rules", "storage.rules"];

const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const ADDRESS = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const OLD_SLOT = "__SHOP_OWNER_EMAIL__";

/** One rules file as it is deployed. Throws when it names an address or the old per-shop owner slot. */
export function checkRules(text) {
  if (text.includes(OLD_SLOT)) throw new Error("The rules still hold the old per-shop owner slot.");
  if (ADDRESS.test(text.replace(/\/\/.*$/gm, ""))) throw new Error("The rules name an email address; the owner comes from the shop's record.");
  return text;
}

// The front door (the shared system, step 5; functions/frontDoor.js): one Hosting site answers for every shop. What
// differs per shop (its profile, its pages as first drawn, its sitemap, robots, catalogue file and feeds) is never
// uploaded with the site: Hosting sends those addresses to the frontDoor function, which answers with the shop the
// address belongs to. The build still makes them (for the test shop's data); they are left out here.
export const FRONT_DOOR = "frontDoor";
export const PER_SHOP_FILES = [
  "shop-profile.js", "stockroom/shop-profile.js", "index.html", "books/**", "products/**", "page/**", "collections/**",
  "sitemap.xml", "robots.txt", "storefront-data.json", "llms.txt", "google-merchant-feed.xml", "social-product-feed.csv",
  "seo-published-fingerprint.txt", "prerender-routes.xml",
];
const FRONT_DOOR_PATHS = [
  "/shop-profile.js", "/stockroom/shop-profile.js", "/sitemap.xml", "/robots.txt", "/storefront-data.json", "/llms.txt",
  "/google-merchant-feed.xml", "/social-product-feed.csv", "/seo-published-fingerprint.txt",
];
// The storefront pages a shop draws ahead (scripts/prerenderHtml.mjs routeOutputPath): home, books, products, pages, collections.
const FRONT_DOOR_PAGES = "^/(?:|(?:books|products|page|collections)/[^/]+/?)$";
// Google's Search Console proof file for the shop's address (functions/frontDoor.js VERIFICATION_FILE).
const FRONT_DOOR_VERIFICATION = "^/google[0-9a-f]{8,32}\\.html$";

/** The Hosting part of the shared site: the per-shop files left out, and their addresses sent to the front door. */
export function frontDoorHosting(hosting, region) {
  if (!/^[a-z]+-[a-z]+[0-9]$/.test(region || "")) throw new Error(`"${region}" isn't a functions region.`);
  const to = { function: { functionId: FRONT_DOOR, region } };
  return {
    ...hosting,
    ignore: [...new Set([...(hosting.ignore ?? []), ...PER_SHOP_FILES])],
    rewrites: [
      ...FRONT_DOOR_PATHS.map(source => ({ source, ...to })),
      { regex: FRONT_DOOR_PAGES, ...to },
      { regex: FRONT_DOOR_VERIFICATION, ...to },
      ...(hosting.rewrites ?? []),
    ],
  };
}

/**
 * firebase.json for one project: its own Hosting site and the checked rules. Everything else as the template. `region`
 * is where the functions run; it has no default, because a front door pointed at another region answers nothing.
 */
export function buildFirebaseConfig(template, projectId, { region } = {}) {
  if (!PROJECT.test(projectId || "")) throw new Error(`"${projectId}" isn't a Firebase project id.`);
  const config = JSON.parse(JSON.stringify(template));
  if (!config.firestore || !config.storage || !config.hosting) throw new Error("firebase.json needs firestore, storage and hosting.");
  config.firestore.rules = `${OUT_DIR}/firestore.rules`;
  config.storage.rules = `${OUT_DIR}/storage.rules`;
  // A project's default Hosting site has the project's id as its name; it is the front door for every shop in it.
  config.hosting = frontDoorHosting({ ...config.hosting, site: projectId }, region);
  return config;
}

/** Writes .deploy/*.rules and firebase.deploy.json under `root`. Returns the paths written. */
export function writeDeployFiles({ root, projectId, region }) {
  const config = buildFirebaseConfig(JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")), projectId, { region });
  const rules = RULE_FILES.map(file => [file, checkRules(readFileSync(join(root, file), "utf8"))]);
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

/**
 * Where the functions run, read as they read it: `--region`, else SHOP_FUNCTIONS_REGION, else the shop profile's
 * functionsRegion (the deploy writes SHOP_FUNCTIONS_REGION from it; functions/shopConfig.js).
 */
export function functionsRegion(argv = [], env = process.env, fromProfile = () => profileValue("functionsRegion")) {
  const at = argv.indexOf("--region");
  return (at >= 0 ? argv[at + 1] : "") || String(env.SHOP_FUNCTIONS_REGION ?? "").trim() || fromProfile();
}

function main(argv) {
  const at = argv.indexOf("--project");
  const projectId = at >= 0 ? argv[at + 1] : "";
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const region = functionsRegion(argv);
    const written = writeDeployFiles({ root, projectId, region });
    console.log(`Deploy files for ${projectId} (functions in ${region}): ${written.join(", ")}`);
    return 0;
  } catch (err) {
    console.error(`${err.message} Nothing usable was written; don't deploy.`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
