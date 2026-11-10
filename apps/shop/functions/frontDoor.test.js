// The front door (frontDoor.js, LMB-PLATFORM docs/shared-system.md step 5): one site for every shop's address, each
// address answered with its own shop's profile, files and pages, never another's.
import { describe, expect, it } from "vitest";
const { frontDoor, hostOf, snapshotFile, safeSlug, SITE_FILES } = require("./frontDoor");
import { PER_SHOP_FILES, frontDoorHosting } from "../scripts/deployConfig.mjs";
import { safeSlug as prerenderSafeSlug } from "../scripts/routeSafety.mjs";

const PROFILE = id => ({ version: 1, shopId: id, firebase: { projectId: "lmb-test-shop" }, siteUrl: `https://${id}.example`, apps: { shop: true, stockroom: true } });
const SHOPS = {
  "press-a": { id: "press-a", tenant: "press-a-111111", status: "open", record: { profile: PROFILE("press-a") } },
  "press-b": { id: "press-b", tenant: "press-b-222222", status: "open", record: { profile: PROFILE("press-b") } },
  "press-c": { id: "press-c", tenant: "", status: "closed", record: { profile: PROFILE("press-c") } },
  "press-d": { id: "press-d", tenant: "", status: "open", record: {} },
};
const ADDRESSES = { "press-a.example": "press-a", "www.press-b.example": "press-b", "press-c.example": "press-c", "press-d.example": "press-d", "odd.example": "Not An Id" };
const FILES = {
  "shops/press-a/site/index.html": "<html>A home</html>",
  "shops/press-a/site/books/night-buses.html": "<html>A book</html>",
  "shops/press-a/site/sitemap.xml": "<urlset>A</urlset>",
  "shops/press-b/site/index.html": "<html>B home</html>",
};

function door({ files = FILES } = {}) {
  const reads = { addresses: 0, files: [], shell: 0 };
  const rootDb = () => ({
    collection: name => ({
      doc: id => ({
        get: async () => {
          expect(name).toBe("addresses");
          reads.addresses++;
          return { exists: id in ADDRESSES, data: () => ({ shopId: ADDRESSES[id] }) };
        },
      }),
    }),
  });
  const bucket = () => ({
    file: name => ({
      download: async () => {
        reads.files.push(name);
        if (name in files) return [Buffer.from(files[name])];
        throw Object.assign(new Error("No such object"), { code: 404 });
      },
    }),
  });
  const fetch = async url => { reads.shell++; expect(url).toBe("https://lmb-test-shop.web.app/spa.html"); return { ok: true, text: async () => "<html>blank app</html>" }; };
  const answer = frontDoor({ rootDb, bucket, loadShop: async id => SHOPS[id] ?? null, shellUrl: () => "https://lmb-test-shop.web.app/spa.html", fetch, log: { error() {} } });
  const ask = async (host, path, method = "GET") => {
    const out = { headers: {} };
    const res = {
      status(code) { out.status = code; return this; },
      set(k, v) { out.headers[k] = v; return this; },
      send(body) { out.body = String(body); return this; },
    };
    await answer({ method, path, headers: { host }, hostname: host, get: () => undefined }, res);
    return out;
  };
  return { ask, reads };
}

describe("addresses", () => {
  it("reads the typed address, lower case, without a port", () => {
    expect(hostOf({ hostname: "Press-A.Example" })).toBe("press-a.example");
    expect(hostOf({ get: h => (h === "x-forwarded-host" ? "shop.example:443, proxy" : undefined) })).toBe("shop.example");
    for (const bad of ["", "localhost", "a b.example", "../x", "x".repeat(300) + ".example"]) expect(hostOf({ hostname: bad }), bad).toBe("");
  });
  it("names a storefront page's file the way the prerender writes it, and nothing else", () => {
    expect(snapshotFile("/")).toBe("index.html");
    expect(snapshotFile("/books/night-buses")).toBe("books/night-buses.html");
    expect(snapshotFile("/collections/new/")).toBe("collections/new.html");
    expect(snapshotFile("/books/l'été")).toBe("books/l'été.html");
    for (const bad of ["/admin", "/books/a/b", "/books/..", "/books/%2e%2e", "/books/a%2Fb", "/other/x", "/books/%E0"]) expect(snapshotFile(bad), bad).toBeNull();
  });

  it("takes exactly the slugs the prerender writes files for", () => {
    for (const slug of ["night-buses", "l'été", "a..b", "Book 2", ".", "..", "a/b", "a%b", "a.", "a ", "", "x<y", "tab\there"]) {
      expect(safeSlug(slug), slug).toBe(prerenderSafeSlug(slug));
    }
  });
});

describe("one site, every shop", () => {
  it("every published file is left out of the site's upload and sent here by Hosting", () => {
    const rewrites = frontDoorHosting({}, "us-central1").rewrites;
    for (const name of SITE_FILES) {
      expect(PER_SHOP_FILES, name).toContain(name);
      expect(rewrites.some(r => r.source === `/${name}`), name).toBe(true);
    }
  });


  it("answers each address with its own shop's profile, carrying the shop's sign-in list", async () => {
    const { ask } = door();
    const a = await ask("press-a.example", "/shop-profile.js");
    expect(a.status).toBe(200);
    expect(a.headers["Content-Type"]).toMatch(/javascript/);
    expect(a.headers["Cache-Control"]).toBe("no-cache");
    const profile = JSON.parse(a.body.slice(a.body.indexOf("=") + 1).trim().replace(/;$/, ""));
    expect(profile).toMatchObject({ shopId: "press-a", tenant: "press-a-111111" });
    const b = await ask("www.press-b.example", "/stockroom/shop-profile.js");
    expect(b.body).toContain('"shopId": "press-b"');
    expect(b.body).not.toContain("press-a");
  });

  it("serves each shop's own pages and files, and never another shop's", async () => {
    const { ask, reads } = door();
    expect((await ask("press-a.example", "/")).body).toBe("<html>A home</html>");
    expect((await ask("press-a.example", "/books/night-buses")).body).toBe("<html>A book</html>");
    expect((await ask("www.press-b.example", "/")).body).toBe("<html>B home</html>");
    expect((await ask("press-a.example", "/sitemap.xml")).body).toBe("<urlset>A</urlset>");
    expect((await ask("www.press-b.example", "/sitemap.xml")).status).toBe(404);
    for (const name of reads.files) expect(name).toMatch(/^shops\/press-[ab]\/site\//);
    expect(reads.files.filter(n => n.startsWith("shops/press-b/")).every(n => !n.includes("press-a"))).toBe(true);
  });

  it("falls back to the blank app for a page not drawn yet, and a plain robots file", async () => {
    const { ask, reads } = door();
    expect((await ask("www.press-b.example", "/books/new-one")).body).toBe("<html>blank app</html>");
    expect((await ask("www.press-b.example", "/collections/all")).body).toBe("<html>blank app</html>");
    expect(reads.shell).toBe(1);
    const robots = await ask("www.press-b.example", "/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.body).toContain("Disallow: /admin");
  });

  it("an unknown address, a bad record or a closed shop gets a plain page, never another shop", async () => {
    const { ask } = door();
    for (const host of ["nobody.example", "odd.example", "localhost"]) {
      const out = await ask(host, "/shop-profile.js");
      expect(out.status, host).toBe(404);
      expect(out.body).toContain("There is no shop here");
    }
    expect((await ask("press-c.example", "/")).status).toBe(410);
    expect((await ask("press-d.example", "/shop-profile.js")).status).toBe(503);
  });

  it("only reads, and remembers an address for a minute", async () => {
    const { ask, reads } = door();
    expect((await ask("press-a.example", "/", "POST")).status).toBe(405);
    await ask("press-a.example", "/");
    await ask("press-a.example", "/sitemap.xml");
    expect(reads.addresses).toBe(1);
  });
});
