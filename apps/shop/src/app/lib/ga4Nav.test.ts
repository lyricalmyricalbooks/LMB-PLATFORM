// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("./ga4", async (original) => ({ ...(await original<typeof import("./ga4")>()), ga4Event: vi.fn() }));
import { ga4Event } from "./ga4";
import { linkTextOf, navClickOf, navMenuOf, newThresholds, scrollPercent, startNavTracking } from "./ga4Nav";

function page(html: string) {
  document.body.innerHTML = html;
  return document.body;
}
const $ = (sel: string) => document.querySelector(sel);

describe("Google Analytics menu clicks", () => {
  it("names the menu from data-ga-menu, else the shop's header or footer", () => {
    page(`
      <header data-fm-header>
        <a id="logo" href="/" aria-label="Lyricalmyrical home"><img alt=""></a>
        <nav data-ga-menu="categories"><a id="cat" href="/collections/zines">Zines</a></nav>
        <nav data-ga-menu="phone"><a id="tab" href="/page/about">About</a></nav>
        <div data-fm-section><a id="sec" href="/books/salt">Salt</a></div>
      </header>
      <main><a id="body" href="/books/salt">Salt</a></main>
      <footer data-fm-footer><a id="foot" href="/page/shipping">Shipping</a></footer>
      <div role="menu" data-ga-menu="categories"><a id="panel" role="menuitem" href="/collections/riso">Riso</a></div>
      <div data-ga-menu="nonsense"><a id="odd" href="/">x</a></div>`);
    expect(navMenuOf($("#logo"))).toBe("header");
    expect(navMenuOf($("#cat"))).toBe("categories");
    expect(navMenuOf($("#tab"))).toBe("phone");
    expect(navMenuOf($("#foot"))).toBe("footer");
    expect(navMenuOf($("#panel"))).toBe("categories");
    expect(navMenuOf($("#sec"))).toBeNull();
    expect(navMenuOf($("#body"))).toBeNull();
    expect(navMenuOf($("#odd"))).toBeNull();
  });

  it("uses the visible label, or the aria-label for icon links and the bag button, trimmed to 100", () => {
    page(`<a id="a" href="/x">  Our
      history </a><button id="bag" aria-label="Bag"><span>Bag</span> <span>2</span></button><a id="long" href="/y">${"w".repeat(140)}</a>`);
    expect(linkTextOf($("#a")!)).toBe("Our history");
    expect(linkTextOf($("#bag")!)).toBe("Bag");
    expect(linkTextOf($("#long")!)).toHaveLength(100);
  });

  it("reports clicks on links and buttons in a menu, not menu openers or anything outside", () => {
    page(`
      <header data-fm-header>
        <nav data-ga-menu="categories">
          <a href="/collections/zines"><span id="inner">Zines</span></a>
          <button id="opener" aria-haspopup="true" aria-expanded="false">Books</button>
          <button id="empty"></button>
        </nav>
        <span id="plain">text</span>
      </header>
      <a id="outside" href="/books/salt">Salt</a>`);
    expect(navClickOf($("#inner"))).toEqual({ menu: "categories", link_text: "Zines" });
    expect(navClickOf($("#opener"))).toBeNull();
    expect(navClickOf($("#empty"))).toBeNull();
    expect(navClickOf($("#plain"))).toBeNull();
    expect(navClickOf($("#outside"))).toBeNull();
    expect(navClickOf(null)).toBeNull();
  });
});

describe("Google Analytics scroll depth", () => {
  it("measures the bottom of the screen against the page height", () => {
    expect(scrollPercent(0, 800, 3200)).toBeCloseTo(25.06, 1);
    expect(scrollPercent(1600, 800, 3200)).toBeCloseTo(75.06, 1);
    expect(scrollPercent(2399, 800, 3200)).toBe(100);
    expect(scrollPercent(5000, 800, 3200)).toBe(100);
    expect(scrollPercent(100, 0, 3200)).toBe(0);
    expect(scrollPercent(100, 800, 0)).toBe(0);
  });

  it("sends each threshold once, lowest first, including ones skipped by a fast scroll", () => {
    expect(newThresholds(10, new Set())).toEqual([]);
    expect(newThresholds(60, new Set())).toEqual([25, 50]);
    expect(newThresholds(100, new Set([25, 50]))).toEqual([75, 100]);
    expect(newThresholds(80, new Set([25, 50, 75]))).toEqual([]);
  });
});

describe("Google Analytics listeners", () => {
  it("sends nav_click from one delegated listener, and scroll depth once per threshold per page", () => {
    const sent = vi.mocked(ga4Event);
    // Runs the frame at once (returning 0 so the next scroll schedules again, as after a real frame).
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as any;
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 3200, configurable: true });
    const scrollTo = (y: number) => { Object.defineProperty(window, "scrollY", { value: y, configurable: true }); window.dispatchEvent(new Event("scroll")); };
    history.replaceState(null, "", "/books/salt?e=a%40b.c");
    startNavTracking();
    startNavTracking();

    page(`<footer data-fm-footer><a id="f" href="#">Shipping</a></footer>`);
    $("#f")!.addEventListener("click", e => e.preventDefault());
    ($("#f") as HTMLElement).click();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]).toEqual(["nav_click", { menu: "footer", link_text: "Shipping", page_location: "http://localhost:3000/books/salt" }]);

    sent.mockClear();
    scrollTo(0); // the router's scroll-to-top: not a scroll the visitor made
    expect(sent).not.toHaveBeenCalled();
    scrollTo(1300);
    scrollTo(1350);
    expect(sent.mock.calls.map(c => c[1]?.percent)).toEqual([25, 50]);
    scrollTo(2400);
    expect(sent.mock.calls.map(c => c[1]?.percent)).toEqual([25, 50, 75, 100]);

    sent.mockClear();
    history.replaceState(null, "", "/page/about");
    scrollTo(1000);
    expect(sent.mock.calls.map(c => c[1]?.percent)).toEqual([25, 50]);
  });
});
