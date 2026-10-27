import { describe, expect, it } from "vitest";
import { BLOCK_CANDIDATE_ID, blockChoices, canPasteBlock, copyBlock, pasteBlock, withBlockCandidate } from "./blockLibrary";

const composition = { type: "CompositionSection", blockType: "composition", blockDefaults: { type: "text", title: "New block" }, blockLabel: "Content block" };
const faq = { type: "FaqSection", blockType: "faq", blockDefaults: { question: "Q?", answer: "A." }, blockLabel: "Question" };

describe("block clipboard", () => {
  const block = { id: "b1", type: "group", title: "G", children: [{ id: "c1", type: "text", title: "Hi" }], grid: { desktop: { column: 2, span: 4 } } };
  it("copies a snapshot that later edits don't change", () => {
    const clip = copyBlock("CompositionSection", block);
    (block.children[0] as any).title = "Changed";
    expect((clip.block.children![0] as any).title).toBe("Hi");
    (block.children[0] as any).title = "Hi";
  });
  it("pastes only into a section of the same type", () => {
    const clip = copyBlock("CompositionSection", block);
    expect(canPasteBlock(clip, "CompositionSection")).toBe(true);
    expect(canPasteBlock(clip, "FaqSection")).toBe(false);
    expect(canPasteBlock(null, "CompositionSection")).toBe(false);
  });
  it("pastes a copy with new ids after a block or at the end, keeping its placement", () => {
    const clip = copyBlock("CompositionSection", block);
    const list = [{ id: "a" }, { id: "z" }];
    const after = pasteBlock(list, clip, "a");
    expect(after.list.map(b => b.id)).toEqual(["a", after.id, "z"]);
    const pasted = after.list[1];
    expect(pasted.id).not.toBe("b1");
    expect(pasted.children![0].id).not.toBe("c1");
    expect(pasted.grid).toEqual({ desktop: { column: 2, span: 4 } });
    expect(pasteBlock(list, clip).list.map(b => b.id).slice(0, 2)).toEqual(["a", "z"]);
    expect(list).toHaveLength(2);
  });
  it("keeps a linked shared block linked and adds no children it didn't have", () => {
    const linked = pasteBlock([], copyBlock("FaqSection", { id: "p", sharedBlockId: "s1" })).list[0];
    expect(linked.sharedBlockId).toBe("s1");
    expect(linked).not.toHaveProperty("children");
  });
});

describe("block picker choices", () => {
  it("offers text, picture, button and group for a Flexible composition", () => {
    const choices = blockChoices(composition, {});
    expect(choices.map(c => c.label)).toEqual(["Text", "Picture", "Button", "Group"]);
    const picture = choices[1].make();
    expect(picture).toMatchObject({ type: "image", imageUrl: "" });
    expect(choices[1].make().id).not.toBe(picture.id);
  });
  it("offers a new block, copies, compatible shared blocks and the clipboard for other sections", () => {
    const choices = blockChoices(faq, {
      existing: [{ id: "q1", question: "Shipping?" }],
      sharedBlocks: [{ id: "s1", name: "Returns answer", sectionType: "FaqSection", block: {} } as any, { id: "s2", name: "Other", sectionType: "HeroSection", block: {} } as any],
      clip: copyBlock("FaqSection", { id: "x", question: "Copied" }),
      labelOf: b => String((b as any).question),
    });
    expect(choices.map(c => `${c.group}: ${c.label}`)).toEqual([
      "New: New question", "Copy one already here: Copy of Shipping?", "Shared blocks: Returns answer", "Clipboard: Paste copied block",
    ]);
    expect(choices[0].make()).toMatchObject({ question: "Q?" });
    expect(choices[1].make()).toMatchObject({ question: "Shipping?" });
    expect(choices[1].make().id).not.toBe("q1");
    expect(choices[2].make()).toMatchObject({ sharedBlockId: "s1" });
    expect(choices[3].make()).toMatchObject({ question: "Copied" });
  });
  it("leaves out a clipboard block from another section type, and offers nothing for sections without blocks", () => {
    expect(blockChoices(faq, { clip: copyBlock("CompositionSection", { id: "x" }) }).some(c => c.group === "Clipboard")).toBe(false);
    expect(blockChoices({ type: "HeroSection" }, {})).toEqual([]);
  });
});

describe("preview candidate block", () => {
  it("appends a never-saved candidate to the right section only", () => {
    const design = { heroPage: { sections: [{ id: "s1", type: "FaqSection", settings: { items: [{ id: "q1" }] } }, { id: "s2", type: "FaqSection", settings: { items: [] } }] } };
    const next = withBlockCandidate(design, "s1", "items", { id: "tmp", question: "Q" });
    expect(next.heroPage.sections[0].settings.items.map((b: any) => b.id)).toEqual(["q1", BLOCK_CANDIDATE_ID]);
    expect(next.heroPage.sections[1]).toBe(design.heroPage.sections[1]);
    expect(design.heroPage.sections[0].settings.items).toHaveLength(1);
  });
});

describe("paste depth", () => {
  it("refuses a spot where the pasted block's inner blocks would go deeper than 3 levels", async () => {
    const { fitsAfter } = await import("./blockLibrary");
    const tree = [{ id: "g1", type: "group", children: [{ id: "g2", type: "group", children: [{ id: "t3", type: "text" }] }] }];
    const group = { id: "x", type: "group", children: [{ id: "y", type: "text" }] };
    expect(fitsAfter(tree, "t3", { id: "z", type: "text" })).toBe(true);
    expect(fitsAfter(tree, "t3", group)).toBe(false);
    expect(fitsAfter(tree, "g2", group)).toBe(true);
    expect(fitsAfter(tree, null, group)).toBe(true);
    expect(fitsAfter(tree, "missing", group)).toBe(false);
  });
});
