import { describe, expect, it } from "vitest";
import { SETTINGS_ITEM_PREFIX } from "../app/admin/riso/nav";
import type { SetupPress } from "./door";
import { DESIGN_PAGE, GENERAL_PAGE, HELP_PAGE, HOME_PAGE, PLAN_PAGE, guideProgress, guideSteps, pageFromHash, setupLocked, setupMenu, setupMenuItemFor, setupPageLabel } from "./pages";

const press = (over: Partial<SetupPress> = {}): SetupPress => ({
  pressId: "press-moth", status: "setup", plan: "", pressName: "", sells: "", country: "", look: "", adminLook: "", ...over,
});

describe("setup mode's menu (code plan 18.6)", () => {
  const menu = setupMenu();

  it("is the admin's own five items, then Plan and billing and Help", () => {
    expect(menu.map((i) => i.label)).toEqual(["Home", "Orders", "Books", "Design", "Settings", "Plan and billing", "Help"]);
  });

  it("moves Plan out of Settings into its own item", () => {
    const settings = menu.find((i) => i.label === "Settings")!;
    expect(settings.children?.map((c) => c.id)).not.toContain(PLAN_PAGE);
    expect(menu.find((i) => i.label === "Plan and billing")!.id).toBe(PLAN_PAGE);
  });

  it("opens Home, Design, General, Plan and billing and Help, and locks every other page", () => {
    for (const page of [HOME_PAGE, DESIGN_PAGE, GENERAL_PAGE, PLAN_PAGE, HELP_PAGE]) expect(setupLocked(page)).toBe(false);
    const every = menu.flatMap((i) => (i.children ? i.children.map((c) => c.id) : [i.id]));
    const locked = every.filter(setupLocked);
    expect(locked).toEqual(expect.arrayContaining(["orders", "customers", "catalog", "inventory", SETTINGS_ITEM_PREFIX + "payments", SETTINGS_ITEM_PREFIX + "shipping"]));
    expect(locked).not.toContain(GENERAL_PAGE);
  });

  it("names each page and finds the item that holds it", () => {
    expect(setupPageLabel("customers", menu)).toBe("Customers");
    expect(setupPageLabel(PLAN_PAGE, menu)).toBe("Plan and billing");
    expect(setupMenuItemFor(SETTINGS_ITEM_PREFIX + "shipping", menu)).toBe(GENERAL_PAGE);
    expect(setupMenuItemFor(PLAN_PAGE, menu)).toBe(PLAN_PAGE);
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
    expect(steps.map((s) => s.id)).toEqual(["plan", "details", "look", "products", "open"]);
    expect(guideProgress(steps)).toEqual({ done: 0, total: 4 });
    expect(steps.find((s) => s.id === "products")!.locked).toBe(true);
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
});
