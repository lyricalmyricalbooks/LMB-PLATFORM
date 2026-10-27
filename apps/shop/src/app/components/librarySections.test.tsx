// @vitest-environment jsdom
// Studio 2.6 sections: Featured collection, Book spotlight, Praise quotes, Promo strip, Newsletter sign-up (pop-up)
// and the sticky add-to-bag bar.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cart = vi.hoisted(() => ({ addToCart: vi.fn(() => true) }));
const signup = vi.hoisted(() => ({ subscribeNewsletter: vi.fn(async () => {}) }));
vi.mock("../CartContext", () => ({ useCart: () => cart, catalogUnitPrice: (b: any, v?: any) => Number(v?.price ?? b.retailPrice) }));
vi.mock("../features/site/newsletterSignup", async (orig) => ({ ...(await orig() as any), subscribeNewsletter: signup.subscribeNewsletter }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const Sections: Record<string, any> = await import("./SectionComponents");
const { SectionPageContext, SectionDesignContext } = await import("./sectionCopy");
const { CurrencyProvider } = await import("../CurrencyContext");

const BOOKS = [
  { id: "b1", slug: "one", title: "Zqx One", retailPrice: 30, stockLevel: 5, status: "published", categories: ["Books"], photos: [{ url: "https://example.com/1.jpg" }] },
  { id: "b2", slug: "two", title: "Zqx Two", retailPrice: 25, stockLevel: 3, status: "published", categories: ["Zines"], authorName: "A. Writer" },
];

let root: Root | null = null;
async function render(type: string, settings: any, page: any = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(h(CurrencyProvider, null, h(SectionDesignContext.Provider, { value: { categories: [{ name: "Books" }, { name: "Zines" }] } },
      h(SectionPageContext.Provider, { value: page }, h(Sections[type], { settings: { __sectionId: "s1", ...settings }, books: BOOKS, enableAnimations: false })))));
  });
  return el;
}

beforeEach(() => { cart.addToCart.mockClear(); signup.subscribeNewsletter.mockClear(); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; window.history.replaceState(null, "", "/"); });

describe("Featured collection", () => {
  it("shows only the chosen category, as book cards, with a View all link to it", async () => {
    const el = await render("FeaturedCollectionSection", { productCategory: "Zines", title: "Zines", viewAllText: "All zines" });
    expect(el.textContent).toContain("Zqx Two");
    expect(el.textContent).not.toContain("Zqx One");
    expect(el.querySelector(".fm-card .fm-card-title")?.textContent).toBe("Zqx Two");
    expect(el.querySelector("a")?.getAttribute("href")).toMatch(/\/collections\/zines$/);
  });
  it("shows nothing when the category has no books", async () => {
    const el = await render("FeaturedCollectionSection", { productCategory: "Nothing here" });
    expect(el.querySelector("section")).toBeNull();
  });
});

describe("Book spotlight", () => {
  it("shows the book on a book page when none is picked, and a picked book elsewhere", async () => {
    let el = await render("BookSpotlightSection", { quote: "Remarkable.", quoteSource: "The Paper" }, { book: BOOKS[1] });
    expect(el.querySelector(".fm-card-title")?.textContent).toBe("Zqx Two");
    expect(el.textContent).toContain("A. Writer");
    expect(el.textContent).toContain("“Remarkable.”");
    await act(async () => root!.unmount());
    el = await render("BookSpotlightSection", { productSlug: "one" }, { book: BOOKS[1] });
    expect(el.querySelector(".fm-card-title")?.textContent).toBe("Zqx One");
  });
});

describe("Praise quotes and promo strip", () => {
  it("lists quotes with their source and publication", async () => {
    const el = await render("PraiseQuotesSection", { items: [{ id: "q1", quote: "A triumph.", source: "Reviewer", publication: "Weekly", linkUrl: "https://example.com/r" }] });
    expect(el.querySelector("blockquote")?.textContent).toBe("A triumph.");
    expect(el.querySelector("figcaption")?.textContent).toBe("Reviewer · Weekly");
    expect(el.querySelector("figcaption a")?.getAttribute("href")).toBe("https://example.com/r");
  });
  it("shows no sample quotes to shoppers", async () => {
    const el = await render("PraiseQuotesSection", { items: [] });
    expect(el.querySelector("section")).toBeNull();
  });
  it("links the promo strip inside the shop", async () => {
    const el = await render("PromoStripSection", { text: "Sale on", linkText: "Shop", linkUrl: "/collections/sale" });
    expect(el.textContent).toContain("Sale on");
    expect(el.querySelector("a")?.getAttribute("href")).toMatch(/\/collections\/sale$/);
  });
});

describe("Newsletter sign-up (pop-up)", () => {
  const type = (el: HTMLElement, value: string) => {
    const input = el.querySelector("input[type=email]") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const submit = (el: HTMLElement) => act(async () => { el.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

  it("asks again for an invalid address and signs up a valid one", async () => {
    const el = await render("NewsletterPopupSection", { errorMessage: "Check it", successMessage: "Welcome" });
    await act(async () => type(el, "not-an-email"));
    await submit(el);
    expect(el.querySelector("[role=alert]")?.textContent).toBe("Check it");
    expect(signup.subscribeNewsletter).not.toHaveBeenCalled();
    await act(async () => type(el, "reader@example.com"));
    await submit(el);
    expect(signup.subscribeNewsletter).toHaveBeenCalledWith("reader@example.com", "website-popup");
    expect(el.querySelector("[role=status]")?.textContent).toBe("Welcome");
  });
  it("never adds an address from the Studio preview", async () => {
    window.history.replaceState(null, "", "/?preview=true");
    const el = await render("NewsletterSection", {});
    await act(async () => type(el, "owner@example.com"));
    await submit(el);
    expect(signup.subscribeNewsletter).not.toHaveBeenCalled();
    expect(el.querySelector("[role=status]")).not.toBeNull();
  });
});

describe("Sticky add-to-bag bar", () => {
  it("adds a plain book straight to the bag", async () => {
    const el = await render("StickyAddToBagSection", {}, { book: BOOKS[0] });
    const button = el.querySelector("button")!;
    expect(button.textContent).toBe("Add to bag");
    await act(async () => button.click());
    expect(cart.addToCart).toHaveBeenCalledWith(BOOKS[0], undefined);
  });
  it("sends shoppers to the buy box when there is a choice to make, and says when sold out", async () => {
    let el = await render("StickyAddToBagSection", {}, { book: { ...BOOKS[0], variants: [{ id: "v1", price: 10, stockLevel: 2 }, { id: "v2", price: 12, stockLevel: 2 }] } });
    expect(el.querySelector("button")!.textContent).toBe("Choose options");
    await act(async () => el.querySelector("button")!.click());
    expect(cart.addToCart).not.toHaveBeenCalled();
    await act(async () => root!.unmount());
    el = await render("StickyAddToBagSection", {}, { book: { ...BOOKS[0], stockLevel: 0 } });
    expect(el.querySelector("button")!.textContent).toBe("Sold out");
    expect((el.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  });
  it("renders nothing outside a book page", async () => {
    const el = await render("StickyAddToBagSection", {});
    expect(el.querySelector("section")).toBeNull();
  });
});
