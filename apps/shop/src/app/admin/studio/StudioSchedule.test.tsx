// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioSchedule } from "./StudioSchedule";
import { isoToTorontoLocal } from "./themeSchedule";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const theme = { id: "t1", name: "Autumn", savedAt: "2026-10-01T00:00:00Z", design: { autumn: 1 } };
function api(entries: any[] = [], lastRunAt: string | null = new Date().toISOString()) {
  return { list: vi.fn(async () => entries), add: vi.fn(async () => ({})), cancel: vi.fn(async () => {}), endNow: vi.fn(async () => {}), status: vi.fn(async () => (lastRunAt ? { lastRunAt } : null)) };
}
async function mount(props: any) {
  const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root!.render(h(StudioSchedule, { open: true, onClose: () => {}, draft: { draft: 1 }, savedThemes: [theme], askConfirm: async () => true, say: vi.fn(), ...props })); await new Promise(r => setTimeout(r, 0)); });
}
const button = (text: string, scope: ParentNode = document.body) => [...scope.querySelectorAll("button")].find(b => b.textContent?.trim() === text) as HTMLButtonElement;
const set = (el: HTMLInputElement | HTMLSelectElement, value: string) => act(async () => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
});
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Theme actions › Schedule publishing", () => {
  it("schedules a saved theme as a campaign in Toronto time", async () => {
    const a = api();
    await mount({ api: a, initialThemeId: "t1" });
    expect((document.querySelector(".studio-schedule select") as HTMLSelectElement).value).toBe("theme:t1");
    await act(async () => (document.querySelectorAll('input[type=radio]')[1] as HTMLInputElement).click());
    const [start, end] = [...document.querySelectorAll('input[type="datetime-local"]')] as HTMLInputElement[];
    const startIso = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 13) + ":00:00.000Z";
    await set(start, isoToTorontoLocal(startIso));
    await set(end, isoToTorontoLocal(new Date(Date.parse(startIso) + 3 * 86_400_000).toISOString()));
    await act(async () => { button("Schedule campaign").click(); await new Promise(r => setTimeout(r, 0)); });
    expect(a.add).toHaveBeenCalledWith(expect.objectContaining({ kind: "campaign", name: "Autumn", design: { autumn: 1 }, startAt: startIso }));
  });

  it("shows problems instead of saving, and warns when the scheduler has never run", async () => {
    const a = api([], null);
    await mount({ api: a });
    expect(document.querySelector("[data-scheduler-health]")!.getAttribute("data-scheduler-health")).toBe("never");
    await set(document.querySelector('input[type="datetime-local"]') as HTMLInputElement, "2020-01-01T09:00");
    await act(async () => { button("Schedule publish").click(); });
    expect(document.querySelector("[role=alert]")!.textContent).toMatch(/already passed/);
    expect(a.add).not.toHaveBeenCalled();
  });

  it("lists what's coming and running, with Cancel and End now", async () => {
    const a = api([
      { id: "s1", kind: "publish", name: "Winter", status: "scheduled", startAt: "2030-01-01T14:00:00.000Z" },
      { id: "s2", kind: "campaign", name: "Sale", status: "live", startAt: "2026-10-01T14:00:00.000Z", endAt: "2030-01-01T14:00:00.000Z" },
      { id: "s3", kind: "campaign", name: "Spring", status: "done", startAt: "2026-04-01T14:00:00.000Z", endAt: "2026-04-10T14:00:00.000Z", note: "kept-later-publish" },
    ]);
    await mount({ api: a });
    await act(async () => { button("Cancel", document.querySelector('[data-schedule-id="s1"]')!).click(); await new Promise(r => setTimeout(r, 0)); });
    expect(a.cancel).toHaveBeenCalledWith("s1");
    await act(async () => { button("End now", document.querySelector('[data-schedule-id="s2"]')!).click(); await new Promise(r => setTimeout(r, 0)); });
    expect(a.endNow).toHaveBeenCalledWith("s2");
    expect(document.querySelector('[data-schedule-id="s3"]')!.textContent).toContain("You published something else while it ran");
  });
});
