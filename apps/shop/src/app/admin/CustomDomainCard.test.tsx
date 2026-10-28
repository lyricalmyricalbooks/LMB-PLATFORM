// @vitest-environment jsdom
// Settings › General › Your web address (plan 5.9): Make main and Remove, with a pretend domain service.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const OWN = "moth-press.web.app";
const state = vi.hoisted(() => ({ main: "moth-press.web.app", domains: [] as any[] }));
const listOf = () => ({ domains: state.domains.map((d: any) => ({ ...d, main: d.name === state.main })), own: "moth-press.web.app", main: state.main, max: 3 });
const api = vi.hoisted(() => ({ customDomains: vi.fn() }));
vi.mock("./api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { CustomDomainCard } = await import("./CustomDomainCard");

let root: Root | null = null;
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ""; api.customDomains.mockReset(); });

function serve() {
  api.customDomains.mockImplementation(async (step: string, domain?: string) => {
    if (step === "list") return listOf();
    if (step === "check") return { name: domain, state: state.domains.find((d: any) => d.name === domain)?.state, records: [] };
    if (step === "makeMain") { state.main = domain!; return listOf(); }
    if (step === "remove") {
      if (domain === state.main) throw Object.assign(new Error("This is your shop's main address. Make another address main first, then remove this one."), { code: "is_main" });
      state.domains = state.domains.filter((d: any) => d.name !== domain);
      return { removed: domain, ...listOf() };
    }
    throw new Error(`unexpected ${step}`);
  });
}

const button = (scope: ParentNode, text: string) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
async function mount() {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(h(CustomDomainCard, { fallback: h("p", null, "fallback") })); });
  return el;
}
async function clickConfirm(label: string) {
  await act(async () => button(document.querySelector(".rp-dialog-foot")!, label)!.click());
}

describe("Your web address: main address and remove", () => {
  it("shows the main address, offers Make main only on a live address, and never Remove on the main one", async () => {
    state.main = OWN;
    state.domains = [{ name: "shop.mothpress.example", state: "live" }, { name: "new.mothpress.example", state: "waiting_dns" }];
    serve();
    const el = await mount();
    expect(el.querySelector("[data-domain-main]")?.textContent).toContain(`Your main address: ${OWN}`);
    const live = el.querySelector('[data-domain="shop.mothpress.example"]')!;
    const waiting = el.querySelector('[data-domain="new.mothpress.example"]')!;
    expect(button(live, "Make main")).toBeTruthy();
    expect(button(waiting, "Make main")).toBeUndefined();
    expect(waiting.textContent).toContain("Once it shows as Live");
    expect(button(live, "Remove")).toBeTruthy();

    await act(async () => button(live, "Make main")!.click());
    expect(document.body.textContent).toContain("Make shop.mothpress.example your main address?");
    await clickConfirm("Make main");
    expect(api.customDomains).toHaveBeenCalledWith("makeMain", "shop.mothpress.example");
    expect(el.querySelector("[data-domain-main]")?.textContent).toContain("Your main address: shop.mothpress.example");
    const nowMain = el.querySelector('[data-domain="shop.mothpress.example"]')!;
    expect(nowMain.textContent).toContain("Main address");
    expect(button(nowMain, "Remove")).toBeUndefined();
    expect(nowMain.textContent).toContain("make another address main first");
    expect(button(el, `Go back to ${OWN}`)).toBeTruthy();
  });

  it("removes an address after asking, and leaves it when the press cancels", async () => {
    state.main = OWN;
    state.domains = [{ name: "shop.mothpress.example", state: "live" }, { name: "old.mothpress.example", state: "live" }];
    serve();
    const el = await mount();
    const old = () => el.querySelector('[data-domain="old.mothpress.example"]');
    await act(async () => button(old()!, "Remove")!.click());
    expect(document.body.textContent).toContain("Remove old.mothpress.example?");
    await clickConfirm("Cancel");
    expect(api.customDomains).not.toHaveBeenCalledWith("remove", expect.anything());
    await act(async () => button(old()!, "Remove")!.click());
    await clickConfirm("Remove address");
    expect(api.customDomains).toHaveBeenCalledWith("remove", "old.mothpress.example");
    expect(old()).toBeNull();
    expect(el.textContent).toContain("old.mothpress.example was removed from your shop.");
  });
});
