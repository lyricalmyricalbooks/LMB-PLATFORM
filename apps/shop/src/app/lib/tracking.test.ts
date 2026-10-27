import { describe, expect, it } from "vitest";
import { cleanTrackingLink, getTrackingUrl } from "./tracking";

describe("tracking links", () => {
  it("uses the carrier's page for known carriers", () => {
    expect(getTrackingUrl("Canada Post", "123")).toContain("canadapost-postescanada.ca");
    expect(getTrackingUrl("Purolator", "9")).toContain("purolator.com");
    expect(getTrackingUrl("canada_post", "1")).toContain("canadapost-postescanada.ca");
  });
  it("prefers a publisher-entered link, but only a web link", () => {
    expect(getTrackingUrl("Intelcom", "X1", "https://track.example.com/X1")).toBe("https://track.example.com/X1");
    expect(getTrackingUrl("Intelcom", "X1", "javascript:alert(1)")).toContain("google.com/search");
    expect(cleanTrackingLink("not a url")).toBe("");
  });
});
