import { describe, expect, it } from "vitest";
import { loginWords } from "./loginWords";

describe("the sign-in screen's words", () => {
  it("keeps a books shop, and a shop with no answer, as a publishing house", () => {
    for (const sells of ["books", "zines", null, undefined, "something-new"]) {
      expect(loginWords(sells)).toEqual({ sub: "Publishing House · Admin", lede: "Sign in with the shop's Google account to manage books, orders and settings." });
    }
  });
  it("never calls a shop of other things a publishing house", () => {
    for (const sells of ["clothing", "other", "prints", "mixed"]) {
      const words = loginWords(sells);
      expect(words.sub).toBe("Shop · Admin");
      expect(words.lede).toBe("Sign in with the shop's Google account to manage products, orders and settings.");
    }
  });
});
