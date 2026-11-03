import { afterEach, expect, it } from "vitest";
import { consentAllows, CONSENT_KEY, noteCookieBanner } from "./consent";

const store: Record<string, string> = {};
(globalThis as any).window = { localStorage: { getItem: (k: string) => store[k] ?? null } };
afterEach(() => { delete store[CONSENT_KEY]; noteCookieBanner(null); });

it("runs nothing optional until the shopper says yes to that kind", () => {
  expect(consentAllows("analytics")).toBe(false);
  expect(consentAllows("marketing")).toBe(false);
  store[CONSENT_KEY] = JSON.stringify({ necessary: true, analytics: false, marketing: true });
  expect(consentAllows("analytics")).toBe(false);
  expect(consentAllows("marketing")).toBe(true);
  store[CONSENT_KEY] = "{bad json";
  expect(consentAllows("marketing")).toBe(false);
});

it("a shop with the banner switched off counts undecided shoppers as yes, but never overrides a no", () => {
  noteCookieBanner({ showCookieBanner: false });
  expect(consentAllows("analytics")).toBe(true);
  store[CONSENT_KEY] = JSON.stringify({ necessary: true, analytics: false, marketing: false });
  expect(consentAllows("analytics")).toBe(false);
  noteCookieBanner({ showCookieBanner: true });
  delete store[CONSENT_KEY];
  expect(consentAllows("analytics")).toBe(false);
});
