import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { handleOldShopRead, readOldShop } = require("./oldShopRead.js");

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
});
