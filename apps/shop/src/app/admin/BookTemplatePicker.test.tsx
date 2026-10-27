// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getAlternateTemplates: vi.fn(async () => [{ id: "poetry", name: "Poetry", published: true }, { id: "photo", name: "Photo books", published: false }]) }));
vi.mock("./api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { BookTemplatePicker } = await import("./BookTemplatePicker");

let root: Root | null = null;
async function mount(value: string | undefined, onChange = vi.fn()) {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(h(BookTemplatePicker, { value, onChange })); });
  return { el, onChange };
}
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Books › Book page template", () => {
  it("lists templates, marking unpublished ones, and saves the choice", async () => {
    const { el, onChange } = await mount(undefined);
    const select = el.querySelector("select")!;
    expect([...select.options].map(o => o.textContent)).toEqual(["Default book page", "Poetry", "Photo books (not published yet)"]);
    await act(async () => { select.value = "poetry"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith("poetry");
    await act(async () => { select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
  it("explains a template that was deleted", async () => {
    const { el } = await mount("gone");
    expect(el.textContent).toContain("was deleted");
  });
});
