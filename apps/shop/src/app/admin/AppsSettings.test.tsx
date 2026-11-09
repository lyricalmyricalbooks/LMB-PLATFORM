// @vitest-environment jsdom
// Settings › Apps: installed apps with Remove behind a question, the store gallery with Details and Add, and activity
// with the shop's reason for a refusal.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null }, db: {} }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { AppsSettings } = await import("./AppsSettings");
const { addAddress } = await import("./appActivity");

const PAL = { appId: "app_0000000000a1", name: "Parcel Pal", tagline: "Cheaper labels", description: "", category: "orders-shipping", categoryName: "Orders and shipping", supportEmail: "help@pal.example", website: "https://pal.example", installAddress: "https://pal.example/start", permissions: [{ scope: "write_orders", words: "Add tracking and mark orders as sent", personal: true }] };
const MAIL = { ...PAL, appId: "app_0000000000b2", name: "Letterbox", category: "marketing", categoryName: "Marketing and email", installAddress: "" };

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el: Element | null | undefined) => act(async () => { (el as HTMLElement).click(); });
const byText = (sel: string, text: string) => [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim() === text);

function apiWith(over: Record<string, any> = {}) {
  let installed: any[] = [PAL];
  const calls: string[] = [];
  return {
    calls,
    api: {
      installed: async () => installed, store: async () => ({ apps: [PAL, MAIL], categories: [{ id: "orders-shipping", name: "Orders and shipping" }, { id: "marketing", name: "Marketing and email" }] }),
      remove: async (id: string) => { calls.push(id); installed = []; },
      activity: async () => [{ id: "r1", app: "Parcel Pal", what: "Marked order 1 sent", when: "2026-11-04T15:00:00Z", state: "refused", reason: "Order on hold: author" }],
      ...over,
    },
  };
}
async function show(api: any) {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => { root!.render(h(AppsSettings, { api, shopId: "moth-press" })); });
  await flush();
}

describe("Settings › Apps", () => {
  it("lists installed apps and removes one only after asking", async () => {
    const { api, calls } = apiWith();
    await show(api);
    expect(document.body.textContent).toContain("Parcel Pal");
    expect(byText("[role=tab]", "Installed1")).toBeTruthy();
    await click(byText("button", "Remove"));
    expect(document.body.textContent).toContain("Remove Parcel Pal?");
    await click([...document.querySelectorAll(".rp-dialog button")].find((b) => b.textContent === "Remove"));
    await flush();
    expect(calls).toEqual(["app_0000000000a1"]);
    expect(document.body.textContent).toContain("No apps yet");
  });

  it("shows the store as cards, filters by category, and opens details with the permissions", async () => {
    await show(apiWith().api);
    await click(byText("[role=tab]", "App store"));
    expect(document.querySelectorAll(".ap-card")).toHaveLength(2);
    expect(document.querySelector(".ap-card")?.textContent).toContain("Installed");
    await click(byText("[role=tab]", "Marketing and email"));
    expect(document.querySelectorAll(".ap-card")).toHaveLength(1);
    await click(byText("button", "Details"));
    expect(document.querySelector(".rp-dialog")?.textContent).toContain("Personal details");
  });

  it("shows activity with the reason, and a plain note when the store isn't open", async () => {
    await show(apiWith({ installed: async () => { throw Object.assign(new Error("off"), { code: "not_available" }); } }).api);
    expect(document.body.textContent).toContain("The app store opens soon");
    await click(byText("[role=tab]", "Activity"));
    await flush();
    expect(document.body.textContent).toContain("Order on hold: author");
  });

  it("sends Add to the app's start address with the shop", () => {
    expect(addAddress(PAL, "moth-press")).toBe("https://pal.example/start?shop=moth-press");
    expect(addAddress(MAIL, "moth-press")).toBe("https://pal.example");
  });
});
