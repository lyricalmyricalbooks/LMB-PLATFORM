// @vitest-environment jsdom
// The shop card's second photo (Studio › Style › Book cards in the shop grid › showCardHoverPhoto) is fetched
// only after a mouse points at the card or the card gets keyboard focus; a touch never loads it.
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import CardHoverPhoto from "./CardHoverPhoto";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(h("div", { className: "fm-card group" }, h("a", { href: "#" }, h(CardHoverPhoto, { photo: { url: "https://x/2.jpg" }, sizes: "300px" })))));
  const card = host.querySelector(".fm-card") as HTMLElement;
  return { host, card, root };
}
function pointer(el: HTMLElement, pointerType: string) {
  const e = new Event("pointerenter") as any;
  e.pointerType = pointerType;
  act(() => { el.dispatchEvent(e); });
}

it("loads nothing until a mouse points at the card", () => {
  const { host, card, root } = mount();
  expect(host.querySelector("img")).toBeNull();
  pointer(card, "touch");
  expect(host.querySelector("img")).toBeNull();
  pointer(card, "mouse");
  const img = host.querySelector("img[data-fm-hover-photo]") as HTMLImageElement;
  expect(img.getAttribute("src")).toBe("https://x/2.jpg");
  expect(img.getAttribute("alt")).toBe("");
  expect(img.getAttribute("aria-hidden")).toBe("true");
  act(() => root.unmount());
});

it("loads on keyboard focus too", () => {
  const { host, card, root } = mount();
  act(() => { (card.querySelector("a") as HTMLElement).dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
  expect(host.querySelector("img[data-fm-hover-photo]")).not.toBeNull();
  act(() => root.unmount());
});
