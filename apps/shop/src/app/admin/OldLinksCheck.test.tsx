// @vitest-environment jsdom
// Settings › General › URL redirects › Check your old links (plan 23.8): read the old shop's pages, add the suggestions.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  let saved = [{ from: "/products/moth-songs", to: "/books/moth-songs" }];
  return {
    getRedirects: vi.fn(async () => saved),
    saveRedirects: vi.fn(async (items: any[]) => { saved = items; return items; }),
    getAllBooks: vi.fn(async () => [{ id: "b1", title: "Moth Songs", slug: "moth-songs", status: "published" }, { id: "b2", title: "Salt Hours", status: "draft" }]),
    getPages: vi.fn(async () => [{ slug: "about", title: "About the press", status: "published" }]),
    getSettings: vi.fn(async () => ({ design: {} })),
    createPage: vi.fn(async (page: any) => ({ id: `p-${page.slug}`, ...page })),
  };
});
vi.mock("./api", () => ({ adminApi: api }));
const old = vi.hoisted(() => ({
  readOldLinks: vi.fn(async (_a: string) => ({
    host: "moth.example", notes: [], paths: ["/", "/products/moth-songs", "/products/salt-hours", "/pages/about-us", "/blog/news"],
  })),
  readOldPages: vi.fn(async (_a: string, _paths: string[]) => ({
    host: "moth.example", skipped: [{ path: "/pages/gone", reason: "couldn't be read" }],
    pages: [{ path: "/pages/visit-us", slug: "visit-us", title: "Visit us", body: "<p>Come by.</p>", images: 2 }],
  })),
}));
vi.mock("./oldShopApi", () => old);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { RedirectsCard } = await import("./RedirectsCard");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const button = (text: RegExp) => [...document.querySelectorAll("button")].find((b) => text.test(b.textContent || "")) as HTMLButtonElement;
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("Check your old links", () => {
  it("lists the old addresses that would show page not found, and adds every suggested redirect at once", async () => {
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(RedirectsCard)));
    await flush();
    const address = [...document.querySelectorAll("input")].find((i) => i.placeholder === "yourshop.com") as HTMLInputElement;
    act(() => type(address, " moth.example "));
    await act(async () => { button(/Check old links/).click(); });
    await flush();

    expect(old.readOldLinks).toHaveBeenCalledWith("moth.example");
    const text = document.body.textContent || "";
    expect(text).toContain("5 old addresses on moth.example");
    expect(text).toContain("2 work");
    expect(text).toContain("3 would show page not found");
    expect(text).toContain("Salt Hours /books/salt-hours");
    expect(text).toContain("About the press /page/about");

    await act(async () => { button(/Add all 3 suggested redirects/).click(); });
    await flush();
    expect(api.saveRedirects).toHaveBeenCalledWith([
      { from: "/products/moth-songs", to: "/books/moth-songs" },
      { from: "/products/salt-hours", to: "/books/salt-hours" },
      { from: "/pages/about-us", to: "/page/about" },
      { from: "/blog/news", to: "/" },
    ]);
    // The rows move as soon as the redirects are saved.
    expect(document.body.textContent).toContain("None would show page not found");
  });

  it("shows the server's plain words when the old shop has no list of pages", async () => {
    old.readOldLinks.mockRejectedValueOnce(new Error("We couldn't find a list of your old shop's pages at that address."));
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(RedirectsCard)));
    await flush();
    const address = [...document.querySelectorAll("input")].find((i) => i.placeholder === "yourshop.com") as HTMLInputElement;
    act(() => type(address, "nowhere.example"));
    await act(async () => { button(/Check old links/).click(); });
    await flush();
    expect([...document.querySelectorAll('[role="alert"]')].some((a) => /couldn't find a list/.test(a.textContent || ""))).toBe(true);
  });

  it("brings the old shop's own pages over as drafts, each with a redirect from its old address (plan 23.6)", async () => {
    old.readOldLinks.mockResolvedValueOnce({ host: "moth.example", notes: [], paths: ["/pages/visit-us", "/pages/gone", "/old-news/x"] });
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(RedirectsCard)));
    await flush();
    const address = [...document.querySelectorAll("input")].find((i) => i.placeholder === "yourshop.com") as HTMLInputElement;
    act(() => type(address, "moth.example"));
    await act(async () => { button(/Check old links/).click(); });
    await flush();
    await act(async () => { button(/Bring your own pages over/).click(); });
    await flush();
    expect(old.readOldPages).toHaveBeenCalledWith("moth.example", ["/pages/visit-us", "/pages/gone", "/old-news/x"]);
    expect(api.createPage).toHaveBeenCalledWith({ title: "Visit us", slug: "visit-us", body: "<p>Come by.</p>", status: "draft", showInNav: false, order: 1 });
    const saved = api.saveRedirects.mock.calls.at(-1)![0] as any[];
    expect(saved).toContainEqual({ from: "/pages/visit-us", to: "/page/visit-us" });
    const text = document.body.textContent || "";
    expect(text).toContain("1 page brought over as drafts. Their photos are copied into your shop within the hour. 2 photos couldn't come over");
    expect(text).toContain("1 page left out");
    // The brought-over page's old address now has its redirect, so only the others still need a home.
    expect(text).toContain("2 would show page not found");
  });
});
