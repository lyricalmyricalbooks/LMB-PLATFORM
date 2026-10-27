import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrencyProvider } from "../../CurrencyContext";
import { StaticRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
vi.mock("./useSiteData", () => ({ useLiveDesign: () => ({}) }));
const { MobileStorefrontNav } = await import("./MobileStorefrontNav");
const { NotFoundContent } = await import("./NotFoundPage");
const render = (element: any) => renderToStaticMarkup(h(StaticRouter, { location: "/" }, h(CurrencyProvider, null, element)));

describe("storefront recovery", () => {
  it("offers phone category, child category, search, wishlist, account and currency access", () => {
    const html = render(h(MobileStorefrontNav, {design:{mobileNavStyle:"menu",categories:[{id:"p",name:"Books"},{id:"c",name:"Zines",parentId:"p"}]},pages:[],onSearch:()=>{}}));
    expect(html).toContain("<details");
    expect(html).toContain("/collections/books");
    expect(html).toContain("/collections/zines");
    expect(html).toContain("/wishlist");
    expect(html).toContain("/account");
    expect(html).toContain("Search");
    expect(html).toContain("Select currency");
  });
  it("honors hidden phone menu and individual header controls", () => {
    expect(render(h(MobileStorefrontNav,{design:{showMobileNavigation:false},pages:[],onSearch:()=>{}}))).toBe("");
    const html = render(h(MobileStorefrontNav,{design:{mobileNavStyle:"menu",hideHeaderSearch:true,hideHeaderWishlist:true,hideHeaderAccount:true,hideCurrencySelector:true},pages:[],onSearch:()=>{}}));
    expect(html).not.toContain("/wishlist");
    expect(html).not.toContain("/account");
    expect(html).not.toContain("Select currency");
  });
  it("shows phone navigation as tabs across the top by default", () => {
    const html = render(h(MobileStorefrontNav, {design:{categories:[{id:"p",name:"Books"},{id:"c",name:"Zines",parentId:"p"}]},pages:[{id:"a",slug:"about",title:"About",status:"published"}],onSearch:()=>{}}));
    expect(html).not.toContain("<details");
    expect(html).toContain("fm-mobile-tabs");
    // "Books" has a sub-category, so it is a drop-down button (its links open in the panel).
    expect(html).toContain('aria-haspopup="true"');
    expect(html).toContain("Books");
    expect(html).toContain("/wishlist");
    expect(html).toContain("Select currency");
    const hidden = render(h(MobileStorefrontNav,{design:{hideHeaderWishlist:true,hideCurrencySelector:true},pages:[],onSearch:()=>{}}));
    expect(hidden).not.toContain("/wishlist");
    expect(hidden).not.toContain("Select currency");
  });
  it("gives unknown URLs an editable title and a route back to the store", () => {
    const html = render(h(NotFoundContent,{design:{copy:{notFoundTitle:"Missing page",notFoundBack:"Shop again"}}}));
    expect(html).toContain("Missing page");
    expect(html).toContain("Shop again");
    expect(html).toContain('href="/"');
  });
});
