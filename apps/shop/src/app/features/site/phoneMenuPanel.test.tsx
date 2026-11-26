// @vitest-environment jsdom
// Plan "Starters on par", step 3: Style › Header layout › "Menu button opens a full-screen panel". The panel covers the
// page (a portal on <body>, so the header's blur can't squeeze it), stops the page scrolling, and closes on Escape or a link.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MobileStorefrontNav } from "./MobileStorefrontNav";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement;
const design = { phoneMenuFullScreen: true, navShopLink: "menu", hideCurrencySelector: true, showSocialInMobileMenu: false,
  categories: [{ id: "a", name: "Bread", showInNav: true }] };
const pages = [{ id: "p", title: "About", slug: "about", showInNav: true, status: "published" }];
const render = async (d: any) => act(async () => root.render(h(MemoryRouter, null,
  h("header", null, h(MobileStorefrontNav, { design: d, pages, onSearch: () => {}, everywhere: true })))));

beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.style.overflow = ""; });

describe("full-screen phone menu", () => {
  it("opens over the whole page with the Shop link, its categories and the pages", async () => {
    await render(design);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const button = host.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    await act(async () => button.click());
    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.parentElement).toBe(document.body);
    expect(panel.hasAttribute("data-fm-store")).toBe(true);
    expect([...panel.querySelectorAll("a")].map((a) => a.textContent)).toEqual(expect.arrayContaining(["Shop", "Bread", "About"]));
    expect(panel.querySelector('a[href="/collections/all"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on Escape and on a link, giving the page its scrolling back", async () => {
    await render(design);
    const button = host.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    await act(async () => button.click());
    await act(async () => document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    await act(async () => button.click());
    await act(async () => document.querySelector<HTMLAnchorElement>('[role="dialog"] a[href="/page/about"]')!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the small drop-down when the switch is off (the default)", async () => {
    await render({ ...design, phoneMenuFullScreen: undefined });
    expect(host.querySelector("details")).not.toBeNull();
    expect(host.querySelector('button[aria-haspopup="dialog"]')).toBeNull();
  });
});
