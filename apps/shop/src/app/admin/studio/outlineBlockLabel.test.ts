// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { outlineBlockLabel } from "./StudioOutline";

describe("outline names for linked shared blocks", () => {
  const library = [
    { id: "s1", name: "Shop promise", block: { id: "x", title: "Free shipping over $50" }, updatedAt: "" },
    { id: "s2", name: "Logo strip", block: { id: "y" }, updatedAt: "" },
  ];
  it("reads the shared source's words, then its name, instead of 'Column 2'", () => {
    expect(outlineBlockLabel({ id: "p1", sharedBlockId: "s1" }, 1, "Column", library)).toBe("Free shipping over $50");
    expect(outlineBlockLabel({ id: "p2", sharedBlockId: "s2" }, 1, "Column", library)).toBe("Logo strip");
    expect(outlineBlockLabel({ id: "p3", sharedBlockId: "gone" }, 1, "Column", library)).toBe("Column 2");
    expect(outlineBlockLabel({ id: "p4", title: "Own words" }, 0, "Column", library)).toBe("Own words");
  });
});
