import { describe, expect, it } from "vitest";
import { cleanRegion, provinceFromPostal } from "./postalRegion";

describe("provinceFromPostal", () => {
  it("reads Canadian provinces", () => {
    expect(provinceFromPostal("Canada", "M6G3H1")).toBe("ON");
    expect(provinceFromPostal("Canada", "v6b 1a1")).toBe("BC");
    expect(provinceFromPostal("Canada", "H2X 1Y4")).toBe("QC");
    expect(provinceFromPostal("Canada", "X0A 0H0")).toBe("NU");
  });
  it("reads US states", () => {
    expect(provinceFromPostal("United States", "10001")).toBe("NY");
    expect(provinceFromPostal("United States", "94105")).toBe("CA");
    expect(provinceFromPostal("United States", "abc")).toBe("");
  });
  it("ignores other countries", () => expect(provinceFromPostal("France", "75001")).toBe(""));
  it("clears placeholders", () => {
    expect(cleanRegion("Please select")).toBe("");
    expect(cleanRegion(" ON ")).toBe("ON");
  });
});

describe("regionsFor", () => {
  it("lists every code provinceFromPostal can return", async () => {
    const { regionsFor } = await import("./postalRegion");
    const ca = regionsFor("Canada")!.map(r => r[0]);
    for (const code of ["M6G3H1", "V6B1A1", "X0A0H0", "X1A0A1", "A1A1A1"]) expect(ca).toContain(provinceFromPostal("Canada", code));
    expect(regionsFor("France")).toBeNull();
  });
});

describe("#78 ZIP 201 is Virginia, not DC", () => {
  it("fills Northern Virginia ZIPs with VA and keeps DC's own ranges", () => {
    for (const zip of ["20147", "20166", "20190", "20101"]) expect(provinceFromPostal("United States", zip)).toBe("VA");
    for (const zip of ["20001", "20500", "20005"]) expect(provinceFromPostal("United States", zip)).toBe("DC");
    expect(provinceFromPostal("United States", "20601")).toBe("MD");
  });
});
