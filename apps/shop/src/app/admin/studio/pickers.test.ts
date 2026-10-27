import { describe, expect, it } from "vitest";
import {
  bookOptions, bookSlugs, categoryOptions, describeLink, describeVideo, filterPickOptions, FIXED_LINKS, fontOptions, linkOptions, pageOptions,
} from "./pickers";
import { findProduct, resolveProductRoutes } from "../../features/site/productRoutes";
import { isLiveBook } from "../../features/site/liveBook";
import { resolveHref } from "../../features/site/storeMenu";
import { bookSlug } from "../../features/site/staffNotes";
import { pickBook, selectBooks } from "../../features/site/merchandising";
import { resolveStaffNoteRows } from "../../features/site/staffNotes";

const NOW = "2026-10-09T12:00:00.000Z";
const BOOKS = [
  { id: "b1", slug: "night-pages", title: "Night Pages", author: "A. Writer", status: "published" },
  { id: "b2", slug: "twin", title: "Twin One", status: "published" },
  { id: "b3", slug: "twin", title: "Twin Two", status: "published", scheduleDate: "2099-01-01" },
  { id: "b4", title: "Paper Weather", status: "published" },
];
const PAGES = [
  { id: "p2", slug: "open-call", title: "Open call", status: "draft" },
  { id: "p1", slug: "about", title: "About", status: "published" },
];
const CATEGORIES = ["PUBLICATIONS", { id: "z", name: "Zines & Things", parentId: "cat-0" }, { id: "h", name: "Hidden", showInNav: false }];

describe("book picker values are the storefront's own slugs", () => {
  it("resolves against the whole catalog, so a slug a scheduled twin shares is saved as the immutable id", () => {
    const slugs = bookSlugs(BOOKS);
    expect(slugs.get("b1")).toBe("night-pages");
    expect(slugs.get("b2")).toBe("b2");
    expect(slugs.get("b3")).toBe("b3");
    expect(slugs.get("b4")).toBe("paper-weather");
  });
  it("a picked book stays the same book in the Studio preview, for shoppers now, and after its twin goes live", () => {
    const later = "2099-06-01T00:00:00.000Z";
    const views = {
      // Studio preview resolves the complete snapshot; shoppers resolve live books only.
      preview: resolveProductRoutes(BOOKS),
      shopNow: resolveProductRoutes(BOOKS.filter(b => isLiveBook(b, NOW))),
      shopLater: resolveProductRoutes(BOOKS.filter(b => isLiveBook(b, later))),
    };
    for (const option of bookOptions(BOOKS, NOW)) {
      const book = BOOKS.find(b => `book:${b.id}` === option.id)!;
      for (const [name, list] of Object.entries(views)) {
        if (!list.some(b => b.id === book.id)) continue;
        expect(selectBooks(list, { source: "manual", manual: option.value }).map(b => b.id), `${name} ${option.value}`).toEqual([book.id]);
        expect(pickBook(list, { productSlug: option.value })?.id, `${name} ${option.value}`).toBe(book.id);
        expect(resolveStaffNoteRows([{ slug: option.value, note: "n" }], list).map(r => r.book.id), name).toEqual([book.id]);
      }
    }
  });
  it("a slug saved before (readable, live-first) keeps working for shoppers", () => {
    const shopNow = resolveProductRoutes(BOOKS.filter(b => isLiveBook(b, NOW)));
    expect(selectBooks(shopNow, { source: "manual", manual: "twin" }).map(b => b.id)).toEqual(["b2"]);
    expect(findProduct(shopNow, "b2")?.id).toBe("b2");
    expect(shopNow.find(b => bookSlug(b) === "night-pages")?.id).toBe("b1");
  });
  it("labels books that shoppers can't buy yet", () => {
    expect(bookOptions(BOOKS, NOW).find(o => o.id === "book:b3")?.hint).toBe("Not on sale yet");
    expect(bookOptions(BOOKS, NOW).find(o => o.id === "book:b1")?.hint).toBe("A. Writer");
  });
});

describe("link picker", () => {
  const options = linkOptions({ books: BOOKS, pages: PAGES, categories: CATEGORIES }, NOW);
  it("offers store pages, custom pages, shop categories and books as site-relative hrefs", () => {
    expect(options.filter(o => o.group === "Store pages").map(o => o.value)).toEqual(FIXED_LINKS.map(f => f.value));
    expect(options.filter(o => o.group === "Custom pages").map(o => o.value)).toEqual(["/page/about", "/page/open-call"]);
    expect(options.find(o => o.label === "PUBLICATIONS › Zines & Things")?.value).toBe("/collections/zines-things");
    expect(options.find(o => o.label === "Night Pages")?.value).toBe("/books/night-pages");
    // siteHref (SectionComponents) adds the GitHub Pages sub-path to "/…" links — never stored here.
    expect(options.every(o => o.value.startsWith("/") && !o.value.includes("LyricalmyricalWebsiteTrial"))).toBe(true);
  });
  it("uses the same hrefs as the header and footer menus", () => {
    expect(options.find(o => o.id === "page:p1")?.value).toBe(resolveHref({ id: "x", label: "", type: "page", value: "about" }));
    for (const name of ["PUBLICATIONS", "Zines & Things", "Hidden"]) {
      expect(options.some(o => o.value === resolveHref({ id: "x", label: "", type: "collection", value: name }))).toBe(true);
    }
    expect(options.find(o => o.label === "Home")?.value).toBe(resolveHref({ id: "x", label: "", type: "home" }));
  });
  it("describes saved links in plain words, including ones typed by hand", () => {
    expect(describeLink("/page/about", options)).toEqual({ label: "About", group: "Custom pages" });
    expect(describeLink("https://example.com/x", options)?.group).toMatch(/Web address/);
    expect(describeLink("/somewhere", options)?.group).toMatch(/not matched/);
    expect(describeLink("mailto:hi@example.com", options)).toEqual({ label: "hi@example.com", group: "Email link" });
    expect(describeLink("", options)).toBeNull();
  });
  it("search matches every typed word", () => {
    expect(filterPickOptions(options, "zines").map(o => o.value)).toEqual(["/collections/zines-things"]);
    expect(filterPickOptions(options, "custom about").map(o => o.value)).toEqual(["/page/about"]);
  });
});

describe("category and page pickers", () => {
  it("store the category name and the page slug", () => {
    const cats = categoryOptions(CATEGORIES);
    expect(cats.map(o => o.value)).toEqual(["PUBLICATIONS", "Zines & Things", "Hidden"]);
    expect(cats.find(o => o.value === "Hidden")?.hint).toBe("Hidden from the menu");
    const pages = pageOptions(PAGES);
    expect(pages.map(o => o.value)).toEqual(["about", "open-call"]);
    expect(pages[1].hint).toMatch(/Draft/);
  });
});

describe("video picker", () => {
  it("recognises the links the video sections can play, with the renderers' own rules", () => {
    expect(describeVideo("https://youtu.be/dQw4w9WgXcQ").kind).toBe("youtube");
    expect(describeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ").kind).toBe("youtube");
    expect(describeVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ").kind).toBe("unknown");
    expect(describeVideo("https://vimeo.com/123456").kind).toBe("vimeo");
    expect(describeVideo("https://vimeo.com/channels/x").kind).toBe("unknown");
    expect(describeVideo("https://cdn.example.com/film.mp4?x=1").kind).toBe("file");
    expect(describeVideo("").kind).toBe("empty");
    expect(describeVideo("hello").kind).toBe("unknown");
  });
});

describe("font picker", () => {
  it("keeps a typed font name that isn't on the curated list", () => {
    expect(fontOptions("Anton").some(o => o.label.includes("typed name"))).toBe(false);
    expect(fontOptions("Comic Neue")[0]).toEqual({ value: "Comic Neue", label: "Comic Neue (typed name)" });
  });
});
