import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { POLICY_KEYS } from "../features/site/policyPages";
import { STARTER_POLICY_NOTE, starterFacts, starterPolicy, withStarter } from "./starterPolicies";

const settings = {
  info: { name: "Inkwell Press", email: "hello@inkwell.example" },
  location: { street: "12 Paper Lane", city: "Halifax", state: "Nova Scotia", zip: "B3H 1A1", country: "Canada" },
  design: { copy: { seoReturnDays: "14" } },
};

describe("starter policy wording", () => {
  it("fills every policy with the shop's details and leaves no placeholder", () => {
    const f = starterFacts(settings);
    expect(f).toEqual({ name: "Inkwell Press", address: "12 Paper Lane, Halifax, Nova Scotia B3H 1A1, Canada", email: "hello@inkwell.example", returnDays: 14 });
    for (const k of POLICY_KEYS) {
      const text = starterPolicy(k, f);
      expect(text, k).toMatch(/Inkwell Press/);
      expect(text, k).not.toMatch(/[{}[\]]|undefined|null|NaN|\b(TODO|XXX)\b/);
    }
    expect(starterPolicy("returns", f)).toMatch(/within 14 days of delivery/);
    expect(starterPolicy("privacy", f)).toMatch(/12 Paper Lane/);
  });

  it("says no returns after shipping when the shop has no returns window, and copes with missing details", () => {
    const f = starterFacts({});
    expect(f).toEqual({ name: "", address: "", email: "", returnDays: 0 });
    expect(starterPolicy("returns", f)).toMatch(/Once an order has shipped it can't be returned/);
    for (const k of POLICY_KEYS) expect(starterPolicy(k, f), k).not.toMatch(/[{}[\]]|undefined|null|NaN|\(\)|, ,|\s\./);
    expect(starterFacts({ design: { copy: { seoReturnDays: "nonsense" } } }).returnDays).toBe(0);
  });

  it("never overwrites saved text", () => {
    const f = starterFacts(settings);
    expect(withStarter("Our own words.", "terms", f)).toBe("Our own words.");
    expect(withStarter("  \n", "terms", f)).toBe(starterPolicy("terms", f));
    expect(withStarter(undefined, "shipping", f)).toBe(starterPolicy("shipping", f));
  });

  it("is offered only for an empty policy and marked as not legal advice", () => {
    const src = readFileSync(new URL("./ShopSettings.tsx", import.meta.url), "utf8");
    expect(STARTER_POLICY_NOTE).toBe("A starting point, not legal advice.");
    expect(src).toMatch(/\{!text\.trim\(\) && \([\s\S]{0,800}Start from our wording/);
    expect(src).toMatch(/withStarter\(prev\?\.policies\?\.\[k\]/);
  });
});
