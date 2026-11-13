import { describe, expect, it } from "vitest";
import { linkPrefill, prefillChanged } from "./linkPrefill";

describe("telling the card form who is paying (Link)", () => {
  it("waits for a complete email and passes the name when there is one", () => {
    expect(linkPrefill("robin@")).toBeNull();
    expect(linkPrefill("")).toBeNull();
    expect(linkPrefill(" robin@example.com ")).toEqual({ billingDetails: { email: "robin@example.com" } });
    expect(linkPrefill("robin@example.com", " Robin Reader ")).toEqual({ billingDetails: { email: "robin@example.com", name: "Robin Reader" } });
  });

  it("only updates the form when the email or name changed", () => {
    const a = linkPrefill("robin@example.com", "Robin");
    expect(prefillChanged(null, a)).toBe(true);
    expect(prefillChanged(a, linkPrefill("robin@example.com", "Robin"))).toBe(false);
    expect(prefillChanged(a, linkPrefill("robin@example.com", "Robin R"))).toBe(true);
    expect(prefillChanged(a, linkPrefill("sam@example.com", "Robin"))).toBe(true);
    expect(prefillChanged(a, null)).toBe(false);
  });
});
