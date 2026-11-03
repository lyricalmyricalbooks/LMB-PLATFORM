// Two-step sign-in's steps and words (plan 22.6), with the Firebase calls pretended: a sign-in that asks for a code
// becomes the code step, the code is cleaned before it's sent, the setup key reads in groups, and every answer has words.
import { describe, expect, it, vi } from "vitest";
import { TwoStepNeeded, WRONG_CODE, cleanCode, codeLooksRight, finishTwoStep, startSetup, twoStepNeeded, twoStepWords, type TwoStepAuth } from "./adminTwoStep";

function pretend(hints: Array<{ uid: string; factorId: string }>) {
  const resolver = { hints } as any;
  const two: TwoStepAuth = {
    resolverOf: vi.fn(() => resolver),
    googleCredentialOf: vi.fn(() => ({ providerId: "google.com" }) as any),
    signInWithCode: vi.fn(async () => ({ user: { uid: "u1" } }) as any),
    newSecret: vi.fn(async () => ({ secretKey: "JBSWY3DPEHPK3PXPJBSWY3DP", generateQrCodeUrl: (who: string, issuer: string) => `otpauth://totp/${issuer}:${who}?secret=x` }) as any),
    enroll: vi.fn(async () => {}),
    unenroll: vi.fn(async () => {}),
    factors: vi.fn(() => []),
  };
  return { two, resolver };
}

describe("two-step sign-in", () => {
  it("a sign-in that asks for the code becomes the code step; anything else stays as it was", () => {
    const { two, resolver } = pretend([{ uid: "f1", factorId: "totp" }]);
    const pending = twoStepNeeded(two, { code: "auth/multi-factor-auth-required" });
    expect(pending).toBeInstanceOf(TwoStepNeeded);
    expect(pending!.resolver).toBe(resolver);
    expect(pending!.hintUid).toBe("f1");
    expect(pending!.googleCredential).toEqual({ providerId: "google.com" });
    expect(twoStepNeeded(two, { code: "auth/popup-closed-by-user" })).toBeNull();
    expect(twoStepNeeded(two, null)).toBeNull();
    // A text-message second step only (not offered here) is left to the usual words.
    expect(twoStepNeeded(pretend([{ uid: "p1", factorId: "phone" }]).two, { code: "auth/multi-factor-auth-required" })).toBeNull();
  });

  it("sends only the digits of the code", async () => {
    const { two } = pretend([{ uid: "f1", factorId: "totp" }]);
    const pending = twoStepNeeded(two, { code: "auth/multi-factor-auth-required" })!;
    await finishTwoStep(two, pending, " 123 456 ");
    expect(two.signInWithCode).toHaveBeenCalledWith(pending.resolver, "f1", "123456");
    expect(cleanCode("12-34-56")).toBe("123456");
    expect(codeLooksRight("123 456")).toBe(true);
    expect(codeLooksRight("12345")).toBe(false);
  });

  it("the setup key reads in groups of four, and the app is named after the shop", async () => {
    const { two } = pretend([]);
    const setup = await startSetup(two, { email: "owner@example.com" } as any, "Moth Press");
    expect(setup.key).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP");
    expect(setup.link).toBe("otpauth://totp/Moth Press:owner@example.com?secret=x");
    expect((await startSetup(two, { email: null } as any, "")).link).toContain("Shop admin");
  });

  it("every answer has plain words", () => {
    expect(twoStepWords({ code: "auth/invalid-verification-code" })).toBe(WRONG_CODE);
    expect(twoStepWords({ code: "auth/requires-recent-login" })).toMatch(/sign out and sign in again/);
    expect(twoStepWords({ code: "auth/operation-not-allowed" })).toMatch(/aren't switched on for this shop yet/);
    expect(twoStepWords({ code: "auth/totp-challenge-timeout" })).toMatch(/took too long/);
    expect(twoStepWords({ code: "auth/something-new" })).toMatch(/Try again in a moment/);
    for (const code of ["auth/invalid-verification-code", "auth/requires-recent-login", "auth/operation-not-allowed", "auth/too-many-requests"]) {
      expect(twoStepWords({ code })).not.toMatch(/auth\/|firebase|mfa|totp/i);
    }
  });
});
