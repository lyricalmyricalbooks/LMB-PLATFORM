// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../components/sectionRender", () => ({
  GroupSections: ({ group }: any) => h("div", { "data-group": group }, "Join the newsletter"),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { PopupSections } = await import("./PopupSections");
const { CONSENT_EVENT, CONSENT_KEY } = await import("../../lib/consent");

const design = (extra: any = {}) => ({ overlaySections: [{ id: "p1", type: "Newsletter", settings: { title: "Join" } }], popupDelaySeconds: 0, ...extra });
const dialog = () => document.querySelector('[role="dialog"]');
let root: Root | null = null;

async function mount(d: any) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => { root!.render(h(PopupSections, { design: d })); });
}
const tick = (ms = 0) => act(async () => { vi.advanceTimersByTime(ms); });

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); });
afterEach(async () => {
  await act(async () => root?.unmount()); root = null;
  vi.useRealTimers();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("pop-up section group", () => {
  it("waits for the cookie answer, then the delay, and shows once per visit", async () => {
    await mount(design({ popupDelaySeconds: 3 }));
    await tick(5000);
    expect(dialog()).toBeNull();
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: true }));
    await act(async () => { window.dispatchEvent(new Event(CONSENT_EVENT)); });
    await tick(2000);
    expect(dialog()).toBeNull();
    await tick(1000);
    expect(dialog()?.textContent).toContain("Join the newsletter");
    const close = dialog()!.querySelector("button")!;
    expect(close.getAttribute("aria-label")).toBe("Close");
    await act(async () => { close.click(); });
    expect(dialog()).toBeNull();
    await act(async () => root!.unmount());
    await mount(design({ popupDelaySeconds: 3 }));
    await tick(5000);
    expect(dialog()).toBeNull();
  });

  it("does not wait for a cookie answer when the banner is off, and 'every page' shows again", async () => {
    sessionStorage.setItem("anything", "1");
    await mount(design({ showCookieBanner: false, popupFrequency: "always" }));
    await tick(0);
    expect(dialog()).not.toBeNull();
    await act(async () => { dialog()!.querySelector("button")!.click(); });
    await act(async () => root!.unmount());
    await mount(design({ showCookieBanner: false, popupFrequency: "always" }));
    await tick(0);
    expect(dialog()).not.toBeNull();
  });

  it("shows nothing without sections", async () => {
    await mount({ showCookieBanner: false, popupDelaySeconds: 0 });
    await tick(1000);
    expect(dialog()).toBeNull();
  });

  it("opens in the Studio preview only when Studio asks", async () => {
    window.history.replaceState(null, "", "/?preview=true");
    await mount(design({ showCookieBanner: false }));
    await tick(10000);
    expect(dialog()).toBeNull();
    await act(async () => { window.dispatchEvent(new CustomEvent("fm:studio-open-overlay", { detail: { overlay: "popup" } })); });
    expect(dialog()?.getAttribute("data-studio-target")).toBe("style:popup|copy:Sections");
    await act(async () => { window.dispatchEvent(new CustomEvent("fm:studio-open-overlay", { detail: { overlay: "close" } })); });
    expect(dialog()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});

describe("pop-up and the HTML prerender", () => {
  it("never opens while the prerender's suppression flag is set", async () => {
    const { POPUP_SUPPRESS_KEY } = await import("./sectionGroups");
    expect(POPUP_SUPPRESS_KEY).toBe("lm:popup-suppressed"); // scripts/prerender-storefront.mjs sets this literal
    sessionStorage.setItem(POPUP_SUPPRESS_KEY, "1");
    await mount(design({ showCookieBanner: false, popupFrequency: "always" }));
    await tick(10000);
    expect(dialog()).toBeNull();
  });
});

describe("pop-up opened by Studio before it mounted", () => {
  it("still opens when the request came first (the preview was loading)", async () => {
    window.history.replaceState(null, "", "/?preview=true");
    (window as any).__studioOpenOverlay = "popup";
    try {
      await mount(design({ showCookieBanner: false }));
      expect(dialog()).not.toBeNull();
    } finally { delete (window as any).__studioOpenOverlay; }
  });
});

describe("pop-up › when it opens", () => {
  const mouse = (fine: boolean) => {
    (window as any).matchMedia = (q: string) => ({ matches: q.includes("pointer: fine") ? fine : false, addEventListener() {}, removeEventListener() {} });
  };
  afterEach(() => { delete (window as any).matchMedia; });

  it("exit intent: opens only when the mouse leaves through the top of the window", async () => {
    mouse(true);
    await mount(design({ showCookieBanner: false, popupTrigger: "exit", popupDelaySeconds: 1 }));
    await tick(10000);
    expect(dialog()).toBeNull();
    await act(async () => { document.dispatchEvent(new MouseEvent("mouseout", { clientY: 300 })); });
    expect(dialog()).toBeNull();
    await act(async () => { document.dispatchEvent(new MouseEvent("mouseout", { clientY: -2 })); });
    expect(dialog()).not.toBeNull();
  });

  it("exit intent falls back to the delay on touch screens", async () => {
    mouse(false);
    await mount(design({ showCookieBanner: false, popupTrigger: "exit", popupDelaySeconds: 2 }));
    await tick(1000);
    expect(dialog()).toBeNull();
    await tick(1000);
    expect(dialog()).not.toBeNull();
  });

  it("scroll: waits until the shopper is part way down the page", async () => {
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
    await mount(design({ showCookieBanner: false, popupTrigger: "scroll", popupScrollPercent: 50 }));
    await tick(10000);
    expect(dialog()).toBeNull();
    (window as any).scrollY = 400;
    await act(async () => { window.dispatchEvent(new Event("scroll")); });
    expect(dialog()).toBeNull();
    (window as any).scrollY = 520;
    await act(async () => { window.dispatchEvent(new Event("scroll")); });
    expect(dialog()).not.toBeNull();
  });
});
