import { describe, expect, test } from "vitest";
import { hangTagsHtml } from "@stockroom/hang-tags.js";
import { tagBook } from "./HangTagsDialog";

describe("hang tags", () => {
  test("a book's list price prints; no price leaves a blank to write in", () => {
    expect(tagBook({ title: "Moths", author: "Ana", listPrice: 24, currency: "CAD", isbn: "978" })).toMatchObject({ title: "Moths", price: 24, isbn: "978" });
    expect(tagBook({ title: "Zine" }).price).toBe("");
    const html = hangTagsHtml({ books: [tagBook({ title: "Moths", listPrice: 24, currency: "CAD" })], copies: 2, eventName: "Fair" });
    expect(html.match(/Moths/g)!.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("24.00");
  });
});
