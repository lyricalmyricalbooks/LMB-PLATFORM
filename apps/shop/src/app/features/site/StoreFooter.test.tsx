import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { StoreFooter } from "./StoreFooter";

const policies = { shipping: "Ships worldwide", returns: "Return details", privacy: "Privacy details", terms: "Terms details" };
const render = (design: any = {}) => renderToStaticMarkup(createElement(MemoryRouter, null,
  createElement(StoreFooter, { settings: { design, policies }, pages: [] })));

describe("editable footer layouts", () => {
  it("defaults to grouped navigation with every policy and inline edit hooks", () => {
    const html = render({ copy: { footerExploreHeading: "Discover" } });
    expect(html).toContain('aria-label="Discover"');
    expect(html).toContain('data-studio-copy="footerExploreHeading"');
    expect(html).toContain('data-studio-copy="footerLinkShop"');
    expect(html).toContain('data-studio-label="Footer legal links"');
    for (const key of Object.keys(policies)) expect(html).toContain(`/page/policy-${key}`);
  });
  it("applies group toggles without hiding policies", () => {
    const html = render({ showFooterExplore: false, showFooterConnect: false, showFooterLegalHeading: false });
    expect(html).not.toContain("<nav");
    expect(html).not.toContain('data-studio-copy="footerLegalHeading"');
    expect(html).toContain("/page/policy-shipping");
  });
  it.each([{}, { footerNavigationLayout: "columns" }, { footerNavigationLayout: "columns", footerLayout: "4col" }])("honours location visibility in every layout: %j", design => {
    expect(render({ ...design, showFooterLocation: false })).not.toContain('data-studio-copy="footerLocation"');
    expect(render(design)).toContain('data-studio-copy="footerLocation"');
  });
  it("keeps custom destinations and child links with explicit placement", () => {
    const html = render({ menus: { footer: [{ id: "custom", label: "Journal", type: "page", value: "journal", footerGroup: "connect", children: [{ id: "child", label: "Archive", type: "page", value: "archive" }] }] } });
    expect(html).toContain('href="/page/journal"');
    expect(html).toContain('href="/page/archive"');
    expect(html).toContain('aria-label="Participate &amp; connect"');
  });
});
