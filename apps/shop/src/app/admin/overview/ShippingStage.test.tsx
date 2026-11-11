// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getShippingProfiles: vi.fn(async () => [] as any[]),
  createShippingProfile: vi.fn(async (p: any) => ({ id: "p1", ...p })),
}));
vi.mock("../api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { ShippingStage } = await import("./ShippingStage");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const text = () => document.body.textContent || "";
const button = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const complete = { street: "12 Queen Street", city: "Toronto", state: "ON", zip: "M5H 2N2", country: "Canada" };

async function mount(settings: any, onDone = vi.fn(async () => {})) {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(ShippingStage, { settings, onDone })));
  await flush();
  return onDone;
}

describe("Get started: shipping (plan 17.11)", () => {
  it("a Canadian press sees its ship-from address, Canada's starter and the starter's prices", async () => {
    await mount({ location: complete });
    expect(text()).toContain("Shipping");
    expect(text()).toContain("Ships from");
    expect(text()).toContain("12 Queen Street, Toronto, ON, M5H 2N2, Canada");
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe("world");
    expect(text()).toContain("Canada: $8.00 for the first one, $3.00 for each extra one");
  });

  it("confirming makes one shipping profile with the starter's zones, then records the starter", async () => {
    const onDone = await mount({ location: complete });
    await act(async () => { button("Set up this shipping")!.click(); });
    await flush();
    expect(api.createShippingProfile).toHaveBeenCalledTimes(1);
    expect(api.createShippingProfile.mock.calls[0][0]).toMatchObject({ name: "Standard shipping" });
    expect(api.createShippingProfile.mock.calls[0][0].zones).toHaveLength(3);
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), starter: "world" });
  });

  it("if the step can't be saved after the profile is made, a retry doesn't make a second profile", async () => {
    const onDone = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    await mount({ location: complete }, onDone);
    await act(async () => { button("Set up this shipping")!.click(); });
    await flush();
    await act(async () => { button("Set up this shipping")!.click(); });
    await flush();
    expect(api.createShippingProfile).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenLastCalledWith({ at: expect.any(String), starter: "world" });
  });

  it("the starting-shipping list never offers Start empty, which hid the list with no way back", async () => {
    await mount({ location: complete });
    const values = [...document.querySelectorAll("select option")].map(o => (o as HTMLOptionElement).value);
    expect(values).not.toContain("blank");
  });

  it("a shop that already has shipping and its address passes the step by itself, making nothing new", async () => {
    api.getShippingProfiles.mockResolvedValueOnce([{ id: "old", name: "Standard" }]);
    const onDone = await mount({ location: complete });
    expect(text()).not.toContain("nothing new is added");
    expect(api.createShippingProfile).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), skipped: true });
  });

  it("if passing by itself can't be saved, the step shows with Continue and a plain message", async () => {
    api.getShippingProfiles.mockResolvedValueOnce([{ id: "old", name: "Standard" }]);
    const onDone = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    await mount({ location: complete }, onDone);
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it("a shop with shipping but no full address still asks for the address", async () => {
    api.getShippingProfiles.mockResolvedValueOnce([{ id: "old", name: "Standard" }]);
    const onDone = await mount({ location: { ...complete, street: "" } });
    expect(text()).toContain("Add the street address your orders ship from.");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a country that needs its shipping by hand makes nothing and says so", async () => {
    const onDone = await mount({ location: { ...complete, country: "Japan" } });
    expect(text()).toContain("starts empty");
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(api.createShippingProfile).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), skipped: true });
  });

  it("an incomplete ship-from address is named, and nothing can be confirmed", async () => {
    const onDone = await mount({ location: { ...complete, street: "", zip: "" } });
    expect(text()).toContain("Add the street address your orders ship from.");
    expect(text()).toContain("Add your postal code.");
    expect(button("Set up this shipping")!.disabled).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a failed save keeps the step open with a plain message and records nothing", async () => {
    api.createShippingProfile.mockRejectedValueOnce(new Error("offline"));
    const onDone = await mount({ location: complete });
    await act(async () => { button("Set up this shipping")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("setting shipping up later records the step as skipped", async () => {
    const onDone = await mount({ location: complete });
    await act(async () => { button("Set up shipping later")!.click(); });
    await flush();
    expect(api.createShippingProfile).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), skipped: true });
  });
});
