// @vitest-environment jsdom
// Style › Header & announcement bar › Close button: shoppers close the bar until its messages change.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./useSiteData", () => ({ useSiteData: () => ({ settings: {}, pages: [], books: [], loading: false, fresh: true }), useLiveDesign: () => ({}) }));
vi.mock("../../CartContext", () => ({ useCart: () => ({ cartCount: 0, cartTotal: 0, setIsCartOpen: () => {}, addToCart: () => true, cart: [] }), catalogUnitPrice: () => 0 }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../components/sectionRender", () => ({ SectionList: () => null, GlobalSections: () => null, GroupSections: () => null, TemplateSections: () => null }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { StoreHeader } = await import("./StoreHeader");
const { CurrencyProvider } = await import("../../CurrencyContext");
const { announcementSignature, resetAnnouncementDismissal, ANNOUNCE_CLOSED_KEY } = await import("./announcementDismiss");

let root: Root | null = null;
async function mount(design: any) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root!.render(h(MemoryRouter, null, h(CurrencyProvider, null, h(StoreHeader, { design, pages: [], books: [] } as any)))); });
}
const bar = () => document.querySelector('[data-studio-label="Announcement bar"]') as HTMLElement | null;
const closeButton = () => document.querySelector(".fm-announce-close") as HTMLButtonElement | null;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  resetAnnouncementDismissal();
});

describe("announcementSignature", () => {
  it("changes when a message's words or link change, and not otherwise", () => {
    const a = announcementSignature([{ text: "Free shipping" }]);
    expect(announcementSignature([{ text: "Free shipping" }])).toBe(a);
    expect(announcementSignature([{ text: "Free shipping!" }])).not.toBe(a);
    expect(announcementSignature([{ text: "Free shipping", link: "/x" }])).not.toBe(a);
  });
});

describe("announcement close button", () => {
  it("is not there while the switch is off (the bar draws as before)", async () => {
    await mount({ showAnnouncement: true, announcementText: "Hello" });
    expect(bar()).not.toBeNull();
    expect(closeButton()).toBeNull();
    expect(bar()!.className).toContain("px-6");
  });

  it("closes the bar, remembers it, and shows it again for a new message", async () => {
    const design = { showAnnouncement: true, announcementDismissible: true, announcementText: "Hello" };
    await mount(design);
    expect(closeButton()?.getAttribute("aria-label")).toBe("Close announcement");
    await act(async () => { closeButton()!.click(); });
    expect(bar()).toBeNull();
    expect(window.localStorage.getItem(ANNOUNCE_CLOSED_KEY)).toBe(announcementSignature([{ text: "Hello" }]));
    // The header no longer leaves room for the bar.
    expect(document.querySelector("header[data-fm-header]")?.className).toContain("top-0");

    await act(async () => root?.unmount());
    await mount(design);
    expect(bar()).toBeNull();

    await act(async () => root?.unmount());
    await mount({ ...design, announcementText: "New zine out" });
    expect(bar()?.textContent).toBe("New zine out");
  });

  it("uses the words from Text & labels › Header", async () => {
    await mount({ showAnnouncement: true, announcementDismissible: true, announcementText: "Hi", copy: { announceClose: "Hide this" } });
    expect(closeButton()?.getAttribute("aria-label")).toBe("Hide this");
  });

  it("also closes the scrolling ticker", async () => {
    await mount({ showAnnouncement: true, announcementDismissible: true, announcementScrolling: true, announcementText: "Ticker" });
    await act(async () => { closeButton()!.click(); });
    expect(bar()).toBeNull();
  });
});
