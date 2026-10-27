import { describe, expect, it } from "vitest";
import { shouldScrollToTop } from "./ScrollToTop";

describe("shouldScrollToTop", () => {
  it("opens a newly clicked page at the top", () => {
    expect(shouldScrollToTop("/page/about", { pathname: "/page/contact", hash: "" }, "PUSH")).toBe(true);
    expect(shouldScrollToTop("/", { pathname: "/books/zine", hash: "" }, "PUSH")).toBe(true);
  });
  it("leaves back/forward, replace, anchors, same-page and admin navigation alone", () => {
    expect(shouldScrollToTop("/page/about", { pathname: "/", hash: "" }, "POP")).toBe(false);
    expect(shouldScrollToTop("/books/old", { pathname: "/books/new", hash: "" }, "REPLACE")).toBe(false);
    expect(shouldScrollToTop("/", { pathname: "/page/faq", hash: "#returns" }, "PUSH")).toBe(false);
    expect(shouldScrollToTop("/", { pathname: "/", hash: "" }, "PUSH")).toBe(false);
    expect(shouldScrollToTop(null, { pathname: "/page/about", hash: "" }, "PUSH")).toBe(false);
    expect(shouldScrollToTop("/admin", { pathname: "/admin/orders", hash: "" }, "PUSH")).toBe(false);
  });
});
