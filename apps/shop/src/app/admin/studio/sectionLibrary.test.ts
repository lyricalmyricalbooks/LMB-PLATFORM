import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANDIDATE_ID, deletePreset, deleteSharedBlock, libraryGroups, placementHint, renamePreset, renameSharedBlock,
  sharedBlockUsage, withCandidate,
} from "./sectionLibrary";

const registry = [
  { type: "A", label: "Promo strip", description: "Slim line", category: "Promo", bestIn: { group: "headerSections", note: "Best under the header (every page)" } },
  { type: "B", label: "Book spotlight", description: "One book", category: "Commerce" },
  { type: "C", label: "Sticky add-to-bag bar", description: "Bar", category: "Commerce", bestIn: { template: "productPage", note: "Book pages only" } },
];

describe("section library", () => {
  it("groups by category and searches labels, descriptions and placement notes", () => {
    expect(libraryGroups(registry, "").map(g => [g.category, g.items.map(i => i.type)])).toEqual([["Promo", ["A"]], ["Commerce", ["B", "C"]]]);
    expect(libraryGroups(registry, "header").flatMap(g => g.items.map(i => i.type))).toEqual(["A"]);
    expect(libraryGroups(registry, "nothing like this")).toEqual([]);
  });
  it("says when a section is made for somewhere else", () => {
    expect(placementHint(registry[0], "headerSections")).toEqual({ note: "Best under the header (every page)", elsewhere: false });
    expect(placementHint(registry[0], "heroPage")?.elsewhere).toBe(true);
    expect(placementHint(registry[2], "productPage")?.elsewhere).toBe(false);
    expect(placementHint(registry[1], "heroPage")).toBeNull();
  });
  it("puts the try-on candidate at the insert spot without touching anything else", () => {
    const design = { heroPage: { title: "keep", sections: [{ id: "a", type: "X", settings: {} }, { id: "b", type: "X", settings: {} }] } };
    const next = withCandidate(design, "heroPage", design.heroPage.sections, 1, { id: "tmp", type: "B", settings: { title: "t" } });
    expect(next.heroPage.sections.map((s: any) => s.id)).toEqual(["a", CANDIDATE_ID, "b"]);
    expect(next.heroPage.title).toBe("keep");
    expect(design.heroPage.sections).toHaveLength(2);
    const group = withCandidate({ headerSections: [] }, "headerSections", [], 5, { id: "x", type: "A", settings: {} });
    expect(group.headerSections.map((s: any) => s.id)).toEqual([CANDIDATE_ID]);
  });
  it("the preview bridges recognise the same candidate id", () => {
    for (const file of ["previewBridge.ts", "canvasBridge.ts"]) expect(readFileSync(join(__dirname, file), "utf8")).toContain(`'${CANDIDATE_ID}'`);
  });
});

describe("saved sections", () => {
  const design = { sectionPresets: [{ id: "p1", name: "Old", section: { id: "s", type: "B", settings: {} } }, { id: "p2", name: "Other", section: {} }] };
  it("renames (ignoring blank names) and deletes", () => {
    expect(renamePreset(design, "p1", "  New  ").sectionPresets[0].name).toBe("New");
    expect(renamePreset(design, "p1", "   ")).toBe(design);
    expect(deletePreset(design, "p1").sectionPresets.map((p: any) => p.id)).toEqual(["p2"]);
  });
});

describe("shared blocks", () => {
  const library = [{ id: "sh", name: "Signup", block: { id: "src", title: "Shared title", body: "Shared body" }, updatedAt: "2026-10-01" }];
  const design = {
    sharedBlocks: library,
    headerSections: [{ id: "h", type: "RowSection", settings: { items: [{ id: "p1", sharedBlockId: "sh", grid: { desktop: { x: 1 } } }] } }],
    heroPage: { sections: [{ id: "c", type: "CompositionSection", settings: { items: [{ id: "g", type: "group", children: [{ id: "p2", sharedBlockId: "sh" }] }] } }] },
  };
  it("lists every placement, in groups and nested blocks", () => {
    expect(sharedBlockUsage(design, "sh").map(u => [u.surface, u.sectionId, u.blockId])).toEqual([["headerSections", "h", "p1"], ["heroPage", "c", "p2"]]);
    expect(sharedBlockUsage(design, "nope")).toEqual([]);
  });
  it("renames", () => {
    expect(renameSharedBlock(design, "sh", "Newsletter box").sharedBlocks[0].name).toBe("Newsletter box");
  });
  it("deleting keeps each placement showing the same content, as an ordinary copy", () => {
    const next = deleteSharedBlock(design, "sh");
    expect(next.sharedBlocks).toEqual([]);
    expect(next.headerSections[0].settings.items[0]).toEqual({ id: "p1", title: "Shared title", body: "Shared body", grid: { desktop: { x: 1 } } });
    expect(next.heroPage.sections[0].settings.items[0].children[0]).toEqual({ id: "p2", title: "Shared title", body: "Shared body" });
    expect(JSON.stringify(next)).not.toContain("sharedBlockId");
  });
});
