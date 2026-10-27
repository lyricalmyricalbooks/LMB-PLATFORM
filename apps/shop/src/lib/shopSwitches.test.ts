// Plan 1.17: one press's one-offs (legacy stockroom sign-in, GitHub Pages forwarding, Gmail receipt finder) are
// switches in the shop profile, off unless the profile turns them on with `true`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SHOP_PROFILE, SHOP_SWITCHES, parseShopProfile, switchOn, type ShopProfile } from "./shopProfile";
import { signIntoLegacyStockroom } from "../app/admin/legacySignIn";
// @ts-expect-error plain JavaScript build script
import { SHOP_SWITCHES as SCRIPT_SWITCHES, switchValue } from "../../scripts/shopProfile.mjs";

const root = join(__dirname, "../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const withSwitches = (switches?: unknown) => ({ ...structuredClone(DEFAULT_SHOP_PROFILE), ...(switches === undefined ? {} : { switches }) });

describe("shop switches", () => {
  it("are all off for the test shop and for a profile that names none", () => {
    for (const name of SHOP_SWITCHES) {
      expect(switchOn(name, DEFAULT_SHOP_PROFILE)).toBe(false);
      expect(switchOn(name, parseShopProfile(withSwitches())!)).toBe(false);
      expect(switchValue(name)).toBe("false");
    }
  });

  it("turn on only with true; other values and unknown names are dropped", () => {
    const parsed = parseShopProfile(withSwitches({ githubPagesForwarding: true, legacyStockroomSignIn: 1, other: true }))!;
    expect(parsed.switches).toEqual({ githubPagesForwarding: true });
    expect(switchOn("githubPagesForwarding", parsed)).toBe(true);
    expect(switchOn("legacyStockroomSignIn", parsed)).toBe(false);
    expect(parseShopProfile(withSwitches("on"))!.switches).toBeUndefined();
    expect(switchValue("githubPagesForwarding", withSwitches({ githubPagesForwarding: true }))).toBe("true");
    expect(() => switchValue("other")).toThrow(/not a shop switch/);
  });

  it("the build scripts know the same switches", () => {
    expect(SCRIPT_SWITCHES).toEqual([...SHOP_SWITCHES]);
  });
});

describe("legacy stockroom sign-in", () => {
  const credential = { providerId: "google.com" } as never;

  it("is never attempted, nor its code downloaded, when off", async () => {
    const load = vi.fn(), signIn = vi.fn();
    expect(await signIntoLegacyStockroom(credential, false, load, signIn)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in with the same credential when on, and a failure never blocks the admin sign-in", async () => {
    const legacyAuth = {};
    const signIn = vi.fn().mockResolvedValue({});
    expect(await signIntoLegacyStockroom(credential, true, async () => ({ legacyAuth }) as never, signIn)).toBe(true);
    expect(signIn).toHaveBeenCalledWith(legacyAuth, credential);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(signIntoLegacyStockroom(credential, true, async () => { throw new Error("offline"); }, signIn)).resolves.toBe(true);
    warn.mockRestore();
  });

  it("follows the profile's switch at sign-in", () => {
    expect(read("src/app/admin/legacySignIn.ts")).toContain('on: boolean = switchOn("legacyStockroomSignIn")');
    const api = read("src/app/admin/api.ts");
    expect(api).toContain("await signIntoLegacyStockroom(GoogleAuthProvider.credentialFromResult(result));");
    expect(api).not.toContain("legacyFirebase");
  });
});

describe("GitHub Pages forwarding", () => {
  it("the shop takes a handed-over bag only when the switch is on", () => {
    expect(read("src/main.tsx")).toContain('if (switchOn("githubPagesForwarding")) takeMovedState();');
  });

  it("the deploy publishes forwarding pages only when the switch is on", () => {
    const workflow = read(".github/workflows/deploy-pages.yml");
    expect(workflow).toContain('forward="$(node scripts/shopProfile.mjs switch githubPagesForwarding)"');
    expect(workflow).toContain("forward-old-address: ${{ steps.address.outputs.forward-old-address }}");
    expect(workflow).toMatch(/redirect-old-address:\n {4}needs: \[build-hosting, deploy-hosting\]\n {4}if: [^\n]*needs\.build-hosting\.outputs\.forward-old-address == 'true'/);
  });
});

// A profile that turns a switch on is still the same shop: nothing else in it changes.
it("switches never change the rest of the profile", () => {
  const parsed = parseShopProfile(withSwitches({ gmailReceiptFinder: true })) as ShopProfile;
  const { switches: _switches, ...rest } = parsed;
  expect(rest).toEqual(DEFAULT_SHOP_PROFILE);
});
