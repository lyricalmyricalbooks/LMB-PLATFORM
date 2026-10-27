import { describe, expect, it } from "vitest";
import { acquisitionRows, deviceFromUserAgent, sourceSummary } from "./orderAcquisition";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe("How they found you", () => {
  it("lists the recorded source, campaign, pages and device", () => {
    const rows = acquisitionRows({
      acquisition: JSON.stringify({ source: "instagram", medium: "social", campaign: "fall", referrer: "l.instagram.com", landingPage: "/books/x", clickId: "fbclid", firstSeenAt: "2026-10-17T20:00:00.000Z" }),
      metadata: { userAgent: IPHONE },
    });
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]));
    expect(byLabel["Came from"]).toBe("Instagram (social media)");
    expect(byLabel.Campaign).toBe("fall");
    expect(byLabel["Ad click"]).toBe("Yes, from Facebook or Instagram");
    expect(byLabel["First page seen"]).toBe("/books/x");
    expect(byLabel.Device).toBe("Phone · iPhone");
  });

  it("falls back to the site name older orders saved, and says so", () => {
    const rows = acquisitionRows({ referralSource: "google" });
    expect(rows[0]).toEqual({ label: "Came from", value: "Google" });
    expect(rows.some(r => r.label === "Note")).toBe(true);
    expect(sourceSummary({ referralSource: "direct" })).toBe("Direct visit");
    expect(acquisitionRows({})).toEqual([]);
  });

  it("names devices", () => {
    expect(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe("Computer · Windows");
    expect(deviceFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari")).toBe("Phone · Android");
    expect(deviceFromUserAgent(undefined)).toBe("");
  });
});
