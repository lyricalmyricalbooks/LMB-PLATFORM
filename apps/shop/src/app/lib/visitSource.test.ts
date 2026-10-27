import { createRequire } from "module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACQUISITION_JSON_MAX, ACQUISITION_KEYS, ACQUISITION_MAX, cleanAcquisition, encodeAcquisition, nextVisitSource, visitSourceFrom } from "./visitSource";

const server = createRequire(import.meta.url)("../../../functions/acquisition.js");
const SHOP = "https://lmb-test-shop.web.app";
const NOW = new Date("2026-10-18T12:00:00.000Z");

describe("visitSourceFrom", () => {
  it("reads utm tags and keeps only the landing page's path", () => {
    const a = visitSourceFrom(`${SHOP}/books/x?utm_source=Instagram&utm_medium=social&utm_campaign=Fall%20launch&key=secret&email=a@b.co`, "https://l.instagram.com/", NOW);
    expect(a).toEqual({ source: "instagram", medium: "social", campaign: "Fall launch", referrer: "l.instagram.com", landingPage: "/books/x", firstSeenAt: NOW.toISOString() });
    expect(JSON.stringify(a)).not.toMatch(/secret|a@b/);
  });

  it("names search, social and other sites from the referrer, without its query string", () => {
    expect(visitSourceFrom(`${SHOP}/`, "https://www.google.com/", NOW)).toMatchObject({ source: "google", medium: "organic", referrer: "www.google.com" });
    expect(visitSourceFrom(`${SHOP}/`, "https://m.facebook.com/story.php?id=9", NOW)).toMatchObject({ source: "facebook", medium: "social", referrer: "m.facebook.com/story.php" });
    expect(visitSourceFrom(`${SHOP}/page/about`, "https://someblog.ca/post/books", NOW)).toMatchObject({ source: "someblog.ca", medium: "referral", landingPage: "/page/about" });
  });

  it("recognises ad clicks without utm tags", () => {
    expect(visitSourceFrom(`${SHOP}/?gclid=abc`, "", NOW)).toMatchObject({ source: "google", medium: "cpc", clickId: "gclid" });
    expect(visitSourceFrom(`${SHOP}/?fbclid=abc`, "https://l.instagram.com/", NOW)).toMatchObject({ source: "instagram", clickId: "fbclid" });
  });

  it("is direct with no referrer, and says nothing for the shop's own pages", () => {
    expect(visitSourceFrom(`${SHOP}/`, "", NOW)).toEqual({ source: "direct", medium: "(none)", landingPage: "/", firstSeenAt: NOW.toISOString() });
    expect(visitSourceFrom(`${SHOP}/checkout`, `${SHOP}/books/x`, NOW)).toBeNull();
  });

  it("uses ?ref= tags", () => {
    expect(visitSourceFrom(`${SHOP}/?ref=Newsletter`, "", NOW)).toMatchObject({ source: "newsletter", medium: "referral" });
  });

  it("caps every value", () => {
    const a = visitSourceFrom(`${SHOP}/?utm_source=${"x".repeat(500)}&utm_campaign=${"y".repeat(500)}`, "", NOW)!;
    for (const v of Object.values(a)) expect(v.length).toBeLessThanOrEqual(ACQUISITION_MAX);
  });
});

describe("nextVisitSource", () => {
  const insta = visitSourceFrom(`${SHOP}/`, "https://instagram.com/", NOW)!;
  const direct = visitSourceFrom(`${SHOP}/`, "", NOW)!;
  const later = new Date("2026-10-25T12:00:00.000Z");
  it("keeps the last non-direct source when the shopper comes back directly", () => {
    expect(nextVisitSource(insta, direct, later)).toBe(insta);
    expect(nextVisitSource(insta, null, later)).toBe(insta);
  });
  it("lets a new tagged visit replace it, and forgets it after 30 days", () => {
    const google = visitSourceFrom(`${SHOP}/`, "https://google.com/", later)!;
    expect(nextVisitSource(insta, google, later)).toBe(google);
    expect(nextVisitSource(insta, direct, new Date("2026-12-01T00:00:00.000Z"))).toBe(direct);
    expect(nextVisitSource(null, direct, NOW)).toBe(direct);
  });
});

describe("one shape everywhere", () => {
  it("browser, server and rules agree on the keys and limits", () => {
    expect(server.ACQUISITION_KEYS).toEqual([...ACQUISITION_KEYS]);
    expect(server.ACQUISITION_MAX).toBe(ACQUISITION_MAX);
    expect(server.ACQUISITION_JSON_MAX).toBe(ACQUISITION_JSON_MAX);
    const rules = readFileSync(join(__dirname, "..", "..", "..", "firestore.rules"), "utf8");
    expect(rules).toContain(`request.resource.data.acquisition.size() <= ${ACQUISITION_JSON_MAX}`);
  });

  it("encodes to a JSON string that always fits, the same way on both sides", () => {
    const huge = Object.fromEntries(ACQUISITION_KEYS.map(k => [k, "\"".repeat(400)]));
    const text = encodeAcquisition(huge)!;
    expect(text.length).toBeLessThanOrEqual(ACQUISITION_JSON_MAX);
    expect(server.encodeAcquisition(huge)).toBe(text);
    const small = { source: "google", medium: "organic", firstSeenAt: NOW.toISOString() };
    expect(JSON.parse(encodeAcquisition(small)!)).toEqual(small);
    expect(cleanAcquisition(encodeAcquisition(small))).toEqual(small);
    expect(encodeAcquisition({ medium: "x" })).toBeNull();
    expect(cleanAcquisition("not json")).toBeNull();
  });

  it("server and browser clean the same way", () => {
    const raw = { source: " google ", medium: 5, junk: "x", campaign: "c".repeat(400), referrer: "a\nb" };
    expect(server.cleanAcquisition(raw)).toEqual(cleanAcquisition(raw));
    expect(server.cleanAcquisition({ medium: "cpc" })).toBeNull();
    expect(cleanAcquisition("instagram")).toBeNull();
  });
});
