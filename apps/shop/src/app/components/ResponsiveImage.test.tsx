import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Studio media library (2.4): pictures chosen from the library get srcset/sizes/width/height and lazy
// loading; every other image (typed URLs, older uploads, existing designs) renders the same <img> as before.


const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../CurrencyContext");
const { CartProvider } = await import("../CartContext");
const { SectionList } = await import("./sectionRender");
const { ResponsiveImage, SectionPriorityContext, sectionHasPriority } = await import("./ResponsiveImage");
const { SECTION_REGISTRY, getSectionFields, getBlockFields, getBlocksKey } = await import("../admin/ThemeEditorExtensions");

const ref = (src: string) => ({
  id: "m1", src, alt: "Library description",
  srcset: [{ url: `${src}?w=480`, w: 480 }, { url: `${src}?w=960`, w: 960 }, { url: src, w: 1600 }], width: 2400, height: 1600,
});
const render = (sections: any[], dataSection = "homepage") => renderToStaticMarkup(
  h(StaticRouter, { location: "/" }, h(CurrencyProvider, null, h(CartProvider, null,
    h(SectionList, { sections, books: [], enableAnimations: false, dataSection })))),
);
const imgTags = (html: string, src: string) => [...html.matchAll(/<img [^>]*>/g)].map(m => m[0]).filter(tag => tag.includes(`src="${src}`));

describe("ResponsiveImage", () => {
  it("renders exactly the plain <img> for a URL without a library record", () => {
    const props = { src: "https://cdn.test/a.jpg", alt: "A", loading: "lazy" as const, decoding: "async" as const, className: "w-full" };
    expect(renderToStaticMarkup(h(ResponsiveImage, props))).toBe(renderToStaticMarkup(h("img", props)));
    expect(renderToStaticMarkup(h(ResponsiveImage, { ...props, media: { ...ref("https://cdn.test/other.jpg") } })))
      .toBe(renderToStaticMarkup(h("img", props)));
  });

  it("adds srcset, sizes, width, height and lazy loading for a library picture", () => {
    const src = "https://cdn.test/b.webp";
    const html = renderToStaticMarkup(h(ResponsiveImage, { src, media: ref(src), sizes: "50vw", alt: "" }));
    expect(html).toContain(`srcSet="${src}?w=480 480w, ${src}?w=960 960w, ${src} 1600w"`);
    expect(html).toContain('sizes="50vw"');
    expect(html).toContain('width="2400"');
    expect(html).toContain('height="1600"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('alt="Library description"');
    expect(html).not.toMatch(/fetchPriority/i);
  });

  it("loads first-section pictures eagerly with high priority", () => {
    const src = "https://cdn.test/c.webp";
    const html = renderToStaticMarkup(h(SectionPriorityContext.Provider, { value: true }, h(ResponsiveImage, { src, media: ref(src), loading: "lazy" })));
    expect(html).toContain('loading="eager"');
    expect(html).toMatch(/fetchPriority="high"/i);
    expect(sectionHasPriority("homepage", 0)).toBe(true);
    expect(sectionHasPriority("page:about", 0)).toBe(true);
    expect(sectionHasPriority("homepage", 1)).toBe(false);
    expect(sectionHasPriority("productPage", 0)).toBe(false);
    expect(sectionHasPriority("globalSections", 0)).toBe(false);
  });
});

describe("section renderers", () => {
  // Every image field (section-level and block-level), filled with a URL, with and without its record.
  function sample(meta: any, withRecord: boolean) {
    const settings: Record<string, any> = { ...(meta.defaults || {}) };
    const urls: string[] = [];
    for (const f of getSectionFields(meta.type) as any[]) if (f.kind === "image") {
      const src = `https://cdn.test/${meta.type}/${f.key}.webp`;
      urls.push(src);
      settings[f.key] = src;
      if (withRecord) settings[`${f.key}__media`] = ref(src);
    }
    const imageBlockFields = (getBlockFields(meta.type) as any[]).filter(f => f.kind === "image");
    if (imageBlockFields.length) {
      const block: Record<string, any> = { id: "b1", ...(meta.blockDefaults || {}), type: "image", kind: "image" };
      for (const f of imageBlockFields) {
        const src = `https://cdn.test/${meta.type}/block-${f.key}.webp`;
        urls.push(src);
        block[f.key] = src;
        if (withRecord) block[`${f.key}__media`] = ref(src);
      }
      settings[getBlocksKey(meta.type)] = [block];
    }
    return { settings, urls };
  }

  it("leave plain image URLs untouched in every section type", () => {
    for (const meta of SECTION_REGISTRY as any[]) {
      const { settings } = sample(meta, false);
      const html = render([{ id: "s1", type: meta.type, settings }, { id: "s0", type: "TextSection", settings: {} }], "productPage");
      expect(html, meta.type).not.toMatch(/srcSet=|sizes=/);
    }
  });

  it("serve library pictures responsively in the sections that draw <img> tags", () => {
    const responsive: string[] = [];
    for (const meta of SECTION_REGISTRY as any[]) {
      const { settings, urls } = sample(meta, true);
      const html = render([{ id: "s1", type: meta.type, settings }], "productPage");
      for (const src of urls) {
        const tags = imgTags(html, src);
        if (tags.length && tags.every(t => t.includes("srcSet=") && t.includes('width="2400"'))) responsive.push(`${meta.type}:${src.split("/").pop()}`);
      }
    }
    expect(responsive).toEqual(expect.arrayContaining([
      "HeroSection:imageUrl.webp", "ImageBannerSection:imageUrl.webp", "ImageBannerSection:mobileImageUrl.webp",
    ]));
    expect(responsive.filter(r => r.includes(":block-")).length).toBeGreaterThanOrEqual(3);
  });

  it("gives the home page's first section priority, not the later ones", () => {
    const src = "https://cdn.test/banner.webp";
    const banner = (id: string) => ({ id, type: "ImageBannerSection", settings: { imageUrl: src, imageUrl__media: ref(src) } });
    const [first, second] = imgTags(render([banner("a"), banner("b")]), src);
    expect(first).toMatch(/fetchPriority="high"/i);
    expect(first).toContain('loading="eager"');
    expect(second).not.toMatch(/fetchPriority/i);
    expect(second).toContain('loading="lazy"');
    // Product pages draw their own photo first, so their sections never take priority.
    expect(imgTags(render([banner("a")], "productPage"), src)[0]).toContain('loading="lazy"');
  });
});
