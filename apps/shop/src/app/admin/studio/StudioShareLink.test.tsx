// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewLinkUrl, StudioShareLink } from "./StudioShareLink";
import { OwnEditsPanel } from "./StarterChanges";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const design = { backgroundColor: "#000000" };
function setup(overrides: Record<string, any> = {}) {
  return {
    share: { name: "Your draft", design }, onClose: vi.fn(),
    links: { create: vi.fn(async (_d: any, name: string, days: number) => ({ token: "tok_0123456789abcdefghijkl", name, createdAt: "2026-10-09T10:00:00Z", expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() })),
      list: vi.fn(async () => []), revoke: vi.fn(async () => {}) },
    askConfirm: vi.fn(async () => true), say: vi.fn(), ...overrides,
  } as any;
}
async function mount(el: any) {
  const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root!.render(el); await new Promise(r => setTimeout(r, 0)); });
}
const button = (text: string, scope: ParentNode = document.body) =>
  [...scope.querySelectorAll("button")].find(b => (b.textContent || "").trim() === text || b.getAttribute("aria-label") === text) as HTMLButtonElement;
const click = (b: HTMLElement) => act(async () => { b.click(); await new Promise(r => setTimeout(r, 0)); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Studio › ⋯ › Share a preview link", () => {
  it("creates a private preview link of the draft for the chosen time", async () => {
    const props = setup();
    await mount(h(StudioShareLink, props));
    const select = document.querySelector(".studio-share select") as HTMLSelectElement;
    await act(async () => { select.value = "30"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(button("Create link"));
    expect(props.links.create).toHaveBeenCalledWith(design, "Your draft", 30);
    const input = document.querySelector("[data-share-link] input") as HTMLInputElement;
    expect(input.value).toBe(previewLinkUrl("tok_0123456789abcdefghijkl"));
    expect(input.value).toContain("?themePreview=tok_0123456789abcdefghijkl");
  });

  it("explains links that can't work until the rules are deployed", async () => {
    const denied = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    await mount(h(StudioShareLink, setup({ links: { create: vi.fn(), list: vi.fn(async () => { throw denied; }), revoke: vi.fn() } })));
    expect(document.body.textContent).toContain("Preview links aren't switched on for your shop yet");
    expect(button("Create link")).toBeUndefined();
  });

  it("turns a link off after asking", async () => {
    const link = { token: "tok_aaaaaaaaaaaaaaaaaaaaaaaa", name: "Draft", createdAt: "2026-10-09T10:00:00Z", expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    const props = setup({ links: { create: vi.fn(), list: vi.fn(async () => [link]), revoke: vi.fn(async () => {}) } });
    await mount(h(StudioShareLink, props));
    await click(button("Turn off", document.querySelector(`[data-preview-link="${link.token}"]`)!));
    expect(props.askConfirm).toHaveBeenCalled();
    expect(props.links.revoke).toHaveBeenCalledWith(link.token);
  });

  it("stays closed with nothing to share", async () => {
    await mount(h(StudioShareLink, setup({ share: null })));
    expect(document.querySelector(".studio-share")).toBeNull();
  });
});

describe("Version history › Compare with the starter", () => {
  it("lists the owner's changes and puts the starter's back", async () => {
    const onReset = vi.fn();
    const edits = [{ key: "primaryColor", label: "Accent colour", before: "#112233", after: "#445566" }] as any;
    await mount(h(OwnEditsPanel, { lookName: "Gallery", edits, onReset }));
    expect(document.body.textContent).toContain("1 setting is yours; everything else comes from Gallery.");
    await click(button("Use the starter's Accent colour"));
    expect(onReset).toHaveBeenCalledWith(edits);
  });
});
