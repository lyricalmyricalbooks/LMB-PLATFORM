// Settings › Team tells the platform it changed (teamNotice.js, plan 5.11): one POST with the shop's key and no team
// data, and never a thrown error.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { tellPlatformTeamChanged } = require("./teamNotice.js");
const { readShopConfig } = require("./shopConfig.js");
const { usesPlatformServices } = require("./platformKey.js");

const URL_ = "https://accounts.platform.example/";
const KEY = "k".repeat(40);

describe("telling the platform the Team changed", () => {
  test("posts to the door with the shop's id and key, and sends nothing about the team", async () => {
    const calls = [];
    const fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
    expect(await tellPlatformTeamChanged({ url: URL_, shopId: "moth-press", serviceKey: () => KEY, fetch })).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://accounts.platform.example/team-changed");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({ "X-Shop-Id": "moth-press", Authorization: `Bearer ${KEY}` });
    expect(calls[0].init.body).toBe("{}");
  });

  test("no address, no key, a refusal or no answer: it reports and never throws", async () => {
    const never = async () => { throw new Error("should not be called"); };
    expect((await tellPlatformTeamChanged({ url: "", shopId: "s", serviceKey: () => KEY, fetch: never })).ok).toBe(false);
    expect((await tellPlatformTeamChanged({ url: URL_, shopId: "s", serviceKey: () => "", fetch: never })).reason).toBe("no platform key yet");
    expect(await tellPlatformTeamChanged({ url: URL_, shopId: "s", serviceKey: () => KEY, fetch: async () => ({ ok: false, status: 401 }) }))
      .toEqual({ ok: false, reason: "the platform answered 401" });
    const down = await tellPlatformTeamChanged({ url: URL_, shopId: "s", serviceKey: () => KEY, fetch: async () => { throw new Error("ECONNRESET"); } });
    expect(down.ok).toBe(false);
    expect(down.reason).toContain("ECONNRESET");
  });

  test("the address comes from PLATFORM_ACCOUNTS_URL (https only), and it makes the shop need its platform key", () => {
    expect(readShopConfig({ PLATFORM_ACCOUNTS_URL: URL_ }).platformAccountsUrl).toBe("https://accounts.platform.example");
    expect(readShopConfig({ PLATFORM_ACCOUNTS_URL: "http://accounts.platform.example" }).platformAccountsUrl).toBe("");
    expect(readShopConfig({}).platformAccountsUrl).toBe("");
    expect(usesPlatformServices({ paymentMode: "own", platformAccountsUrl: "https://accounts.platform.example" })).toBe(true);
  });
});
