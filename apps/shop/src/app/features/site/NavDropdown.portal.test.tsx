// @vitest-environment jsdom
// Faults #47 / #49: the body portal must keep the header's font and shrink-to-fit scale, and a keyboard
// user who opens it with Enter/click must be able to Tab into it, and it must close when focus leaves.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NavDropdown } from "./NavDropdown";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement; let sheet: HTMLStyleElement;

beforeEach(async () => {
  sheet = document.createElement("style");
  sheet.textContent = `header[data-section="navigation"]{font-family:'Special Nav',sans-serif;}`;
  document.head.appendChild(sheet);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(h(MemoryRouter, null,
    h("header", { "data-section": "navigation", style: { ["--nav-fit" as any]: "0.8", fontWeight: 900 } },
      h("button", { id: "before" }, "Before"),
      h(NavDropdown, {
        design: {}, label: "Books", linkStyle: { fontSize: "calc(12px * var(--nav-fit, 1))" },
        all: { key: "all", label: "Books", to: "/collections/books" },
        entries: [{ key: "z", label: "Zines", to: "/collections/zines" }],
      }),
      h("a", { href: "/next", id: "after" }, "Next link"),
    ),
  )));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sheet.remove(); });

const button = () => host.querySelector<HTMLButtonElement>("button[aria-haspopup]")!;
const panel = () => document.querySelector<HTMLElement>("[data-nav-dropdown-panel]");
const open = async () => { await act(async () => button().click()); expect(panel()).not.toBeNull(); };

describe("category drop-down keeps the header's look in its body portal (#47)", () => {
  it("carries the header & menu font, weight and --nav-fit scale", async () => {
    await open();
    expect(panel()!.style.fontFamily).toContain("Special Nav");
    expect(panel()!.style.getPropertyValue("--nav-fit")).toBe("0.8");
    expect(panel()!.style.fontWeight).toBe("900");
  });
});

describe("category drop-down is keyboard reachable (#49)", () => {
  it("Tab from the button, opened by click/Enter, moves focus into the panel", async () => {
    await open();
    button().focus();
    await act(async () => {
      button().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(document.activeElement).toBe(panel()!.querySelector("a,button"));
  });

  it("closes when focus leaves the button and panel", async () => {
    await open();
    const after = host.querySelector<HTMLElement>("#after")!;
    button().focus();
    await act(async () => { after.focus(); });
    expect(panel()).toBeNull();
  });

  it("stays open while focus moves from the button into the panel", async () => {
    await open();
    button().focus();
    await act(async () => { panel()!.querySelector<HTMLElement>("a")!.focus(); });
    expect(panel()).not.toBeNull();
  });
});
