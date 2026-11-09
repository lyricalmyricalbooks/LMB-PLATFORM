// @vitest-environment jsdom
// Overview › Your move so far (plan 23.17): the parts left, opening each place, and "We had none".
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api: any = vi.hoisted(() => ({ getFirstWeek: vi.fn(), updateFirstWeek: vi.fn(async () => {}), untickFirstWeek: vi.fn(async () => {}),
  movedCounts: vi.fn(async () => ({ customers: 4, giftCards: null, orders: 1 })) }));
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
    // The old-links check sits on Settings › General › Visitors & Google, which the page switch alone can't open.
    act(() => button(host, "Check your old links")[0].click());
    expect(window.location.hash).toBe("#settings/general/visitors");
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () => { button(host, "We had none")[0].click(); });
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ done: { "move-customers": expect.any(String) } });
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ done: expect.objectContaining({ "move-customers": expect.any(String) }) }));
  });

  it("stays away for a press that started fresh", () => {
    const { host } = mount({ bring: { at: "x", skipped: true } });
    expect(host.textContent).toBe("");
  });
});

describe("Your move so far, put away", () => {
  it("leaves one line that brings it back", async () => {
    const { host, setDoc } = mount({ ...moving, done: { ...moving.done, "move-list": "2026-11-03" } });
    expect(host.textContent).toContain("Your move so far is hidden.");
    await act(async () => { button(host, "Show it again")[0].click(); });
    expect(api.untickFirstWeek).toHaveBeenCalledWith("move-list");
    expect(setDoc.mock.calls[0][0].done).toEqual({ "move-giftcards": "2026-11-02" });
  });

  it("says you're all moved in once every part is done, until closed (plan 23.25)", async () => {
    const all = { "move-customers": "a", "move-giftcards": "a", "move-orders": "a", "move-links": "a" };
    const { host, setDoc } = mount({ ...moving, done: all });
    expect(host.textContent).toContain("You're all moved in");
    expect(host.textContent).toContain("5 of 5 done");
    // What came over, counted (plan 23.28): a count that couldn't be read is left out.
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toContain("4 customers and 1 past order came over");
    act(() => button(host, "Check your old links")[0].click());
    expect(window.location.hash).toBe("#settings/general/visitors");
    await act(async () => { button(host, "Close")[0].click(); });
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ done: { "move-list": expect.any(String) } });
    expect(setDoc.mock.calls[0][0].done).toMatchObject({ ...all, "move-list": expect.any(String) });
  });

  it("says nothing once every part is done and it was closed", () => {
    const all = { "move-customers": "a", "move-giftcards": "a", "move-orders": "a", "move-links": "a", "move-list": "a" };
    const { host } = mount({ ...moving, done: all });
    expect(host.textContent).toBe("");
  });
});
