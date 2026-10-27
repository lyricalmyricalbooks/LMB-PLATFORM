// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectableField, DynamicSourcesContext } from "./StudioConnect";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
async function mount(fieldKind: string, value: any, onChange: (v: any) => void) {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(h(DynamicSourcesContext.Provider, { value: { fields: [{ key: "series", label: "Series", kind: "text" }] } },
    h(ConnectableField, { fieldKind, label: "Title", value, onChange }, h("input", { "data-editor": true })))); });
  return el;
}
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Connect to a detail", () => {
  it("offers text details for a text field, including custom book fields, and saves the connection", async () => {
    const onChange = vi.fn();
    const el = await mount("text", "Fixed", onChange);
    const select = el.querySelector("select")!;
    const options = [...select.querySelectorAll("option")].map(o => o.textContent);
    expect(options).toContain("Series");
    expect(options).not.toContain("First photo");
    await act(async () => { select.value = "book.custom.series"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith({ $dyn: "book.custom.series" });
  });
  it("offers pictures for image fields and nothing for colours", async () => {
    let el = await mount("image", "", vi.fn());
    expect([...el.querySelectorAll("option")].map(o => o.textContent)).toContain("First photo");
    await act(async () => root!.unmount());
    el = await mount("color", "#fff", vi.fn());
    expect(el.querySelector("select")).toBeNull();
  });
  it("shows a connected field as a chip that can be disconnected", async () => {
    const onChange = vi.fn();
    const el = await mount("text", { $dyn: "book.custom.series" }, onChange);
    expect(el.querySelector("[data-editor]")).toBeNull();
    expect(el.textContent).toContain("Connected to Book › Series");
    await act(async () => (el.querySelector("button") as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith("");
  });
});
