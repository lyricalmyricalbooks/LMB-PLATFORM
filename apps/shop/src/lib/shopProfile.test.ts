import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SHOP_PROFILE, parseShopProfile, readShopProfile } from "./shopProfile";

const other = {
  ...DEFAULT_SHOP_PROFILE,
  shopId: "mothpress",
  firebase: { ...DEFAULT_SHOP_PROFILE.firebase, projectId: "shop-mothpress", appId: "1:2:web:3" },
  siteUrl: "https://mothpress.example",
  appCheckSiteKey: "moth-key",
};

describe("shop profile", () => {
  it("uses the built-in settings when the page has no profile", () => {
    expect(readShopProfile(undefined)).toBe(DEFAULT_SHOP_PROFILE);
  });

  it("uses the profile the page opened with", () => {
    expect(readShopProfile(other)).toEqual(other);
  });

  it("ignores a broken profile as a whole, never mixing two shops' settings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = { ...other, firebase: { ...other.firebase, apiKey: "" } };
    expect(readShopProfile(broken)).toBe(DEFAULT_SHOP_PROFILE);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("refuses wrong shapes", () => {
    expect(parseShopProfile(null)).toBeNull();
    expect(parseShopProfile({ ...other, version: 2 })).toBeNull();
    expect(parseShopProfile({ ...other, siteUrl: "http://mothpress.example" })).toBeNull();
    expect(parseShopProfile({ ...other, siteUrl: "https://mothpress.example/" })).toBeNull();
    expect(parseShopProfile({ ...other, apps: { shop: "yes", stockroom: true } })).toBeNull();
    expect(parseShopProfile({ ...other, appCheckSiteKey: 5 })).toBeNull();
  });

  it("keeps only the profile's own fields", () => {
    const parsed = parseShopProfile({ ...other, stripeAccountId: "acct_1", firebase: { ...other.firebase, extra: 1 } });
    expect(parsed).toEqual(other);
  });

  it("the profile file Hosting serves for this shop matches the built-in settings", () => {
    const window: { __SHOP_PROFILE__?: unknown } = {};
    vm.runInNewContext(readFileSync("public/shop-profile.js", "utf8"), { window });
    expect(JSON.parse(JSON.stringify(window.__SHOP_PROFILE__))).toEqual(DEFAULT_SHOP_PROFILE);
  });

  it("index.html loads the profile, deferred, before the app script", () => {
    const html = readFileSync("index.html", "utf8");
    const profile = html.indexOf('<script defer src="%BASE_URL%shop-profile.js"></script>');
    const app = html.indexOf('<script type="module" src="/src/main.tsx"></script>');
    expect(profile).toBeGreaterThan(-1);
    expect(app).toBeGreaterThan(profile);
  });
});
