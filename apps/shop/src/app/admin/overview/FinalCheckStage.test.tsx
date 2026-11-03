// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadinessItem } from "../launchReadiness";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { FinalCheckStage } = await import("./FinalCheckStage");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const text = () => document.body.textContent || "";
const button = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const item = (over: Partial<ReadinessItem>): ReadinessItem => ({ id: "x", label: "Payments", detail: "Connect your card account", status: "block", tab: "payments", action: "Open Payments", ...over });

async function mount(props: any) {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  const base = { readiness: [], onOpenShop: vi.fn(async () => true), onDone: vi.fn(async () => {}), onFinishLater: vi.fn() };
  act(() => root!.render(h(FinalCheckStage, { ...base, ...props })));
  await flush();
  return { ...base, ...props };
}

describe("Get started, step 8: the final check and open (plan 17.13)", () => {
  it("names what is still missing in plain words, and does not open", async () => {
    await mount({ readiness: [item({ label: "Get paid", detail: "Connect your card account" }), item({ id: "y", label: "Shipping", status: "ok" })] });
    expect(text()).toContain("Get started · Step 8 of 8: final check and open");
    expect(text()).toContain("Still to do before you open");
    expect(text()).toContain("Get paid");
    expect(button("Open my shop")!.disabled).toBe(true);
    expect(text()).not.toContain("Shipping");
  });

  it("recommends a practice order, and never requires one", async () => {
    await mount({ readiness: [] });
    expect(text()).toContain("We recommend placing a practice order first");
    expect(text()).toContain("It isn't required.");
  });

  it("with nothing missing, opening the shop records the step as opened", async () => {
    const props = await mount({ readiness: [item({ status: "ok" })] });
    await act(async () => { button("Open my shop")!.click(); });
    await flush();
    expect(props.onOpenShop).toHaveBeenCalledTimes(1);
    expect(props.onDone).toHaveBeenCalledWith({ at: expect.any(String), opened: true });
  });

  it("if the shop can't be opened, the step stays open with a plain message", async () => {
    const props = await mount({ readiness: [], onOpenShop: vi.fn(async () => false) });
    await act(async () => { button("Open my shop")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(props.onDone).not.toHaveBeenCalled();
  });

  it("finish later records nothing and hands back to the setup guide", async () => {
    const props = await mount({ readiness: [item({})] });
    await act(async () => { button("Finish later")!.click(); });
    await flush();
    expect(props.onFinishLater).toHaveBeenCalledTimes(1);
    expect(props.onDone).not.toHaveBeenCalled();
  });

  it("recommends two-step sign-in and backup codes first, without stopping the shop opening", async () => {
    const props = await mount({ readiness: [item({ id: "sign-in", label: "No backup codes saved", detail: "Make them in Settings › Security.", status: "warn", tab: "security", action: "Open Security" })], onOpen: vi.fn() });
    expect(text()).toContain("Recommended before you open");
    expect(text()).toContain("No backup codes saved");
    expect(button("Open my shop")!.disabled).toBe(false);
    act(() => button("Open Security")!.click());
    expect(props.onOpen).toHaveBeenCalledWith("security");
  });
});
