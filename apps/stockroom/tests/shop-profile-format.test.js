// @vitest-environment node
// The stockroom and the shop read the same /shop-profile.js, whose format's master copy is the platform's
// profile/shop-profile.schema.json. This keeps the stockroom's reader in step with it (the shop has the same check).
import { describe, it, expect } from 'vitest';
import vm from 'vm';
import schema from '../../../profile/shop-profile.schema.json';
import example from '../../../profile/examples/test-shop.json';
import { profileProblems } from '../../../profile/profile.js';
import served from '../public/shop-profile.js?raw';
import { DEFAULT_SHOP_PROFILE, parseShopProfile } from '../src/lib/shop-profile.js';

const without = (value, path) => {
  const copy = structuredClone(value);
  let at = copy;
  for (const key of path.slice(0, -1)) at = at[key];
  delete at[path[path.length - 1]];
  return copy;
};

describe("the stockroom reads the platform's profile format", () => {
  it("accepts the platform's example, adding only the default database address", () => {
    const parsed = parseShopProfile(example);
    expect(parsed).toEqual({
      ...example,
      firebase: { ...example.firebase, databaseURL: `https://${example.firebase.projectId}-default-rtdb.firebaseio.com` },
    });
  });

  it('its built-in profile and the file it serves are valid to the platform', () => {
    expect(profileProblems(DEFAULT_SHOP_PROFILE)).toEqual([]);
    const sandbox = { window: {} };
    vm.runInNewContext(served, sandbox);
    expect(profileProblems(sandbox.window.__SHOP_PROFILE__)).toEqual([]);
  });

  it('refuses a profile missing anything the platform requires', () => {
    const required = [
      ...schema.required.map((key) => [key]),
      ...schema.properties.firebase.required.map((key) => ['firebase', key]),
      ...schema.properties.apps.required.map((key) => ['apps', key]),
    ];
    for (const path of required) expect(parseShopProfile(without(example, path)), path.join('.')).toBeNull();
  });

  it("everything it reads back is part of the platform's format", () => {
    expect(profileProblems(parseShopProfile(example))).toEqual([]);
  });
});
