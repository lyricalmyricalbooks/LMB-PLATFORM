import { describe, expect, it } from "vitest";
import { noteWords } from "./importPreview";
import { goodsWords } from "./sells";

describe("noteWords", () => {
  it("puts a note in the shop's words and leaves what the file said alone", () => {
    expect(noteWords("Type how many you have in the book editor.", goodsWords)).toBe("Type how many you have in the product editor.");
    expect(noteWords("The title “The Book of Hours” matches 2 books (Book one, Book two).", goodsWords))
      .toBe("The title “The Book of Hours” matches 2 products (Book one, Book two).");
    expect(noteWords("A new book needs a Title.", (t) => t)).toBe("A new book needs a Title.");
  });
});
