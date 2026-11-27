import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LazyMotion, domAnimation } from "motion/react";
import { SectionList, siteRevealMode } from "./sectionRender";
import { THEME_LIBRARY } from "../admin/studio/themeLibrary";

const sections = [
  { id: "a", type: "RichTextSection", settings: { title: "First" } },
  { id: "b", type: "RichTextSection", settings: { title: "Second" } },
];
const html = (design: any) =>
  renderToStaticMarkup(<LazyMotion features={domAnimation}><SectionList sections={sections} design={design} /></LazyMotion>);

describe("Sections appear as you scroll", () => {
  it("maps the Style choice to a gentle entrance, and anything else to none", () => {
    expect(siteRevealMode("fade")).toBe("gentle-fade");
    expect(siteRevealMode("fade-zoom")).toBe("gentle-zoom");
    expect(siteRevealMode("")).toBe("");
    expect(siteRevealMode(undefined)).toBe("");
  });

  it("draws exactly as before when it is off", () => {
    expect(html({})).toBe(html({ sectionReveal: "" }));
    expect(html({})).not.toMatch(/scale\(0\.97\)/);
  });

  it("leaves the first section alone and brings the next one in", () => {
    const out = html({ sectionReveal: "fade-zoom" });
    expect(out.match(/scale\(0\.97\)/g)?.length).toBe(1);
    expect(out.search(/scale\(0\.97\)/)).toBeGreaterThan(out.indexOf('id="section-b"'));
  });

  it("is on in every starter", () => {
    const starters = THEME_LIBRARY.filter((t: any) => /^(juniper|aurel|starter)-/.test(t.id));
    expect(starters).toHaveLength(9);
    for (const t of starters as any[]) expect(t.global.sectionReveal, t.id).toBe("fade-zoom");
  });
});
