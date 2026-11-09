// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewLinkUrl, StudioThemes } from "./StudioThemes";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const theme = { id: "t1", name: "Autumn", savedAt: "2026-10-01T10:00:00.000Z", design: { themeStyle: "default", backgroundColor: "#f5efe6", primaryColor: "#8a3b12" } };
function setup(overrides: Record<string, any> = {}) {
  const props: any = {
    design: { backgroundColor: "#000000" }, published: { backgroundColor: "#000000" }, unpublished: true, savedThemes: [theme],
    presets: [{ id: "p1", name: "Paper", mood: "Light and calm", global: { backgroundColor: "#ffffff" } }], currentPresetId: undefined,
    previewingId: null, onPreview: vi.fn(), onSaveCurrent: vi.fn(), onImport: vi.fn(), onLoad: vi.fn(), onPublish: vi.fn(), onRename: vi.fn(),
    onDuplicate: vi.fn(), onDownload: vi.fn(), onDelete: vi.fn(), onApplyPreset: vi.fn(),
    links: { create: vi.fn(async (_d: any, name: string, days: number) => ({ token: "tok_0123456789abcdefghijkl", name, createdAt: "2026-10-09T10:00:00Z", expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() })),
      list: vi.fn(async () => []), revoke: vi.fn(async () => {}) },
    askConfirm: vi.fn(async () => true), say: vi.fn(), ...overrides,
  };
  return props;
}
async function mount(props: any) {
  const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root!.render(h(StudioThemes, props)); });
}
const button = (text: string, scope: ParentNode = document.body) =>
  [...scope.querySelectorAll("button")].find(b => (b.textContent || "").trim() === text || b.getAttribute("aria-label") === text) as HTMLButtonElement;
const click = (b: HTMLElement) => act(async () => { b.click(); await new Promise(r => setTimeout(r, 0)); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Studio › Themes", () => {
  it("shows the live theme, the draft, My themes and ready-made looks with thumbnails", async () => {
    const props = setup();
    await mount(props);
    const cards = [...document.querySelectorAll("[data-theme-card]")].map(c => c.getAttribute("data-theme-card"));
    expect(cards).toEqual(["live", "draft", "t1", "preset:p1"]);
    expect(document.querySelector('[data-theme-card="t1"] [role=img]')!.getAttribute("aria-label")).toContain("#f5efe6");
    expect(document.body.textContent).toContain("Not published");
    await click(button("Customize"));
    expect(props.onLoad).toHaveBeenCalledWith(theme);
    await click(button("Preview", document.querySelector('[data-theme-card="preset:p1"]')!));
    expect(props.onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "preset:p1", design: expect.objectContaining({ backgroundColor: "#ffffff" }) }));
    await click(button("Use this look"));
    expect(props.onApplyPreset).toHaveBeenCalledWith(props.presets[0]);
  });

  it("draws every look on the press's own covers and product name", async () => {
    await mount(setup({ products: [{ title: "Zqx Poems", photo: "https://example.com/a.jpg" }, { title: "", photo: "https://example.com/b.jpg" }] }));
    const thumb = document.querySelector('[data-theme-card="preset:p1"] [role=img]')!;
    expect(thumb.textContent).toContain("Zqx Poems");
    const covers = [...thumb.querySelectorAll("b")].map(b => (b as HTMLElement).style.background);
    expect(covers[0]).toContain("https://example.com/a.jpg");
    expect(covers[1]).toContain("https://example.com/b.jpg");
    await act(async () => root!.unmount());
    await mount(setup());
    expect(document.querySelector('[data-theme-card="preset:p1"] [role=img]')!.textContent).toContain("Books & prints");
  });
  it("draws the press's name and logo, and opens a look full size on a phone from its drawing", async () => {
    const props = setup({ pressName: "Moth Press", presets: [{ id: "p1", name: "Paper", global: { backgroundColor: "#ffffff", logoUrl: "https://example.com/logo.png" } }] });
    await mount(props);
    const card = document.querySelector('[data-theme-card="preset:p1"]')!;
    expect(card.querySelector(".studio-theme-thumb-name")!.textContent).toBe("Moth Press");
    await click(button("Preview Paper on a phone", card));
    expect(props.onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "preset:p1" }), "mobile");
  });
  it("offers Reset template details on the draft when it sets any", async () => {
    const onResetTemplateDetails = vi.fn();
    await mount(setup({ templateDetails: "You've changed card tilt.", onResetTemplateDetails }));
    const bar = document.querySelector('[data-theme-card="draft"] [data-template-reset]')!;
    expect(bar.textContent).toContain("You've changed card tilt.");
    await click(button("Reset template details", bar));
    expect(onResetTemplateDetails).toHaveBeenCalled();
    await act(async () => root!.unmount());
    await mount(setup());
    expect(document.querySelector("[data-template-reset]")).toBeNull();
  });
  it("creates a private preview link of the draft for the chosen time", async () => {
    const props = setup();
    await mount(props);
    await click(button("Share a preview link"));
    const select = document.querySelector(".studio-share select") as HTMLSelectElement;
    await act(async () => { select.value = "30"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(button("Create link"));
    expect(props.links.create).toHaveBeenCalledWith(props.design, "Draft", 30);
    const input = document.querySelector("[data-share-link] input") as HTMLInputElement;
    expect(input.value).toBe(previewLinkUrl("tok_0123456789abcdefghijkl"));
    expect(input.value).toContain("?themePreview=tok_0123456789abcdefghijkl");
  });

  it("explains links that can't work until the rules are deployed", async () => {
    const denied = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    await mount(setup({ links: { create: vi.fn(), list: vi.fn(async () => { throw denied; }), revoke: vi.fn() } }));
    await click(button("Share a preview link"));
    expect(document.body.textContent).toContain("Preview links aren't switched on for your shop yet");
    expect(button("Create link")).toBeUndefined();
  });

  it("turns a link off after asking", async () => {
    const link = { token: "tok_aaaaaaaaaaaaaaaaaaaaaaaa", name: "Draft", createdAt: "2026-10-09T10:00:00Z", expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    const props = setup({ links: { create: vi.fn(), list: vi.fn(async () => [link]), revoke: vi.fn(async () => {}) } });
    await mount(props);
    await click(button("Share a preview link"));
    await click(button("Turn off", document.querySelector(`[data-preview-link="${link.token}"]`)!));
    expect(props.askConfirm).toHaveBeenCalled();
    expect(props.links.revoke).toHaveBeenCalledWith(link.token);
  });
});
