// @vitest-environment jsdom
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
// React 19 removed react-dom/test-utils' Simulate: set the value the way a browser does and fire real events.
const Simulate = {
  change(el: Element, init: { target: { value: string } }) {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, init.target.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  },
  keyDown(el: Element, init: KeyboardEventInit) {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  },
};

const { SectionFieldEditor, BlockFieldEditor, BlockListFieldEditor, getSectionFields, getBlockFields } = await import("../ThemeEditorExtensions");
const { StudioPickerProvider } = await import("./StudioPickers");

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.appendChild(host);
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); host.replaceChildren(); });

const DATA = {
  books: [
    { id: "b1", slug: "night-pages", title: "Night Pages", status: "published" },
    { id: "b2", slug: "paper-weather", title: "Paper Weather", status: "published" },
  ],
  pages: [{ id: "p1", slug: "about", title: "About", status: "published" }],
  categories: [{ id: "z", name: "Zines" }],
};
const field = (type: string, key: string, block = false) => (block ? getBlockFields(type) : getSectionFields(type)).find((f: any) => f.key === key)!;
const button = (name: string) => [...host.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === name || b.textContent === name)!;

function mount(render: () => any) {
  root = createRoot(host);
  act(() => root.render(h(StudioPickerProvider, { value: DATA }, render())));
}

describe("Studio pickers in the section editor", () => {
  it("a link field picks a custom page and saves the same href a typed link would", () => {
    let value = "";
    const draw = () => h(SectionFieldEditor, { field: field("ImageWithTextSection", "ctaUrl"), value, onChange: (v: string) => { value = v; } });
    mount(draw);
    act(() => button("Choose link: CTA link").click());
    const search = host.querySelector<HTMLInputElement>("[role=combobox]")!;
    expect(search.getAttribute("aria-label")).toBe("Find a page, category or book");
    act(() => Simulate.change(search, { target: { value: "about" } } as any));
    act(() => Simulate.keyDown(search, { key: "Enter" }));
    expect(value).toBe("/page/about");
    act(() => root.render(h(StudioPickerProvider, { value: DATA }, draw())));
    expect(host.textContent).toContain("About");
    expect(host.querySelector<HTMLInputElement>("input[aria-label='CTA link (address)']")!.value).toBe("/page/about");
  });

  it("a typed address still works and shows where it goes", () => {
    let value = "https://example.com/zine";
    mount(() => h(SectionFieldEditor, { field: field("HeroSection", "ctaUrl"), value, onChange: (v: string) => { value = v; } }));
    expect(host.textContent).toContain("Web address");
    act(() => Simulate.change(host.querySelector<HTMLInputElement>("input[aria-label='CTA link (optional) (address)']")!, { target: { value: "/collections/zines" } } as any));
    expect(value).toBe("/collections/zines");
  });

  it("the books picker keeps the saved comma-separated slugs, including ones not in the shop", () => {
    let value = "ghost-book";
    const draw = () => h(SectionFieldEditor, { field: field("ProductShowcaseGridSection", "manualSlugs"), value, onChange: (v: string) => { value = v; } });
    mount(draw);
    expect(host.textContent).toContain("“ghost-book” — not a book in the shop right now");
    act(() => button("Add a book: Books to show (for “Books I pick”)").click());
    const option = [...host.querySelectorAll("[role=option]")].find(o => o.textContent?.includes("Paper Weather"))!;
    act(() => (option as HTMLElement).click());
    expect(value).toBe("ghost-book, paper-weather");
    act(() => root.render(h(StudioPickerProvider, { value: DATA }, draw())));
    act(() => button("Move Paper Weather up").click());
    expect(value).toBe("paper-weather, ghost-book");
    act(() => root.render(h(StudioPickerProvider, { value: DATA }, draw())));
    act(() => button("Remove ghost-book").click());
    expect(value).toBe("paper-weather");
  });

  it("the book picker saves a book slug for the staff notes table", () => {
    let value = "";
    mount(() => h(BlockFieldEditor, { field: field("StaffNotesTableSection", "slug", true), value, onChange: (v: string) => { value = v; } }));
    act(() => button("Choose book: Book").click());
    const search = host.querySelector<HTMLInputElement>("[role=combobox]")!;
    act(() => Simulate.change(search, { target: { value: "night" } } as any));
    act(() => Simulate.keyDown(search, { key: "Enter" }));
    expect(value).toBe("night-pages");
  });

  it("the category picker saves the category name", () => {
    let value = "";
    mount(() => h(SectionFieldEditor, { field: field("ProductGridHeaderSection", "productCategory"), value, onChange: (v: string) => { value = v; } }));
    expect(host.textContent).toContain("Blank = every book");
    act(() => button("Choose category: Shop category (for “Books in a shop category”)").click());
    act(() => ([...host.querySelectorAll("[role=option]")][0] as HTMLElement).click());
    expect(value).toBe("Zines");
  });

  it("list rows with links (Multicolumn › Links) get a link picker per row", () => {
    let value: any = [{ text: "Read", url: "" }];
    mount(() => h(BlockListFieldEditor, { field: field("MulticolumnSection", "links", true) as any, value, onChange: (v: any) => { value = v; } }));
    act(() => button("Choose link: Link 1 · Link").click());
    const search = host.querySelector<HTMLInputElement>("[role=combobox]")!;
    act(() => Simulate.change(search, { target: { value: "night" } } as any));
    act(() => Simulate.keyDown(search, { key: "Enter" }));
    expect(value).toEqual([{ text: "Read", url: "/books/night-pages" }]);
  });

  it("the video picker says whether the link will play", () => {
    mount(() => h(SectionFieldEditor, { field: field("VideoSection", "videoUrl"), value: "https://youtube.com/shorts/abcdefgh", onChange: () => {} }));
    expect(host.textContent).toContain("won't play here");
  });

  it("the font picker keeps a font name typed before pickers existed", () => {
    let value = "Comic Neue";
    mount(() => h(SectionFieldEditor, { field: field("PageContentSection", "titleFont"), value, onChange: (v: string) => { value = v; } }));
    const select = host.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("Comic Neue");
    expect(select.options[0].textContent).toBe("Same as heading font");
    act(() => Simulate.change(select, { target: { value: "" } } as any));
    expect(value).toBe("");
  });
});
