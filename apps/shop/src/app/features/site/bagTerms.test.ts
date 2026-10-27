import { describe, expect, it } from "vitest";
import { hasTermsPage, rememberTermsAgreed, splitTermsLabel, termsAgreed } from "./bagTerms";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

describe("bag terms checkbox", () => {
  it("remembers the tick for the tab and forgets it when unticked", () => {
    const store = memory();
    expect(termsAgreed(store)).toBe(false);
    rememberTermsAgreed(true, store);
    expect(termsAgreed(store)).toBe(true);
    rememberTermsAgreed(false, store);
    expect(termsAgreed(store)).toBe(false);
  });

  it("survives blocked storage", () => {
    const blocked = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } };
    expect(termsAgreed(blocked)).toBe(false);
    expect(rememberTermsAgreed(true, blocked)).toBe(true);
  });

  it("links the terms only when the shop has written them", () => {
    expect(hasTermsPage({ terms: "Our terms" })).toBe(true);
    expect(hasTermsPage({ terms: "  " })).toBe(false);
    expect(hasTermsPage(undefined)).toBe(false);
  });

  it("splits the sentence around {terms}", () => {
    expect(splitTermsLabel("I agree to the {terms}.")).toEqual(["I agree to the ", "."]);
    expect(splitTermsLabel("I agree")).toEqual(["I agree ", ""]);
  });
});
