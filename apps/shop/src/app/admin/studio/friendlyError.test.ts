import { afterEach, describe, expect, it, vi } from "vitest";
import { friendlyError, friendlyReason, isPlainMessage } from "./friendlyError";

afterEach(() => vi.restoreAllMocks());

describe("friendlyError", () => {
  it("maps provider codes to plain sentences and still says it failed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyError({ code: "permission-denied", message: "Missing or insufficient permissions." }, "save the draft")).toMatch(/^Couldn't save the draft\. The shop didn't allow that/);
    expect(friendlyError({ code: "unavailable" }, "publish")).toMatch(/connection dropped/);
    expect(friendlyError({ code: "deadline-exceeded" }, "publish")).toMatch(/too long/);
    expect(friendlyError({ code: "resource-exhausted" }, "publish")).toMatch(/limit/);
    expect(friendlyError({ code: "not-found" }, "save the page")).toMatch(/no longer exists/);
    expect(friendlyReason(new Error("Failed to fetch"))).toMatch(/connection dropped/);
  });
  it("adds 'Your changes are still here.' only when asked", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyError({ code: "unavailable" }, "save the draft", { keepsChanges: true })).toMatch(/ Your changes are still here\.$/);
    expect(friendlyError({ code: "unavailable" }, "cancel the schedule")).not.toMatch(/still here/);
  });
  it("logs the raw error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new Error("boom");
    friendlyError(raw, "save the draft");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("save the draft"), raw);
  });
  it("keeps a short plain-English server message, hides technical ones", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyError(new Error("That address is already used by another page"), "save the page")).toBe("Couldn't save the page. That address is already used by another page.");
    const hidden = friendlyError(new Error("FirebaseError: 7 PERMISSION_DENIED at foo.js:12"), "save the page");
    expect(hidden).not.toMatch(/Firebase|foo\.js/);
    expect(hidden).toMatch(/^Couldn't save the page\./);
    expect(friendlyError(undefined, "save the page")).toMatch(/Something went wrong/);
  });
  it("isPlainMessage rejects empty, long and code-like text", () => {
    expect(isPlainMessage("")).toBe(false);
    expect(isPlainMessage("x".repeat(200))).toBe(false);
    expect(isPlainMessage("auth/invalid-token")).toBe(false);
    expect(isPlainMessage("Write the page title first")).toBe(true);
  });
});
