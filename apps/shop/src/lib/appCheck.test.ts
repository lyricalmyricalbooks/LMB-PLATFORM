// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeBrowserAppCheck } from "./appCheck";
const { configs } = vi.hoisted(() => ({ configs: [] as any[] }));
vi.mock("firebase/app-check", () => ({
  ReCaptchaEnterpriseProvider: class { constructor(public key: string) {} },
  initializeAppCheck: (_app: unknown, options: unknown) => { configs.push(options); return { initialized: true }; },
}));
afterEach(() => { configs.length = 0; delete (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN; });
describe("reCAPTCHA Enterprise initialization", () => {
  it("keeps an unconfigured rollout usable", () => {
    expect(initializeBrowserAppCheck({} as any, { VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "" } as any)).toBeNull();
    expect(configs).toEqual([]);
  });
  it("uses the registered key with automatic token refresh", () => {
    expect(initializeBrowserAppCheck({} as any, { VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: " registered-key " } as any)).toEqual({ initialized: true });
    expect(configs).toEqual([{ provider: { key: "registered-key" }, isTokenAutoRefreshEnabled: true }]);
  });
  it("prefers the shop profile's key over the build setting", () => {
    initializeBrowserAppCheck({} as any, { VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "build-key" } as any, " shop-key ");
    initializeBrowserAppCheck({} as any, { VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "build-key" } as any, "");
    expect(configs.map(config => config.provider.key)).toEqual(["shop-key", "build-key"]);
  });
  it("does not activate a debug credential in production", () => {
    initializeBrowserAppCheck({} as any, { VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "key", VITE_APP_CHECK_DEBUG_TOKEN: "private-debug-token", DEV: false } as any);
    expect((self as any).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });
  it("can explicitly disable initialization for rollback", () => {
    expect(initializeBrowserAppCheck({} as any, { VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "key", VITE_APP_CHECK_MODE: "off" } as any)).toBeNull();
    expect(configs).toEqual([]);
  });
});
