// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
const { events } = vi.hoisted(() => ({ events: [] as string[] }));
vi.mock("firebase/app", () => ({ initializeApp: () => { events.push("app"); return {}; } }));
vi.mock("firebase/app-check", () => ({
  ReCaptchaEnterpriseProvider: class {}, ReCaptchaV3Provider: class {},
  initializeAppCheck: () => { if (events.includes("check")) throw new Error("duplicate app check"); events.push("check"); return {}; },
}));
vi.mock("firebase/firestore", () => ({ getFirestore: () => { events.push("firestore"); return {}; } }));
vi.mock("firebase/auth", () => ({ getAuth: () => { events.push("auth"); return {}; }, GoogleAuthProvider: class {} }));
afterEach(() => { vi.unstubAllEnvs(); events.length = 0; vi.resetModules(); });
describe("Firebase App Check startup", () => {
  it("initializes exactly one provider before Firebase services even when a legacy key remains in the environment", async () => {
    vi.stubEnv("VITE_APP_CHECK_SITE_KEY", "legacy-key"); vi.stubEnv("VITE_RECAPTCHA_ENTERPRISE_SITE_KEY", "enterprise-key");
    await import("./firebase");
    expect(events).toEqual(["app", "check", "firestore", "auth"]);
  });
  it("off mode disables every provider even when a legacy key remains configured", async () => {
    vi.stubEnv("VITE_APP_CHECK_MODE", "off"); vi.stubEnv("VITE_APP_CHECK_SITE_KEY", "legacy-key"); vi.stubEnv("VITE_RECAPTCHA_ENTERPRISE_SITE_KEY", "enterprise-key");
    await import("./firebase");
    expect(events).toEqual(["app", "firestore", "auth"]);
  });
});
