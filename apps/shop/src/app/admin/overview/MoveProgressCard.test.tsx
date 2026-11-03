// @vitest-environment jsdom
// Overview › Your move so far (plan 23.17): the parts left, opening each place, and "We had none".
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getFirstWeek: vi.fn(), updateFirstWeek: vi.fn(async () => {}) }));
vi.mock("../api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { MoveProgressCard } = await import("./MoveProgressCard");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const moving = { bring: { at: "2026-11-01T00:00:00.000Z", from: "online" as const }, done: { "move-giftcards": "2026-11-02" } };
const mount = (doc: any, setDoc = vi.fn(), onOpen = vi.fn()) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(MoveProgressCard, { doc, setDoc, onOpen })));
  return { host, setDoc, onOpen };
};
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].filter(b => b.textContent === text);

describe("Your move so far", () => {
  it("lists what is left, opens each place and ticks a part the old shop didn't have", async () => {
    const { host, setDoc, onOpen } = mount(moving);
    expect(host.textContent).toContain("Your move so far");
    expect(host.textContent).toContain("2 of 5 done");
    act(() => button(host, "Bring past orders over")[0].click());
    expect(onOpen).toHaveBeenCalledWith("orders");
    await act(async () => { button(host, "We had none")[0].click(); });
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ done: { "move-customers": expect.any(String) } });
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ done: expect.objectContaining({ "move-customers": expect.any(String) }) }));
  });

  it("stays away for a press that started fresh", () => {
    const { host } = mount({ bring: { at: "x", skipped: true } });
    expect(host.textContent).toBe("");
  });
});
