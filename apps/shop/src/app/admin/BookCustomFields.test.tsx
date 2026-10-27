// @vitest-environment jsdom
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getBookFields: vi.fn(async () => [{ key: "series", label: "Series", kind: "text" }]),
  saveBookFields: vi.fn(async (f: any[]) => f),
}));
vi.mock("./api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { BookCustomFields } = await import("./BookCustomFields");

let root: Root | null = null;
let latest: any = {};
function Harness({ initial }: { initial: any }) {
  const [form, setForm] = useState(initial);
  latest = form;
  return h(BookCustomFields, { form, set: (name: string, value: any) => setForm((p: any) => ({ ...p, [name]: value })) });
}
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Books › More details", () => {
  it("edits this book's answers and keeps answers of fields no longer defined", async () => {
    const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
    await act(async () => { root!.render(h(Harness, { initial: { custom: { old_field: "kept" } } })); });
    const input = el.querySelector("[data-book-field=series]") as HTMLInputElement;
    await act(async () => type(input, "The Night Series"));
    expect(latest.custom).toEqual({ old_field: "kept", series: "The Night Series" });
    await act(async () => type(input, ""));
    expect(latest.custom).toEqual({ old_field: "kept" });
  });
  it("adds a shared field and saves the definitions", async () => {
    const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
    await act(async () => { root!.render(h(Harness, { initial: {} })); });
    const name = [...el.querySelectorAll("label")].find(l => l.textContent === "New field name")!;
    await act(async () => type(document.getElementById(name.getAttribute("for")!) as HTMLInputElement, "Translated by"));
    await act(async () => ([...el.querySelectorAll("button")].find(b => b.textContent?.includes("Add field")) as HTMLButtonElement).click());
    await act(async () => ([...el.querySelectorAll("button")].find(b => b.textContent === "Save book fields") as HTMLButtonElement).click());
    expect(api.saveBookFields).toHaveBeenCalledWith([{ key: "series", label: "Series", kind: "text" }, { key: "translated_by", label: "Translated by", kind: "text" }]);
    expect(el.textContent).toContain("Book fields saved");
  });
});
