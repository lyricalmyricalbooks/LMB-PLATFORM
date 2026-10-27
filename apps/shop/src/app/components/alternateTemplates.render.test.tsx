// Studio 2.8: a page using an alternate template shows that template's sections; one without its own shows the default's.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const { StaticRouter } = await import("react-router");
const { TemplateSections } = await import("./sectionRender");

const text = (id: string, title: string) => ({ id, type: "TextContentSection", settings: { title } });
const design = {
  alternateTemplates: { productPage: [{ id: "poetry", name: "Poetry" }, { id: "bare", name: "Bare" }] },
  productPage: { sections: [text("d", "Default layout")] },
  "productPage~poetry": { sections: [text("p", "Poetry layout")] },
  "productPage~bare": { accentColor: "#fff" },
};
const render = (templateId: string) => renderToStaticMarkup(h(StaticRouter, { location: "/books/x" }, h(TemplateSections, { design, templateId, enableAnimations: false })));

describe("alternate template sections", () => {
  it("renders the alternate's own sections", () => {
    expect(render("productPage~poetry")).toContain("Poetry layout");
    expect(render("productPage~poetry")).not.toContain("Default layout");
  });
  it("falls back to the default's sections when the alternate has none", () => {
    expect(render("productPage~bare")).toContain("Default layout");
    expect(render("productPage")).toContain("Default layout");
  });
});
