import { describe, expect, it } from "vitest";
import { cleanTaxRate, taxRateProblem } from "./taxRatesEdit";

describe("tax rate editing", () => {
  it("accepts 0–100 numbers only", () => {
    expect(taxRateProblem({ country: "Canada", region: "Ontario", rate: "13" }, [])).toBe("");
    expect(taxRateProblem({ country: "Canada", rate: "0" }, [])).toBe("");
    expect(taxRateProblem({ country: "Canada", rate: "130" }, [])).toMatch(/between 0 and 100/);
    expect(taxRateProblem({ country: "Canada", rate: "13%" }, [])).toMatch(/number/);
    expect(taxRateProblem({ country: "Canada", rate: "-1" }, [])).toMatch(/number/);
    expect(taxRateProblem({ country: "", rate: "5" }, [])).toMatch(/country/);
  });

  it("refuses a duplicate place", () => {
    expect(taxRateProblem({ country: "canada", region: "ontario", rate: "13" }, [{ country: "Canada", region: "Ontario", rate: "13" }])).toMatch(/already/);
  });

  it("keeps the stored shape (rate as text)", () => {
    expect(cleanTaxRate({ country: " Canada ", region: " Ontario", rate: "13.0" })).toEqual({ country: "Canada", region: "Ontario", rate: "13" });
  });
});

describe("rates limited to a kind of product (plan 12.2)", () => {
  const on: any = { country: "Canada", region: "Ontario", rate: "13" };
  it("allows a clothing rate beside the place's general rate, once", () => {
    expect(taxRateProblem({ country: "Canada", region: "Ontario", rate: "0", kind: "clothing" }, [on])).toBe("");
    const clothing = cleanTaxRate({ country: "Canada", region: "Ontario", rate: "0", kind: "clothing" });
    expect(clothing.kinds).toEqual(["clothing"]);
    expect(taxRateProblem({ country: "Canada", region: "Ontario", rate: "0", kind: "clothing" }, [on, clothing])).toMatch(/kind of product/);
  });
  it("still refuses a second general rate for a place and stores no kinds without one", () => {
    expect(taxRateProblem({ country: "Canada", region: "Ontario", rate: "5" }, [on])).toMatch(/already a rate/);
    expect(cleanTaxRate({ country: "Canada", region: "Ontario", rate: "13" })).not.toHaveProperty("kinds");
  });
});
