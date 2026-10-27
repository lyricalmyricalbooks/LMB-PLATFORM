// @vitest-environment jsdom
// Studio 2.2: several announcement messages take turns (pausing on hover), each can link somewhere.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./useSiteData", () => ({ useSiteData: () => ({ settings: {}, pages: [], books: [], loading: false, fresh: true }), useLiveDesign: () => ({}) }));
vi.mock("../../CartContext", () => ({ useCart: () => ({ cartCount: 0, cartTotal: 0, setIsCartOpen: () => {}, addToCart: () => true, cart: [] }), catalogUnitPrice: () => 0 }));
vi.mock("../../../lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../../components/sectionRender", () => ({ SectionList: () => null, GlobalSections: () => null, GroupSections: () => null, TemplateSections: () => null }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { StoreHeader } = await import("./StoreHeader");
const { CurrencyProvider } = await import("../../CurrencyContext");

let root: Root | null = null;
async function mount(design: any) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root!.render(h(MemoryRouter, null, h(CurrencyProvider, null, h(StoreHeader, { design, pages: [], books: [] } as any)))); });
}
const bar = () => document.querySelector('[data-studio-label="Announcement bar"]') as HTMLElement | null;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-09T16:00:00Z")); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; vi.useRealTimers(); document.body.innerHTML = ""; });

describe("announcement bar messages", () => {
  const design = {
    showAnnouncement: true,
    announcementRotateSeconds: 3,
    announcements: [
      { id: "1", text: "Free shipping over $50" },
      { id: "2", text: "New zine out", link: "/collections/zines" },
      { id: "3", text: "Not yet", from: "2026-12-01" },
    ],
  };
  it("rotates through today's messages and links the ones with a link", async () => {
    await mount(design);
    expect(bar()?.textContent).toBe("Free shipping over $50");
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(bar()?.textContent).toBe("New zine out");
    expect(bar()?.querySelector("a")?.getAttribute("href")).toBe("/collections/zines");
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(bar()?.textContent).toBe("Free shipping over $50");
  });
  it("pauses while the pointer is over it", async () => {
    await mount(design);
    await act(async () => { bar()!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(bar()?.textContent).toBe("Free shipping over $50");
  });
  it("keeps the single announcement text when there is no list", async () => {
    await mount({ showAnnouncement: true, announcementText: "Hello" });
    expect(bar()?.textContent).toBe("Hello");
    expect(bar()?.querySelector("[data-studio-edit-value]")).not.toBeNull();
  });
});

describe("announcement countdown", () => {
  const ending = { showAnnouncement: true, announcements: [{ id: "1", text: "Sale today", until: "2026-10-09" }] };
  it("adds nothing while the switch is off (default)", async () => {
    await mount(ending);
    expect(bar()?.textContent).toBe("Sale today");
    expect(bar()?.querySelector(".fm-announce-countdown")).toBeNull();
  });
  it("counts down to the end of the Show until day and keeps ticking", async () => {
    await mount({ ...ending, announcementCountdown: true });
    expect(bar()?.querySelector(".fm-announce-countdown")?.textContent).toBe("Ends in 12h 0m");
    expect(bar()?.querySelector(".fm-announce-countdown")?.getAttribute("translate")).toBe("no");
    await act(async () => { vi.advanceTimersByTime(11.5 * 3_600_000); });
    expect(bar()?.querySelector(".fm-announce-countdown")?.textContent).toBe("Ends in 30 min");
  });
  it("waits until the message is inside the window and uses Text & labels words", async () => {
    await mount({ showAnnouncement: true, announcementCountdown: true, announcementCountdownWithin: 24, copy: { announceEndsDays: "Last {days} days" },
      announcements: [{ id: "1", text: "Far off", until: "2026-10-20" }] });
    expect(bar()?.querySelector(".fm-announce-countdown")).toBeNull();
  });
});
