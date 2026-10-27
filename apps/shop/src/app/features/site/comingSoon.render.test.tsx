// @vitest-environment jsdom
// Coming soon (Books › Inventory › Coming soon) on the product page: never "Sold out", a Coming soon button
// instead of Add to bag, and pressing it opens the "email me when it's out" signup.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
const added = vi.hoisted(() => ({ count: 0 }));
vi.mock("./useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => { added.count++; return true; }, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));
vi.mock("../../lib/reviews", () => ({ reviewsApi: { listApproved: async () => [], summary: async () => null } }));
vi.mock("../../lib/commerce", () => ({ funnelApi: new Proxy({}, { get: () => () => {} }) }));
vi.mock("../../components/sectionRender", () => ({ TemplateSections: () => null, GlobalSections: () => null, SectionList: () => null }));
vi.mock("./RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("./ReviewsSection", () => ({ default: () => null }));
vi.mock("./StoreHeader", () => ({ StoreHeader: () => null }));
vi.mock("./StoreFooter", () => ({ StoreFooter: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { default: BookDetail } = await import("./BookDetail");
const { CurrencyProvider } = await import("../../CurrencyContext");

const book = { id: "soon", slug: "soon", title: "Soon Book", status: "published", comingSoon: true, publishDate: "2099-01-01", stockLevel: 0, trackInventory: true, retailPrice: 30, photos: [{ id: "p", url: "https://example.com/1.jpg" }] };

async function page(design: any) {
  site.data = { books: [book], settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: ["/books/soon"] },
      h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  return { el, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}

it("shows Coming soon, not Sold out, and the button opens the signup", async () => {
  const { el, done } = await page({});
  const card = el.querySelector(".fm-pdp-card")!;
  expect(card.textContent).not.toMatch(/sold out/i);
  expect(card.querySelector(".fm-pdp-stock")?.getAttribute("data-state")).toBe("soon");
  expect(card.querySelector(".fm-pdp-stock")?.textContent).toMatch(/^Coming .*2099/);
  const button = card.querySelector<HTMLButtonElement>('button[data-section="buttons"]')!;
  expect(button.textContent).toMatch(/COMING SOON/);
  expect(button.disabled).toBe(false);
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(el.querySelector("#pdp-coming-soon-signup")).toBeNull();
  await act(async () => { button.click(); });
  const signup = el.querySelector("#pdp-coming-soon-signup");
  expect(signup?.textContent).toMatch(/Email me when it's out/);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(added.count).toBe(0);
  await done();
});

it("with the signup box hidden in Studio the button is just a label", async () => {
  const { el, done } = await page({ showComingSoonSignup: false });
  const button = el.querySelector<HTMLButtonElement>('.fm-pdp-card button[data-section="buttons"]')!;
  expect(button.textContent?.trim()).toBe("Coming soon");
  expect(button.disabled).toBe(true);
  await done();
});
