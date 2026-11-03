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

const PRESS: SetupPress = { pressId: "press-moth", status: "setup", plan: "both", pressName: "Moth Press", sells: "books", country: "", look: "", adminLook: "", stagedImport: null };
const lists = { countries: { CA: { name: "Canada" }, US: { name: "United States" } }, sells: [{ id: "books", label: "Books" }, { id: "zines", label: "Zines" }] };

function door(): SetupDoor & { saved: any[] } {
  const saved: any[] = [];
  return {
    saved,
    presses: vi.fn(async () => [PRESS]),
    save: vi.fn(async (_id: string, change: any) => { saved.push(change); return { ...PRESS, ...change }; }),
    keepImport: vi.fn(async (_id: string, _file: Blob, details: { name: string; rows: number }) => ({ ...PRESS, stagedImport: { ...details, size: 9, at: "2026-11-03T09:00:00Z" } })),
    removeImport: vi.fn(async () => ({ ...PRESS, stagedImport: null })),
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
    expect(el.textContent).toContain("Bring your books over from your old shop · optional");
  });

  it("a locked page says it opens with the shop, offers Open my shop, and writes nothing", async () => {
    const d = door();
    const el = await mount(d, "#orders");
    expect(el.querySelector("h1")?.textContent).toBe("Orders");
    expect(el.textContent).toContain("Opens with your shop");
    const button = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Open my shop") as HTMLButtonElement;
    act(() => button.click());
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("Plan");
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
    expect(d.saved).toEqual([{ country: "CA" }]);
  });

  it("changes the plan from Settings › Plan, with each plan's price", async () => {
    const d = door();
    const el = await mount(d, "#settings/plan");
    expect(el.textContent).toContain("$29.00");
    const shop = [...el.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.startsWith("Shop") && !b.textContent.includes("stockroom")) as HTMLButtonElement;
    await act(async () => { shop.click(); });
    await flush();
    expect(d.saved).toEqual([{ plan: "shop" }]);
  });

  it("keeps the page when the address names no page, as the skip link's #rp-main does", async () => {
    const el = await mount(door(), "#settings/general");
    expect(el.querySelector("h1")?.textContent).toBe("General");
    await act(async () => { location.hash = "rp-main"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("General");
  });

  it("says when the prices didn't load, promises no free days, and tries again", async () => {
    const d = door();
    const good = d.plans as any;
    const first = good.getMockImplementation();
    good.mockImplementationOnce(async () => { throw new Error("offline"); });
    const el = await mount(d, "#settings/plan");
    expect(el.textContent).toContain("Prices couldn't load");
    expect(el.textContent).not.toMatch(/\d+ days/);
    expect(el.textContent).toContain("Shop and stockroom");
    good.mockImplementation(first);
    const retry = [...el.querySelectorAll("button")].find((b) => b.textContent === "Try again") as HTMLButtonElement;
    await act(async () => { retry.click(); });
    await flush();
    expect(el.textContent).toContain("$29.00");
    expect(el.textContent).toContain("Your first shop is free for 14 days");
  });

  it("a press browsing other looks can keep its own without saving", async () => {
    const d = door();
    const el = document.createElement("div");
    document.body.append(el);
    location.hash = "#settings/designer";
    root = createRoot(el);
    act(() => root!.render(h(SetupAdmin, { press: { ...PRESS, look: "press-riso" }, door: d, lists, email: "owner@example.com", helpUrl: "/help/", onSignOut: () => {} })));
    await flush();
    const change = [...el.querySelectorAll("button")].find((b) => b.textContent === "Choose another look") as HTMLButtonElement;
    act(() => change.click());
    await flush();
    expect(el.textContent).not.toContain("Skip for now");
    const keep = [...el.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Keep ")) as HTMLButtonElement;
    act(() => keep.click());
    await flush();
    expect(el.textContent).toContain("Choose another look");
    expect(d.save).not.toHaveBeenCalled();
  });

  it("Books previews a product file and keeps it for the shop; nothing is kept until the press says so", async () => {
    const d = door();
    const el = await mount(d, "#catalog");
    expect(el.querySelector("h1")?.textContent).toBe("Books");
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["Title,Price,Stock\nMoths,12,3\nNight Pages,15,1\n"], "my-books.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    expect(el.textContent).toContain("2 books ready");
    expect(el.querySelectorAll('[aria-label="Import preview"] li')).toHaveLength(2);
    expect(d.keepImport).not.toHaveBeenCalled();
    const keep = [...el.querySelectorAll("button")].find((b) => b.textContent === "Keep 2 books for my shop") as HTMLButtonElement;
    await act(async () => { keep.click(); });
    await flush();
    expect((d.keepImport as any).mock.calls[0][2]).toEqual({ name: "my-books.csv", rows: 2 });
    expect(el.textContent).toContain("Kept for your shop");
    expect(el.textContent).toContain("2 books, kept 3 November 2026");
  });

  it("refuses a file over 5 MB in plain words, before reading or sending it", async () => {
    const d = door();
    const el = await mount(d, "#catalog");
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File(["x"], "huge.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 });
    Object.defineProperty(input, "files", { value: [big], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/larger than 5 MB/);
    expect(d.keepImport).not.toHaveBeenCalled();
  });
});

describe("bringing a shop over, at the top of Home (code plan 23.0)", () => {
  const button = (el: HTMLElement, text: string) => [...el.querySelectorAll("main button")].find((b) => b.textContent === text) as HTMLButtonElement;

  it("is the first card on Home, above the setup guide", async () => {
    const el = await mount(door());
    const cards = [...el.querySelectorAll("main section")];
    expect(cards[0].textContent).toContain("Selling somewhere already?");
    expect(cards[1].textContent).toContain("Setup guide");
  });

  it("Bring my shop over opens Books and records the answer", async () => {
    const d = door();
    const el = await mount(d);
    act(() => button(el, "Bring my shop over").click());
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("Books");
    expect(d.saved).toEqual([{ moving: "yes" }]);
    expect(el.textContent).toContain("Where do you sell now?");
  });

  it("I'm starting fresh puts the card away and moves the step last", async () => {
    const d = door();
    const el = await mount(d);
    await act(async () => { button(el, "I'm starting fresh").click(); });
    await flush();
    expect(d.saved).toEqual([{ moving: "fresh" }]);
    expect(el.textContent).not.toContain("Selling somewhere already?");
    const steps = [...el.querySelectorAll("main ol li")].map((li) => li.textContent ?? "");
    expect(steps[steps.length - 2]).toContain("Bring your books over");
  });

  it("the Books page shows the plain steps for where the press sells now", async () => {
    const el = await mount(door(), "#catalog");
    const select = [...el.querySelectorAll("select")].find((s) => s.closest("label, div")?.textContent?.includes("Where do you sell now?")) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "online");
    act(() => { select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(el.querySelector('ol[aria-label="How to get your product file"]')?.textContent).toContain("Export or Download");
  });
});
