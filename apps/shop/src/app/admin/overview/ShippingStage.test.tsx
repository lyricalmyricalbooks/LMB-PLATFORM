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

describe("Get started, step 6: shipping and your address (plan 17.11)", () => {
  it("a Canadian press sees its ship-from address, Canada's starter and the starter's prices", async () => {
    await mount({ location: complete });
    expect(text()).toContain("Get started · Step 6 of 8: shipping and your address");
    expect(text()).toContain("12 Queen Street, Toronto, ON, M5H 2N2, Canada");
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe("world");
    expect(text()).toContain("Canada: $8.00 for the first book, $3.00 for each extra one");
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

  it("a shop that already has shipping makes nothing new, and the step is recorded as skipped", async () => {
    api.getShippingProfiles.mockResolvedValueOnce([{ id: "old", name: "Standard" }]);
    const onDone = await mount({ location: complete });
    expect(text()).toContain("Your shop already has shipping, so nothing new is added.");
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(api.createShippingProfile).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), skipped: true });
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
