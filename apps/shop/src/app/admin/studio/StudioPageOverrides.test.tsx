// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { StudioPageOverrides, overrideLabel } from "./StudioPageOverrides";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
afterEach(() => host.replaceChildren());

it("lists a page's own values with plain labels and both actions", () => {
  const onUseAll = vi.fn(), onMakeAll = vi.fn();
  const design = { catalogGridGap: 42, copy: { cartTitle: "Bag" }, storefront: { catalogGridGap: 18, copy: { cartTitle: "Basket" }, sections: [] } };
  const root = createRoot(host);
  act(() => root.render(h(StudioPageOverrides, { design, surface: "storefront", pageLabel: "Catalog / Shop", onUseAll, onMakeAll })));
  expect(host.querySelector(".studio-overrides-count")?.textContent).toBe("2");
  expect(host.textContent).toContain("This page: 18 · All pages: 42");
  expect(host.textContent).toMatch(/Text & labels › .* › /);
  const buttons = [...host.querySelectorAll("button")];
  act(() => buttons.find(b => b.textContent === "Use the all-pages value")!.click());
  act(() => buttons.find(b => b.textContent === "Make this the all-pages value")!.click());
  expect(onUseAll).toHaveBeenCalledWith("catalogGridGap");
  expect(onMakeAll).toHaveBeenCalledWith("catalogGridGap", 18);
  act(() => root.unmount());
});

it("shows nothing when the page follows all pages", () => {
  const root = createRoot(host);
  act(() => root.render(h(StudioPageOverrides, { design: { storefront: { sections: [] } }, surface: "storefront", pageLabel: "x", onUseAll() {}, onMakeAll() {} })));
  expect(host.innerHTML).toBe("");
  act(() => root.unmount());
});

it("names controls by their Studio category", () => {
  expect(overrideLabel("catalogGridGap")).toMatch(/ › /);
  expect(overrideLabel("social")).toMatch(/ › social$/);
});

it("finds one field's page value, nested keys included", async () => {
  const { fieldPageOverride } = await import("./StudioPageOverrides");
  const design = { transparentHeader: false, social: { instagram: "a" }, heroPage: { transparentHeader: true, logoUrl: "https://x/logo.png", social: { instagram: "b" }, sections: [] } };
  expect(fieldPageOverride(design, "heroPage", "transparentHeader")).toEqual({ value: true });
  expect(fieldPageOverride(design, "heroPage", "logoUrl")).toEqual({ value: "https://x/logo.png" });
  expect(fieldPageOverride(design, "heroPage", "social.instagram")).toEqual({ value: "b" });
  expect(fieldPageOverride(design, "heroPage", "primaryColor")).toBeNull();
  expect(fieldPageOverride(design, "productPage", "transparentHeader")).toBeNull();
});
