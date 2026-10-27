// @vitest-environment jsdom
// "Ask a question about this book" (Studio › Style › Book page · photos & layout › showPdpAskQuestion): off by
// default; when on, the form sends one contactMessages row naming the book.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ data: {} as any }));
const sent = vi.hoisted(() => [] as any[]);
vi.mock("../../useSiteData", () => ({ useSiteData: () => site.data, useLiveDesign: () => site.data.settings?.design || {} }));
vi.mock("../../../../CartContext", async (orig) => ({ ...(await orig() as any), useCart: () => ({ addToCart: () => true, setIsCartOpen: () => {}, cartCount: 0, cart: [] }) }));
vi.mock("../../../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../shippingProfilesLoad", () => ({ loadShippingProfiles: async () => [] }));
vi.mock("../../contactMessages", () => ({ submitContactMessage: async (m: any) => { sent.push(m); } }));
vi.mock("../../../../lib/seo", () => ({ useSEO: () => {} }));
vi.mock("../../../../lib/reviews", () => ({ reviewsApi: { listApproved: async () => [], summary: async () => null } }));
vi.mock("../../../../lib/commerce", () => ({ funnelApi: new Proxy({}, { get: () => () => {} }) }));
vi.mock("../../../../components/sectionRender", () => ({ TemplateSections: () => null, GlobalSections: () => null, SectionList: () => null }));
vi.mock("../../RecentlyViewedRow", () => ({ default: () => null }));
vi.mock("../../ReviewsSection", () => ({ default: () => null }));
vi.mock("../../StoreHeader", () => ({ StoreHeader: () => null }));
vi.mock("../../StoreFooter", () => ({ StoreFooter: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).fetch = () => Promise.reject(new Error("offline"));

const { default: BookDetail } = await import("../../BookDetail");
const { CurrencyProvider } = await import("../../../../CurrencyContext");

const book = { id: "pb", slug: "pb", title: "Printed Book", status: "published", format: "Paperback", stockLevel: 0, trackInventory: true, retailPrice: 30, photos: [{ id: "p", url: "https://example.com/1.jpg" }] };
async function page(design: any) {
  site.data = { books: [book], settings: { design, policies: {}, info: {} }, pages: [], loading: false, fresh: true };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: ["/books/pb"] },
      h(CurrencyProvider, null, h(Routes, null, h(Route, { path: "/books/:slug", element: h(BookDetail) })))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, done: async () => { await act(async () => root.unmount()); el.remove(); } };
}
const box = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-studio-region="productAskQuestion"], .fm-pdp-ask');
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

it("is off by default", async () => {
  const { el, done } = await page({});
  expect(box(el)).toBeNull();
  await done();
});

it("shows on a sold-out book and sends the question to Messages", async () => {
  const { el, done } = await page({ showPdpAskQuestion: true });
  const b = box(el)!;
  expect(b.textContent).toContain("Ask a question about this book");
  const form = b.querySelector("form")!;
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(b.querySelector('[role="alert"]')?.textContent).toMatch(/valid email/);
  expect(sent).toHaveLength(0);
  const [name, email] = Array.from(b.querySelectorAll<HTMLInputElement>('input:not([name="website"])'));
  await act(async () => { type(name, "Ana"); type(email, "Ana@Example.com"); type(b.querySelector("textarea")!, "Is it signed?"); });
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(sent).toEqual([expect.objectContaining({ name: "Ana", email: "Ana@Example.com", subject: "Question about Printed Book", message: "Is it signed?" })]);
  expect(b.querySelector('[role="status"]')?.textContent).toMatch(/Thanks/);
  await done();
});
