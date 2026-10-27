// @vitest-environment jsdom
// The category drop-down panel is position:fixed. Inside the modern sticky header (backdrop-filter),
// that header becomes its containing block and the panel lands offset by the header's top — so the
// panel must render in a portal on <body>, keeping focus, hover, click-outside and Studio hooks.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavDropdown } from "./NavDropdown";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement;
const onSelect = vi.fn();

beforeEach(async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(h(MemoryRouter, null,
    h("header", { style: { backdropFilter: "blur(8px)", position: "sticky", top: 0 } },
      h(NavDropdown, {
        design: { copy: { navDropdownAll: "Everything" } }, label: "Books", linkStyle: {},
        all: { key: "all", label: "Books", to: "/collections/books" },
        entries: [{ key: "z", label: "Zines", onSelect }, { key: "p", label: "Poetry", to: "/collections/poetry" }],
      }),
      h("a", { href: "/next", id: "after" }, "Next link"),
    ),
  )));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); onSelect.mockReset(); });

const button = () => host.querySelector<HTMLButtonElement>("button[aria-haspopup]")!;
const panel = () => document.querySelector<HTMLElement>("[data-nav-dropdown-panel]");
const openIt = async () => { await act(async () => button().click()); expect(panel()).not.toBeNull(); };

describe("category drop-down panel", () => {
  it("renders on <body>, outside the blurred header, with theme tokens and Studio hooks", async () => {
    await openIt();
    expect(panel()!.parentElement).toBe(document.body);
    expect(host.querySelector("header")!.contains(panel())).toBe(false);
    expect(panel()!.hasAttribute("data-fm-store")).toBe(true);
    expect(panel()!.getAttribute("data-studio-target")).toBe("menus:categories|style:navlinks");
    expect(panel()!.getAttribute("data-studio-label")).toBe("Category drop-down");
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(panel()!.textContent).toContain("Everything");
  });

  it("closes on Escape (focus back on the button) and on a click outside, but not on a click inside", async () => {
    await openIt();
    await act(async () => { panel()!.querySelector("a")!.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(panel()).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
    await openIt();
    await act(async () => { document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(panel()).toBeNull();
  });

  it("moves between items with arrows, and Tab leaves to the element after the button", async () => {
    await openIt();
    const items = [...panel()!.querySelectorAll<HTMLElement>("a,button")];
    items[0].focus();
    await act(async () => { items[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    expect(document.activeElement).toBe(items[1]);
    await act(async () => { items[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("#after"));
  });

  it("selects an entry and closes; hover-close waits so the pointer can cross into the portal", async () => {
    vi.useFakeTimers();
    await openIt();
    const wrap = button().parentElement!;
    await act(async () => { wrap.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })); });
    await act(async () => { panel()!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(panel()).not.toBeNull();
    await act(async () => { [...panel()!.querySelectorAll("button")].find(b => b.textContent === "Zines")!.click(); });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(panel()).toBeNull();
  });
});
