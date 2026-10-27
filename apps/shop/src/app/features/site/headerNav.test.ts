import { describe, expect, it } from "vitest";
import { fitScale, naturalNavWidth, navNeedsOwnRow } from "./headerNav";

describe("navNeedsOwnRow", () => {
  it("keeps a comfortable buffer when the header fits inline", () => {
    expect(navNeedsOwnRow(400, 300, 900)).toBe(false);
  });

  it("moves the navigation below before it can collide with fixed controls", () => {
    expect(navNeedsOwnRow(520, 430, 1000)).toBe(true);
  });

  it("treats an exact fit including the buffer as inline", () => {
    expect(navNeedsOwnRow(404, 300, 800)).toBe(false);
  });
});

describe("naturalNavWidth (shrink-to-fit category bar)", () => {
  it("measures the links, not the bar's full-row box, so room to spare means no shrink", () => {
    // A 1012px row holding 250px of links: measuring the box asked for 0.99, then 0.98, then 0.97…
    expect(fitScale(naturalNavWidth(1012, 250, 1), 1010)).toBe(1);
    expect(fitScale(naturalNavWidth(1012, 240, 0.96), 1010)).toBe(1);
  });

  it("still shrinks links that really overflow, and stays put once shrunk", () => {
    const fit = fitScale(naturalNavWidth(1012, 1200, 1), 1010);
    expect(fit).toBeLessThan(1);
    expect(fitScale(naturalNavWidth(1012, 1200 * fit, fit), 1010)).toBe(fit);
  });

  it("falls back to the box width when there are no links to measure", () => {
    expect(naturalNavWidth(300, 0, 0.5)).toBe(600);
  });
});

describe("navLinkStyle link case", () => {
  it("uses uppercase only when unset; Inherit (\"\") leaves the case alone", async () => {
    const { navLinkStyle } = await import("./headerNav");
    expect(navLinkStyle({}, false, "#fff").textTransform).toBe("uppercase");
    expect(navLinkStyle({ navLinkTransform: "" }, false, "#fff").textTransform).toBe("");
    expect(navLinkStyle({ navLinkTransform: "none" }, false, "#fff").textTransform).toBe("none");
  });
});

describe("content width bounds", () => {
  it("follows the Studio slider's whole range (800–2560px)", async () => {
    const { contentMaxWidth, catalogHeaderMaxWidth } = await import("./headerNav");
    expect(contentMaxWidth({ containerWidth: 800 })).toBe(800);
    expect(contentMaxWidth({ containerWidth: 2400 })).toBe(2400);
    expect(contentMaxWidth({ containerWidth: 5000 })).toBe(2560);
    expect(contentMaxWidth({})).toBe(1200);
    expect(contentMaxWidth({ containerWidth: "x" })).toBe(1200);
    expect(contentMaxWidth({ fullWidth: true, containerWidth: 900 })).toBe("100%");
    // Shop masthead follows content width unless its own Header width is set.
    expect(catalogHeaderMaxWidth({ containerWidth: 800 })).toBe(800);
    expect(catalogHeaderMaxWidth({ containerWidth: 800, catalogHeaderWidth: 1500 })).toBe(1500);
  });
});

describe("side-margin content width", () => {
  it("fixed mode is unchanged", async () => {
    const { contentMaxWidth } = await import("./headerNav");
    expect(contentMaxWidth({ containerWidth: 1400 })).toBe(1400);
  });
  it("margins mode scales with the screen and clamps", async () => {
    const { contentMaxWidth, catalogHeaderMaxWidth } = await import("./headerNav");
    expect(contentMaxWidth({ contentWidthMode: "margins", contentSideMargin: 6 })).toBe("min(100%, max(320px, calc(100% - 12vw)))");
    expect(contentMaxWidth({ contentWidthMode: "margins", contentSideMargin: 99 })).toBe("min(100%, max(320px, calc(100% - 40vw)))");
    expect(contentMaxWidth({ contentWidthMode: "margins", contentSideMargin: 0 })).toBe("100%");
    expect(catalogHeaderMaxWidth({ contentWidthMode: "margins", catalogHeaderWidth: 1000 })).toBe("min(100%, max(320px, calc(100% - 10vw)))");
    expect(contentMaxWidth({ fullWidth: true, contentWidthMode: "margins" })).toBe("100%");
  });
});
