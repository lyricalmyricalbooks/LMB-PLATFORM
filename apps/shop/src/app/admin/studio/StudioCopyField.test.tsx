// @vitest-environment jsdom
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { StudioCopyField } from "./StudioCopyField";
import { StudioRegionBrowser } from "./StudioRegionBrowser";
import { applyGlobalStyle, STYLE_GROUPS } from "./styleSchema";
import { COPY_SCHEMA, getCopy } from "../../features/site/storeCopy";
import { layerDesign } from "../../features/site/designModel";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); host.replaceChildren(); });

describe("Studio public element controls", () => {
  it("shows the footer About blurb the shop really uses (Settings › General description) as its default", () => {
    const field = COPY_SCHEMA.flatMap(g => g.fields).find(f => f.key === "footerAbout")!;
    const settings = { info: { description: "Our own shop description." } };
    root = createRoot(host); act(() => root.render(h(StudioCopyField, { field, design: {}, settings, onChange: () => {} })));
    expect((host.querySelector("textarea, input") as any).value).toBe("Our own shop description.");
    act(() => root.render(h(StudioCopyField, { field, design: { copy: { footerAbout: "Typed here" } }, settings, onChange: () => {} })));
    expect((host.querySelector("textarea, input") as any).value).toBe("Typed here");
  });

  it("clears real copy through the page-aware writer and explicitly resets the default", () => {
    const field = COPY_SCHEMA.flatMap(g => g.fields).find(f => f.key === "wishlistTitle")!;
    let design: any = { wishlistPage: { copy: { wishlistTitle: "Old local value" }, sections: [1] } };
    const render = () => root.render(h(StudioCopyField, { field, design, onChange: value => {
      design = applyGlobalStyle(design, "copy.wishlistTitle", value, ["wishlistPage"]); render();
    } }));
    root = createRoot(host); act(render);
    const input = host.querySelector("input")!;
    expect(input.value).toBe(getCopy({}, "wishlistTitle"));
    expect(host.querySelector("label")?.htmlFor).toBe(input.id);
    act(() => Simulate.change(input, { target: { value: "" } } as any));
    expect(design.copy.wishlistTitle).toBe("");
    // The stale page copy is cleared, so the wishlist page shows the new (blank) value too.
    expect(getCopy(layerDesign(design, design.wishlistPage), "wishlistTitle")).toBe("");
    expect(host.textContent).toContain("left blank on purpose");
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(design.copy?.wishlistTitle).toBeUndefined();
    expect(input.value).toBe(getCopy({}, "wishlistTitle"));
    expect(design.wishlistPage.sections).toEqual([1]);
  });

  it("keeps hidden and required elements discoverable without showing all their fields", () => {
    const onPick = vi.fn();
    root = createRoot(host);
    act(() => root.render(h(StudioRegionBrowser, { groupId: "wishlistLayout", fields: STYLE_GROUPS.find(g => g.id === "wishlistLayout")!.fields,
      values: { wishlistTitleTabletVisible: false }, device: "tablet", onPick })));
    const button = [...host.querySelectorAll("button")].find(el => el.textContent?.includes("Wishlist title"))!;
    expect(button.textContent).toContain("Hidden at this size");
    expect(host.querySelectorAll("input")).toHaveLength(0);
    act(() => button.click());
    expect(onPick).toHaveBeenCalledWith("wishlistLayout", "Wishlist title");
  });
});

it("selects the matching device when the settings search only finds phone fields", () => {
  const onPick = vi.fn();
  root = createRoot(host);
  act(() => root.render(h(StudioRegionBrowser, { groupId: "wishlistLayout",
    fields: STYLE_GROUPS.find(g => g.id === "wishlistLayout")!.fields.filter(f => f.key === "regions.wishlistTitleMobileSize"),
    values: {}, device: "desktop", onPick })));
  act(() => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(onPick).toHaveBeenCalledWith("wishlistLayout", "Wishlist title", "mobile");
});

it("edits raw text templates so site-name and year tokens stay dynamic", () => {
  const field = COPY_SCHEMA.flatMap(g => g.fields).find(f => f.key === "siteDefaultTitle")!;
  const onChange = vi.fn();
  root = createRoot(host);
  act(() => root.render(h(StudioCopyField, { field, design: {}, onChange })));
  const input = host.querySelector("input")!;
  expect(input.value).toContain("{name}");
  act(() => Simulate.change(input, { target: { value: input.value + " · Books" } } as any));
  expect(onChange).toHaveBeenCalledWith(field.default + " · Books");
});

it("explicit review title styling wins over its parent review-list styling", async () => {
  const { storefrontRegionCss, regionProps } = await import("../../features/site/storefrontRegions");
  const style = document.createElement("style");
  style.textContent = storefrontRegionCss({ regions: { reviewsTitleSize: 30, reviewsListSize: 12,
    reviewsTitleColor: "#ff0000", reviewsListColor: "#0000ff" } });
  document.head.append(style);
  root = createRoot(host);
  act(() => root.render(h("div", { "data-fm-store": true }, h("ul", regionProps("reviewsList"), h("li", {}, h("h4", regionProps("reviewsTitle"), "Review title"))))));
  try {
    expect(getComputedStyle(host.querySelector("h4")!).fontSize).toBe("30px");
    expect(getComputedStyle(host.querySelector("h4")!).color).toBe("rgb(255, 0, 0)");
  } finally { style.remove(); }
});
