import { describe, expect, it } from "vitest";
import { menuLinksTo, redirectsAfterRename, renamePageInMenus } from "./pageRename";

describe("renaming a page's address", () => {
  const menus = {
    header: [{ id: "a", type: "page", value: "about", label: "About" }, { id: "b", type: "url", value: "/page/about", label: "x" },
      { id: "c", type: "home", value: "", label: "Home", children: [{ id: "d", type: "page", value: "about", label: "Us" }] }],
    footer: [{ id: "e", type: "page", value: "contact", label: "Contact" }],
  };

  it("points page links (and sub-links) at the new address and leaves everything else alone", () => {
    const next = renamePageInMenus(menus, "about", "our-story")!;
    expect(next.header[0].value).toBe("our-story");
    expect(next.header[2].children[0].value).toBe("our-story");
    expect(next.header[1]).toBe(menus.header[1]);
    expect(next.footer).toBe(menus.footer);
    expect(menuLinksTo(menus, "about")).toBe(2);
  });

  it("returns the same menus when no link uses the page", () => {
    expect(renamePageInMenus(menus, "journal", "news")).toBe(menus);
    expect(renamePageInMenus(undefined, "a", "b")).toBeUndefined();
  });

  it("forwards the old address and never leaves a chain or a loop", () => {
    expect(redirectsAfterRename([], "about", "our-story")).toEqual([{ from: "/page/about", to: "/page/our-story" }]);
    expect(redirectsAfterRename([{ from: "/old-about", to: "/page/about" }], "about", "our-story"))
      .toEqual([{ from: "/old-about", to: "/page/our-story" }, { from: "/page/about", to: "/page/our-story" }]);
    // Renamed back: the earlier forward away from the address the page now uses is dropped.
    expect(redirectsAfterRename([{ from: "/page/about", to: "/page/our-story" }], "our-story", "about"))
      .toEqual([{ from: "/page/our-story", to: "/page/about" }]);
    expect(redirectsAfterRename([{ from: "/page/about", to: "/page/our-story" }], "about", "our-story")).toBeNull();
  });
});
