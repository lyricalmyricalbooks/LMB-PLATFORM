// The front door (frontDoor.js, LMB-PLATFORM docs/shared-system.md step 5): one site for every shop's address, each
// address answered with its own shop's profile, files and pages, never another's.
import { gunzipSync, brotliDecompressSync } from "node:zlib";
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
const ADDRESSES = { "press-a.example": "press-a", "press-a.shops.example": "press-a", "www.press-b.example": "press-b", "press-c.example": "press-c", "press-d.example": "press-d", "odd.example": "Not An Id" };
const FILES = {
  "shops/press-a/site/index.html": "<html>A home</html>",
  "shops/press-a/site/books/night-buses.html": "<html>A book</html>",
  "shops/press-a/site/sitemap.xml": "<urlset>A</urlset>",
  "shops/press-b/site/index.html": "<html>B home</html>",
  "shops/press-a/site/google0123456789abcdef.html": "google-site-verification: google0123456789abcdef.html",
};

function door({ files = FILES, usage = () => {}, shell = "<html>blank app</html>", routeCheck = null } = {}) {
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
  const fetch = async url => { reads.shell++; expect(url).toBe("https://lmb-test-shop.web.app/spa.html"); return { ok: true, text: async () => shell }; };
  const answer = frontDoor({ rootDb, bucket, loadShop: async id => SHOPS[id] ?? null, shellUrl: () => "https://lmb-test-shop.web.app/spa.html", fetch, log: { error() {} }, usage, routeCheck });
  const ask = async (host, path, method = "GET", { url, headers = {} } = {}) => {
    const out = { headers: {} };
    const res = {
      status(code) { out.status = code; return this; },
      set(k, v) { out.headers[k] = v; return this; },
      send(body) { out.raw = body; out.body = String(body); return this; },
    };
    await answer({ method, path, url: url ?? path, headers: { host, ...headers }, hostname: host, get: h => headers[h] }, res);
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

describe("usage", () => {
  it("writes each shop's web traffic by size, and nothing for an address with no shop", async () => {
    const lines = [];
    const { ask } = door({ usage: entry => lines.push(entry) });
    const home = await ask("www.press-b.example", "/");
    await ask("press-a.example", "/shop-profile.js", "HEAD");
    await ask("nobody.example", "/");
    expect(lines).toEqual([{ shop: "press-b", kind: "page", bytes: Buffer.byteLength(home.body) }, { shop: "press-a", kind: "page", bytes: 0 }]);
  });
});

describe("Google's proof file (Connect Google)", () => {
  it("answers only the shop's own file, and sends its address to the front door", async () => {
    const { ask } = door();
    const ok = await ask("press-a.example", "/google0123456789abcdef.html");
    expect(ok.status).toBe(200);
    expect(ok.body).toContain("google-site-verification");
    expect((await ask("www.press-b.example", "/google0123456789abcdef.html")).status).toBe(404);
    const rewrites = frontDoorHosting({}, "us-central1").rewrites;
    expect(rewrites.some(r => r.regex && new RegExp(r.regex).test("/google0123456789abcdef.html"))).toBe(true);
    expect(rewrites.some(r => r.regex && r.regex.includes("google") && new RegExp(r.regex).test("/google/../x.html"))).toBe(false);
  });
});

// The app's blank page as the shared build writes it (index.html, trimmed to what the front door changes).
const SHELL = `<!DOCTYPE html><html lang="en"><head>
    <title>Your Press</title>
    <meta name="description" content="Shop online at Your Press." />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:url" content="https://lmb-test-shop.web.app/" />
    <meta property="og:site_name" content="Your Press" />
    <meta property="og:locale" content="en_CA" />
    <script type="application/ld+json" id="seo-jsonld-static">
    { "@type": "Store", "name": "Your Press", "url": "https://lmb-test-shop.web.app/" }
    </script>
  </head><body><div id="root"></div><script>var name = "Your Press";</script></body></html>`;

describe("one address per shop", () => {
  it("moves a page asked for on another of the shop's addresses to its main one, for good", async () => {
    const { ask } = door();
    const out = await ask("press-a.shops.example", "/books/night-buses", "GET", { url: "/books/night-buses?ref=ig" });
    expect(out.status).toBe(301);
    expect(out.headers.Location).toBe("https://press-a.example/books/night-buses?ref=ig");
    expect(out.headers["Cache-Control"]).toBe("private, max-age=3600");
    expect((await ask("press-a.shops.example", "/")).headers.Location).toBe("https://press-a.example/");
  });
  it("answers on the main address as before, and leaves the profile, files and owner previews where they are", async () => {
    const { ask } = door();
    expect((await ask("press-a.example", "/books/night-buses")).status).toBe(200);
    expect((await ask("press-a.shops.example", "/shop-profile.js")).status).toBe(200);
    expect((await ask("press-a.shops.example", "/sitemap.xml")).status).toBe(200);
    expect((await ask("press-a.shops.example", "/", "GET", { url: "/?preview=true" })).status).toBe(200);
    expect((await ask("press-a.shops.example", "/books/night-buses", "GET", { headers: { "sec-fetch-dest": "iframe" } })).status).toBe(200);
  });
  it("never sends visitors to a main address that isn't this shop's", async () => {
    // press-b's profile names press-b.example, which no shop holds: its www address keeps answering.
    const { ask } = door();
    expect((await ask("www.press-b.example", "/")).status).toBe(200);
  });
});

describe("pages not drawn yet", () => {
  const live = async () => ({ state: "live" });
  it("make the app's blank page the shop's own: its address, name and no template shop description", async () => {
    const shop = { ...SHOPS["press-a"], record: { profile: { ...PROFILE("press-a"), name: "Moth & Co", currency: "USD" } } };
    SHOPS["press-e"] = { ...shop, id: "press-e", record: { profile: { ...shop.record.profile, shopId: "press-e", siteUrl: "https://press-e.example" } } };
    ADDRESSES["press-e.example"] = "press-e";
    try {
      const { ask } = door({ shell: SHELL, routeCheck: live });
      const out = await ask("press-e.example", "/books/new-one");
      expect(out.status).toBe(200);
      expect(out.body).toContain('<meta property="og:url" content="https://press-e.example/books/new-one" />');
      expect(out.body).toContain('<link rel="canonical" href="https://press-e.example/books/new-one" />');
      expect(out.body).toContain("<title>Moth &amp; Co</title>");
      expect(out.body).toContain('<meta property="og:locale" content="en_US" />');
      expect(out.body).not.toContain("seo-jsonld-static");
      expect(out.body).not.toContain("lmb-test-shop");
      expect(out.body).toContain('content="index, follow');
      expect(out.body).toContain('var name = "Your Press";'); // the page body and scripts are left alone
    } finally {
      delete SHOPS["press-e"];
      delete ADDRESSES["press-e.example"];
    }
  });
  it("answer 404 with noindex for a product or page the shop doesn't have", async () => {
    const asked = [];
    const { ask } = door({ shell: SHELL, routeCheck: async (shop, path) => { asked.push([shop.id, path]); return { state: "missing" }; } });
    const out = await ask("press-a.example", "/books/gone");
    expect(out.status).toBe(404);
    expect(out.body).toContain('<meta name="robots" content="noindex" />');
    expect(out.body).not.toContain('rel="canonical"');
    expect(asked).toEqual([["press-a", "/books/gone"]]);
    // A drawn page and the home page are never checked; an owner's preview of a draft isn't refused.
    await ask("press-a.example", "/books/night-buses");
    expect((await ask("press-a.example", "/books/draft", "GET", { url: "/books/draft?preview=true" })).status).toBe(200);
    expect(asked).toHaveLength(1);
  });
  it("send an address the owner redirected on with a 301", async () => {
    const { ask } = door({ shell: SHELL, routeCheck: async (_shop, path) => ({ state: "missing", to: path === "/books/old" ? "/books/new?x=1" : "https://elsewhere.example/a" }) });
    expect((await ask("press-a.example", "/books/old")).headers.Location).toBe("https://press-a.example/books/new?x=1");
    const away = await ask("press-a.example", "/page/moved");
    expect(away.status).toBe(301);
    expect(away.headers.Location).toBe("https://elsewhere.example/a");
  });
  it("keep the blank page with a 200 when it can't tell", async () => {
    const { ask } = door({ shell: SHELL, routeCheck: async () => ({ state: "unknown" }) });
    expect((await ask("press-a.example", "/collections/new")).status).toBe(200);
  });
  it("a shop with no robots file yet gets the publish run's own lines, with its sitemap", async () => {
    const { ask } = door();
    const robots = (await ask("press-a.example", "/robots.txt")).body;
    for (const route of ["admin", "checkout", "account", "wishlist", "track"]) expect(robots).toContain(`Disallow: /${route}\n`);
    expect(robots).toContain("Sitemap: https://press-a.example/sitemap.xml");
  });
});

describe("one address per page", () => {
  it("moves a page asked for with a trailing slash to the one without, keeping the query", async () => {
    const { ask } = door();
    const out = await ask("press-a.example", "/books/night-buses/", "GET", { url: "/books/night-buses/?ref=ig" });
    expect(out.status).toBe(301);
    expect(out.headers.Location).toBe("https://press-a.example/books/night-buses?ref=ig");
    // On another of the shop's addresses: one hop, straight to the main address without the slash.
    expect((await ask("press-a.shops.example", "/books/night-buses/")).headers.Location).toBe("https://press-a.example/books/night-buses");
    expect((await ask("press-a.example", "/")).status).toBe(200);
    expect((await ask("press-a.example", "/books/night-buses/", "GET", { url: "/books/night-buses/?preview=true" })).status).toBe(200);
  });
});

describe("page size", () => {
  const BIG = `<html><head><title>A</title></head><body>${"<p>A book about night buses.</p>".repeat(200)}</body></html>`;
  const files = { ...FILES, "shops/press-a/site/books/big.html": BIG };
  it("sends pages squeezed with brotli or gzip when the visitor takes it, and says so", async () => {
    const { ask } = door({ files });
    const br = await ask("press-a.example", "/books/big", "GET", { headers: { "accept-encoding": "gzip, deflate, br" } });
    expect(br.headers["Content-Encoding"]).toBe("br");
    expect(br.headers.Vary).toBe("Accept-Encoding");
    expect(br.raw.length).toBeLessThan(BIG.length / 10);
    expect(brotliDecompressSync(br.raw).toString()).toBe(BIG);
    const gz = await ask("press-a.example", "/books/big", "GET", { headers: { "accept-encoding": "gzip" } });
    expect(gz.headers["Content-Encoding"]).toBe("gzip");
    expect(gunzipSync(gz.raw).toString()).toBe(BIG);
  });
  it("sends it as is to a visitor that can't take it, and small answers always as is", async () => {
    const { ask } = door({ files });
    for (const enc of [undefined, "identity", "br;q=0, gzip;q=0"]) {
      const out = await ask("press-a.example", "/books/big", "GET", { headers: enc ? { "accept-encoding": enc } : {} });
      expect(out.headers["Content-Encoding"]).toBeUndefined();
      expect(out.body).toBe(BIG);
    }
    const small = await ask("press-a.example", "/books/night-buses", "GET", { headers: { "accept-encoding": "br" } });
    expect(small.headers["Content-Encoding"]).toBeUndefined();
    expect(small.body).toBe("<html>A book</html>");
  });
});
