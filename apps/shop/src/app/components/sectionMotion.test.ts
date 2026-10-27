import { describe, expect, it } from "vitest";
import { entranceTiming, sectionMotionCss, wantsReveal } from "./sectionMotion";

describe("section motion (Studio 3.0 phase 4)", () => {
  it("adds nothing for an untouched section or when Page animations is off", () => {
    expect(sectionMotionCss("s1", {})).toBe("");
    expect(sectionMotionCss("s1", { revealBlocks: "fade-up", sticky: true }, false)).toBe("");
    expect(wantsReveal({ revealBlocks: "fade-up" }, false)).toBe(false);
  });
  it("hides blocks only while the section is armed, staggered, inside the motion preference", () => {
    const css = sectionMotionCss("s1", { revealBlocks: "fade-up", staggerStep: 100, motionDelay: 50 });
    expect(css.startsWith("@media (prefers-reduced-motion: no-preference){")).toBe(true);
    expect(css).toContain('#section-s1[data-motion="armed"] [data-fm-block]{opacity:0;transform:translateY(28px);}');
    expect(css).toContain("#section-s1 [data-fm-block]:nth-child(3){transition-delay:250ms;}");
    expect(css).not.toMatch(/#section-s1 \[data-fm-block\]\{opacity:0/);
    expect(wantsReveal({ revealBlocks: "fade-up" })).toBe(true);
  });
  it("turns motion off on phones with a width query", () => {
    expect(sectionMotionCss("s1", { revealBlocks: "fade", motionOffOnPhones: true })).toContain("(prefers-reduced-motion: no-preference) and (min-width: 768px)");
  });
  it("hover lifts, parallax behind @supports, and sticky regardless of motion", () => {
    const css = sectionMotionCss("s1", { blockHover: "lift", parallax: "strong", sticky: true, stickyTop: 60 });
    expect(css).toContain("@media (hover: hover){#section-s1 :is([data-fm-block],.fm-card):hover{transform:translateY(-4px);}}");
    expect(css).toContain("@supports (animation-timeline: view())");
    expect(css).toContain("calc(50% - 110px)");
    expect(css).toContain("#section-s1{position:sticky;top:60px;z-index:2;}");
  });
  it("keeps timings in range and scopes unsafe ids", () => {
    expect(entranceTiming({ motionDuration: 99999, motionDelay: -5 })).toEqual({ duration: 2, delay: 0 });
    expect(sectionMotionCss('a"b', { sticky: true })).toContain("#section-ab{");
  });
});
