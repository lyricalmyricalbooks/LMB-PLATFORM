// The shop and the stockroom read the same /shop-profile.js, whose format's master copy is the platform's
// profile/shop-profile.schema.json. This keeps the shop's reader in step with it (the stockroom has the same check).
import { describe, expect, it } from "vitest";
import schema from "../../../../profile/shop-profile.schema.json";
import example from "../../../../profile/examples/test-shop.json";
// @ts-expect-error plain JavaScript module from the platform folder
import { profileProblems } from "../../../../profile/profile.js";
import served from "../../public/shop-profile.js?raw";
import { DEFAULT_SHOP_PROFILE, parseShopProfile } from "./shopProfile";

const without = (value: Record<string, any>, path: string[]) => {
  const copy = structuredClone(value);
  let at = copy;
  for (const key of path.slice(0, -1)) at = at[key];
  delete at[path[path.length - 1]];
  return copy;
};

describe("the shop reads the platform's profile format", () => {
  it("accepts the platform's example as it is", () => {
    expect(parseShopProfile(example)).toEqual(example);
  });

  it("its built-in profile and the file it serves are valid to the platform", () => {
    expect(profileProblems(DEFAULT_SHOP_PROFILE)).toEqual([]);
    const window: { __SHOP_PROFILE__?: unknown } = {};
    new Function("window", served)(window);
    expect(profileProblems(window.__SHOP_PROFILE__)).toEqual([]);
  });

  it("refuses a profile missing anything the platform requires", () => {
    const required = [
      ...schema.required.map((key: string) => [key]),
      ...schema.properties.firebase.required.map((key: string) => ["firebase", key]),
      ...schema.properties.apps.required.map((key: string) => ["apps", key]),
    ];
    for (const path of required) expect(parseShopProfile(without(example, path)), path.join(".")).toBeNull();
  });

  it("everything it reads back is part of the platform's format", () => {
    const parsed = parseShopProfile({ ...example, appCheckSiteKey: "site-key" });
    expect(profileProblems(parsed)).toEqual([]);
  });
});
