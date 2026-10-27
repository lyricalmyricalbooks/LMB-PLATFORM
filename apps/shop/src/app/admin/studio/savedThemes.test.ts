import { describe, it, expect } from "vitest";
import { addSavedTheme, removeSavedTheme, renameSavedTheme, duplicateSavedTheme, serializeThemeFile, parseThemeFile, themeFileName, MAX_SAVED_THEMES, savedThemeLimitProblem, themeNamed } from "./savedThemes";

describe("saved themes", () => {
  it("stores a detached, undefined-free copy", () => {
    const d: any = { a: 1, b: undefined, s: [{ id: "x" }] };
    const [t] = addSavedTheme([], " Autumn ", d);
    expect(t.name).toBe("Autumn");
    expect(t.design).toEqual({ a: 1, s: [{ id: "x" }] });
    d.s[0].id = "changed";
    expect(t.design.s[0].id).toBe("x");
  });
  it("replaces a theme with the same name and caps the list", () => {
    let l = addSavedTheme([], "A", { v: 1 });
    l = addSavedTheme(l, "a", { v: 2 });
    expect(l).toHaveLength(1);
    expect(l[0].design.v).toBe(2);
    for (let i = 0; i < 15; i++) l = addSavedTheme(l, `T${i}`, {});
    expect(l).toHaveLength(MAX_SAVED_THEMES);
    expect(l[0].name).toBe("T14");
  });
  it("removes by id and names blanks", () => {
    const l = addSavedTheme([], "  ", {});
    expect(l[0].name).toBe("Untitled theme");
    expect(removeSavedTheme(l, l[0].id)).toEqual([]);
  });

  it("renames, replacing a clashing name", () => {
    let l = addSavedTheme([], "A", {});
    l = addSavedTheme(l, "B", {});
    const a = l.find((t) => t.name === "A")!;
    expect(renameSavedTheme(l, a.id, "  ").map((t) => t.name).sort()).toEqual(["A", "B"]);
    expect(renameSavedTheme(l, a.id, "b").map((t) => t.name)).toEqual(["b"]);
  });
  it("duplicates with a unique name and a detached design", () => {
    let l = addSavedTheme([], "A", { v: 1 });
    l = duplicateSavedTheme(l, l[0].id);
    l = duplicateSavedTheme(l, l.find((t) => t.name === "A")!.id);
    expect(l.map((t) => t.name).sort()).toEqual(["A", "A copy", "A copy 2"]);
    expect(l[0].design).toEqual({ v: 1 });
  });
  it("round-trips a theme file and rejects junk", () => {
    const text = serializeThemeFile({ name: "Autumn", design: { a: [1] } });
    expect(parseThemeFile(text)).toEqual({ name: "Autumn", design: { a: [1] } });
    expect("error" in parseThemeFile("nope")).toBe(true);
    expect("error" in parseThemeFile('{"x":1}')).toBe(true);
    expect(themeFileName({ name: "My Theme!" })).toBe("my-theme.theme.json");
  });

  it("refuses a new theme at the cap instead of dropping the oldest, but allows replacing a same-named one", () => {
    let l: any[] = [];
    for (let i = 0; i < MAX_SAVED_THEMES; i++) l = addSavedTheme(l, `T${i}`, {});
    expect(savedThemeLimitProblem(l, "New one")).toMatch(/maximum of 10 themes/);
    expect(savedThemeLimitProblem(l, "t3")).toBeNull();
    expect(savedThemeLimitProblem(l.slice(1), "New one")).toBeNull();
  });

  it("finds a clashing name for rename/save confirmations, ignoring the theme itself", () => {
    const l = addSavedTheme(addSavedTheme([], "Spring", {}), "Autumn", {});
    const spring = l.find(t => t.name === "Spring")!;
    expect(themeNamed(l, " spring ")?.id).toBe(spring.id);
    expect(themeNamed(l, "Spring", spring.id)).toBeUndefined();
    expect(themeNamed(l, "Winter")).toBeUndefined();
  });
});
