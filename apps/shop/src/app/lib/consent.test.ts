import { afterEach, expect, it } from "vitest";
import { consentAllows, CONSENT_KEY } from "./consent";

const store: Record<string, string> = {};
(globalThis as any).window = { localStorage: { getItem: (k: string) => store[k] ?? null } };
afterEach(() => { delete store[CONSENT_KEY]; });

it("respects an explicit decline and leaves undecided shoppers unchanged", () => {
  expect(consentAllows("analytics")).toBe(true);
  store[CONSENT_KEY] = JSON.stringify({ necessary: true, analytics: false, marketing: true });
  expect(consentAllows("analytics")).toBe(false);
  expect(consentAllows("marketing")).toBe(true);
  store[CONSENT_KEY] = "{bad json";
  expect(consentAllows("marketing")).toBe(true);
});
