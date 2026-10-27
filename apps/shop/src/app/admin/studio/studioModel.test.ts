import { describe, expect, it } from "vitest";
import {
  commit, duplicateSection, getSections, initHistory, insertSection, makeSection, moveSection,
  normalizeDesign, patchBlockField, patchSectionSettings, redo, removeSection, setPath, setSections,
  toggleSection, undo,
} from "./studioModel";

describe("setPath", () => {
  it("sets nested values without mutating and deletes on undefined", () => {
    const a = { x: { y: 1 } };
    const b = setPath(a, "x.z.w", 2);
    expect(a).toEqual({ x: { y: 1 } });
    expect(b).toEqual({ x: { y: 1, z: { w: 2 } } });
    expect(setPath(b, "x.y", undefined)).toEqual({ x: { z: { w: 2 } } });
  });
});

describe("sections", () => {
  const t = { kind: "template", id: "productPage" } as const;
  it("reads/writes template and global lists", () => {
    let d: any = normalizeDesign({}, {});
    expect(getSections(d, t)).toEqual([]);
    const s = makeSection("HeroSection", { title: "Hi" });
    d = setSections(d, t, [s]);
    expect(d.productPage.sections[0].settings.title).toBe("Hi");
    d = setSections(d, { kind: "global" }, [s]);
    expect(d.globalSections).toHaveLength(1);
  });
  it("normalizeDesign keeps existing sections and fills heroPage", () => {
    const d = normalizeDesign({ homepageSections: [{ id: "a", type: "X", settings: {} }] }, { primaryColor: "#fff" });
    expect(d.heroPage.sections).toHaveLength(1);
    expect(d.primaryColor).toBe("#fff");
  });
  it("insert, move, toggle, patch, remove", () => {
    const a = makeSection("A"), b = makeSection("B"), c = makeSection("C");
    let l = insertSection(insertSection(insertSection([], a), b), c, 1);
    expect(l.map((s) => s.type)).toEqual(["A", "C", "B"]);
    l = moveSection(l, 0, 2);
    expect(l.map((s) => s.type)).toEqual(["C", "B", "A"]);
    l = toggleSection(l, a.id);
    expect(l[2].visible).toBe(false);
    l = patchSectionSettings(l, b.id, { title: "t", gone: undefined });
    expect(l[1].settings).toEqual({ title: "t" });
    expect(removeSection(l, b.id)).toHaveLength(2);
  });
  it("duplicate gives fresh section and block ids", () => {
    const s = makeSection("Slideshow", { slides: [{ id: "b1", t: 1 }] });
    const { list, newId } = duplicateSection([s], s.id);
    expect(list).toHaveLength(2);
    expect(list[1].id).toBe(newId);
    expect(list[1].id).not.toBe(s.id);
    expect(list[1].settings.slides[0].id).not.toBe("b1");
    expect(s.settings.slides[0].id).toBe("b1");
  });
  it("patchBlockField edits only the matching block", () => {
    const s = makeSection("Slideshow", { slides: [{ id: "b1", title: "a" }, { id: "b2", title: "b" }] });
    const [n] = patchBlockField([s], s.id, "b2", "title", "z");
    expect(n.settings.slides.map((x: any) => x.title)).toEqual(["a", "z"]);
  });
});

describe("history", () => {
  it("undo/redo and truncates redo on new commit", () => {
    let h = initHistory(1);
    h = commit(commit(h, 2), 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = commit(undo(h), 9);
    expect(h.future).toEqual([]);
    expect(commit(h, h.present)).toBe(h);
  });
});

describe("labelled, coalesced undo history", () => {
  it("names each step and carries the name across undo/redo", async () => {
    const { initHistory, commit, undo, redo, undoLabel, redoLabel } = await import("./studioModel");
    let h = initHistory(0);
    h = commit(h, 1, { label: "Add Newsletter" });
    h = commit(h, 2, { label: "Move Newsletter up" });
    expect(undoLabel(h)).toBe("Move Newsletter up");
    h = undo(h);
    expect(h.present).toBe(1);
    expect(undoLabel(h)).toBe("Add Newsletter");
    expect(redoLabel(h)).toBe("Move Newsletter up");
    h = redo(h);
    expect(h.present).toBe(2);
    expect(redoLabel(h)).toBe("");
  });
  it("typing in one field within a second is one step", async () => {
    const { initHistory, commit, undo } = await import("./studioModel");
    let h = initHistory("");
    h = commit(h, "H", { label: "Edit heading", coalesce: "heading", now: 1000 });
    h = commit(h, "He", { label: "Edit heading", coalesce: "heading", now: 1300 });
    h = commit(h, "Hey", { label: "Edit heading", coalesce: "heading", now: 1600 });
    expect(h.past).toEqual([""]);
    expect(undo(h).present).toBe("");
    h = commit(h, "Hey!", { label: "Edit heading", coalesce: "heading", now: 5000 });
    expect(h.past).toEqual(["", "Hey"]);
  });
});

describe("insertBlockAfter", () => {
  it("puts a duplicate right after the original at the same nesting level", async () => {
    const { insertBlockAfter } = await import("./studioModel");
    const blocks: any[] = [{ id: "a" }, { id: "g", children: [{ id: "c1" }, { id: "c2" }] }, { id: "z" }];
    expect(insertBlockAfter(blocks, "a", { id: "a2" } as any).map(b => b.id)).toEqual(["a", "a2", "g", "z"]);
    const nested = insertBlockAfter(blocks, "c1", { id: "c1b" } as any);
    expect(nested.map(b => b.id)).toEqual(["a", "g", "z"]);
    expect(nested[1].children!.map(b => b.id)).toEqual(["c1", "c1b", "c2"]);
    expect(insertBlockAfter(blocks, "missing", { id: "n" } as any).map(b => b.id)).toEqual(["a", "g", "z", "n"]);
  });
});
