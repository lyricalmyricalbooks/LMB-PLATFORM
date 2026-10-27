import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";


const { CurrentPageContext, PageContentSection } = await import("../../components/SectionComponents");
const { sitePageStyle } = await import("./PageView");

const render = (settings: any, design: any) =>
  renderToStaticMarkup(
    h(CurrentPageContext.Provider, { value: { title: "History of LM", body: "<p>ssss</p>", pageStyle: sitePageStyle(design, "Page") } },
      h(PageContentSection, { settings, enableAnimations: false })),
  );

describe("custom pages share one Studio-controlled look", () => {
  const design = { pageTitleSize: "xl", pageAlign: "center", pageWidth: "wide", pageTextColor: "#123456", pageShowEyebrow: true };
  const drifted = { titleSize: "sm", align: "left", maxWidth: "full", textColor: "#ff0000", showEyebrow: false };

  it("a page's Page content section follows Style › Custom pages, ignoring stale per-page styling", () => {
    const html = render(drifted, design);
    expect(html).toContain("text-6xl");
    expect(html).toContain("max-w-6xl");
    expect(html).toContain("#123456");
    expect(html).not.toContain("#ff0000");
    expect(html).toContain(">Page<");
  });

  it("“Style this page on its own” keeps the section's own values", () => {
    const html = render({ ...drifted, ownStyle: true }, design);
    expect(html).toContain("text-3xl");
    expect(html).toContain("#ff0000");
  });

  it("falls back to the standard look when nothing is set", () => {
    expect(sitePageStyle({}, "Page")).toMatchObject({ showEyebrow: false, titleSize: "md", titleUppercase: true, maxWidth: "header", align: "left", showRule: true, textMeasure: "readable", headerWidth: 1200 });
  });

  it("hides the small “Page” label by default (Option D)", () => {
    expect(render({}, {})).not.toContain(">Page<");
  });

  it("lines the title up with the header and draws the ruled line from Studio values", () => {
    const html = render({}, { containerWidth: 1400, pageRuleColor: "#abcdef", pageRuleWidth: 4, pageRuleSpacing: 40, pageTitleSizePx: 140, pageTitleSizePxMobile: 60, pageTitleFont: "Anton", pageTitleWeight: "400", pageTopSpacing: 24 });
    expect(html).toContain("max-width:1400px");
    expect(html).toContain("4px solid #abcdef");
    expect(html).toContain("margin-block:40px");
    expect(html).toContain("font-size:140px");
    expect(html).toContain("font-size:60px");
    expect(html).toContain("&#x27;Anton&#x27;");
    expect(html).toContain("font-weight:400");
    expect(html).toContain("padding-top:24px");
    expect(html).toContain("max-width:62ch");
  });

  it("can switch the line off and use the full text width", () => {
    const html = render({}, { pageShowRule: false, pageTextMeasure: "full" });
    expect(html).not.toContain("<hr");
    expect(html).not.toContain("62ch");
    expect(html).toContain("max-w-none");
  });

  it("offers wider text choices and an exact width that wins over them", () => {
    expect(render({}, { pageTextMeasure: "comfortable" })).toContain("max-width:75ch");
    expect(render({}, { pageTextMeasure: "wide" })).toContain("max-width:90ch");
    const exact = render({}, { pageTextMeasure: "readable", pageTextWidthPx: 1000 });
    expect(exact).toContain("max-width:1000px");
    expect(exact).not.toContain("62ch");
    expect(render({}, { pageTextWidthPx: 0 })).toContain("max-width:62ch");
  });

  it("keeps a narrowed text column on the chosen side", () => {
    expect(render({}, { pageAlign: "center" })).toContain("margin-inline:auto");
    expect(render({}, { pageAlign: "right" })).toContain("margin-left:auto");
  });

  it("a page styled on its own uses its own text width", () => {
    const html = render({ ownStyle: true, textMeasure: "full", textWidthPx: 720 }, { pageTextMeasure: "readable" });
    expect(html).toContain("max-width:720px");
  });
});
