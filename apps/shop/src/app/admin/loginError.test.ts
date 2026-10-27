import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "./loginError";

describe("loginErrorMessage", () => {
  it("never shows Firebase's own wording", () => {
    for (const code of ["auth/popup-closed-by-user", "auth/popup-blocked", "auth/network-request-failed", "auth/internal-error", ""]) {
      const text = loginErrorMessage({ code, message: `Firebase: Error (${code}).` });
      expect(text).not.toMatch(/Firebase|auth\//);
      expect(text.length).toBeGreaterThan(10);
    }
  });
  it("says what to do for the common cases", () => {
    expect(loginErrorMessage({ code: "auth/popup-blocked" })).toMatch(/Allow pop-ups/);
    expect(loginErrorMessage({ code: "auth/popup-closed-by-user" })).toMatch(/try again/);
    expect(loginErrorMessage(new Error("Unauthorized: Access restricted to lyricalmyricalbooks@gmail.com"))).toMatch(/shop's own Google account/);
    expect(loginErrorMessage(undefined)).toBe("Couldn't sign in. Please try again in a moment.");
  });
});
