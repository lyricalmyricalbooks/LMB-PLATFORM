// Studio 2.7: connected fields render the page's details on the storefront; "Hide when empty" leaves a section out.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const { StaticRouter } = await import("react-router");
const { SectionList } = await import("./sectionRender");
const { SectionPageContext } = await import("./sectionCopy");

const book = { id: "b1", slug: "night", title: "Night Pages", custom: { series: "The Night Series" } };
const section = (settings: any) => ({ id: "s1", type: "TextContentSection", settings: { content: "<p>Body</p>", ...settings } });
const render = (sections: any[], ctx: any) => renderToStaticMarkup(
  h(StaticRouter, { location: "/" }, h(SectionPageContext.Provider, { value: ctx }, h(SectionList, { sections, enableAnimations: false }))));

describe("connected section fields on the storefront", () => {
  it("shows the book's detail in a connected field and in {{tokens}}", () => {
    const html = render([section({ title: { $dyn: "book.custom.series" }, subtitle: "From {{book.title}}" })], { book });
    expect(html).toContain("The Night Series");
    expect(html).toContain("From Night Pages");
    expect(html).not.toContain("$dyn");
  });
  it("leaves the section out where the detail is missing when Hide when empty is on", () => {
    expect(render([section({ title: { $dyn: "book.custom.series" }, hideWhenEmpty: true })], {})).not.toContain("data-fm-section");
    expect(render([section({ title: { $dyn: "book.custom.series" } })], {})).toContain("data-fm-section");
  });
});
