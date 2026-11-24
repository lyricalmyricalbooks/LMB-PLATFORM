// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChooseLookWelcome } from "./ChooseLookWelcome";
import { builtLooks, filterLooks } from "../lookGallery";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const mount = async (props: Record<string, unknown> = {}) => {
  const onDone = vi.fn(async () => {});
  const apply = vi.fn(async () => {});
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(ChooseLookWelcome, { publishes: "books", settings: { info: { name: "Moth Press" } }, onDone, apply, guidedStart: false, ...props })));
  await flush();
  return { onDone, apply };
};
const button = (label: string, scope: ParentNode = document) => [...scope.querySelectorAll("button")].find(b => (b.textContent?.trim() === label || b.getAttribute("aria-label") === label)) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); await flush(); };
const dialog = () => document.querySelector("[role=dialog]") as HTMLElement | null;
const title = () => dialog()?.querySelector("h2")?.textContent;

describe("Choose your look as a theme store", () => {
  it("draws a whole shop page for every card, with the press's name, and filters the list", async () => {
    await mount();
    const others = builtLooks();
    // One general list of the built looks: no suggested section, nothing behind a "see all" button.
    expect(others).toHaveLength(13);
    expect(document.querySelector("ul[aria-label='Suggested looks']")).toBeNull();
    expect(document.body.textContent).not.toContain("Suggested for you");
    expect(document.querySelectorAll("ul[aria-label='Looks'] > li")).toHaveLength(others.length);
    expect(document.querySelectorAll("[data-look-stage]").length).toBeGreaterThanOrEqual(others.length);
    expect(document.body.innerHTML).toContain("Moth Press in this look, desktop width");
    await click(document.getElementById("rp-tab-looks-bold") as HTMLElement);
    expect(document.querySelectorAll("ul[aria-label='Looks'] > li")).toHaveLength(filterLooks(others, "bold").length);
    await click(document.getElementById("rp-tab-looks-dark") as HTMLElement);
    expect(document.querySelectorAll("ul[aria-label='Looks'] > li")).toHaveLength(filterLooks(others, "dark").length);
  });

  it("loads each look's own type so the try-on shows real faces", async () => {
    await mount();
    const fonts = [...document.head.querySelectorAll("link[data-look-font]")].map(l => l.getAttribute("data-look-font"));
    expect(fonts).toContain("Cormorant Garamond");
    expect(new Set(fonts).size).toBe(fonts.length);
  });

  it("Try it on opens the look full screen; the arrows flip looks, and the screen and page switch", async () => {
    await mount();
    const first = builtLooks()[0];
    await click(button(`Try on ${first.name}`));
    expect(title()).toBe(`Try on: ${first.name}`);
    expect(dialog()!.querySelector("[data-try-on-stage]")).not.toBeNull();
    await click(button("Next look", dialog()!));
    expect(title()).toBe(`Try on: ${builtLooks()[1].name}`);
    await click(button("Previous look", dialog()!));
    await click(button("Previous look", dialog()!));
    expect(title()).not.toBe(`Try on: ${first.name}`);
    await click(button("Next look", dialog()!));
    expect(title()).toBe(`Try on: ${first.name}`);

    await click(button("Phone", dialog()!));
    expect(dialog()!.querySelector("[data-try-on-stage]")!.getAttribute("data-try-on-stage")).toBe("phone");
    expect(button("Phone", dialog()!).getAttribute("aria-pressed")).toBe("true");
    await click(button("Product page", dialog()!));
    expect(dialog()!.textContent).toContain("Shipping & returns");
    expect(dialog()!.querySelector("[role=img]")!.getAttribute("aria-label")).toContain("phone screen, product page");

    const keyed = dialog()!.querySelector("[data-try-on-stage]")!;
    await act(async () => { keyed.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(title()).toBe(`Try on: ${builtLooks()[1].name}`);
  });

  it("choosing from the try-on records that look", async () => {
    const { onDone, apply } = await mount();
    const look = builtLooks()[3];
    await click(button(`Try on ${look.name}`));
    await click(button(`Use ${look.name}`, dialog()!));
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: look.id }), expect.anything(), "books");
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ theme: look.id }));
  });

  it("shows the press's own products, with a switch back to samples", async () => {
    await mount({ books: [{ title: "Moth Hours", photo: "https://cdn.example/m.jpg" }] });
    expect(document.body.textContent).toContain("Moth Hours");
    await click(button(`Try on ${builtLooks()[0].name}`));
    expect(button("Your products", dialog()!).getAttribute("aria-pressed")).toBe("true");
    expect(dialog()!.querySelector("img[src='https://cdn.example/m.jpg']")).not.toBeNull();
    await click(button("Samples", dialog()!));
    expect(dialog()!.querySelector("img[src='https://cdn.example/m.jpg']")).toBeNull();
    expect(dialog()!.textContent).toContain("Example clothbound book");
  });

  it("Show with swaps the sample set the look is shown with, the shop's own set first", async () => {
    await mount({ publishes: "clothing" });
    await click(button(`Try on ${builtLooks()[0].name}`));
    const group = () => dialog()!.querySelector("[data-show-with]") as HTMLElement;
    const labels = [...group().querySelectorAll("button")].map(b => b.textContent?.trim());
    expect(labels).toEqual(["Clothing", "Home goods", "Books and prints"]);
    expect(button("Clothing", group()).getAttribute("aria-pressed")).toBe("true");
    expect(dialog()!.textContent).toContain("Example wool sweater");
    await click(button("Home goods", group()));
    expect(button("Home goods", group()).getAttribute("aria-pressed")).toBe("true");
    expect(dialog()!.textContent).not.toContain("Example wool sweater");
    expect(dialog()!.innerHTML).toContain("/samples/home/");
  });

  it("Show with stays out of the way while the press looks at its own products, and for services", async () => {
    await mount({ publishes: "clothing", books: [{ title: "Wool Hat", photo: "https://cdn.example/h.jpg" }] });
    await click(button(`Try on ${builtLooks()[0].name}`));
    expect(dialog()!.querySelector("[data-show-with]")).toBeNull();
    await click(button("Samples", dialog()!));
    expect(dialog()!.querySelector("[data-show-with]")).not.toBeNull();
    act(() => root?.unmount()); root = null; document.body.innerHTML = "";
    await mount({ publishes: "hair" });
    await click(button(`Try on ${builtLooks()[0].name}`));
    expect(dialog()!.querySelector("[data-show-with]")).toBeNull();
  });

  it("a shop that doesn't sell books sees samples and words for what it sells", async () => {
    await mount({ publishes: "clothing" });
    expect(document.body.textContent).toContain("Example wool sweater");
    expect(document.body.textContent).not.toContain("Example clothbound book");
    await click(button(`Try on ${builtLooks()[0].name}`));
    await click(button("Product page", dialog()!));
    expect(dialog()!.textContent).toContain("Gift wrapped");
    expect(dialog()!.textContent).not.toContain("Paperback");
  });

  it("the full view is clickable: a product opens its page, Bag opens the bag, and the shop name goes home", async () => {
    await mount({ publishes: "clothing" });
    await click(button(`Try on ${builtLooks()[0].name}`));
    const stage = () => dialog()!.querySelector("[data-look-stage]") as HTMLElement;
    expect(stage().hasAttribute("data-live")).toBe(true);
    await click(stage().querySelector("[data-go='product:1']") as HTMLElement);
    expect(button("Product page", dialog()!).getAttribute("aria-pressed")).toBe("true");
    expect(dialog()!.textContent).toContain("Example ribbed knit");
    await click(stage().querySelector("[data-go='bag']") as HTMLElement);
    expect(button("Bag", dialog()!).getAttribute("aria-pressed")).toBe("true");
    expect(dialog()!.textContent).toContain("Your bag");
    expect(dialog()!.textContent).toContain("Subtotal");
    await click(stage().querySelector("[data-go='home']") as HTMLElement);
    expect(button("Home page", dialog()!).getAttribute("aria-pressed")).toBe("true");
  });

  it("Use and customize records the look, then opens the designer", async () => {
    const { onDone, apply } = await mount();
    const look = builtLooks()[2];
    await click(button(`Try on ${look.name}`));
    await click(button("Use and customize", dialog()!));
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: look.id }), expect.anything(), "books");
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ theme: look.id }));
    expect(window.location.hash).toBe("#settings/designer");
  });
});
