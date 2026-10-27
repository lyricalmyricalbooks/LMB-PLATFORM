import { afterEach, describe, expect, it } from "vitest";
import { anyDirty, clearDirty, dirtyKeys, registerDirty } from "./settingsDirty";

afterEach(clearDirty);

describe("settings dirty registry", () => {
  it("reports registered sections with unsaved edits", () => {
    let general = false;
    registerDirty("general", () => general);
    registerDirty("payments", () => false);
    expect(anyDirty()).toBe(false);
    general = true;
    expect(dirtyKeys()).toEqual(["general"]);
  });

  it("unregisters, and a throwing check never blocks", () => {
    const off = registerDirty("taxes", () => true);
    registerDirty("broken", () => { throw new Error("x"); });
    expect(dirtyKeys()).toEqual(["taxes"]);
    off();
    expect(anyDirty()).toBe(false);
  });

  it("a stale unregister doesn't remove a newer check under the same key", () => {
    const off = registerDirty("profile", () => true);
    registerDirty("profile", () => true);
    off();
    expect(anyDirty()).toBe(true);
  });
});
