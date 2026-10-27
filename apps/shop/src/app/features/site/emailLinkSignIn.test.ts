import { describe, expect, it, vi } from "vitest";
import { finishEmailLinkSignIn } from "./emailLinkSignIn";

describe("email-link sign-in retry", () => {
  it("forgets a stale saved address and keeps asking when sign-in fails", async () => {
    const forgetSavedEmail = vi.fn();
    const r = await finishEmailLinkSignIn(" wrong@example.com ", { signIn: async () => { throw new Error("auth/invalid-email"); }, forgetSavedEmail });
    expect(r).toMatchObject({ ok: false, keepAsking: true });
    expect(forgetSavedEmail).toHaveBeenCalledTimes(1);
  });
  it("signs in with the trimmed address and clears it on success", async () => {
    const signIn = vi.fn(async () => ({}));
    const forgetSavedEmail = vi.fn();
    expect(await finishEmailLinkSignIn(" a@b.co ", { signIn, forgetSavedEmail })).toEqual({ ok: true });
    expect(signIn).toHaveBeenCalledWith("a@b.co");
    expect(forgetSavedEmail).toHaveBeenCalled();
  });
});
