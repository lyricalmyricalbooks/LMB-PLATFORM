import { describe, expect, it } from "vitest";
import { cardHoverPhoto } from "./cardHoverPhoto";

describe("cardHoverPhoto", () => {
  it("takes the next plain photo after the cover", () => {
    const second = { url: "https://x/2.jpg" };
    expect(cardHoverPhoto({ photos: [{ url: "https://x/1.jpg" }, second] })).toBe(second);
  });
  it("is null with one photo, none or no usable second photo", () => {
    expect(cardHoverPhoto({ photos: [{ url: "https://x/1.jpg" }] })).toBeNull();
    expect(cardHoverPhoto({})).toBeNull();
    expect(cardHoverPhoto(null)).toBeNull();
    expect(cardHoverPhoto({ photos: [{ url: "https://x/1.jpg" }, { url: "" }, { url: "javascript:alert(1)" }] })).toBeNull();
  });
  it("skips videos (their still frame would read as a broken player)", () => {
    const still = { url: "https://x/3.jpg" };
    expect(cardHoverPhoto({ photos: [{ url: "https://x/1.jpg" }, { url: "https://x/poster.jpg", videoUrl: "https://x/v.mp4" }, still] })).toBe(still);
  });
});
