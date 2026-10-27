// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SectionFieldEditor } from "../ThemeEditorExtensions";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// An empty colour or slider means "not set: the default applies". It must never look like a real
// value (black, or the slider's minimum), or the owner reads a colour/size the shop doesn't show.
let root: Root | null = null;
async function mount(field: any, value: any) {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(h(SectionFieldEditor, { field, value, onChange: () => {} })); });
  return el;
}
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("unset Studio fields", () => {
  it("shows an empty colour as not set, never as black", async () => {
    const el = await mount({ key: "bgColor", label: "Solid colour", kind: "color" }, undefined);
    expect(el.querySelector("[data-color-unset=true]")).not.toBeNull();
    const text = el.querySelector("input:not([type=color])") as HTMLInputElement;
    expect(text.value).toBe("");
    expect(text.placeholder).toMatch(/not set/i);
    expect((el.querySelector("[title]") as HTMLElement).style.background).not.toMatch(/#000|rgb\(0, 0, 0\)/);
  });

  it("shows a set colour as itself", async () => {
    const el = await mount({ key: "bgColor", label: "Solid colour", kind: "color" }, "#e8402a");
    expect(el.querySelector("[data-color-unset]")).toBeNull();
    expect((el.querySelector("input:not([type=color])") as HTMLInputElement).value).toBe("#e8402a");
  });

  it("shows an empty slider as Default instead of its minimum", async () => {
    const field = { key: "headingSize", label: "Heading size", kind: "range", min: 14, max: 120, suffix: "px" };
    let el = await mount(field, undefined);
    expect(el.textContent).toContain("Default");
    expect(el.textContent).not.toContain("14px");
    await act(async () => root!.unmount());
    el = await mount(field, 32);
    expect(el.textContent).toContain("32px");
  });

  it("shows an unset drop-down as Default, so its first choice can still be picked", async () => {
    const field = { key: "align", label: "Alignment", kind: "select", options: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }] };
    let el = await mount(field, undefined);
    let select = el.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.selectedOptions[0].textContent).toMatch(/default/i);
    await act(async () => root!.unmount());
    el = await mount(field, "left");
    select = el.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("left");
    expect([...select.options].some(o => /default/i.test(o.textContent || ""))).toBe(false);
  });

  it("shows a default-on switch as on until it is turned off", async () => {
    const field = { key: "uppercase", label: "Uppercase", kind: "toggle", defaultValue: true };
    let el = await mount(field, undefined);
    expect(el.querySelector("[role=switch]")!.getAttribute("aria-checked")).toBe("true");
    await act(async () => root!.unmount());
    el = await mount(field, false);
    expect(el.querySelector("[role=switch]")!.getAttribute("aria-checked")).toBe("false");
  });
});
