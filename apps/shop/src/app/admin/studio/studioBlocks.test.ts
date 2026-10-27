import { describe, expect, it } from "vitest";
import { addChildBlock, findBlock, freshBlockIds, mapBlock, moveBlockBefore, normalizeBlocks, removeBlock, resolveSharedBlocks } from "./studioModel";

describe("recursive Studio blocks", () => {
  it("inherits nested shared content without losing local placement", () => {
    const library: any[] = [{ id: "shared", name: "Group", updatedAt: "now", block: {
      id: "source", type: "group", children: [{ id: "child", type: "text", text: "Original" }],
    } }];
    const placement = normalizeBlocks([{ id: "placement", sharedBlockId: "shared", hidden: true, grid: { desktop: { column: 3 } } }]);
    expect(resolveSharedBlocks(placement, library)[0]).toMatchObject({
      id: "placement", hidden: true, grid: { desktop: { column: 3 } }, children: [{ id: "child", text: "Original" }],
    });
    library[0].block.children[0].text = "Updated";
    expect(resolveSharedBlocks(placement, library)[0].children?.[0].text).toBe("Updated");
    expect(placement[0].children).toBeUndefined();
  });

  it("bounds recursively linked sources even when a source links to itself", () => {
    const library: any[] = [{ id: "loop", name: "Loop", updatedAt: "now", block: {
      id: "source", type: "group", children: [{ id: "child", sharedBlockId: "loop" }],
    } }];
    const resolved = resolveSharedBlocks([{ id: "placement", sharedBlockId: "loop" }], library);
    expect(resolved[0].children?.[0].children?.[0].children).toEqual([]);
  });

  const tree: any[] = [{ id: "parent", title: "Parent", children: [{ id: "child", title: "Child", children: [{ id: "leaf", title: "Leaf" }] }] }];

  it("finds, updates, inserts and removes at any supported depth", () => {
    expect(findBlock(tree, "leaf")?.title).toBe("Leaf");
    expect(findBlock(mapBlock(tree, "leaf", b => ({ ...b, title: "Edited" })), "leaf")?.title).toBe("Edited");
    expect(findBlock(addChildBlock(tree, "child", { id: "new" }), "new")?.id).toBe("new");
    expect(findBlock(removeBlock(tree, "child"), "leaf")).toBeUndefined();
  });

  it("caps recursive content at three levels and supplies stable legacy ids", () => {
    const normalized = normalizeBlocks([{ children: [{ children: [{ children: [{ title: "too deep" }] }] }] }], "s");
    expect(normalized[0].id).toBe("s-0");
    expect(normalized[0].children?.[0].children?.[0].children).toBeUndefined();
  });

  it("duplicates a whole tree with fresh ids", () => {
    const copy = freshBlockIds(tree[0]);
    expect(copy.id).not.toBe("parent");
    expect(copy.children?.[0].id).not.toBe("child");
    expect(copy.children?.[0].children?.[0].id).not.toBe("leaf");
  });

  it("reorders siblings without flattening their tree", () => {
    const next = moveBlockBefore([{ id: "group", children: [{ id: "a" }, { id: "b" }, { id: "c" }] }], "c", "a");
    expect(next[0].children?.map(b => b.id)).toEqual(["c", "a", "b"]);
  });

  it("resolves a linked shared block while preserving placement overrides", () => {
    const resolved = resolveSharedBlocks([{ id: "placement", sharedBlockId: "shared", grid: { desktop: { column: 3 } } }], [{
      id: "shared", name: "CTA", updatedAt: "now", block: { id: "source", type: "button", text: "Buy now", url: "/" },
    }]);
    expect(resolved[0]).toMatchObject({ id: "placement", type: "button", text: "Buy now", sharedBlockId: "shared", grid: { desktop: { column: 3 } } });
  });
});
