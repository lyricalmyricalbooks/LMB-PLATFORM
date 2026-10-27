import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseProfileScript, readShopProfile, shopProjectId, shopSiteUrl } from "./shopProfile.mjs";
import { DEFAULT_SHOP_PROFILE } from "../src/lib/shopProfile";

const profileFile = (text: string) => {
  const path = join(mkdtempSync(join(tmpdir(), "shop-profile-")), "shop-profile.js");
  writeFileSync(path, text);
  return pathToFileURL(path);
};

describe("shop profile for build scripts", () => {
  it("reads the same profile the page reads", async () => {
    expect(await readShopProfile()).toEqual(DEFAULT_SHOP_PROFILE);
    expect(await shopProjectId()).toBe(DEFAULT_SHOP_PROFILE.firebase.projectId);
  });

  it("reads a profile written by the platform, escaped < included", () => {
    const text = '// Written by the platform. Do not edit by hand.\nwindow.__SHOP_PROFILE__ = {\n  "shopId": "a\\u003cb",\n  "firebase": { "projectId": "press-two" }\n};\n';
    expect(parseProfileScript(text)).toEqual({ shopId: "a<b", firebase: { projectId: "press-two" } });
  });

  it("names the problem when the project is missing", async () => {
    await expect(shopProjectId(profileFile('window.__SHOP_PROFILE__ = { "firebase": {} };'))).rejects.toThrow(/project ID missing/);
    expect(() => parseProfileScript("var x = 1;")).toThrow(/__SHOP_PROFILE__/);
  });

  it("takes the site address from SITE_URL first, then the profile", async () => {
    const file = profileFile('window.__SHOP_PROFILE__ = { "siteUrl": "https://press-two.example/" };');
    expect(await shopSiteUrl(file, {})).toBe("https://press-two.example");
    expect(await shopSiteUrl(file, { SITE_URL: "https://preview.example/shop/" })).toBe("https://preview.example/shop");
  });
});
