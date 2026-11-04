import { describe, expect, it } from "vitest";
import { NAV, SETTINGS_ITEM_PREFIX, sidebarItems } from "../app/admin/riso/nav";
import type { SetupPress } from "./door";
import { DESIGN_PAGE, GENERAL_PAGE, HELP_PAGE, HOME_PAGE, PLAN_PAGE, guideProgress, guideSteps, helpFor, nextGuideStep, pageFromHash, readyToCreate, setupLocked, showMoveIn, setupMenu, setupMenuItemFor, setupPageLabel } from "./pages";

const press = (over: Partial<SetupPress> = {}): SetupPress => ({
  pressId: "press-moth", status: "setup", plan: "", pressName: "", sells: "", country: "", look: "", adminLook: "", stagedImport: null, ...over,
});

describe("setup mode's menu (code plan 18.6)", () => {
  const menu = setupMenu();

  it("is exactly the admin's own menu, with Plan under Settings", () => {
    expect(menu).toEqual(sidebarItems(NAV));
    expect(menu.map((i) => i.label)).toEqual(["Home", "Orders", "Books", "Design", "Settings"]);
  });

  it("keeps Plan under Settings, as the open shop's admin does", () => {
    const settings = menu.find((i) => i.label === "Settings")!;
    expect(settings.children?.map((c) => c.id)).toContain(PLAN_PAGE);
  });

  it("opens Home, Design, General, Plan and Help, and locks every other page", () => {
    for (const page of [HOME_PAGE, DESIGN_PAGE, GENERAL_PAGE, PLAN_PAGE, HELP_PAGE, "catalog"]) expect(setupLocked(page)).toBe(false);
    const every = menu.flatMap((i) => (i.children ? i.children.map((c) => c.id) : [i.id]));
    const locked = every.filter(setupLocked);
    expect(locked).toEqual(expect.arrayContaining(["orders", "customers", "inventory", SETTINGS_ITEM_PREFIX + "payments", SETTINGS_ITEM_PREFIX + "shipping"]));
    expect(locked).not.toContain(GENERAL_PAGE);
  });

  it("names each page and finds the item that holds it", () => {
    expect(setupPageLabel("customers", menu)).toBe("Customers");
    expect(setupPageLabel(PLAN_PAGE, menu)).toBe("Plan");
    expect(setupPageLabel(HELP_PAGE, menu)).toBe("Help");
    expect(setupMenuItemFor(SETTINGS_ITEM_PREFIX + "shipping", menu)).toBe(GENERAL_PAGE);
    expect(setupMenuItemFor(PLAN_PAGE, menu)).toBe(GENERAL_PAGE);
  });

  it("reads the page from the address, and anything unknown opens Home", () => {
    expect(pageFromHash("#settings/general", menu)).toBe(GENERAL_PAGE);
    expect(pageFromHash("#help", menu)).toBe(HELP_PAGE);
    expect(pageFromHash("", menu)).toBe(HOME_PAGE);
    expect(pageFromHash("#nowhere", menu)).toBeNull();
    expect(pageFromHash("#rp-main", menu)).toBeNull();
    expect(pageFromHash("#%E0%A4%A", menu)).toBeNull();
  });
});

describe("the setup guide", () => {
  it("starts with nothing done and counts only what can be done before opening", () => {
    const steps = guideSteps(press());
    // Not yet said whether it is moving: bringing books over comes before the look (23.0).
    expect(steps.map((s) => s.id)).toEqual(["plan", "details", "books", "look", "open"]);
    expect(guideProgress(steps)).toEqual({ done: 0, total: 4 });
  });

  it("counts bringing books over only once a file is kept: a press with nothing to bring still finishes", () => {
    const kept = guideSteps(press({ stagedImport: { name: "a.csv", size: 9, rows: 3, at: "2026-11-03T09:00:00Z" } }));
    expect(kept.find((s) => s.id === "books")!.done).toBe(true);
    expect(guideProgress(kept)).toEqual({ done: 1, total: 5 });
  });

  it("ticks each step from the record; press details need all three answers", () => {
    const some = guideSteps(press({ plan: "both", pressName: "Moth Press", sells: "books" }));
    expect(some.filter((s) => s.done).map((s) => s.id)).toEqual(["plan"]);
    const all = guideSteps(press({ plan: "both", pressName: "Moth Press", sells: "books", country: "CA", look: "press-riso" }));
    expect(guideProgress(all)).toEqual({ done: 3, total: 4 });
  });

  it("has no website look to pick for a stockroom on its own", () => {
    expect(guideSteps(press({ plan: "stockroom" })).map((s) => s.id)).not.toContain("look");
  });

  it("points at the next step that isn't optional, and is ready to create once only that is left", () => {
    expect(nextGuideStep(guideSteps(press({ plan: "both" })))!.id).toBe("details");
    const set = guideSteps(press({ plan: "both", pressName: "Moth Press", sells: "books", country: "CA", look: "press-riso" }));
    expect(nextGuideStep(set)!.id).toBe("open");
    expect(readyToCreate(set)).toBe(true);
    expect(readyToCreate(guideSteps(press({ plan: "both" })))).toBe(false);
    expect(readyToCreate(guideSteps(press({ plan: "both", pressName: "M", sells: "books", country: "CA", look: "x", status: "opening" })))).toBe(false);
    expect(guideSteps(press()).find((s) => s.id === "open")).toMatchObject({ title: "Create your shop", action: "Create my shop" });
    // A press bringing its shop over is pointed at its books first (23.0), though they stay optional.
    const mover = press({ plan: "both", pressName: "M", sells: "books", country: "CA", moving: "yes" });
    expect(nextGuideStep(guideSteps(mover), mover)!.id).toBe("books");
    expect(nextGuideStep(guideSteps({ ...mover, moving: "" }), { moving: "" })!.id).toBe("look");
  });
});

describe("bringing a shop over is easy to find (23.0)", () => {
  const order = (over: Partial<SetupPress>) => guideSteps(press(over)).map((s) => s.id);

  it("a press moving over brings its books right after its details, before the look", () => {
    expect(order({ moving: "yes" })).toEqual(["plan", "details", "books", "look", "open"]);
    expect(order({ moving: "" })).toEqual(["plan", "details", "books", "look", "open"]);
  });

  it("a press starting fresh has it last, still optional", () => {
    expect(order({ moving: "fresh" })).toEqual(["plan", "details", "look", "books", "open"]);
    expect(guideProgress(guideSteps(press({ moving: "fresh" })))).toEqual({ done: 0, total: 4 });
  });

  it("Home's card shows until a file is kept or the press starts fresh, and only in setup", () => {
    expect(showMoveIn(press())).toBe(true);
    expect(showMoveIn(press({ moving: "yes" }))).toBe(true);
    expect(showMoveIn(press({ moving: "fresh" }))).toBe(false);
    expect(showMoveIn(press({ stagedImport: { name: "a.csv", size: 9, rows: 3, at: "2026-11-03T09:00:00Z" } }))).toBe(false);
    expect(showMoveIn(press({ status: "opening" }))).toBe(false);
  });
});

describe("the help centre follows what the shop sells (code plan 12.18)", () => {
  it("adds the answer for a shop that doesn't sell books, and leaves a books shop's link alone", () => {
    expect(helpFor("/help/", "clothing")).toBe("/help/?sells=clothing");
    expect(helpFor("/help/?plan=shop", "music")).toBe("/help/?plan=shop&sells=music");
    expect(helpFor("/help/", "books")).toBe("/help/");
    expect(helpFor("/help/", "zines")).toBe("/help/");
    expect(helpFor("/help/", null)).toBe("/help/");
  });
});
