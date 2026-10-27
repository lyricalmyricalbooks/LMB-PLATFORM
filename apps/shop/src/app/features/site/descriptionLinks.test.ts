import { describe, expect, it } from "vitest";
import { descriptionParts, descriptionPlainText, linkMarkup, safeHref } from "./descriptionLinks";

describe("description links", () => {
  it("turns [text](url) into a link", () => {
    expect(descriptionParts("Press: [Maclean's](https://macleans.ca/culture/x/) — read it.")).toEqual([
      { text: "Press: " }, { text: "Maclean's", href: "https://macleans.ca/culture/x/" }, { text: " — read it." },
    ]);
  });
  it("links bare addresses without trailing punctuation", () => {
    expect(descriptionParts("See https://macleans.ca/a/b/. Next")).toEqual([
      { text: "See " }, { text: "https://macleans.ca/a/b/", href: "https://macleans.ca/a/b/" }, { text: ". Next" },
    ]);
  });
  it("keeps the owner's bracketed address as typed around the link", () => {
    const parts = descriptionParts("[Macleans Magazine Article: https://macleans.ca/culture/ian/]");
    expect(parts.find((p) => p.href)?.href).toBe("https://macleans.ca/culture/ian/");
    expect(parts.map((p) => p.text).join("")).toBe("[Macleans Magazine Article: https://macleans.ca/culture/ian/]");
  });
  it("refuses unsafe schemes", () => {
    expect(descriptionParts("[x](javascript:alert(1))").some((p) => p.href)).toBe(false);
    expect(safeHref("//evil.com")).toBe("");
    expect(safeHref("/books/abc")).toBe("/books/abc");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
  });
  it("plain text drops link markup and keeps line breaks", () => {
    expect(descriptionPlainText("One\n[Two](https://x.ca) three")).toBe("One\nTwo three");
  });
  it("builds markup", () => {
    expect(linkMarkup("Maclean's [article]", "https://x.ca")).toBe("[Maclean's article](https://x.ca)");
    expect(linkMarkup("", "https://x.ca")).toBe("https://x.ca");
  });
});

import { applyFormat, descriptionBlocks, hasFormatting, inlineParts } from "./descriptionLinks";

describe("description formatting", () => {
  it("leaves plain text as one block", () => {
    expect(descriptionBlocks("One\n\nTwo 5 * 3 * 2 snake_case_name")).toEqual([{ type: "text", text: "One\n\nTwo 5 * 3 * 2 snake_case_name" }]);
    expect(hasFormatting("Just words, 5 * 3.")).toBe(false);
  });
  it("reads headings, lists, quotes and dividers", () => {
    expect(descriptionBlocks("Intro\n## Press\n- One\n- Two\n1. A\n> Quote\n> more\n---\nEnd")).toEqual([
      { type: "text", text: "Intro" }, { type: "h3", text: "Press" }, { type: "ul", items: ["One", "Two"] },
      { type: "ol", items: ["A"] }, { type: "quote", text: "Quote\nmore" }, { type: "hr" }, { type: "text", text: "End" },
    ]);
  });
  it("reads bold and italic", () => {
    expect(inlineParts("a **b** *c* _d_")).toEqual([
      { text: "a " }, { text: "b", bold: true }, { text: " " }, { text: "c", italic: true }, { text: " " }, { text: "d", italic: true },
    ]);
  });
  it("plain text drops formatting", () => {
    expect(descriptionPlainText("## Press\n- **Big** [news](https://x.ca)")).toBe("Press\nBig news");
  });
  it("toolbar wraps and unwraps", () => {
    const b = applyFormat("hello world", 6, 11, "bold");
    expect(b.text).toBe("hello **world**");
    expect(applyFormat(b.text, b.start, b.end, "bold").text).toBe("hello world");
    expect(applyFormat("a\nb", 0, 3, "bullets").text).toBe("- a\n- b");
    expect(applyFormat("- a\n- b", 0, 7, "bullets").text).toBe("a\nb");
    expect(applyFormat("a\nb", 0, 3, "numbers").text).toBe("1. a\n2. b");
    expect(applyFormat("Title", 2, 2, "heading").text).toBe("## Title");
    expect(applyFormat("## Title", 2, 2, "subheading").text).toBe("### Title");
    expect(applyFormat("x", 1, 1, "divider").text).toBe("x\n---\n");
  });
});
