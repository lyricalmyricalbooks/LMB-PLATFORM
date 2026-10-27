import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DescriptionFold from "./DescriptionFold";

const long = "word ".repeat(200);

describe("DescriptionFold", () => {
  it("renders the text exactly as before while off", () => {
    const html = renderToStaticMarkup(<DescriptionFold design={{}} look={{}} text={long}><p>body</p></DescriptionFold>);
    expect(html).toBe("<p>body</p>");
  });
  it("folds a long text, keeping all of it in the page", () => {
    const html = renderToStaticMarkup(<DescriptionFold design={{}} look={{ pdpDescriptionFold: true, pdpDescriptionFoldLines: 5 }} text={long}><p>body</p></DescriptionFold>);
    expect(html).toContain("<p>body</p>");
    expect(html).toContain('data-folded="true"');
    expect(html).toContain("calc(5 * 1lh)");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Read more");
  });
  it("leaves a short text alone", () => {
    const html = renderToStaticMarkup(<DescriptionFold design={{}} look={{ pdpDescriptionFold: true }} text="Short."><p>body</p></DescriptionFold>);
    expect(html).toBe("<p>body</p>");
  });
  it("uses the shop's own button words", () => {
    const html = renderToStaticMarkup(<DescriptionFold design={{ copy: { pdpDescriptionMore: "Keep reading" } }} look={{ pdpDescriptionFold: true }} text={long}><p>b</p></DescriptionFold>);
    expect(html).toContain("Keep reading");
  });
});
