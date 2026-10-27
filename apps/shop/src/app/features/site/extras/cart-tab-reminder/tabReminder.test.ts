import { describe, expect, it } from "vitest";
import { tabReminderApplies, tabReminderOn, tabReminderTitle, titleToRestore } from "./tabReminder";

describe("tab reminder", () => {
  it("is off unless switched on", () => {
    expect(tabReminderOn({})).toBe(false);
    expect(tabReminderOn({ cartTabReminder: "true" })).toBe(false);
    expect(tabReminderOn({ cartTabReminder: true })).toBe(true);
  });

  it("needs books in the bag and never runs on the admin or in the preview", () => {
    expect(tabReminderApplies(true, 2, "/books/x", false)).toBe(true);
    expect(tabReminderApplies(true, 0, "/books/x", false)).toBe(false);
    expect(tabReminderApplies(false, 2, "/", false)).toBe(false);
    expect(tabReminderApplies(true, 2, "/", true)).toBe(false);
    expect(tabReminderApplies(true, 2, "/admin", false)).toBe(false);
    expect(tabReminderApplies(true, 2, "/admin/orders", false)).toBe(false);
    expect(tabReminderApplies(true, 2, "/administration-page", false)).toBe(true);
  });

  it("keeps the words to one short line", () => {
    expect(tabReminderTitle("  (2)  Your books\nare waiting ")).toBe("(2) Your books are waiting");
    expect(tabReminderTitle("")).toBe("");
    expect(tabReminderTitle("x".repeat(300))).toHaveLength(120);
  });

  it("restores the title only when nothing else changed it", () => {
    expect(titleToRestore("(1) Come back", "(1) Come back", "Shop")).toBe("Shop");
    expect(titleToRestore("New page", "(1) Come back", "Shop")).toBeNull();
  });
});
