// @vitest-environment jsdom
// Back to top button (Studio › Style › Footer & social links › showBackToTop): off by default; when on it
// stays hidden near the top, shows after scrolling and takes the shopper back up.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BackToTop } from "./BackToTop";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLElement | null = null;
async function mount(design: any) {
  el = document.createElement("div"); document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(h(BackToTop, { design })));
  return el.querySelector<HTMLButtonElement>(".fm-back-to-top");
}
afterEach(async () => { await act(async () => root?.unmount()); el?.remove(); Object.defineProperty(window, "scrollY", { value: 0, configurable: true }); });

it("renders nothing by default", async () => {
  expect(await mount({})).toBeNull();
});

it("shows after scrolling and goes back to the top", async () => {
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  const button = await mount({ showBackToTop: true, backToTopPosition: "left" });
  expect(button?.dataset.shown).toBe("false");
  expect(button?.dataset.side).toBe("left");
  expect(button?.getAttribute("aria-label")).toBe("Back to top");
  Object.defineProperty(window, "scrollY", { value: 3000, configurable: true });
  await act(async () => { window.dispatchEvent(new Event("scroll")); await new Promise((r) => setTimeout(r, 30)); });
  expect(button?.dataset.shown).toBe("true");
  const scrollTo = vi.fn(); (window as any).scrollTo = scrollTo;
  await act(async () => button!.click());
  expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
});

it("uses the Text & labels words", async () => {
  const button = await mount({ showBackToTop: true, copy: { backToTop: "Up" } });
  expect(button?.textContent).toBe("Up");
});
