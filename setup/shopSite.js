// Each shop's published files in the shared system (docs/shared-system.md, step 5). One Hosting site serves the app for
// every shop, and the front door (apps/shop/functions/frontDoor.js) answers each address with that shop's own files,
// read from the shared bucket at shops/<shopId>/site/. This builds and uploads them.
//
// `buildShopSite` copies the built app (apps/shop/dist) into a folder of its own, writes the shop's profile there, and
// runs the shop's own build scripts against it (SHOP_PROFILE_FILE, SHOP_BUILD_DIR): the sitemap, robots, feeds,
// llms.txt and the catalogue file, read from the shop's folder in the shared database, then its pages as first drawn.
// `publishShopSite` uploads exactly the files the front door asks for and removes the shop's older ones that this run
// didn't write (a page whose book was taken down). A build that fails uploads nothing, so the last good files stay.
// Safe to run twice: the same catalogue uploads the same files.
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { profileScript } from "../profile/profile.js";
import { publicRoutes, routeOutputPath } from "../apps/shop/scripts/prerenderHtml.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const SHOP_APP = resolve(here, "../apps/shop");
const { SITE_FILES, TYPES, snapshotFile } = createRequire(import.meta.url)("../apps/shop/functions/frontDoor.js");

/** The shop's folder of published files in the shared bucket. */
export const siteFolder = (shopId) => `shops/${shopId}/site/`;

/** The build scripts, in the order `npm run build` runs them after `vite build`. */
export const BUILD_SCRIPTS = Object.freeze(["generate-sitemap.mjs", "build-storefront-data.mjs", "prerender-storefront.mjs"]);

/** The profile the shop's pages read: the record's profile, with the shop's sign-in list (as the front door serves it). */
export function publishedProfile(shop) {
  const profile = shop?.record?.profile;
  if (!profile || profile.shopId !== shop.id) throw new Error(`Shop ${shop?.id}: its record has no profile for its own id.`);
  return { ...profile, ...(shop.tenant ? { tenant: shop.tenant } : {}) };
}

function runNode(script, { cwd, env }) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [script], { cwd, env, stdio: "inherit" });
    child.on("error", fail);
    child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`${script} stopped with code ${code}.`))));
  });
}

const exists = async (file) => stat(file).then((s) => s.isFile(), () => false);

/**
 * Builds one shop's files into `workDir` (made when not given). Returns { workDir, files }: the names under the shop's
 * site folder, each one a file the front door serves (SITE_FILES, or a page `snapshotFile` names).
 */
export async function buildShopSite({ shop, appDir = SHOP_APP, distDir = join(appDir, "dist"), workDir, run = runNode, env = process.env }) {
  const profile = publishedProfile(shop);
  if (!(await exists(join(distDir, "index.html")))) throw new Error(`${distDir} has no built app: run the shop's vite build first.`);
  const dir = workDir ?? (await mkdtemp(join(tmpdir(), "shop-site-")));
  await cp(distDir, dir, { recursive: true });
  const profileFile = join(dir, "shop-profile.js");
  await writeFile(profileFile, profileScript(profile));
  // The profile decides the address; a SITE_URL or SITE_BASE left in the caller's environment must not.
  const { SITE_URL: _url, SITE_BASE: _base, ...rest } = env;
  const runEnv = { ...rest, SHOP_PROFILE_FILE: profileFile, SHOP_BUILD_DIR: dir };
  for (const script of BUILD_SCRIPTS) await run(join(appDir, "scripts", script), { cwd: appDir, env: runEnv });

  const files = [];
  for (const name of SITE_FILES) if (await exists(join(dir, name))) files.push(name);
  const routes = publicRoutes(await readFile(join(dir, "prerender-routes.xml"), "utf8"), profile.siteUrl, () => {});
  for (const route of routes) {
    const name = routeOutputPath(route);
    // Only a page the front door will ask for by this name.
    if (snapshotFile(route) === name && (await exists(join(dir, name)))) files.push(name);
  }
  return { workDir: dir, files };
}

const typeOf = (name) => TYPES[name.slice(name.lastIndexOf("."))] ?? "application/octet-stream";

/**
 * Uploads `files` from `workDir` to the shop's site folder, then removes the folder's other files.
 * `siteFiles` is clients/google.js `siteFiles`. Returns { uploaded, removed }.
 */
export async function publishShopSite({ siteFiles, projectId, shopId, workDir, files, print = () => {} }) {
  const folder = siteFolder(shopId);
  if (!files.includes("index.html")) throw new Error(`Shop ${shopId}: the build drew no home page, so nothing was published.`);
  for (const name of files) await siteFiles.upload(projectId, folder, name, await readFile(join(workDir, name)), typeOf(name));
  const keep = new Set(files.map((name) => folder + name));
  const removed = [];
  for (const name of await siteFiles.list(projectId, folder)) {
    if (keep.has(name)) continue;
    await siteFiles.remove(projectId, folder, name);
    removed.push(name.slice(folder.length));
  }
  print(`Shop ${shopId}: published ${files.length} files${removed.length ? `, removed ${removed.length} older ones` : ""}.`);
  return { uploaded: files.length, removed };
}

/** Builds and publishes one shop, then clears the build folder. */
export async function buildAndPublish({ shop, siteFiles, projectId, appDir, distDir, run, env, print }) {
  const workDir = await mkdtemp(join(tmpdir(), "shop-site-"));
  try {
    const { files } = await buildShopSite({ shop, appDir, distDir, workDir, run, env });
    return await publishShopSite({ siteFiles, projectId, shopId: shop.id, workDir, files, print });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
