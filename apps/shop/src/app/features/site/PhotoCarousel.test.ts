import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dragPlan, PhotoCarousel } from "./PhotoCarousel";

const strip = (count: number) => renderToStaticMarkup(createElement(PhotoCarousel, {
  count, index: 0, onIndex: () => {}, label: "Photos", renderSlide: (i: number) => createElement("img", { alt: `Photo ${i + 1}`, src: `/p${i}.jpg` }),
}));

describe("PhotoCarousel keyboard access (audit 2026-10-21, axe scrollable-region-focusable)", () => {
  it("a strip with several photos can be focused, so the arrow keys scroll it, with the ring drawn inside the frame", () => {
    const html = strip(3);
    expect(html).toMatch(/<div[^>]*data-fm-carousel[^>]*tabindex="0"|<div[^>]*tabindex="0"[^>]*data-fm-carousel/);
    expect(html).toContain("outline-offset:-4px");
  });
  it("a single photo doesn't scroll, so it adds no extra tab stop", () => {
    const html = strip(1);
    expect(html).not.toContain("tabindex");
    expect(html).not.toContain("outline-offset");
  });
});

describe("dragPlan (mouse drag on the photo strip)", () => {
  it("a short pull snaps back, a sixth of the frame moves one photo", () => {
    expect(dragPlan(2, -40, 600, 5)).toBe(2);
    expect(dragPlan(2, -120, 600, 5)).toBe(3);
    expect(dragPlan(2, 120, 600, 5)).toBe(1);
  });
  it("a long drag moves as many photos as it covered, never past the ends", () => {
    expect(dragPlan(0, -1250, 600, 5)).toBe(2);
    expect(dragPlan(4, -600, 600, 5)).toBe(4);
    expect(dragPlan(0, 600, 600, 5)).toBe(0);
  });
});
