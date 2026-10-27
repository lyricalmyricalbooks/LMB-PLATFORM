import { describe, expect, it } from "vitest";
import { lastGmailProblem } from "./notificationApi";

describe("Gmail sending warning", () => {
  it("warns only when Gmail refused the newest Gmail attempt", () => {
    expect(lastGmailProblem([{ keySource: "gmail", status: "fallback", error: "535", at: "t" }, { keySource: "gmail", status: "sent" }])).toEqual({ at: "t", error: "535" });
    expect(lastGmailProblem([{ keySource: "settings", status: "sent" }, { keySource: "gmail", status: "sent" }, { keySource: "gmail", status: "fallback" }])).toBeNull();
    expect(lastGmailProblem([])).toBeNull();
  });
});
