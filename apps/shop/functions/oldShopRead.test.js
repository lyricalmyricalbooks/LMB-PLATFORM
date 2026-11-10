import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { KEPT_SCANS, handleOldLinksRead, handleOldPagesRead, handleOldShopRead, readOldLinks, readOldPages, readOldShop, recordScan, scanEntry } = require("./oldShopRead.js");

describe("reading an old shop's address from Books › Import (plan 23.11)", () => {
  const read = async (address) => (address === "moth.example"
    ? { ok: true, host: "moth.example", csv: "Handle,Title\nm,Moth\n", products: 1, notes: ["Check stock."] }
    : { ok: false, message: "We couldn't read the products at that address." });

  it("answers the product file, or the reader's own plain words", async () => {
    expect(await handleOldShopRead({ address: " moth.example " }, { allow: async () => true, read })).toEqual({ status: 200, body: { host: "moth.example", csv: "Handle,Title\nm,Moth\n", products: 1, notes: ["Check stock."] } });
    expect(await handleOldShopRead({ address: "nowhere.example" }, { allow: async () => true, read })).toEqual({ status: 400, body: { error: "We couldn't read the products at that address." } });
  });

  it("an empty address or too many reads never reach the old shop", async () => {
    const asked = [];
    const counting = async (a) => { asked.push(a); return read(a); };
    expect((await handleOldShopRead({ address: "  " }, { allow: async () => true, read: counting })).status).toBe(400);
    expect((await handleOldShopRead({ address: ["moth.example"] }, { allow: async () => true, read: counting })).status).toBe(400);
    expect((await handleOldShopRead({ address: "moth.example" }, { allow: async () => false, read: counting })).status).toBe(429);
    expect(asked).toEqual([]);
  });

  it("loads the copied reader, which refuses an address that isn't one without going online", async () => {
    expect(await readOldShop("not an address")).toEqual({ ok: false, message: "Type your old shop's web address, like yourshop.com." });
  });

  it("the old-link check answers the old shop's page addresses, under the same limit (plan 23.8)", async () => {
    const links = async (a) => (a === "moth.example" ? { ok: true, host: "moth.example", paths: ["/", "/pages/about"], notes: [] } : { ok: false, message: "No map." });
    expect(await handleOldLinksRead({ address: "moth.example" }, { allow: async () => true, read: links })).toEqual({ status: 200, body: { host: "moth.example", paths: ["/", "/pages/about"], notes: [] } });
    expect(await handleOldLinksRead({ address: "x.example" }, { allow: async () => true, read: links })).toEqual({ status: 400, body: { error: "No map." } });
    expect((await handleOldLinksRead({ address: "moth.example" }, { allow: async () => false, read: links })).status).toBe(429);
    expect(await readOldLinks("not an address")).toEqual({ ok: false, message: "Type your old shop's web address, like yourshop.com." });
  });

  it("bringing pages over sends the chosen addresses on, and checks them first (plan 23.6)", async () => {
    const seen = [];
    const pages = async (a, body) => { seen.push([a, body.paths]); return { ok: true, host: a, pages: [{ path: "/about", slug: "about", title: "About", body: "<p>Hi</p>", images: 0 }], skipped: [] }; };
    expect(await handleOldPagesRead({ address: "moth.example", paths: ["/about"] }, { allow: async () => true, read: pages })).toEqual({ status: 200, body: { host: "moth.example", pages: [{ path: "/about", slug: "about", title: "About", body: "<p>Hi</p>", images: 0 }], skipped: [] } });
    expect(seen).toEqual([["moth.example", ["/about"]]]);
    for (const paths of [undefined, [], ["/a", 3], Array(51).fill("/a")]) expect((await handleOldPagesRead({ address: "moth.example", paths }, { allow: async () => true, read: pages })).status).toBe(400);
    expect(seen).toHaveLength(1);
    expect(await readOldPages("not an address", { paths: ["/about"] })).toEqual({ ok: false, message: "Type your old shop's web address, like yourshop.com." });
  });
});

describe("each product read is kept for the platform's control room, never the products", () => {
  const at = "2026-11-10T13:00:00.000Z";
  it("keeps the address, the count and a part read, and a failed read's words", () => {
    expect(scanEntry("https://Moth.example/shop", { ok: true, host: "moth.example", csv: "x", products: 40, forSale: 38, stockShown: false, notes: ["Your old shop stopped answering after 40 products. Try again."] }, at))
      .toEqual({ at, host: "moth.example", ok: true, products: 40, forSale: 38, stockShown: false, partial: true });
    expect(scanEntry(" https://Busy.example/a/b ", { ok: false, message: "We couldn't reach that shop." }, at)).toEqual({ at, host: "busy.example", ok: false, message: "We couldn't reach that shop." });
    expect(JSON.stringify(scanEntry("m.example", { ok: true, host: "m.example", csv: "Handle,Title\nsecret,Secret\n", products: 1, notes: [] }, at))).not.toMatch(/Secret/);
  });

  it("records after the read and keeps the newest few; a failed record never fails the read", async () => {
    const kept = [];
    const read = async () => ({ ok: true, host: "moth.example", csv: "c", products: 2, notes: [] });
    const ok = await handleOldShopRead({ address: "moth.example" }, { allow: async () => true, read, record: async (e) => kept.push(e), now: () => new Date(at) });
    expect(ok.status).toBe(200);
    expect(kept).toEqual([{ at, host: "moth.example", ok: true, products: 2, stockShown: false, partial: false }]);
    const failing = await handleOldShopRead({ address: "moth.example" }, { allow: async () => true, read, record: async () => { throw new Error("down"); } });
    expect(failing.status).toBe(200);
    await handleOldShopRead({ address: "moth.example" }, { allow: async () => false, read, record: async (e) => kept.push(e) });
    expect(kept).toHaveLength(1);

    let doc = { scans: Array.from({ length: KEPT_SCANS }, (_, i) => ({ host: `old-${i}.example` })) };
    const db = { doc: () => "ref", runTransaction: async (fn) => fn({ get: async () => ({ data: () => doc }), set: (_ref, next) => { doc = next; } }) };
    await recordScan(db, { at, host: "new.example" });
    expect(doc.scans).toHaveLength(KEPT_SCANS);
    expect(doc.scans[0].host).toBe("new.example");
    expect(doc.at).toBe(at);
  });
});
