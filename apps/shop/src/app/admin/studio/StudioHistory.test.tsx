// @vitest-environment jsdom
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioHistory, type ThemeVersion } from "./StudioHistory";
import { restoreItem } from "./designDiff";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let latest: any;
const live = { backgroundColor: "#000000", heroPage: { sections: [{ id: "a", type: "RichText", settings: { heading: "Hello" } }] } };
const versions: ThemeVersion[] = [
  { id: "cp", kind: "checkpoint", label: "Before the sale", name: "Before the sale", pinned: true, createdAt: "2026-10-09T10:00:00.000Z", design: live },
  { id: "pub", kind: "published", label: "Published 8 Oct", createdAt: "2026-10-08T10:00:00.000Z", design: live },
  { id: "draft-latest", kind: "draft", label: "Draft 9 Oct", createdAt: "2026-10-09T11:00:00.000Z", design: live },
];
const actions = { saveCheckpoint: vi.fn(async (name: string, design: any) => ({ id: "n", kind: "checkpoint", label: name, createdAt: "", design }) as ThemeVersion), update: vi.fn(async () => ({})), remove: vi.fn(async () => undefined) };

function Harness({ draft: initial }: { draft: any }) {
  const [draft, setDraft] = useState(initial);
  latest = draft;
  return h(StudioHistory, {
    open: true, onClose: () => {}, versions, reload: () => {}, draft, published: live, normalize: (d: any) => d,
    ctx: { templates: [{ id: "heroPage", label: "Home page" }], sectionName: () => "Rich text" },
    previewingId: null, onPreview: () => {}, onRestoreAll: () => {},
    onRestoreItem: (v: ThemeVersion, item: any) => setDraft((d: any) => restoreItem(d, v.design, item)),
    actions, askText: async (o: any) => o.defaultValue ?? "", askConfirm: async () => true, say: () => {},
  });
}
async function mount(draft: any) {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(h(Harness, { draft })); });
  return document.body;
}
const button = (el: HTMLElement, text: string, scope?: Element | null) =>
  [...(scope || el).querySelectorAll("button")].find(b => (b.textContent || "").trim() === text || b.getAttribute("aria-label") === text) as HTMLButtonElement;
const click = (b: HTMLElement) => act(async () => { b.click(); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });

describe("Theme actions › Version history", () => {
  it("lists named, pinned checkpoints with their kind", async () => {
    const el = await mount(live);
    const rows = [...el.querySelectorAll("[data-version-id]")];
    expect(rows.map(r => r.getAttribute("data-version-id"))).toEqual(["cp", "pub", "draft-latest"]);
    expect(rows[0].textContent).toContain("Before the sale");
    expect(rows[0].textContent).toContain("Checkpoint");
    expect(rows[0].querySelector('[aria-label="Pinned"]')).toBeTruthy();
    await click(button(el, "Checkpoints"));
    expect(el.querySelectorAll("[data-version-id]").length).toBe(1);
  });

  it("compares a version with the draft and takes one change back", async () => {
    const el = await mount({ ...live, backgroundColor: "#ffffff", heroPage: { sections: [] } });
    await click(button(el, "Compare", el.querySelector('[data-version-id="pub"]')));
    expect(el.textContent).toContain("Page background");
    expect(el.textContent).toContain("Home page");
    const bg = el.querySelector('[data-diff-id="path:backgroundColor"]')!;
    await click(button(el, "Use this version's", bg));
    expect(latest.backgroundColor).toBe("#000000");
    expect(latest.heroPage.sections).toEqual([]);
    expect(el.querySelector('[data-diff-id="path:backgroundColor"]')).toBeNull();
    expect(el.querySelector('[data-diff-id="section:a"]')).toBeTruthy();
  });

  it("only offers per-item restore when comparing with the draft", async () => {
    const el = await mount({ ...live, backgroundColor: "#ffffff" });
    await click(button(el, "Compare", el.querySelector('[data-version-id="pub"]')));
    const select = el.querySelector(".studio-history-against select") as HTMLSelectElement;
    await act(async () => { select.value = "live"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(el.textContent).toContain("No differences");
    expect(button(el, "Use this version's")).toBeUndefined();
  });

  it("saves a checkpoint of the current draft and pins/renames through the menu", async () => {
    const draft = { ...live, backgroundColor: "#123456" };
    const el = await mount(draft);
    await click(button(el, "Save checkpoint…"));
    expect(actions.saveCheckpoint).toHaveBeenCalledWith(expect.stringMatching(/^Checkpoint /), draft);
    await click(button(el, "More actions for Published 8 Oct"));
    await click([...el.querySelectorAll('[role="menuitem"]')].find(m => m.textContent?.includes("Pin")) as HTMLElement);
    expect(actions.update).toHaveBeenCalledWith("pub", { pinned: true });
    await click(button(el, "More actions for Draft 9 Oct"));
    const items = [...el.querySelectorAll('[role="menuitem"]')].map(m => m.textContent);
    expect(items).toEqual(["Keep as checkpoint"]);
  });
});
