// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SetupDoor, SetupPress } from "./door";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { SetupAdmin } = await import("./SetupAdmin");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; location.hash = ""; });
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

const PRESS: SetupPress = { pressId: "press-moth", status: "setup", plan: "both", pressName: "Moth Press", sells: "books", country: "", look: "", adminLook: "" };
const lists = { countries: { CA: { name: "Canada" }, US: { name: "United States" } }, sells: [{ id: "books", label: "Books" }, { id: "zines", label: "Zines" }] };

function door(): SetupDoor & { saved: any[] } {
  const saved: any[] = [];
  return {
    saved,
    presses: vi.fn(async () => [PRESS]),
    save: vi.fn(async (_id: string, change: any) => { saved.push(change); return { ...PRESS, ...change }; }),
    plans: vi.fn(async () => ({ trialDays: 14, plans: [
      { plan: "both" as const, name: "Shop and stockroom", priceText: "$39.00" },
      { plan: "shop" as const, name: "Shop", priceText: "$29.00" },
      { plan: "stockroom" as const, name: "Stockroom", priceText: "$19.00" },
    ] })),
  };
}

async function mount(d: SetupDoor, hash = "") {
  location.hash = hash;
  const el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(h(SetupAdmin, { press: PRESS, door: d, lists, email: "owner@example.com", helpUrl: "/help/", onSignOut: () => {} })));
  await flush();
  return el;
}

describe("the admin in setup mode (code plan 18.6)", () => {
  it("opens on the setup guide with the press's progress", async () => {
    const el = await mount(door());
    expect(el.querySelector("h1")?.textContent).toBe("Welcome, Moth Press");
    expect(el.textContent).toContain("1 of 4 done");
    expect(el.textContent).toContain("Opens with your shop");
  });

  it("a locked page says it opens with the shop, offers Open my shop, and writes nothing", async () => {
    const d = door();
    const el = await mount(d, "#orders");
    expect(el.querySelector("h1")?.textContent).toBe("Orders");
    expect(el.textContent).toContain("Opens with your shop");
    const button = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Open my shop") as HTMLButtonElement;
    act(() => button.click());
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("Plan and billing");
    expect(d.save).not.toHaveBeenCalled();
  });

  it("saves the press's details to the setup record", async () => {
    const d = door();
    const el = await mount(d, "#settings/general");
    const selects = el.querySelectorAll("form select");
    const set = (input: HTMLSelectElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    act(() => set(selects[1] as HTMLSelectElement, "CA"));
    const form = el.querySelector("form")!;
    await act(async () => { form.requestSubmit(); });
    await flush();
    expect(d.saved).toEqual([{ pressName: "Moth Press", sells: "books", country: "CA" }]);
  });

  it("changes the plan from Plan and billing, with each plan's price", async () => {
    const d = door();
    const el = await mount(d, "#settings/plan");
    expect(el.textContent).toContain("$29.00");
    const shop = [...el.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.startsWith("Shop") && !b.textContent.includes("stockroom")) as HTMLButtonElement;
    await act(async () => { shop.click(); });
    await flush();
    expect(d.saved).toEqual([{ plan: "shop" }]);
  });
});
