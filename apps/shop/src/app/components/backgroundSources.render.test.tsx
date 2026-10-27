// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Phase 7: a section background picked from the Media library loads a screen-sized copy on phones and tablets;
// a plain picture renders exactly as it always did.

const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../CurrencyContext");
const { CartProvider } = await import("../CartContext");
const { SectionList } = await import("./sectionRender");

const wrap = (node: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(CurrencyProvider, null, h(CartProvider, null, node))));
const full = "https://img.test/full.jpg";
const render = (settings: any) => wrap(h(SectionList, { sections: [{ id: "bg1", type: "FeatureGridSection", settings: { heading: "Hi", ...settings } }], design: {} }));

describe("section background pictures on the storefront", () => {
  it("draws a plain picture with the same url() as before and no extra rules", () => {
    const html = render({ bgImageUrl: full });
    expect(html).toContain(`background-image:url(${full})`);
    expect(html).not.toContain("--fm-bg-img");
  });
  it("points a library picture at its copies through --fm-bg-img, keeping the full picture for computers", () => {
    const html = render({ bgImageUrl: full, bgImageUrl__media: { id: "m", src: full, srcset: [{ url: "https://img.test/1600.webp", w: 1600 }, { url: "https://img.test/2400.webp", w: 2400 }] } });
    expect(html).toContain("background-image:var(--fm-bg-img, url(https://img.test/full.jpg))");
    expect(html).toContain("#section-bg1{--fm-bg-img:url(https://img.test/2400.webp);}");
    expect(html).toContain("#section-bg1{--fm-bg-img:url(https://img.test/1600.webp);}");
  });
});
