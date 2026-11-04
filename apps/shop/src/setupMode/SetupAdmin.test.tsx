// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SetupDoor, SetupPress } from "./door";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { SetupAdmin } = await import("./SetupAdmin");
const { setImageLoader } = await import("../app/admin/photoLinks");
setImageLoader(async (url) => !url.includes("gone"));

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
    saveDomain: vi.fn(async (_id: string, domain: string) => (domain
      ? { ...PRESS, domain: domain.toLowerCase(), domainChoice: "own" as const, domainSeller: "GoDaddy", domainEasy: true }
      : { ...PRESS, domain: "", domainChoice: "" as const, domainSeller: "", domainEasy: false })),
    readOldShop: vi.fn(async () => ({
      host: "moth.example", products: 1, notes: ["Stock counts aren't shown publicly, so check how many you have of each before you open."],
      csv: "Handle,Title,Variant Price,Image Src,Old page address\nmoth-songs,Moth Songs,20,https://img.example/m.jpg,/product/moth-songs\n",
    })),
    openShop: vi.fn(async (_id: string, choice: { plan: SetupPress["plan"] }) => ({ press: { ...PRESS, country: "CA", plan: choice.plan, status: "opening" as const, shopId: "moth-press" }, shop: { status: "queued", trialEnd: null } })),
    plans: vi.fn(async () => ({ trialDays: 14, termsVersion: "v1", plans: [
      { plan: "both" as const, name: "Shop and stockroom", priceText: "$39.00" },
      { plan: "shop" as const, name: "Shop", priceText: "$29.00" },
      { plan: "stockroom" as const, name: "Stockroom", priceText: "$19.00" },
    ] })),
  };
}

async function mount(d: SetupDoor, hash = "", press: SetupPress = PRESS) {
  location.hash = hash;
  const el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(h(SetupAdmin, { press, door: d, lists, email: "owner@example.com", helpUrl: "/help/", onSignOut: () => {} })));
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

  it("a locked page says it comes with the shop, offers Create my shop, and writes nothing", async () => {
    const d = door();
    const el = await mount(d, "#orders");
    expect(el.querySelector("h1")?.textContent).toBe("Orders");
    expect(el.textContent).toContain("Comes with your shop");
    const button = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Create my shop") as HTMLButtonElement;
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

  it("keeps the language chosen for the platform's emails, for when the shop opens", async () => {
    const d = door();
    const el = await mount(d, "#settings/general");
    const select = [...el.querySelectorAll("form select")].find((s) => [...(s as HTMLSelectElement).options].some((o) => o.value === "fr")) as HTMLSelectElement;
    expect(select.value).toBe("");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "fr");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { el.querySelector("form")!.requestSubmit(); });
    await flush();
    expect(d.saved).toEqual([{ language: "fr" }]);
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

  it("Books keeps the file without photos that can't be loaded from the old shop (plan 23.3)", async () => {
    const d = door();
    const el = await mount(d, "#catalog");
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const csv = "Title,Price,Image URL\nMoths,12,https://img.example/gone.jpg\nNight Pages,15,https://img.example/fine.jpg\n";
    Object.defineProperty(input, "files", { value: [new File([csv], "my-books.csv", { type: "text/csv" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    expect(el.textContent).toContain("1 photo couldn't be loaded from the old shop");
    const keep = [...el.querySelectorAll("button")].find((b) => b.textContent === "Keep 2 books for my shop") as HTMLButtonElement;
    await act(async () => { keep.click(); });
    await flush();
    const sent = await ((d.keepImport as any).mock.calls[0][1] as Blob).text();
    expect(sent).not.toContain("gone.jpg");
    expect(sent).toContain("https://img.example/fine.jpg");
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

  describe("Create my shop (code plan 18.8)", () => {
    const openButton = (el: HTMLElement) => [...el.querySelectorAll("main button")].find((b) => b.textContent === "Create my shop") as HTMLButtonElement;
    const terms = (el: HTMLElement) => el.querySelector("main input[type=checkbox]") as HTMLInputElement;

    it("creates only once the terms are ticked, with the chosen plan and today's terms, then shows the shop being made", async () => {
      const d = door();
      const el = await mount(d, "#settings/plan", { ...PRESS, country: "CA" });
      expect(openButton(el).disabled).toBe(true);
      act(() => terms(el).click());
      expect(openButton(el).disabled).toBe(false);
      act(() => openButton(el).click());
      await flush();
      expect(d.openShop).toHaveBeenCalledWith("press-moth", { plan: "both", termsVersion: "v1" });
      expect(el.textContent).toContain("Your shop is being made");
      expect(el.textContent).toContain("Making your website and your stockroom");
      expect(el.textContent).toContain("To owner@example.com");
      expect(el.textContent).toContain("Then open it to shoppers");
      expect(openButton(el)).toBeUndefined();
      // Nothing left to press in the top bar either.
      expect([...el.querySelectorAll("header button")].some((b) => b.getAttribute("aria-label") === "Create my shop")).toBe(false);
    });

    it("marks the press's missing country as needed, and points at General", async () => {
      const el = await mount(door(), "#settings/plan");
      act(() => terms(el).click());
      expect(openButton(el).disabled).toBe(true);
      expect(el.textContent).toContain("Your press · needed");
      expect(el.textContent).toContain("Add your country.");
      expect(el.textContent).toContain("Fill in what's marked above first.");
      const go = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Add details") as HTMLButtonElement;
      act(() => go.click());
      await flush();
      expect(el.querySelector("h1")?.textContent).toBe("General");
    });

    it("a refusal is shown in plain words and the press stays in setup", async () => {
      const d = door();
      (d.openShop as any).mockRejectedValueOnce(new Error("The payment service is busy. Try again in a minute."));
      const el = await mount(d, "#settings/plan", { ...PRESS, country: "CA" });
      act(() => terms(el).click());
      act(() => openButton(el).click());
      await flush();
      expect(el.querySelector("[role=alert]")?.textContent).toContain("payment service is busy");
      expect(openButton(el).disabled).toBe(false);
    });

    it("after a reload, a press waiting in line still reads why, not that its shop is being made", async () => {
      const el = await mount(door(), "#settings/plan", { ...PRESS, country: "CA", status: "opening", shopStatus: "in-line", shopMessage: "We're making a few shops a day. You're next in line." });
      expect(el.textContent).toContain("You're next in line.");
      expect(el.textContent).not.toContain("We're making your website");
    });

    it("a press whose country hasn't opened is told so and can press again later", async () => {
      const d = door();
      (d.openShop as any).mockResolvedValueOnce({ press: { ...PRESS, country: "US" }, shop: { status: "later", trialEnd: null, message: "Colophon starts in Canada." } });
      const el = await mount(d, "#settings/plan", { ...PRESS, country: "US" });
      act(() => terms(el).click());
      act(() => openButton(el).click());
      await flush();
      expect(el.querySelector("main [role=status]")?.textContent).toContain("Colophon starts in Canada.");
      expect(openButton(el).disabled).toBe(false);
    });

    it("a press waiting its turn sees why", async () => {
      const d = door();
      (d.openShop as any).mockResolvedValueOnce({ press: { ...PRESS, country: "CA", status: "opening" }, shop: { status: "in-line", trialEnd: null, message: "You're next in line." } });
      const el = await mount(d, "#settings/plan", { ...PRESS, country: "CA" });
      act(() => terms(el).click());
      act(() => openButton(el).click());
      await flush();
      expect(el.textContent).toContain("You're next in line.");
    });

    it("shows what goes into the shop, the price and what happens next before anything is created", async () => {
      const el = await mount(door(), "#settings/plan", { ...PRESS, country: "CA", look: "", stagedImport: { name: "old-shop.csv", size: 9, rows: 42, at: "2026-11-03T09:00:00Z" } });
      const text = el.textContent!;
      expect(text).toContain("Shop and stockroom · $39.00 a month");
      expect(text).toContain("Moth Press · Books · Canada");
      expect(text).toContain("Not chosen yet.");
      expect(text).toContain("42 books from old-shop.csv");
      expect(text).toContain("Nothing is charged today. Your first shop is free for 14 days, then $39.00 a month.");
      expect(text).toContain("Your website starts private.");
      expect(text).toContain("Tick the terms to create your shop.");
    });

    it("says when the free days end once the plan has started", async () => {
      const d = door();
      (d.openShop as any).mockResolvedValueOnce({ press: { ...PRESS, country: "CA", status: "opening" }, shop: { status: "queued", trialEnd: "2026-11-17T16:00:00Z" } });
      const el = await mount(d, "#settings/plan", { ...PRESS, country: "CA" });
      act(() => terms(el).click());
      act(() => openButton(el).click());
      await flush();
      expect(el.textContent).toContain("It's free until 17 November.");
    });
  });

  describe("the setup guide's next step", () => {
    it("stands out with its reason and the page's main button", async () => {
      const el = await mount(door(), "", { ...PRESS, plan: "both" });
      const next = el.querySelector('li[aria-current="step"]')!;
      expect(next.textContent).toContain("Tell us about your press");
      expect(next.textContent).toContain("set your shop's words, money and taxes");
      expect(next.querySelector(".rp-btn-primary")?.textContent).toBe("Add details");
    });

    it("says all is set once only creating the shop is left", async () => {
      const el = await mount(door(), "", { ...PRESS, country: "CA", look: "press-riso" });
      expect(el.textContent).toContain("All set. Create your shop when you're ready.");
      expect(el.querySelector('li[aria-current="step"]')?.textContent).toContain("Create your shop");
    });
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
    expect(steps[steps.length - 3]).toContain("Bring your books over");
  });

  it("the Books page shows the plain steps for where the press sells now", async () => {
    const el = await mount(door(), "#catalog");
    const select = [...el.querySelectorAll("select")].find((s) => s.closest("label, div")?.textContent?.includes("Where do you sell now?")) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "online");
    act(() => { select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(el.querySelector('ol[aria-label="How to get your product file"]')?.textContent).toContain("Export or Download");
  });
});

describe("bringing books over from the old shop's address (code plan 23.2)", () => {
  it("reads the address, previews the books like a chosen file, and shows what it couldn't read", async () => {
    const d = door();
    const el = await mount(d, "#catalog");
    const input = [...el.querySelectorAll("input")].find((i) => i.getAttribute("placeholder") === "yourshop.com") as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "moth.example");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { input.closest("form")!.requestSubmit(); });
    await flush();
    expect(d.readOldShop).toHaveBeenCalledWith("press-moth", "moth.example");
    expect(el.textContent).toContain("moth.example products.csv");
    expect(el.textContent).toContain("1 book ready");
    expect(el.textContent).toContain("Stock counts aren't shown publicly");
  });
});

describe("your web address in setup", () => {
  const radio = (el: Element, words: string) => [...el.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.includes(words)) as HTMLButtonElement;
  const typeInto = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("brings a domain the press already has, then says what happens once the shop is made", async () => {
    const d = door();
    const el = await mount(d, "#settings/general");
    expect(el.textContent).toContain("Your web address");
    await act(async () => { radio(el, "I already have a domain").click(); });
    const input = [...el.querySelectorAll("input")].find((i) => i.placeholder === "yourpress.com") as HTMLInputElement;
    await act(async () => { typeInto(input, "MothPress.example"); });
    const use = [...el.querySelectorAll("button")].find((b) => b.textContent === "Use this domain") as HTMLButtonElement;
    await act(async () => { use.click(); });
    await flush();
    expect(d.saveDomain).toHaveBeenCalledWith("press-moth", "MothPress.example");
    expect(d.saved).toEqual([], "the domain is saved on its own, not as a plain answer");
    expect(el.textContent).toContain("mothpress.example");
    expect(el.textContent).toContain("you press Allow once at GoDaddy");
    expect(el.textContent).toContain("www.mothpress.example opens it too");
    expect(el.textContent).not.toMatch(/DNS|CNAME|TXT|record/);
  });

  it("a press without one is sent to GoDaddy, searching for its name, and can add it after", async () => {
    const d = door();
    const el = await mount(d, "#settings/general");
    await act(async () => { radio(el, "I need a domain").click(); });
    await flush();
    expect(d.saved).toEqual([{ domainChoice: "buy" }]);
    const link = [...el.querySelectorAll("a")].find((a) => a.textContent?.includes("Find a domain at GoDaddy")) as HTMLAnchorElement;
    expect(link.href).toBe("https://www.godaddy.com/domainsearch/find?domainToCheck=mothpress");
    expect(link.target).toBe("_blank");
    expect(el.textContent).toContain("Bought it? Add it here");
  });

  it("the free address for now is an answer, and the guide counts it done", async () => {
    const d = door();
    const el = await mount(d, "#settings/general");
    await act(async () => { radio(el, "Use the free address for now").click(); });
    await flush();
    expect(d.saved).toEqual([{ domainChoice: "free" }]);
    const home = await mount(door(), "", { ...PRESS, domainChoice: "free" });
    expect(home.textContent).toContain("Choose your web address");
    expect(home.textContent).toContain("2 of 5 done");
  });

  it("a stockroom-only press has no website, so no web address to choose", async () => {
    const el = await mount(door(), "#settings/general", { ...PRESS, plan: "stockroom" });
    expect(el.textContent).not.toContain("Your web address");
  });
});
