import { describe, expect, it } from "vitest";
import { draftProblem, isActiveIssue, reachedText } from "./newsletterIssues";

describe("newsletter card words", () => {
  it("counts people plainly", () => {
    expect(reachedText({ status: "sending", sent: 120, audience: 340 })).toBe("120 of 340 people");
    expect(reachedText({ status: "sent", sent: 1, audience: 3 })).toBe("1 person");
    expect(reachedText({ status: "queued", sent: 0, audience: 1 })).toBe("0 of 1 person");
  });
  it("knows which newsletters are still going", () => {
    expect(isActiveIssue({ status: "queued" })).toBe(true);
    expect(isActiveIssue({ status: "sending" })).toBe(true);
    expect(isActiveIssue({ status: "paused" })).toBe(false);
  });
  it("matches the server's draft rules", () => {
    const ok = { subject: "Hi", body: "Hello", buttonText: "", buttonUrl: "" };
    expect(draftProblem(ok)).toBe("");
    expect(draftProblem({ ...ok, subject: " " })).toMatch(/subject/);
    expect(draftProblem({ ...ok, buttonText: "Go" })).toMatch(/web address/);
    expect(draftProblem({ ...ok, buttonText: "Go", buttonUrl: "http://x.example" })).toMatch(/https/);
  });
});
