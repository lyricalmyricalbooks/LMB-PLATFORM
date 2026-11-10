import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { BUILD_SCRIPTS, buildAndPublish, buildShopSite, publishShopSite, publishedProfile, siteFolder } from "./shopSite.js";
import { googleClients } from "../clients/google.js";
import { parseProfileScript } from "../apps/shop/scripts/shopProfile.mjs";

const EXAMPLE = JSON.parse(readFileSync(new URL("../profile/examples/test-shop.json", import.meta.url), "utf8"));
const PROFILE = (id) => ({ ...structuredClone(EXAMPLE), shopId: id, siteUrl: `https://${id}.example` });
const SHOP = (id, extra = {}) => ({ id, tenant: `${id}-abc123`, status: "open", record: { profile: PROFILE(id) }, ...extra });

async function builtApp() {
  const dist = await mkdtemp(join(tmpdir(), "dist-"));
  await writeFile(join(dist, "index.html"), "<html>blank app</html>");
  await mkdir(join(dist, "assets"));
  await writeFile(join(dist, "assets", "app.js"), "app");
  return dist;
}

/** Stands in for the three build scripts: writes what they write, for the shop the profile names. */
function fakeScripts({ books = ["night-buses"], fail } = {}) {
  const runs = [];
  const run = async (script, { env }) => {
    const name = basename(script);
    runs.push({ name, env });
    if (name === fail) throw new Error(`${name} stopped with code 1.`);
    const dir = env.SHOP_BUILD_DIR;
    const profile = parseProfileScript(await readFile(env.SHOP_PROFILE_FILE, "utf8"));
    const write = async (file, text) => { await mkdir(dirname(join(dir, file)), { recursive: true }); await writeFile(join(dir, file), text); };
    if (name === "generate-sitemap.mjs") {
      const locs = ["/", ...books.map((b) => `/books/${b}`), "/account"].map((p) => `<url><loc>${profile.siteUrl}${p}</loc></url>`).join("");
      await write("prerender-routes.xml", `<urlset>${locs}</urlset>`);
      await write("sitemap.xml", `<urlset>${profile.shopId}</urlset>`);
      await write("robots.txt", "User-agent: *");
      await write("llms.txt", profile.shopId);
    }
    if (name === "build-storefront-data.mjs") await write("storefront-data.json", JSON.stringify({ shop: profile.shopId }));
    if (name === "prerender-storefront.mjs") {
      await write("index.html", `<html>${profile.shopId} home</html>`);
      for (const b of books) await write(`books/${b}.html`, `<html>${profile.shopId} ${b}</html>`);
    }
  };
  return { run, runs };
}

function fakeBucket(initial = {}) {
  const objects = new Map(Object.entries(initial));
  return {
    objects,
    async list(_p, folder) { return [...objects.keys()].filter((k) => k.startsWith(folder)); },
    async upload(_p, folder, name, body, type) { objects.set(folder + name, { body: String(body), type }); },
    async remove(_p, folder, name) { assert.ok(name.startsWith(folder)); objects.delete(name); },
  };
}

test("the profile the pages read is the shop's own, with its sign-in list", () => {
  assert.deepEqual(publishedProfile(SHOP("press-a")), { ...PROFILE("press-a"), tenant: "press-a-abc123" });
  assert.throws(() => publishedProfile({ id: "press-a", record: { profile: PROFILE("press-b") } }), /no profile for its own id/);
  assert.throws(() => publishedProfile({ id: "press-a", record: {} }), /no profile/);
});

test("builds one shop's files from its own profile, in its own folder, and keeps only what the front door serves", async () => {
  const dist = await builtApp();
  const { run, runs } = fakeScripts();
  const { workDir, files } = await buildShopSite({ shop: SHOP("press-a"), distDir: dist, run, env: { SITE_URL: "https://wrong.example", SITE_BASE: "/x", PATH: "/bin" } });
  assert.deepEqual(runs.map((r) => r.name), [...BUILD_SCRIPTS]);
  for (const { env } of runs) {
    assert.equal(env.SHOP_BUILD_DIR, workDir);
    assert.equal(env.SITE_URL, undefined);
    assert.equal(env.SITE_BASE, undefined);
    assert.equal(env.PATH, "/bin");
  }
  const profile = parseProfileScript(await readFile(join(workDir, "shop-profile.js"), "utf8"));
  assert.equal(profile.tenant, "press-a-abc123");
  // The account page is not a page the front door snapshots; the app's own files are not the shop's.
  assert.deepEqual(files.sort(), ["books/night-buses.html", "index.html", "llms.txt", "robots.txt", "sitemap.xml", "storefront-data.json"]);
  // The built app is left as it was.
  assert.equal(await readFile(join(dist, "index.html"), "utf8"), "<html>blank app</html>");
});

test("publishes into the shop's folder only, and takes down pages this run didn't draw", async () => {
  const dist = await builtApp();
  const bucket = fakeBucket({
    "shops/press-a/site/books/taken-down.html": { body: "old" },
    "shops/press-b/site/index.html": { body: "B home" },
  });
  const first = await buildAndPublish({ shop: SHOP("press-a"), siteFiles: bucket, projectId: "lmb-test-shop", distDir: dist, run: fakeScripts().run });
  assert.deepEqual(first.removed, ["books/taken-down.html"]);
  assert.equal(bucket.objects.get("shops/press-a/site/index.html").body, "<html>press-a home</html>");
  assert.match(bucket.objects.get("shops/press-a/site/index.html").type, /text\/html/);
  assert.match(bucket.objects.get("shops/press-a/site/sitemap.xml").type, /xml/);
  assert.equal(bucket.objects.get("shops/press-b/site/index.html").body, "B home");

  // Run again: the same files, nothing removed.
  const again = await buildAndPublish({ shop: SHOP("press-a"), siteFiles: bucket, projectId: "lmb-test-shop", distDir: dist, run: fakeScripts().run });
  assert.deepEqual(again, { uploaded: first.uploaded, removed: [] });
});

test("a build that fails publishes nothing, so the last good files stay", async () => {
  const dist = await builtApp();
  const bucket = fakeBucket({ "shops/press-a/site/index.html": { body: "last good" } });
  for (const fail of BUILD_SCRIPTS) {
    await assert.rejects(buildAndPublish({ shop: SHOP("press-a"), siteFiles: bucket, projectId: "lmb-test-shop", distDir: dist, run: fakeScripts({ fail }).run }), /stopped/);
  }
  assert.deepEqual([...bucket.objects.keys()], ["shops/press-a/site/index.html"]);
  await assert.rejects(publishShopSite({ siteFiles: bucket, projectId: "p", shopId: "press-a", workDir: dist, files: ["sitemap.xml"] }), /no home page/);
  await assert.rejects(buildShopSite({ shop: SHOP("press-a"), distDir: join(dist, "missing"), run: fakeScripts().run }), /no built app/);
});

test("the bucket client reads and writes only inside a shop's site folder", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    if (String(url).includes("/defaultBucket")) return new Response(JSON.stringify({ bucket: { name: "projects/p/buckets/lmb-test-shop.appspot.com" } }));
    if (init.method === "GET") return new Response(JSON.stringify({ items: [{ name: "shops/press-a/site/index.html" }] }));
    return new Response("{}");
  };
  const { siteFiles } = googleClients({ fetch, token: async () => "t" });
  assert.equal(siteFolder("press-a"), "shops/press-a/site/");
  assert.deepEqual(await siteFiles.list("p", "shops/press-a/site/"), ["shops/press-a/site/index.html"]);
  await siteFiles.upload("p", "shops/press-a/site/", "books/x.html", "<html>", "text/html");
  assert.match(calls.at(-1).url, /name=shops%2Fpress-a%2Fsite%2Fbooks%2Fx\.html/);
  await siteFiles.remove("p", "shops/press-a/site/", "shops/press-a/site/books/x.html");
  assert.match(calls.at(-1).url, /\/o\/shops%2Fpress-a%2Fsite%2Fbooks%2Fx\.html$/);
  for (const [folder, name] of [["shops/press-a/", "x"], ["shops/press-a/site/../", "x"], ["shops/Press/site/", "x"], ["shops/press-a/site/", "../b/site/x"], ["shops/press-a/site/", "a//b"], ["shops/press-a/site/", ""]]) {
    await assert.rejects(siteFiles.upload("p", folder, name, "", "text/plain"), /isn't a/);
  }
  await assert.rejects(siteFiles.list("p", ""), /isn't a shop's site folder/);
});
