import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// "Save as linked shared block" is offered on every block-based section. The section then keeps
// only a stub ({ id, sharedBlockId }) and the content lives in design.sharedBlocks — so every
// block-based renderer must show the shared content, not just Flexible composition.


const { StaticRouter } = await import("react-router");
const { CurrencyProvider } = await import("../CurrencyContext");
const { CartProvider } = await import("../CartContext");
const { SectionList } = await import("./sectionRender");
const { SECTION_REGISTRY, getBlockFields, getBlocksKey } = await import("../admin/ThemeEditorExtensions");
const { resolveSectionSharedBlocks } = await import("../features/site/sharedBlocks");

const BOOK = { id: "b1", slug: "zqx-book", title: "Book", retailPrice: 10, stockLevel: 1, status: "published", photos: [] };
// Link fields (Studio 2.3 pickers) hold plain strings just like the text fields they replaced.
const isStringField = (f: { kind: string }) => f.kind === "text" || f.kind === "textarea" || f.kind === "link";
const withBlocks = SECTION_REGISTRY.filter(meta => getBlockFields(meta.type).some(isStringField));

describe("linked shared blocks", () => {
  it("covers every block-based section type", () => {
    expect(withBlocks.length).toBeGreaterThanOrEqual(10);
  });

  for (const meta of withBlocks) {
    it(`${meta.type} shows the shared block's content`, () => {
      const block: Record<string, any> = { ...(meta as any).blockDefaults };
      for (const f of getBlockFields(meta.type)) if (isStringField(f)) block[f.key] = `Zqx shared ${f.key}`;
      if (meta.type === "CompositionSection") block.type = "text";
      if ("slug" in block) block.slug = BOOK.slug;
      const sharedBlocks = [{ id: "shared-1", name: "Shared", sectionType: meta.type, block, updatedAt: "2026-10-08" }];
      const settings = { ...(meta as any).defaults, [getBlocksKey(meta.type)]: [{ id: "placed-1", sharedBlockId: "shared-1" }] };
      const html = renderToStaticMarkup(
        h(StaticRouter, { location: "/" }, h(CurrencyProvider, null, h(CartProvider, null,
          h(SectionList, { sections: [{ id: "s1", type: meta.type, settings }], books: [BOOK], sharedBlocks, enableAnimations: false })))),
      );
      expect(html).toContain("Zqx shared");
    });
  }

  it("leaves sections without links untouched", () => {
    const settings = { items: [{ title: "A" }] };
    expect(resolveSectionSharedBlocks(settings, [{ id: "x", name: "x", block: { id: "b" }, updatedAt: "" }])).toBe(settings);
  });
});
