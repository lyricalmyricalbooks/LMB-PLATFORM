import { describe, expect, it } from "vitest";
import { backgroundImageCss, backgroundImageValue, cssUrl, hasResponsiveBackground } from "./backgroundSources";

const full = "https://img.test/full.jpg";
const record = {
  id: "m1", src: full,
  srcset: [480, 960, 1600, 2400, 3200].map(w => ({ url: `https://img.test/${w}.webp`, w })),
};

describe("section background pictures sized to the screen", () => {
  it("leaves a plain picture exactly as before", () => {
    expect(backgroundImageValue({ bgImageUrl: full })).toBe(`url(${full})`);
    expect(backgroundImageCss("s1", { bgImageUrl: full })).toBe("");
    expect(hasResponsiveBackground({ bgImageUrl: full })).toBe(false);
  });
  it("ignores a record left over from a picture that has since been replaced", () => {
    const s = { bgImageUrl: "https://img.test/other.jpg", bgImageUrl__media: record };
    expect(backgroundImageValue(s)).toBe("url(https://img.test/other.jpg)");
    expect(backgroundImageCss("s1", s)).toBe("");
  });
  it("gives tablets the 2400 copy and phones the 1600 copy (a step up, for tall cover sections); computers keep the full picture", () => {
    const s = { bgImageUrl: full, bgImageUrl__media: record };
    expect(backgroundImageValue(s)).toBe(`var(--fm-bg-img, url(${full}))`);
    const css = backgroundImageCss("s1", s);
    expect(css).toContain(`@media(max-width:1023px){#section-s1{--fm-bg-img:url(https://img.test/2400.webp);}}`);
    expect(css).toContain(`@media(max-width:767px){#section-s1{--fm-bg-img:url(https://img.test/1600.webp);}}`);
    expect(css).not.toContain("min-width");
  });
  it("uses the largest copy when none is big enough, and writes one rule when phones and tablets share it", () => {
    const s = { bgImageUrl: full, bgImageUrl__media: { ...record, srcset: [{ url: "https://img.test/480.webp", w: 480 }] } };
    const css = backgroundImageCss("s1", s);
    expect(css).toBe(`@media(max-width:1023px){#section-s1{--fm-bg-img:url(https://img.test/480.webp);}}`);
  });
  it("adds nothing when a colour or gradient covers the picture, and cleans the section id", () => {
    expect(backgroundImageCss("s1", { bgImageUrl: full, bgImageUrl__media: record, bgColor: "#000" })).toBe("");
    expect(backgroundImageCss("a}b{", { bgImageUrl: full, bgImageUrl__media: record })).toContain("#section-ab{");
  });
  it("refuses copies that aren't web addresses and escapes quotes", () => {
    expect(hasResponsiveBackground({ bgImageUrl: full, bgImageUrl__media: { ...record, srcset: [{ url: "javascript:alert(1)", w: 900 }] } })).toBe(false);
    expect(cssUrl('https://x.test/a"b\\c (1).png')).toBe("url(https://x.test/a%22b%5Cc%20%281%29.png)");
  });
});
