import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { autoFitSection } from "../admin/studio/autoMobile";


const { SectionList } = await import("./sectionRender");

// Studio's "Auto-fit for phones" writes tablet/phone grid placement and phone section values. They only
// help shoppers if the storefront actually applies them — the desktop placement is an inline style, so the
// media-query rules must be !important to beat it.
const composition = (settings: any = {}) => ({
  id: "c1", type: "CompositionSection", visible: true,
  settings: {
    gridColumns: 12,
    items: [
      { id: "a", type: "text", title: "A", grid: { desktop: { column: 1, span: 6, row: 1 } } },
      { id: "b", type: "text", title: "B", grid: { desktop: { column: 7, span: 6, row: 1 } } },
    ],
    ...settings,
  },
});
// SSR escapes quotes inside <style> text; the browser (client-rendered SPA) sees them raw.
const render = (section: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(SectionList, { sections: [section], enableAnimations: false }))).replace(/&quot;/g, '"');

describe("phone layout reaches the storefront", () => {
  it("auto-fitted block placement is emitted as !important media rules after the desktop inline style", () => {
    const s = composition();
    const fitted = { ...s, settings: { ...s.settings, ...autoFitSection(s as any).value } };
    const html = render(fitted);
    expect(html).toContain('style="grid-column:7 / span 6;grid-row:1 / span 1"'); // desktop inline style (block b)
    expect(html).toMatch(/@media \(max-width:767px\)\{#section-c1 \[data-fm-block="b"\]\{[^}]*grid-row:2 \/ span 1!important/);
    expect(html).toMatch(/@media \(max-width:1023px\)\{#section-c1 \[data-fm-block="b"\]\{[^}]*grid-column:7 \/ span 6!important/);
    // for each block the tablet rule must precede its phone rule, so phones win when both queries match
    const tablet = html.indexOf('(max-width:1023px){#section-c1 [data-fm-block="b"]');
    const phone = html.indexOf('(max-width:767px){#section-c1 [data-fm-block="b"]');
    expect(tablet).toBeGreaterThan(-1);
    expect(tablet).toBeLessThan(phone);
  });

  it("a phone heading size becomes a phone-only rule for the section's headings", () => {
    const html = render(composition({ mobileHeadingSize: 30 }));
    expect(html).toContain("@media(max-width:767px){#section-c1 :is(h1,h2){font-size:30px!important;}");
  });
});
