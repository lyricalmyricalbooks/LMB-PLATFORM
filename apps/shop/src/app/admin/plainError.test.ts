import { describe, expect, it, vi } from "vitest";
import { isPlainSentence, plainError } from "./plainError";

describe("plainError", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  it("keeps the shop's own plain answers", () => {
    expect(plainError(new Error("Gmail refused the app password"), "The test email wasn't sent")).toBe("The test email wasn't sent. Gmail refused the app password.");
  });
  it("swaps provider text for shop words", () => {
    expect(plainError({ code: "permission-denied", message: "Missing or insufficient permissions." }, "Couldn't save")).toMatch(/^Couldn't save\. The shop didn't allow that/);
    expect(plainError(new Error("The email service answered 500. Check that Cloud Functions are deployed."), "The summary wasn't sent")).toBe("The summary wasn't sent. The email service didn't answer. Try again in a few minutes.");
    expect(plainError(new Error("FirebaseError: [code=internal] {x}"), "Couldn't retry this email")).toBe("Couldn't retry this email. Try again in a moment.");
    const net = new TypeError("Failed to fetch");
    expect(plainError(net, "The test email wasn't sent")).toMatch(/connection dropped/);
  });
  it("never shows code-looking text", () => {
    expect(isPlainSentence("undefined is not a function")).toBe(false);
    expect(isPlainSentence("That message no longer exists.")).toBe(true);
  });
});
