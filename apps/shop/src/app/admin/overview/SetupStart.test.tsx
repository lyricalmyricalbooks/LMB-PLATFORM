// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bringHelp } from "../bringShop";
import { startersForKind } from "../websiteChoice";

const api = vi.hoisted(() => ({
  getFirstWeek: vi.fn(), updateFirstWeek: vi.fn(async () => {}), updateSettings: vi.fn(async () => {}),
  getSetupHandover: vi.fn(async () => null as any), getSetupHandoverFile: vi.fn(async (_parts: number) => ""),
  getPublicSettings: vi.fn(async () => null), getShippingProfiles: vi.fn(async () => []),
}));
const store = vi.hoisted(() => {
  class ThemeConflictError extends Error {}
  return {
    ThemeConflictError,
    openWorkspace: vi.fn(async () => ({ draft: { copy: { heroTitle: "Kept" } }, rev: 3, savedThemes: [] })),
    saveDraft: vi.fn(async () => 4),
  };
});
vi.mock("../api", () => ({ adminApi: api }));
vi.mock("../themeStore", () => store);
vi.mock("../inventoryLinkApi", () => ({ inventoryLinkApi: { links: async () => ({}) } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { SetupStart } = await import("./SetupStart");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
// Choosing loads the saving code (and the starter's section list) on first use: wait for it to finish.
const settleChoice = async () => { for (let i = 0; i < 200 && !store.saveDraft.mock.calls.length; i++) await act(async () => { await new Promise(r => setTimeout(r, 25)); }); await flush(); };
const settings = { info: { name: "Moth Press" }, design: { showUnderConstruction: true } };
const base = { books: [], orders: [], readiness: [], settings };
const mount = async (props: any) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(SetupStart, { ...base, ...props })));
  await flush();
  // The welcome loads lazily (it brings Studio's theme library): wait for it when the shop shows it.
  if (props.waitForWelcome !== false) {
    for (let i = 0; i < 200 && !document.querySelector("[data-testid=choose-website]") && /Opening the websites/.test(document.body.textContent || ""); i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 25)); });
    }
  }
};
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const text = () => document.body.textContent || "";
const shortlisted = () => [...document.querySelectorAll("ul[aria-label='All websites'] [data-starter-card]")].map((li) => li.getAttribute("data-starter-card")!);
const useOn = (id: string) => [...document.querySelectorAll(`[data-starter-card='${id}'] button`)].find((b) => b.textContent?.trim() === "Use this") as HTMLButtonElement;

describe("Choose your website, then Set up your shop (plans 6.3, 6.9)", () => {
  it("an existing shop (no setup document) sees neither", async () => {
    api.getFirstWeek.mockResolvedValue(null);
    await mount({});
    expect(text()).toBe("");
  });

  it("a new shop sees Choose your website first, with the press's name and the full list of websites", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, sellingToday: "starting", publishes: "zines", plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    expect(text()).toContain("Welcome to Moth Press. Choose your website");
    expect(text()).not.toContain("Set up your shop");
    expect(shortlisted()).toEqual(startersForKind("products"));
    expect(text()).not.toContain("Picked for you");
    expect(text()).not.toContain("See every look");
  });

  it("Use this puts the starter in the draft once, records it, and then shows the guide", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, sellingToday: "starting", publishes: "books", plan: "shop", details: { at: "then" }, bring: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    const id = shortlisted()[0];
    await act(async () => { useOn(id).click(); });
    await settleChoice();
    expect(store.saveDraft).toHaveBeenCalledTimes(1);
    const [, draft, rev] = store.saveDraft.mock.calls[0] as any[];
    expect(rev).toBe(3);
    expect(draft.themeBase.id).toBe(id);
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ welcome: { theme: id, at: expect.any(String), firstRun: true } });
    expect(text()).toContain("Set up your shop");
    expect(document.querySelector("[data-testid=choose-website]")).toBeNull();
  });

  it("offers no admin look to pick: the admin has one look", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    expect(document.querySelector("[role=radiogroup][aria-label='Admin look']")).toBeNull();
    expect(text()).not.toContain("Your admin");
  });

  it("the colours picked on a card come along into the draft", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, sellingToday: "starting", publishes: "clothing", plan: "shop", details: { at: "then" }, bring: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    const night = [...document.querySelectorAll<HTMLButtonElement>("[data-starter-card='aurel-editorial'] [role=radio]")].find((b) => /Night/.test(b.textContent || ""))!;
    await act(async () => { night.click(); });
    await act(async () => { useOn("aurel-editorial").click(); });
    await settleChoice();
    const [, draft] = store.saveDraft.mock.calls[0] as any[];
    expect(draft.themeBase).toMatchObject({ id: "aurel-editorial", style: "night", name: "Aurel Night" });
    expect(draft.backgroundColor).toBe("#121722");
  });

  it("Skip takes the first of the list and says so", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    await act(async () => { button("Skip for now")!.click(); });
    await settleChoice();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ welcome: expect.objectContaining({ theme: startersForKind("products")[0], skipped: true }) });
  });

  it("a failed save keeps the step up with a plain message", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    store.saveDraft.mockRejectedValueOnce(new Error("offline"));
    await mount({});
    await act(async () => { useOn(shortlisted()[0]).click(); });
    await settleChoice();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(api.updateFirstWeek).not.toHaveBeenCalledWith(expect.objectContaining({ welcome: expect.anything() }));
    expect(text()).toContain("Choose your website");
  });

  it("the welcome never shows again once done; the guide shows its three parts, opens the next step and saves its progress", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" } });
    await mount({});
    expect(document.querySelector("[data-testid=choose-website]")).toBeNull();
    expect([...document.querySelectorAll("section h3")].map(h => h.firstElementChild?.textContent)).toEqual(["Your shop", "Ready to sell", "Launch", "Reach more shoppers"]);
    expect(document.querySelectorAll("ol[aria-label='Your shop'] > li").length).toBe(3);
    // Rows open on a click: the next step has its own tile, with its button.
    expect(document.querySelectorAll("button[aria-expanded='true']").length).toBe(0);
    expect(document.querySelector("li[aria-current='step']")?.textContent).toContain("Add your first book");
    expect(document.querySelector("#setup-next-title")?.textContent).toBe("Add your first book");
    expect(text()).toContain("0 of 12 done");
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ progress: { steps: expect.any(Array), done: [], at: expect.any(String) } });
  });

  it("a done step opens on a click to show Change, and a step done while open gives way to the next", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" } });
    await mount({ settings: { ...settings, design: { ...settings.design, logoUrl: "logo.png" } }, onOpen: vi.fn() });
    const logo = document.querySelector("button[aria-controls='setup-step-logo']") as HTMLButtonElement;
    act(() => logo.click());
    expect(logo.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("#setup-step-logo")?.textContent).toContain("Change");
    // The address is ticked by hand: ticking it while open moves the guide on to the next step.
    act(() => (document.querySelector("button[aria-controls='setup-step-address']") as HTMLButtonElement).click());
    await act(async () => { button("Keep the free address")!.click(); });
    expect(document.querySelector("button[aria-controls='setup-step-address']")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("a press who started before the new steps sees them tagged New, even with the guide hidden, until the next visit", async () => {
    const { firstWeekSteps } = await import("../firstWeek");
    const ids = firstWeekSteps({}, { books: [], readiness: [] }).map(s => s.id).filter(id => id !== "taxes" && id !== "policies");
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" }, hiddenAt: "before", progress: { steps: ids, done: [], at: "t" } });
    await mount({});
    expect(text()).toContain("2 new steps: Set up sales tax and Add your store policies.");
    const tagged = [...document.querySelectorAll("li")].filter(li => li.querySelector(".rp-badge")?.textContent === "New");
    expect(tagged.map(li => li.querySelector("strong")?.textContent)).toEqual(["Set up sales tax", "Add your store policies"]);
    // The progress now holds them, so the next visit treats them as ordinary steps.
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ progress: expect.objectContaining({ steps: expect.arrayContaining(["taxes", "policies"]) }) });
  });

  it("Open your shop is refused while Ready to sell blocks, and takes the wall down once nothing does", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" } });
    const onSetWall = vi.fn(async () => true);
    const blockers = [{ id: "books", label: "No published books", detail: "", status: "block", tab: "catalog", action: "Open Books" }];
    await mount({ readiness: blockers, onSetWall });
    // Any step opens on a click: the last one holds the button.
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find(b => b.textContent?.includes("Open your shop"))!.click(); });
    await act(async () => { document.querySelector<HTMLButtonElement>("#setup-step-open button")!.click(); });
    expect(onSetWall).not.toHaveBeenCalled();
    expect(text()).toContain("No published books");
    act(() => root?.unmount()); document.body.innerHTML = "";
    await mount({ readiness: [], onSetWall });
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find(b => b.textContent?.includes("Open your shop"))!.click(); });
    await act(async () => { document.querySelector<HTMLButtonElement>("#setup-step-open button")!.click(); });
    await flush();
    expect(onSetWall).toHaveBeenCalledWith(false);
    // The moment it opens: one card says so, with the shop's address to visit and share.
    expect(text()).toContain("Moth Press is open.");
    expect(button("View your shop")).toBeDefined();
    act(() => button("Done")!.click());
    expect(text()).not.toContain("Moth Press is open.");
  });

  it("the Open your shop tile names what stops a sale and keeps Open my shop off until nothing does", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" } });
    const onOpen = vi.fn();
    const blockers = [{ id: "books", label: "No published books", detail: "", status: "block", tab: "catalog", action: "Open Books" }];
    await mount({ readiness: blockers, onSetWall: vi.fn(async () => true), onOpen });
    expect(document.querySelector("#setup-progress-title")?.textContent).toBe("1 step to open");
    expect(button("Open my shop")!.disabled).toBe(true);
    act(() => button("No published books")!.click());
    expect(onOpen).toHaveBeenCalledWith("catalog");
    act(() => root?.unmount()); document.body.innerHTML = "";
    await mount({ readiness: [], onSetWall: vi.fn(async () => true) });
    expect(document.querySelector("#setup-progress-title")?.textContent).toBe("Ready to open");
    expect(button("Open my shop")!.disabled).toBe(false);
  });

  it("a read that fails offers Try again", async () => {
    api.getFirstWeek.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null);
    await mount({});
    expect(text()).toContain("couldn't be read");
    await act(async () => { button("Try again")!.click(); });
    await flush();
    expect(text()).toBe("");
  });
});

// Form helpers: a press types into the labelled fields, so the tests do the same.
const field = (label: string) => {
  const l = [...document.querySelectorAll("label")].find(el => el.textContent?.trim() === label);
  return (l ? document.getElementById(l.htmlFor) : null) as HTMLInputElement | HTMLSelectElement | null;
};
const fill = (label: string, value: string) => {
  const el = field(label)!;
  const isSelect = el instanceof HTMLSelectElement;
  Object.getOwnPropertyDescriptor(isSelect ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(el, value);
  act(() => { el.dispatchEvent(new Event(isSelect ? "change" : "input", { bubbles: true })); });
};
const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await act(async () => { await new Promise(r => setTimeout(r, 25)); });
};

// The look and the products come first since move 4: these shops have done both.
const LOOKED = { welcome: { theme: "zine", at: "then", firstRun: true } };
const READY_FOR_DETAILS = { plan: "both", ...LOOKED, bring: { at: "then", skipped: true } };

describe("Get started, contact details after the look and the products (plan 17.2, move 4)", () => {
  it("the list opens on contact details, with the look and the products ticked, the press name in and Canada as the country", async () => {
    api.getFirstWeek.mockResolvedValue(READY_FOR_DETAILS);
    await mount({ waitForWelcome: false });
    expect(document.querySelector("[data-row=delivery][aria-current=step]")).not.toBeNull();
    expect(document.querySelector("[data-row=look]")?.getAttribute("data-state")).toBe("done");
    expect(document.querySelector("[data-row=bring]")?.getAttribute("data-state")).toBe("done");
    expect(text()).toContain("1 step to open Moth Press");
    expect(text()).toContain("We'll also fill in your shipping, returns, privacy and terms pages");
    expect(document.querySelector("[data-testid=choose-website]")).toBeNull();
    expect((field("Brand name") as HTMLInputElement).value).toBe("Moth Press");
    expect((field("Country") as HTMLSelectElement).value).toBe("Canada");
  });

  it("a blank required field is named in plain words, and nothing is saved", async () => {
    api.getFirstWeek.mockResolvedValue(READY_FOR_DETAILS);
    await mount({ waitForWelcome: false });
    await act(async () => { button("Save and continue")!.click(); });
    await flush();
    expect(text()).toContain("Add the street address your orders ship from.");
    expect(text()).toContain("Add an email address customers can write to.");
    expect(api.updateSettings).not.toHaveBeenCalled();
    expect(api.updateFirstWeek).not.toHaveBeenCalled();
  });

  it("saving writes the details to the shop, marks the step done, and then shows shipping", async () => {
    api.getFirstWeek.mockResolvedValue(READY_FOR_DETAILS);
    await mount({ waitForWelcome: false });
    fill("Contact email", "hello@mothpress.example");
    fill("Street address", "12 Queen Street");
    fill("City", "Toronto");
    fill("Postal code", "M5H 2N2");
    await act(async () => { button("Save and continue")!.click(); });
    await flush();
    expect(api.updateSettings).toHaveBeenCalledWith({
      info: { name: "Moth Press", email: "hello@mothpress.example" },
      location: { street: "12 Queen Street", city: "Toronto", state: "", zip: "M5H 2N2", country: "Canada" },
      // The four policies opening needs come filled in with these details (move 4).
      policies: { shipping: expect.stringContaining("Moth Press"), returns: expect.any(String), privacy: expect.stringContaining("hello@mothpress.example"), terms: expect.any(String) },
    });
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ details: { at: expect.any(String) } });
    // Shipping is in the same row: the row stays the one to do now, on its second part.
    await waitFor(() => !document.querySelector("input[name]") || /Ships from|shipping/i.test(text()));
    expect(document.querySelector("[data-row=delivery][aria-current=step]")).not.toBeNull();
    expect(document.querySelector("[data-testid=choose-website]")).toBeNull();
  });

  it("a failed save keeps the step open with a plain message, and records nothing", async () => {
    api.getFirstWeek.mockResolvedValue(READY_FOR_DETAILS);
    api.updateSettings.mockRejectedValueOnce(new Error("offline"));
    await mount({ waitForWelcome: false });
    fill("Contact email", "hello@mothpress.example");
    fill("Street address", "12 Queen Street");
    fill("City", "Toronto");
    fill("Postal code", "M5H 2N2");
    await act(async () => { button("Save and continue")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(document.querySelector("[data-row=delivery][aria-current=step]")).not.toBeNull();
    expect(api.updateFirstWeek).not.toHaveBeenCalled();
  });
});

const radio = (value: string) => document.querySelector(`input[type=radio][value="${value}"]`) as HTMLInputElement;

describe("Get started, step 2: bring your shop with you (plan 17.3)", () => {
  const withDetails = { plan: "both", ...LOOKED };

  it("after the look, a new shop is asked where it sells now", async () => {
    api.getFirstWeek.mockResolvedValue(withDetails);
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Bring your products");
    expect(text()).toContain("Where do you sell now?");
    expect(document.querySelector("[data-testid=choose-website]")).toBeNull();
    expect(document.querySelector("[data-row=bring][aria-current=step]")).not.toBeNull();
  });

  it("choosing an answer shows its plain steps, and nothing is saved until the press asks for the import", async () => {
    api.getFirstWeek.mockResolvedValue(withDetails);
    await mount({ waitForWelcome: false });
    expect(text()).not.toContain(bringHelp("spreadsheet")[0]);
    await act(async () => { radio("spreadsheet").click(); });
    expect(text()).toContain(bringHelp("spreadsheet")[0]);
    expect(text()).toContain("Nothing is saved until you press Import");
    expect(api.updateFirstWeek).not.toHaveBeenCalled();
  });

  it("starting fresh records the step as skipped, with the answer, and then shows contact details", async () => {
    api.getFirstWeek.mockResolvedValue(withDetails);
    await mount({ waitForWelcome: false });
    await act(async () => { radio("fairs").click(); });
    await act(async () => { button("Start fresh")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ bring: { at: expect.any(String), from: "fairs", skipped: true } });
    await waitFor(() => !!document.querySelector("[data-row=delivery][aria-current=step]"));
    expect(document.querySelector("[data-row=bring]")?.getAttribute("data-state")).toBe("done");
    expect(text()).not.toContain("bring your shop with you");
  });

  it("a failed save keeps the step open with a plain message", async () => {
    api.getFirstWeek.mockResolvedValue(withDetails);
    api.updateFirstWeek.mockRejectedValueOnce(new Error("offline"));
    await mount({ waitForWelcome: false });
    await act(async () => { button("Start fresh")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(document.querySelector("[data-row=bring][aria-current=step]")).not.toBeNull();
  });

  it("a shop part-way through the older order (details and products done) is shown the look next", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", details: { at: "then" }, bring: { at: "then" } });
    await mount({});
    await waitFor(() => /Choose your website/.test(text()));
    expect(text()).not.toContain("Where do you sell now?");
  });
});

describe("Choose your website as the list's first open step, with the press's first book (plan 17.8, move 4)", () => {
  it("the website is the step to do now, after the account and the name", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, sellingToday: "starting", publishes: "books", plan: "shop", details: { at: "then" }, bring: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({ books: [{ id: "b1", title: "Salt", photos: [{ url: "https://cdn.example/salt.jpg" }] }] });
    expect(document.querySelector("[data-row=look][aria-current=step]")).not.toBeNull();
    expect(document.querySelector("[data-row=account]")?.getAttribute("data-state")).toBe("done");
    expect(document.querySelector("[data-row=name]")?.getAttribute("data-state")).toBe("done");
    expect(text()).toContain("Welcome to Moth Press. Choose your website");
  });
});

describe("Get started, the last step inside the run (plan 17.13)", () => {
  it("after shipping, the final check shows; Finish later hands back to the setup guide", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, welcome: { theme: "zine", at: "then" }, shipping: { at: "then", skipped: true } });
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Last step: open Moth Press");
    expect(document.querySelectorAll("[data-open-list] [data-state=done]").length).toBe(document.querySelectorAll("[data-open-list] [data-row]").length);
    await act(async () => { button("Finish later")!.click(); });
    await flush();
    expect(text()).toContain("Set up your shop");
    expect(document.querySelector("[data-open-list]")).toBeNull();
  });
});


describe("What the press set up before its shop existed (code plan 18.9)", () => {
  const kept = { pressId: "press-moth", look: "press-riso", adminLook: "paper", at: "then", file: { name: "my zines.csv", rows: 1, at: "2026-11-03T09:00:00.000Z", parts: 2 } };

  it("the bring step offers the file kept in setup, and opens it in the importer's preview", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", ...LOOKED });
    api.getSetupHandover.mockResolvedValue(kept);
    api.getSetupHandoverFile.mockResolvedValue("Title,Price,Stock\nMoth Zine,8,20\n");
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Your file from setup is here");
    expect(text()).toContain("my zines.csv, 1 book, kept on November 3");
    expect(button("Choose a different file")).toBeTruthy();
    await act(async () => { button("Bring in my file")!.click(); });
    await waitFor(() => /Moth Zine/.test(text()));
    expect(api.getSetupHandoverFile).toHaveBeenCalledWith(2);
    expect(text()).toContain("Import books from a spreadsheet");
    expect(text()).toContain("Moth Zine");
    expect(api.updateFirstWeek).not.toHaveBeenCalled();
  });

  it("a kept file that can't be read back says so, and the other ways stay open", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", ...LOOKED });
    api.getSetupHandover.mockResolvedValue(kept);
    api.getSetupHandoverFile.mockRejectedValueOnce(new Error("offline"));
    await mount({ waitForWelcome: false });
    await act(async () => { button("Bring in my file")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("Your file from setup couldn't be opened");
    expect(text()).not.toContain("Import books from a spreadsheet");
    expect(button("Start fresh")).toBeTruthy();
  });

  it("starting fresh past the file from setup is a choice: it is not offered again", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", ...LOOKED });
    api.getSetupHandover.mockResolvedValue(kept);
    await mount({ waitForWelcome: false });
    await act(async () => { button("Start fresh")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ bring: expect.objectContaining({ skipped: true }), done: { setupFile: expect.any(String) } });
    expect(text()).not.toContain("Your file from setup is here");
  });

  it("a file that reached the shop after the bring step is offered on its own card, until the press chooses", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, welcome: { theme: "zine", at: "then" }, shipping: { at: "then", skipped: true } });
    api.getSetupHandover.mockResolvedValue(kept);
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Your file from setup is here");
    expect(text()).toContain("Last step: open Moth Press");
    await act(async () => { button("I don't need it")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ done: { setupFile: expect.any(String) } });
    expect(text()).not.toContain("Your file from setup is here");
  });

  it("a shop whose hand-over can't be read still runs its steps as usual", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", ...LOOKED });
    api.getSetupHandover.mockRejectedValueOnce(new Error("offline"));
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Where do you sell now?");
    expect(text()).not.toContain("Your file from setup");
  });

  it("the website step opens on the one chosen in setup, with the starters below it", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true } });
    api.getSetupHandover.mockResolvedValue(kept);
    await mount({ waitForWelcome: false });
    await waitFor(() => /website you chose/.test(text()));
    expect(text()).toContain("Welcome to Moth Press. Here's the website you chose");
    // An older look chosen in setup can still be used as it is; the starters follow.
    expect(document.querySelector("[data-testid=website-chosen-older]")).not.toBeNull();
    expect(shortlisted().length).toBeGreaterThan(0);
    expect(text()).not.toContain("See every look");
  });
});

describe("The first order (sign-up to open shop plan, move 5)", () => {
  const OLD_SHOP = { plan: "both", welcome: { theme: "press-zine", at: "now" } };
  const order = { id: "o1", paymentStatus: "paid", createdAt: "2026-11-25T10:00:00Z", total: 18, customer: { name: "Ada Lovelace" }, items: [{ id: "b", title: "Moth Notes" }] };

  it("celebrates the first real order once the run is over, and Done puts it away for good", async () => {
    api.getFirstWeek.mockResolvedValue(OLD_SHOP);
    await mount({ orders: [order] });
    expect(document.querySelector("[data-first-order]")?.textContent).toContain("Ada just bought from you.");
    await act(async () => { button("Done")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ done: { firstOrder: expect.any(String) } });
    expect(document.querySelector("[data-first-order]")).toBeNull();
  });

  it("stays away for a practice order and once put away", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, ...OLD_SHOP, done: { firstOrder: "then" } });
    await mount({ orders: [order] });
    expect(document.querySelector("[data-first-order]")).toBeNull();
    act(() => root?.unmount()); root = null;
    api.getFirstWeek.mockResolvedValue(OLD_SHOP);
    await mount({ orders: [{ ...order, isTest: true }] });
    expect(document.querySelector("[data-first-order]")).toBeNull();
  });
});

describe("A shop that is already open (sign-up plan, move 5 follow-up)", () => {
  it("shows the setup guide, not 'N steps to open', and gives the top bar no run count", async () => {
    api.getFirstWeek.mockResolvedValue({ offer: { at: "then" }, plan: "both", sellingToday: "starting", publishes: "other" });
    await mount({ settings: { info: { name: "Test Goods" }, design: { showUnderConstruction: false } }, waitForWelcome: false });
    expect(document.querySelector("[data-open-list]")).toBeNull();
    expect(text()).not.toMatch(/steps? to open/);
    const { getRunLeft } = await import("./firstStep");
    expect(getRunLeft()).toBeNull();
  });
});

describe("What you offer, Get started's first step (shop types plan, part 1)", () => {
  it("a new product shop says what it sells first; ticking books turns the book tools on, in one save", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", sellingToday: "starting", publishes: "other", country: "CA" });
    await mount({ waitForWelcome: false });
    expect(document.querySelector("[data-offer-stage]")).not.toBeNull();
    expect(text()).toContain("Tell us what you offer");
    act(() => button("Continue")!.click());
    await flush();
    expect(text()).toContain("Pick at least one kind of thing you sell.");
    expect(api.updateFirstWeek).not.toHaveBeenCalled();
    act(() => (document.querySelector("[data-offer-group=art]") as HTMLButtonElement).click());
    act(() => (document.querySelector("[data-offer-books] input") as HTMLInputElement).click());
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ sells: "books", productGroups: ["art", "books"], offer: { at: expect.any(String) } });
    expect(document.querySelector("[data-offer-stage]")).toBeNull();
    expect(text()).toContain("Told us what you offer");
  });

  it("a shop doing both says what people book and what most customers come for", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", publishes: "hair", sellsProducts: true });
    await mount({ waitForWelcome: false });
    expect(text()).toContain("What do people book?");
    expect(text()).toContain("What do most customers come for?");
    act(() => (document.querySelector("[data-offer-group=beauty]") as HTMLButtonElement).click());
    act(() => (document.querySelector("[data-offer-lead=products]") as HTMLButtonElement).click());
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ sells: "hair", leadSide: "products", productGroups: ["beauty"], offer: { at: expect.any(String) } });
  });

  it("a shop past its look before this step existed never sees it", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", publishes: "other", welcome: { theme: "x", at: "then", firstRun: true } });
    await mount({ waitForWelcome: false });
    expect(document.querySelector("[data-offer-stage]")).toBeNull();
  });
});
