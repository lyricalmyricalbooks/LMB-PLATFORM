// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getFirstWeek: vi.fn(), updateFirstWeek: vi.fn(async () => {}) }));
vi.mock("../api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { FirstWeekCard } = await import("./FirstWeekCard");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const mount = async (props: any) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(FirstWeekCard, props)));
  await flush();
};
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

describe("FirstWeekCard (plan 3.3)", () => {
  it("shows nothing for a shop setup never wrote an answer for", async () => {
    api.getFirstWeek.mockResolvedValue(null);
    await mount({ books: [], readiness: [] });
    expect(document.body.textContent).toBe("");
  });

  it("a press moving from another online shop sees the bring-over steps first, and a button opens the page", async () => {
    api.getFirstWeek.mockResolvedValue({ sellingToday: "online", plan: "both" });
    const onOpen = vi.fn();
    await mount({ books: [], readiness: [], onOpen });
    const steps = [...document.querySelectorAll("ol[aria-label='First week steps'] li strong")].map((s) => s.textContent);
    expect(steps[0]).toBe("Bring your books over from your old shop");
    expect(document.body.textContent).toContain("0 of 8 done");
    act(() => button("Open Books")!.click());
    expect(onOpen).toHaveBeenCalledWith("catalog");
  });

  it("Mark done saves the tick, and Hide this list hides it for good", async () => {
    api.getFirstWeek.mockResolvedValue({ sellingToday: "starting" });
    await mount({ books: [], readiness: [] });
    await act(async () => { button("Mark done")!.click(); });
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ done: { look: expect.any(String) } });
    expect(document.body.textContent).toContain("1 of 7 done");
    await act(async () => { button("Hide this list")!.click(); });
    expect(api.updateFirstWeek).toHaveBeenLastCalledWith({ hiddenAt: expect.any(String) });
    expect(document.body.textContent).toBe("");
  });
});
