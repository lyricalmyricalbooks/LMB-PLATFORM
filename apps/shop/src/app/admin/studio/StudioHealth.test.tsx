// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioHealth } from "./StudioHealth";
import type { HealthFinding } from "./healthAudit";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const el = document.createElement("img");
const findings: HealthFinding[] = [
  { id: "alt:s:s1", category: "images", severity: "issue", title: "A picture has no description", detail: "Add one.", count: 2, element: el,
    owner: { key: "s:s1", label: "Image with text", target: "", region: "", sectionId: "s1" } },
  { id: "h1:", category: "headings", severity: "tip", title: "2 main headings on one page", detail: "One is clearest.", count: 1, owner: null },
];
async function mount(run: () => HealthFinding[] | null) {
  const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  const onShow = vi.fn(), onFix = vi.fn();
  await act(async () => { root!.render(h(StudioHealth, { open: true, onClose: () => {}, run, pageLabel: "Home", deviceLabel: "phone",
    designResults: [{ tone: "ok", text: "No obviously empty sections." }], onShow, onFix })); });
  return { onShow, onFix };
}
const button = (text: string, scope: ParentNode = document.body) => [...scope.querySelectorAll("button")].find(b => b.textContent?.trim() === text) as HTMLButtonElement;
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Theme actions › Studio Health", () => {
  it("checks the page when it opens and lists what to fix first", async () => {
    const run = vi.fn(() => findings);
    const { onShow, onFix } = await mount(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Checking Home at phone size");
    expect(document.body.textContent).toContain("2 to fix");
    expect(document.body.textContent).toContain("1 suggestion");
    const [fix, tip] = [...document.querySelectorAll("[data-health-id]")];
    expect(fix.textContent).toContain("A picture has no description (2 places)");
    expect(fix.textContent).toContain("In: Image with text");
    expect(tip.closest("section")!.querySelector("h3")!.textContent).toBe("Worth a look");
    await act(async () => button("Show me", fix).click());
    await act(async () => button("Edit this part", fix).click());
    expect(onShow).toHaveBeenCalledWith(findings[0]);
    expect(onFix).toHaveBeenCalledWith(findings[0]);
    expect(button("Edit this part", tip)).toBeUndefined();
    await act(async () => button("Check again").click());
    expect(run).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("No obviously empty sections.");
  });

  it("says so when the preview isn't ready, and when nothing is wrong", async () => {
    await mount(() => null);
    expect(document.body.textContent).toContain("The preview isn't ready yet");
    await act(async () => root?.unmount()); document.body.innerHTML = "";
    await mount(() => []);
    expect(document.body.textContent).toContain("Nothing to fix");
  });
});
