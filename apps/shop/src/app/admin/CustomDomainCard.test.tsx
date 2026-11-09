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
  it("offers Copy link on an address that works, not on one still being set up", async () => {
    serve();
    state.domains = [{ name: "moth-press.shops.example", state: "live", free: true }, { name: "new.mothpress.example", state: "waiting_dns" }];
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const el = await mount();
    const free = el.querySelector('[data-domain="moth-press.shops.example"]')!;
    expect(button(el.querySelector('[data-domain="new.mothpress.example"]')!, "Copy link")).toBeUndefined();
    await act(async () => button(free, "Copy link")!.click());
    expect(writeText).toHaveBeenCalledWith("https://moth-press.shops.example");
  });

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

describe("Your web address: connect in one step (plan 6.15)", () => {
  const GUIDE = {
    seller: "Namecheap", zone: "mothpress.example",
    steps: ["Sign in at Namecheap and open Domain List.", "Press Manage next to mothpress.example.", "For each line below, add it."],
    lines: [{ action: "add", kind: "Address", name: "shop", value: "199.36.158.100" }, { action: "remove", kind: "Address", name: "shop", value: "192.0.2.10" }],
    message: { subject: "Please connect shop.mothpress.example to our shop", body: "Kind: Address" },
  };
  const type = async (el: HTMLElement, text: string) => {
    const input = el.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const connectWith = (answer: any) => {
    state.main = OWN;
    state.domains = [];
    api.customDomains.mockImplementation(async (step: string, domain?: string) => {
      if (step === "list") return listOf();
      if (step === "connect") { state.domains = [{ name: domain, state: "waiting_dns" }]; return { name: domain, state: "waiting_dns", records: [], ...answer }; }
      if (step === "check") return { name: domain, state: "waiting_dns", records: [], ...answer };
      throw new Error(`unexpected ${step}`);
    });
  };

  it("a domain seller that works with Colophon gets one button, and the press sees no records", async () => {
    connectWith({ way: "allow", seller: "GoDaddy", allowUrl: "https://dcc.seller.example/apply?x=1", guide: { ...GUIDE, seller: "GoDaddy" } });
    const el = await mount();
    await type(el, "shop.mothpress.example");
    await act(async () => button(el, "Connect")!.click());
    expect(api.customDomains).toHaveBeenCalledWith("connect", "shop.mothpress.example");
    const card = el.querySelector('[data-domain="shop.mothpress.example"]')!;
    expect(button(card, "Connect with GoDaddy")?.querySelector('[data-brand="godaddy"]')).toBeTruthy();
    expect(card.textContent).toContain("sign in and say yes");
    // The by-hand guide stays folded away behind a plain question.
    expect(card.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(card.textContent).toContain("Prefer to do it yourself?");
    expect(el.textContent).not.toMatch(/DNS|CNAME|\bTXT\b|record type/);
  });

  it("asks before the domain moves, so the old shop's last orders aren't lost", async () => {
    connectWith({ way: "allow", seller: "GoDaddy", allowUrl: "https://dcc.seller.example/apply?x=1", guide: { ...GUIDE, seller: "GoDaddy" } });
    const assign = vi.fn();
    const was = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...was, assign } });
    try {
      const el = await mount();
      await type(el, "shop.mothpress.example");
      await act(async () => button(el, "Connect")!.click());
      const card = el.querySelector('[data-domain="shop.mothpress.example"]')!;
      await act(async () => button(card, "Connect with GoDaddy")!.click());
      expect(document.body.textContent).toContain("Move shop.mothpress.example to this shop now?");
      expect(document.body.textContent).toContain("close its checkout first");
      expect(assign).not.toHaveBeenCalled();
      await clickConfirm("Yes, connect it");
      expect(assign).toHaveBeenCalledWith("https://dcc.seller.example/apply?x=1");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: was });
    }
  });

  it("the shop's free address is set up for the press: no button, no lines, never removed", async () => {
    state.main = OWN;
    state.domains = [{ name: "moth-press.shops.example", state: "waiting_dns", free: true }];
    api.customDomains.mockImplementation(async (step: string, domain?: string) => {
      if (step === "list") return listOf();
      if (step === "check") return { name: domain, state: "waiting_dns", records: [], way: "guide", guide: GUIDE };
      throw new Error(`unexpected ${step}`);
    });
    const el = await mount();
    const card = el.querySelector('[data-domain="moth-press.shops.example"]')!;
    expect(card.textContent).toContain("Setting up");
    expect(card.textContent).toContain("Nothing to do");
    expect(card.querySelector("details")).toBeNull();
    expect(button(card, "Remove")).toBeUndefined();
  });

  it("the free address can get a new name; the one before keeps working and can then be removed", async () => {
    state.main = "moth-press.shops.example";
    state.domains = [{ name: "moth-press.shops.example", state: "live", free: true }];
    api.customDomains.mockImplementation(async (step: string, domain?: string) => {
      if (step === "list") return listOf();
      if (step === "renameFree") {
        state.domains = [{ name: "moth-press.shops.example", state: "live", free: true, former: true }, { name: `${domain}.shops.example`, state: "waiting_dns", free: true }];
        return listOf();
      }
      if (step === "check") return { name: domain, state: "waiting_dns", records: [] };
      throw new Error(`unexpected ${step}`);
    });
    const el = await mount();
    let card = el.querySelector('[data-domain="moth-press.shops.example"]')!;
    expect(button(card, "Remove")).toBeUndefined();
    await act(async () => button(card, "Change name")!.click());
    const input = card.querySelector("[data-rename] input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Moth Books!");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(card.textContent).toContain("moth-books.shops.example");
    await act(async () => button(card, "Use this name")!.click());
    expect(api.customDomains).toHaveBeenCalledWith("renameFree", "moth-books");
    expect(el.textContent).toContain("moth-press.shops.example sends visitors to it");
    card = el.querySelector('[data-domain="moth-press.shops.example"]')!;
    expect(card.textContent).toContain("Main until your new free address works");
    expect(button(card, "Change name")).toBeUndefined();
    expect(button(el.querySelector('[data-domain="moth-books.shops.example"]')!, "Change name")).toBeTruthy();
    // Free addresses never use up one of the three of the press's own.
    expect(el.textContent).toContain("Connect an address you own");
  });

  it("any other seller gets the guide: plain steps, a Copy button on every line, and a mail for the web person", async () => {
    connectWith({ way: "guide", seller: "Namecheap", guide: GUIDE });
    const el = await mount();
    await type(el, "shop.mothpress.example");
    await act(async () => button(el, "Connect")!.click());
    const card = el.querySelector('[data-domain="shop.mothpress.example"]')!;
    expect(card.querySelector("details")?.hasAttribute("open")).toBe(true);
    expect([...card.querySelectorAll("li")].map((li) => li.textContent)).toEqual(GUIDE.steps);
    const lines = [...card.querySelectorAll("[data-guide-line]")];
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("199.36.158.100");
    expect(lines[1].textContent).toContain("Take out, if it's there");
    for (const line of lines) {
      expect(button(line, "Copy name")).toBeTruthy();
      expect(button(line, "Copy value")).toBeTruthy();
    }
    const mail = [...card.querySelectorAll("a")].find((a) => a.textContent === "Send these to my web person") as HTMLAnchorElement;
    expect(mail.getAttribute("href")).toContain("mailto:?subject=Please%20connect%20shop.mothpress.example");
    expect(button(card, "Connect with Namecheap")).toBeUndefined();
    expect(el.textContent).not.toMatch(/DNS|CNAME|\bTXT\b|record type/);
  });
});
