import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DescriptionLinkDialog, normalizeLinkInput } from "./BookEditorFields";

describe("book editor fields", () => {
  it("renders the Add link dialog without a nested <form> (it sits inside the book form)", () => {
    const html = renderToStaticMarkup(<DescriptionLinkDialog open initialText="Maclean's" onClose={() => {}} onInsert={() => {}} />);
    expect(html).toContain("Web address");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="submit"');
  });
  it("adds https:// to bare web addresses", () => {
    expect(normalizeLinkInput("macleans.ca/x")).toBe("https://macleans.ca/x");
    expect(normalizeLinkInput("/books/a")).toBe("/books/a");
  });
});
