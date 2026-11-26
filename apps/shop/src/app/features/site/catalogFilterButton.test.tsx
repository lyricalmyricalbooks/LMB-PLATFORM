// @vitest-environment jsdom
// Plan "Starters on par", step 4: Style › Shop page heading & filters › Filters › "One Filter button". Sort and the
// count share the Filter button's row; the search and filters open under it, and the button counts what is picked.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CatalogControls, EMPTY_FILTERS } from "./CatalogControls";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let host: HTMLDivElement;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

const props = (design: any, extra: any = {}) => ({ query: "", setQuery: () => {}, sort: "featured" as const, setSort: () => {}, inStockOnly: false,
  setInStockOnly: () => {}, resultCount: 6, design, filters: EMPTY_FILTERS, setFilters: () => {}, showPrice: true, ...extra });

describe("Filter button layout", () => {
  it("keeps every filter showing by default", async () => {
    await act(async () => root.render(h(CatalogControls, props({}))));
    expect(host.querySelector('[data-filter-layout="button"]')).toBeNull();
    expect(host.querySelector('input[aria-label]')).not.toBeNull();
  });

  it("shows one Filter button with sort beside it, and opens the search and filters under it", async () => {
    await act(async () => root.render(h(CatalogControls, props({ catalogFilterLayout: "button" }))));
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Filter"))!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector("select")).not.toBeNull();
    expect(host.querySelector("input")).toBeNull();
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(`#${CSS.escape(button.getAttribute("aria-controls")!)} input`)).not.toBeNull();
  });

  it("counts what narrows the list on the button", async () => {
    await act(async () => root.render(h(CatalogControls, props({ catalogFilterLayout: "button" }, { inStockOnly: true, query: "mug", filters: { ...EMPTY_FILTERS, minPrice: "10" } }))));
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Filter"))!;
    expect(button.textContent).toBe("Filter3");
  });
});
