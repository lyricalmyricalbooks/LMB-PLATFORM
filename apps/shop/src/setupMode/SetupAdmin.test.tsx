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
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; location.hash = ""; sessionStorage.clear(); });
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
    askForHelp: vi.fn(async () => {}),
    plans: vi.fn(async () => ({ trialDays: 14, termsVersion: "v1", plans: [
      { plan: "both" as const, name: "Shop and stockroom", priceText: "$39.00" },
      { plan: "shop" as const, name: "Shop", priceText: "$29.00" },
      { plan: "stockroom" as const, name: "Stockroom", priceText: "$19.00" },
    ] })),
  };
}

async function mount(d: SetupDoor, hash = "", press: SetupPress = PRESS, answers?: Map<string, any>) {
  location.hash = hash;
  const el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  act(() => root!.render(h(SetupAdmin, { press, door: d, lists, email: "owner@example.com", helpUrl: "/help/", onSignOut: () => {}, ...(answers ? { answers } : {}) })));
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

  it("opens the next step with its button and help, and any other step on a click", async () => {
    const el = await mount(door());
    const rows = () => [...el.querySelectorAll("main ol[aria-label='Setup steps'] > li > button")] as HTMLButtonElement[];
    const open = () => rows().filter((b) => b.getAttribute("aria-expanded") === "true").map((b) => b.textContent);
    expect(open()).toEqual([expect.stringContaining("Tell us about your press")]);
    // Tell us about your press has no help answer of its own (the help centre's is about the open shop's contact details).
    expect(el.textContent).not.toContain("How this works");
    act(() => rows().find((b) => b.textContent?.includes("Choose your website's look"))!.click());
    expect(open()).toEqual([expect.stringContaining("Choose your website's look")]);
    const choose = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Choose a look") as HTMLButtonElement;
    act(() => choose.click());
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("Design");
  });

  it("keeps the step the press opened when it comes back to Home, and moves on once that step is done", async () => {
    const el = await mount(door());
    const rows = () => [...el.querySelectorAll("main ol[aria-label='Setup steps'] > li > button")] as HTMLButtonElement[];
    act(() => rows().find((b) => b.textContent?.includes("Choose your website's look"))!.click());
    act(() => root!.unmount());
    root = null; document.body.innerHTML = "";
    const again = await mount(door());
    expect([...again.querySelectorAll("main ol[aria-label='Setup steps'] > li > button")].filter((b) => b.getAttribute("aria-expanded") === "true").map((b) => b.textContent))
      .toEqual([expect.stringContaining("Choose your website's look")]);
    act(() => root!.unmount());
    root = null; document.body.innerHTML = "";
    const looked = await mount(door(), "", { ...PRESS, look: "press-riso" });
    expect([...looked.querySelectorAll("main ol[aria-label='Setup steps'] > li > button")].filter((b) => b.getAttribute("aria-expanded") === "true").map((b) => b.textContent))
      .toEqual([expect.stringContaining("Tell us about your press")]);
  });

  it("says plainly when everything is in, with Create my shop at the top", async () => {
    const el = await mount(door(), "", { ...PRESS, country: "CA", look: "press-riso", moving: "fresh" });
    expect(el.textContent).toContain("You're ready to create your shop");
    const button = [...el.querySelectorAll("main section button")].find((b) => b.textContent === "Create my shop") as HTMLButtonElement;
    act(() => button.click());
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("Plan");
  });

  it("doesn't say it's ready while a step is still missing", async () => {
    const el = await mount(door());
    expect(el.textContent).not.toContain("You're ready to create your shop");
  });

  it("says what happens once the shop is made, and where to get help", async () => {
    const el = await mount(door());
    expect(el.textContent).toContain("Once your shop is made");
    expect(el.textContent).toContain("Your first shop is free for 14 days from then");
    expect(el.textContent).toContain("Need a hand?");
    expect([...el.querySelectorAll("main button")].some((b) => b.textContent === "Ask a person")).toBe(true);
  });

  it("promises no free days on Home when the platform gives no trial", async () => {
    const d = door();
    (d.plans as any).mockImplementation(async () => ({ trialDays: 0, termsVersion: "v1", plans: [] }));
    const el = await mount(d);
    expect(el.textContent).not.toMatch(/free for \d+ days/);
  });

  it("a locked page says it comes with the shop, offers Create my shop, and writes nothing", async () => {
    const d = door();
    const el = await mount(d, "#orders");
    expect(el.querySelector("h1")?.textContent).toBe("Orders");
    expect(el.textContent).toContain("Comes with your shop");
    expect(el.textContent).toContain("Every order in one list");
    expect([...el.querySelectorAll("main button")].some((b) => b.textContent === "Back to the setup guide")).toBe(true);
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
      expect(text).toContain("Not chosen yet");
      expect(text).toContain("42 books from old-shop.csv");
      expect(text).toContain("Nothing is charged today. Your first shop is free for 14 days, then $39.00 a month.");
      expect(text).toContain("It stays private until you open it.");
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
    const steps = [...el.querySelectorAll("main ol[aria-label='Setup steps'] > li")].map((li) => li.textContent ?? "");
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

describe("Stripe or Square in setup's Settings › Payments", () => {
  it("offers both, shows Stripe picked for the press until it chooses, and saves Square when pressed", async () => {
    const d = door();
    const el = await mount(d, "#settings/payments");
    const radios = [...el.querySelectorAll<HTMLButtonElement>("[role='radiogroup'][aria-label='Card payments'] [role='radio']")];
    expect(radios.map((r) => r.querySelector("strong")?.textContent)).toEqual(["Stripe", "Square"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    await act(async () => { radios[1].click(); });
    await flush();
    expect(d.saved).toEqual([{ cardProvider: "square" }]);
    const after = [...el.querySelectorAll("[role='radiogroup'][aria-label='Card payments'] [role='radio']")].map((r) => r.getAttribute("aria-checked"));
    expect(after).toEqual(["false", "true"]);
  });

  it("a stockroom on its own has no website checkout to choose for", async () => {
    const el = await mount(door(), "#settings/payments", { ...PRESS, plan: "stockroom" });
    expect(el.textContent).toContain("no website checkout");
  });

  it("Square can't be picked from a country where it doesn't work with checkout", async () => {
    const el = await mount(door(), "#settings/payments", { ...PRESS, country: "GB" });
    const square = el.querySelectorAll<HTMLButtonElement>("[role='radiogroup'][aria-label='Card payments'] [role='radio']")[1];
    expect(square.disabled).toBe(true);
    expect(square.textContent).toContain("Not available in your country yet.");
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
    expect(el.textContent).toContain("Bought at GoDaddy. Once your shop is made, you press Allow there once.");
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

  it("a Canadian press is pointed at a .ca name, and every press sees the free address its shop will get", async () => {
    const canadian = { ...PRESS, country: "CA", freeAddress: "moth-press.shops.example" };
    const d = door();
    d.save = vi.fn(async (_id: string, change: any) => ({ ...canadian, ...change }));
    const el = await mount(d, "#settings/general", canadian);
    expect(el.textContent).toContain("Free address: moth-press.shops.example");
    await act(async () => { radio(el, "I need a domain").click(); });
    await flush();
    const link = [...el.querySelectorAll("a")].find((a) => a.textContent?.includes("Find a domain at GoDaddy")) as HTMLAnchorElement;
    expect(link.href).toBe("https://www.godaddy.com/domainsearch/find?domainToCheck=mothpress.ca");
    expect(el.textContent).toContain("A .ca name tells shoppers you're local");
  });

  it("a press can pick its own name for the free address", async () => {
    let current: any = { ...PRESS, freeAddress: "moth-press.shops.example" };
    const d = door();
    d.save = vi.fn(async (_id: string, change: any) => {
      current = { ...current, ...change, freeAddress: change.freeName ? `${change.freeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}.shops.example` : "moth-press.shops.example" };
      return current;
    });
    const el = await mount(d, "#settings/general", current);
    const pick = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Change name") as HTMLButtonElement;
    await act(async () => { pick.click(); });
    const input = [...el.querySelectorAll("main input")].find((i) => i.getAttribute("placeholder") === "moth-books") as HTMLInputElement;
    await act(async () => { typeInto(input, "Moth Books!"); });
    expect(el.textContent).toContain("moth-books.shops.example");
    const use = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Use this name") as HTMLButtonElement;
    await act(async () => { use.click(); });
    await flush();
    expect(d.save).toHaveBeenCalledWith(PRESS.pressId, { freeName: "Moth Books!" });
    expect(el.textContent).toContain("Free address: moth-books.shops.example");
  });

  it("a name another shop has is caught while typing, and a press whose name can't be used is asked for one", async () => {
    const pressed: any = { ...PRESS, pressName: "Amazon Books", freeAddress: "my-shop.shops.example", freeNameNeeded: true };
    const d = door();
    (d as any).checkFreeName = vi.fn(async (_id: string, name: string) => ({ name, address: `${name}.shops.example`, problem: "", available: name !== "moth-press",
      suggestions: name === "moth-press" ? ["moth-press-shop", "moth-press-studio"] : [] }));
    const el = await mount(d, "#settings/general", pressed);
    expect(el.textContent).toContain("Your press's name can't be used here. Pick a name.");
    const input = [...el.querySelectorAll("main input")].find((i) => i.getAttribute("placeholder") === "moth-books") as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => { typeInto(input, "Moth Press"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(el.textContent).toContain("Another shop already has moth-press.shops.example. Try another name.");
    const use = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Use this name") as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    const pick = [...el.querySelectorAll("main button")].find((b) => b.textContent === "moth-press-shop") as HTMLButtonElement;
    expect(pick).toBeTruthy();
    await act(async () => { pick.click(); });
    expect(input.value).toBe("moth-press-shop");
    await act(async () => { typeInto(input, "Moth Books"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(el.textContent).toContain("moth-books.shops.example is free");
    expect(use.disabled).toBe(false);
  });

  it("a name picked earlier that another shop has taken since asks for a new one", async () => {
    const pressed: any = { ...PRESS, freeName: "moth-press", freeAddress: "moth-press.shops.example" };
    const d = door();
    (d as any).checkFreeName = vi.fn(async (_id: string, name: string) => ({ name, address: `${name}.shops.example`, problem: "", available: false, suggestions: ["moth-press-shop"] }));
    const el = await mount(d, "#settings/general", pressed);
    await flush();
    expect(el.textContent).toContain("Another shop already has moth-press.shops.example. Try another name.");
    expect([...el.querySelectorAll("main button")].some((b) => b.textContent === "moth-press-shop")).toBe(true);
  });

  it("a stockroom-only press has no website, so no web address to choose", async () => {
    const el = await mount(door(), "#settings/general", { ...PRESS, plan: "stockroom" });
    expect(el.textContent).not.toContain("Your web address");
  });
});

describe("help without leaving setup", async () => {
  // @ts-expect-error the platform's help answers are a plain ES module outside this app
  const { ARTICLES } = await import("../../../../help/articles.js");
  const { helpAnswersFrom } = await import("./SetupHelp");
  const answers = helpAnswersFrom(ARTICLES) as Map<string, any>;
  const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("opens a step's help answer in place, under its button", async () => {
    const el = await mount(door(), "", { ...PRESS, country: "CA", moving: "yes" }, answers);
    const how = [...el.querySelectorAll("main button")].find((b) => b.textContent?.startsWith("How this works")) as HTMLButtonElement;
    expect(how.getAttribute("aria-expanded")).toBe("false");
    act(() => how.click());
    expect(how.getAttribute("aria-expanded")).toBe("true");
    expect(el.textContent).toContain(answers.get("bring-books").answer[0]);
  });

  it("opens Need a hand?'s answers in place, and links out when the answers didn't load", async () => {
    const el = await mount(door(), "", PRESS, answers);
    const q = [...el.querySelectorAll("main button")].find((b) => b.textContent === "How do I bring my books over from my old shop?") as HTMLButtonElement;
    act(() => q.click());
    expect(el.textContent).toContain(answers.get("bring-books").answer[0]);
    act(() => root!.unmount()); root = null; document.body.innerHTML = "";
    const bare = await mount(door());
    expect(bare.querySelector("a[href='/help/#bring-books']")).not.toBeNull();
  });

  it("asks a person from Help: checks the words first, sends once with the press's name, and says it's sent", async () => {
    const d = door();
    const el = await mount(d, "#help", PRESS, answers);
    const form = el.querySelector("#ask form") as HTMLFormElement;
    await act(async () => { form.requestSubmit(); });
    expect(d.askForHelp).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Say in a few words what it's about.");
    type(form.querySelector("input")!, "Which look?");
    type(form.querySelector("textarea")!, "Which look suits a zine press best?");
    await act(async () => { form.requestSubmit(); });
    await flush();
    expect(d.askForHelp).toHaveBeenCalledTimes(1);
    const sent = (d.askForHelp as any).mock.calls[0][0];
    expect(sent.subject).toBe("Which look?");
    expect(sent.body).toContain("Which look suits a zine press best?");
    expect(sent.body).toContain("setting up Moth Press");
    expect(el.textContent).toContain("We've emailed you a copy");
  });

  it("keeps the words and the same request on a failed send, so trying again makes one request", async () => {
    const d = door();
    (d.askForHelp as any).mockImplementationOnce(async () => { throw new Error("We couldn't reach Colophon. Check your connection and try again."); });
    const el = await mount(d, "#help", PRESS, answers);
    const form = el.querySelector("#ask form") as HTMLFormElement;
    type(form.querySelector("input")!, "Shipping");
    type(form.querySelector("textarea")!, "How do I charge for shipping?");
    await act(async () => { form.requestSubmit(); });
    await flush();
    expect(el.textContent).toContain("couldn't reach Colophon");
    expect((form.querySelector("textarea") as HTMLTextAreaElement).value).toBe("How do I charge for shipping?");
    await act(async () => { form.requestSubmit(); });
    await flush();
    const [first, second] = (d.askForHelp as any).mock.calls.map((c: any[]) => c[0].requestId);
    expect(second).toBe(first);
    expect(el.textContent).toContain("We've emailed you a copy");
  });

  it("Home's Ask a person goes to the form on Help", async () => {
    const el = await mount(door(), "", PRESS, answers);
    const ask = [...el.querySelectorAll("main button")].find((b) => b.textContent === "Ask a person") as HTMLButtonElement;
    act(() => ask.click());
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("Help");
    expect(el.querySelector("#ask form")).not.toBeNull();
  });
});
