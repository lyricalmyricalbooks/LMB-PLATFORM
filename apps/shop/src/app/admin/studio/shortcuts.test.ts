import { describe, expect, it } from "vitest";
import { goHint, GO_KEYS, resolveGoKey, resolveShortcut, SHORTCUTS } from "./shortcuts";

describe("Studio shortcuts", () => {
  it("maps the documented keys", () => {
    expect(resolveShortcut({ key: "k", ctrl: true })).toBe("find");
    expect(resolveShortcut({ key: "K", meta: true })).toBe("find");
    expect(resolveShortcut({ key: "z", ctrl: true, shift: true })).toBe("redo");
    expect(resolveShortcut({ key: "y", meta: true })).toBe("redo");
    expect(resolveShortcut({ key: "ArrowUp", alt: true })).toBe("moveUp");
    expect(resolveShortcut({ key: "?" , shift: true })).toBe("help");
    expect(resolveShortcut({ key: "2" })).toBe("tablet");
  });
  it("Alt+Left goes back, but never while typing or in a dialog", () => {
    expect(resolveShortcut({ key: "ArrowLeft", alt: true })).toBe("back");
    expect(resolveShortcut({ key: "ArrowLeft", alt: true, typing: true })).toBeNull();
    expect(resolveShortcut({ key: "ArrowLeft", alt: true, dialogOpen: true })).toBeNull();
    expect(resolveShortcut({ key: "ArrowLeft" })).toBeNull();
    expect(SHORTCUTS.some(s => s.action === "back" && s.keys === "Alt ←")).toBe(true);
  });
  it("never steals keys while typing or in a dialog", () => {
    expect(resolveShortcut({ key: "Backspace", typing: true })).toBeNull();
    expect(resolveShortcut({ key: "z", ctrl: true, typing: true })).toBeNull();
    expect(resolveShortcut({ key: "1", dialogOpen: true })).toBeNull();
    expect(resolveShortcut({ key: "d", ctrl: true, dialogOpen: true })).toBeNull();
    expect(resolveShortcut({ key: "s", ctrl: true, typing: true })).toBe("save");
  });
  it("Backspace on a focused button never deletes the section; Delete still does", () => {
    expect(resolveShortcut({ key: "Backspace", onControl: true })).toBeNull();
    expect(resolveShortcut({ key: "Backspace" })).toBe("delete");
    expect(resolveShortcut({ key: "Delete", onControl: true })).toBe("delete");
  });
  it("every action in the cheat sheet is reachable", () => {
    const actions = new Set(SHORTCUTS.map(s => s.action));
    expect(actions.size).toBe(SHORTCUTS.length);
  });
  it("G starts a workspace jump; the second key picks the workspace", () => {
    expect(resolveShortcut({ key: "g" })).toBe("goPrefix");
    expect(resolveShortcut({ key: "g", typing: true })).toBeNull();
    expect(resolveShortcut({ key: "g", dialogOpen: true })).toBeNull();
    expect(resolveGoKey("T")).toBe("go:style");
    expect(resolveGoKey("l")).toBe("go:sections");
    expect(resolveGoKey("q")).toBeNull();
    expect(new Set(GO_KEYS.map(g => g.key)).size).toBe(GO_KEYS.length);
    expect(goHint("menus")).toBe("G then N");
  });
  it("plain keys for the Workbench, Add section and section stepping", () => {
    expect(resolveShortcut({ key: "w" })).toBe("workbench");
    expect(resolveShortcut({ key: "a" })).toBe("addSection");
    expect(resolveShortcut({ key: "[" })).toBe("prevSection");
    expect(resolveShortcut({ key: "]" })).toBe("nextSection");
    expect(resolveShortcut({ key: "a", typing: true })).toBeNull();
    expect(resolveShortcut({ key: "w", ctrl: true })).toBeNull();
  });
  it("every workspace jump is in the cheat sheet", () => {
    for (const g of GO_KEYS) expect(SHORTCUTS.some(s => s.action === `go:${g.tab}`)).toBe(true);
  });
});
