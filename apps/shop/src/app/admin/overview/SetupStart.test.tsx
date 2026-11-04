// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bringHelp } from "../bringShop";

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
const settings = { info: { name: "Moth Press" }, design: { showUnderConstruction: true } };
const base = { books: [], orders: [], readiness: [], settings };
const mount = async (props: any) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(SetupStart, { ...base, ...props })));
  await flush();
  // The welcome loads lazily (it brings Studio's theme library): wait for it when the shop shows it.
  if (props.waitForWelcome !== false) {
    for (let i = 0; i < 200 && !document.querySelector("ul[aria-label='Suggested looks']") && /Opening the looks/.test(document.body.textContent || ""); i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 25)); });
    }
  }
};
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const text = () => document.body.textContent || "";

describe("Choose your look, then Set up your shop (plans 6.3, 6.9)", () => {
  it("an existing shop (no setup document) sees neither", async () => {
    api.getFirstWeek.mockResolvedValue(null);
    await mount({});
    expect(text()).toBe("");
  });

  it("a new shop sees the welcome first, with the press's name, suggestions and every look", async () => {
    api.getFirstWeek.mockResolvedValue({ sellingToday: "starting", publishes: "zines", plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, google: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    expect(text()).toContain("Welcome to Moth Press. Choose your look");
    expect(text()).not.toContain("Set up your shop");
    const suggested = [...document.querySelectorAll("ul[aria-label='Suggested looks'] > li > div > strong")].map(s => s.textContent);
    expect(suggested[0]).toBe("Zine");
    expect(document.querySelectorAll("ul[aria-label='Every look'] li").length).toBeGreaterThan(5);
    expect(document.body.innerHTML).toContain("Moth Press in this look");
  });

  it("choosing applies the look to the draft once, records it, and then shows the guide", async () => {
    api.getFirstWeek.mockResolvedValue({ sellingToday: "starting", publishes: "books", plan: "shop", details: { at: "then" }, bring: { at: "then", skipped: true }, google: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    await act(async () => { button("Use this look")!.click(); });
    await flush();
    expect(store.saveDraft).toHaveBeenCalledTimes(1);
    const [, draft, rev] = store.saveDraft.mock.calls[0] as any[];
    expect(rev).toBe(3);
    expect(draft.themeLibraryPreset).toBe("press-imprint");
    expect(draft.themeBase.id).toBe("press-imprint");
    expect(draft.copy).toEqual({ heroTitle: "Kept" });
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ welcome: { theme: "press-imprint", at: expect.any(String), adminLook: "riso" } });
    expect(text()).toContain("Set up your shop");
    expect(text()).not.toContain("Choose your look.");
  });

  it("picking an admin look applies it at once and records it with the welcome", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, google: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    const radios = [...document.querySelectorAll("[role=radiogroup][aria-label='Admin look'] [role=radio]")] as HTMLButtonElement[];
    expect(radios.map(r => r.textContent)).toHaveLength(6);
    await act(async () => { radios[1].click(); });
    expect(document.documentElement.getAttribute("data-admin-look")).toBe("paper");
    await act(async () => { button("Use this look")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ welcome: expect.objectContaining({ adminLook: "paper" }) });
  });

  it("Skip takes the first suggestion and says so", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, google: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({});
    await act(async () => { button("Skip for now")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ welcome: expect.objectContaining({ theme: "press-riso-noir", skipped: true }) });
  });

  it("a failed save keeps the welcome up with a plain message", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, google: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    store.saveDraft.mockRejectedValueOnce(new Error("offline"));
    await mount({});
    await act(async () => { button("Use this look")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(api.updateFirstWeek).not.toHaveBeenCalledWith(expect.objectContaining({ welcome: expect.anything() }));
    expect(text()).toContain("Choose your look");
  });

  it("the welcome never shows again once done; the guide shows three steps and saves its progress", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" } });
    await mount({});
    expect(text()).not.toContain("Choose your look.");
    expect(document.querySelectorAll("ol[aria-label='Next steps'] > li").length).toBe(3);
    expect(text()).toContain("Later (5)");
    expect(text()).toContain("0 of 8 done");
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ progress: { steps: expect.any(Array), done: [], at: expect.any(String) } });
  });

  it("Open your shop is refused while Ready to sell blocks, and takes the wall down once nothing does", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", welcome: { theme: "press-zine", at: "now" } });
    const onSetWall = vi.fn(async () => true);
    const blockers = [{ id: "books", label: "No published books", detail: "", status: "block", tab: "catalog", action: "Open Books" }];
    await mount({ readiness: blockers, onSetWall });
    await act(async () => { (document.querySelector("details") as HTMLDetailsElement).open = true; });
    await act(async () => { button("Open your shop")!.click(); });
    expect(onSetWall).not.toHaveBeenCalled();
    expect(text()).toContain("No published books");
    act(() => root?.unmount()); document.body.innerHTML = "";
    await mount({ readiness: [], onSetWall });
    await act(async () => { button("Open your shop")!.click(); });
    await flush();
    expect(onSetWall).toHaveBeenCalledWith(false);
    // The moment it opens: one card says so, with the shop's address to visit and share.
    expect(text()).toContain("Your shop is open");
    expect(button("View your shop")).toBeDefined();
    act(() => button("Done")!.click());
    expect(text()).not.toContain("Your shop is open");
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

describe("Get started, step 1: the press's details (plan 17.2)", () => {
  it("a new shop starts with its details, with the press name already in and Canada as the country", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both" });
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Get started · Step 1 of 8");
    expect(text()).not.toContain("Choose your look");
    expect((field("Press name") as HTMLInputElement).value).toBe("Moth Press");
    expect((field("Country") as HTMLSelectElement).value).toBe("Canada");
  });

  it("a blank required field is named in plain words, and nothing is saved", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both" });
    await mount({ waitForWelcome: false });
    await act(async () => { button("Save and continue")!.click(); });
    await flush();
    expect(text()).toContain("Add the street address your orders ship from.");
    expect(text()).toContain("Add an email address customers can write to.");
    expect(api.updateSettings).not.toHaveBeenCalled();
    expect(api.updateFirstWeek).not.toHaveBeenCalled();
  });

  it("saving writes the details to the shop, marks the step done, and then shows the look", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both" });
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
    });
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ details: { at: expect.any(String) } });
    // The next step is bringing the shop over (17.3); the look comes after it.
    await waitFor(() => /bring your shop with you/.test(text()));
    expect(text()).toContain("Step 2 of 8");
    expect(text()).not.toContain("Step 1 of 8");
    expect(text()).not.toContain("Choose your look");
  });

  it("a failed save keeps the step open with a plain message, and records nothing", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both" });
    api.updateSettings.mockRejectedValueOnce(new Error("offline"));
    await mount({ waitForWelcome: false });
    fill("Contact email", "hello@mothpress.example");
    fill("Street address", "12 Queen Street");
    fill("City", "Toronto");
    fill("Postal code", "M5H 2N2");
    await act(async () => { button("Save and continue")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(text()).toContain("Step 1 of 8");
    expect(api.updateFirstWeek).not.toHaveBeenCalled();
  });
});

const radio = (value: string) => document.querySelector(`input[type=radio][value="${value}"]`) as HTMLInputElement;

describe("Get started, step 2: bring your shop with you (plan 17.3)", () => {
  const withDetails = { plan: "both", details: { at: "then" } };

  it("after the press's details, a new shop is asked where it sells now, before the look", async () => {
    api.getFirstWeek.mockResolvedValue(withDetails);
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Get started · Step 2 of 8: bring your shop with you");
    expect(text()).toContain("Where do you sell now?");
    expect(text()).not.toContain("Choose your look");
    expect(text()).not.toContain("Step 1 of 8");
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

  it("starting fresh records the step as skipped, with the answer, and then shows the look", async () => {
    api.getFirstWeek.mockResolvedValue(withDetails);
    await mount({ waitForWelcome: false });
    await act(async () => { radio("fairs").click(); });
    await act(async () => { button("Start fresh")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ bring: { at: expect.any(String), from: "fairs", skipped: true } });
    await waitFor(() => /Choose your look/.test(text()));
    expect(text()).toContain("Choose your look");
    expect(text()).not.toContain("bring your shop with you");
  });

  it("a failed save keeps the step open with a plain message", async () => {
    api.getFirstWeek.mockResolvedValue(withDetails);
    api.updateFirstWeek.mockRejectedValueOnce(new Error("offline"));
    await mount({ waitForWelcome: false });
    await act(async () => { button("Start fresh")!.click(); });
    await flush();
    expect(document.querySelector("[role=alert]")).not.toBeNull();
    expect(text()).toContain("Step 2 of 8");
  });

  it("a shop that already finished step 2 goes straight to the look", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then" } });
    await mount({});
    await waitFor(() => /Choose your look/.test(text()));
    expect(text()).not.toContain("Where do you sell now?");
  });
});

describe("Choose your look as step 3 of 8, with the press's first book (plan 17.8)", () => {
  it("the look says it is step 3 of 8, and its previews show the first book's photo", async () => {
    api.getFirstWeek.mockResolvedValue({ sellingToday: "starting", publishes: "books", plan: "shop", details: { at: "then" }, bring: { at: "then", skipped: true }, google: { at: "then", skipped: true }, shipping: { at: "then", skipped: true }, finalCheck: { at: "then", opened: false } });
    await mount({ books: [{ id: "b1", title: "Salt", photos: [{ url: "https://cdn.example/salt.jpg" }] }] });
    expect(text()).toContain("Step 3 of 8");
    expect(text()).toContain("Welcome to Moth Press. Choose your look");
    expect(document.querySelector("img[src='https://cdn.example/salt.jpg']")).not.toBeNull();
  });
});

describe("Get started, step 8 inside the run (plan 17.13)", () => {
  it("after shipping, the final check shows; Finish later hands back to the setup guide", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, welcome: { theme: "zine", at: "then" }, google: { at: "then", skipped: true }, shipping: { at: "then", skipped: true } });
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Get started · Step 8 of 8: final check and open");
    await act(async () => { button("Finish later")!.click(); });
    await flush();
    expect(text()).toContain("Set up your shop");
    expect(text()).not.toContain("Step 8 of 8");
  });
});


describe("What the press set up before its shop existed (code plan 18.9)", () => {
  const kept = { pressId: "press-moth", look: "press-riso", adminLook: "paper", at: "then", file: { name: "my zines.csv", rows: 1, at: "2026-11-03T09:00:00.000Z", parts: 2 } };

  it("the bring step offers the file kept in setup, and opens it in the importer's preview", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" } });
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
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" } });
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
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" } });
    api.getSetupHandover.mockResolvedValue(kept);
    await mount({ waitForWelcome: false });
    await act(async () => { button("Start fresh")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ bring: expect.objectContaining({ skipped: true }), done: { setupFile: expect.any(String) } });
    expect(text()).not.toContain("Your file from setup is here");
  });

  it("a file that reached the shop after the bring step is offered on its own card, until the press chooses", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true }, welcome: { theme: "zine", at: "then" }, google: { at: "then", skipped: true }, shipping: { at: "then", skipped: true } });
    api.getSetupHandover.mockResolvedValue(kept);
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Your file from setup is here");
    expect(text()).toContain("Step 8 of 8");
    await act(async () => { button("I don't need it")!.click(); });
    await flush();
    expect(api.updateFirstWeek).toHaveBeenCalledWith({ done: { setupFile: expect.any(String) } });
    expect(text()).not.toContain("Your file from setup is here");
  });

  it("a shop whose hand-over can't be read still runs its steps as usual", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" } });
    api.getSetupHandover.mockRejectedValueOnce(new Error("offline"));
    await mount({ waitForWelcome: false });
    expect(text()).toContain("Where do you sell now?");
    expect(text()).not.toContain("Your file from setup");
  });

  it("the look step opens on the look chosen in setup, and every look is one tap away", async () => {
    api.getFirstWeek.mockResolvedValue({ plan: "both", details: { at: "then" }, bring: { at: "then", skipped: true } });
    api.getSetupHandover.mockResolvedValue(kept);
    await mount({ waitForWelcome: false });
    await waitFor(() => /look you chose/.test(text()));
    expect(text()).toContain("Welcome to Moth Press. Here's the look you chose");
    expect(document.querySelectorAll("ul[aria-label='The look you chose'] [data-look-card]").length).toBe(1);
    expect(document.querySelector("[data-look-card='press-riso']")).not.toBeNull();
    expect(document.querySelector("[role=radio][aria-checked=true]")).toBeNull();
    await act(async () => { button("See every look")!.click(); });
    expect(text()).toContain("Welcome to Moth Press. Choose your look");
    expect(document.querySelector("ul[aria-label='Suggested looks']")).not.toBeNull();
    // The admin look chosen in setup is the one picked here.
    expect(document.querySelector("[role=radio][aria-checked=true]")?.textContent).toContain("Paper");
  });
});
