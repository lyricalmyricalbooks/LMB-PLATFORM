import { describe, expect, it } from "vitest";
import { pdpPolicyEntries } from "./pdpPolicyTab";

const printed = { id: "b", format: "Paperback" };

describe("pdpPolicyEntries", () => {
  it("lists the shipping then returns policy for a printed book", () => {
    expect(pdpPolicyEntries({ shipping: " Ships in 3 days ", returns: "30 days" }, printed).map((e) => e.key)).toEqual(["shipping", "returns"]);
    expect(pdpPolicyEntries({ shipping: " Ships in 3 days " }, printed)[0].text).toBe("Ships in 3 days");
  });
  it("leaves out empty policies and gives nothing when none are written", () => {
    expect(pdpPolicyEntries({ shipping: "  ", returns: "30 days" }, printed).map((e) => e.key)).toEqual(["returns"]);
    expect(pdpPolicyEntries({}, printed)).toEqual([]);
    expect(pdpPolicyEntries(undefined, printed)).toEqual([]);
    expect(pdpPolicyEntries({ shipping: "x" }, null)).toEqual([]);
  });
  it("never shows the shipping policy for an e-book", () => {
    expect(pdpPolicyEntries({ shipping: "Ships", returns: "30 days" }, { id: "e", format: "E-book" }).map((e) => e.key)).toEqual(["returns"]);
  });
});
