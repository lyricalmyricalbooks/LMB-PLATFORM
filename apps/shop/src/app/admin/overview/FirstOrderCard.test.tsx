// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { FirstOrderCard } from "./FirstOrderCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("Your first order", () => {
  it("names the buyer, opens the order, shares and puts itself away", async () => {
    const onDone = vi.fn(async () => {});
    const onOpen = vi.fn();
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    const order = { id: "ord 1", paymentStatus: "paid", total: 24, customer: { name: "Ada Lovelace" }, items: [{ id: "x", title: "Moth Notes" }, { id: "y", title: "Wasp Notes" }] };
    act(() => root.render(h(FirstOrderCard, { order, onDone, onOpen })));
    expect(el.textContent).toContain("Ada just bought from you.");
    expect(el.textContent).toContain("Moth Notes and 1 more");
    expect(el.querySelectorAll("ol li")).toHaveLength(3);
    expect(el.querySelector("ol")?.textContent).toContain("Pack it and mark it sent.");
    const button = (words: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === words) as HTMLButtonElement;
    act(() => button("Open the order").click());
    expect(window.location.hash).toBe("#orders/ord%201");
    act(() => button("Share the news").click());
    expect(onOpen).toHaveBeenCalledWith("channels");
    await act(async () => { button("Done").click(); });
    expect(onDone).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("says so when Done couldn't save", async () => {
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(h(FirstOrderCard, { order: { id: "a" }, onDone: async () => { throw new Error("offline"); } })));
    expect(el.textContent).toContain("Someone just bought from you.");
    await act(async () => { [...el.querySelectorAll("button")].find((b) => b.textContent === "Done")!.click(); });
    expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/didn't save/);
    act(() => root.unmount());
  });
});
