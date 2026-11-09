// Setup mode's in-place help answers come in the shop's words (code plan 12.18): main.tsx passes the help centre's
// own `articlesFor("both", sells)` to helpAnswersFrom, so a clothing shop reads what the help centre shows it.
import { describe, expect, it } from "vitest";
// @ts-expect-error: the help centre is plain JS outside the shop's sources, loaded at run time by main.tsx
import { articlesFor } from "../../../../help/articles.js";
import { helpAnswersFrom } from "./SetupHelp";
import { SETUP_QUESTIONS } from "./pages";

describe("setup mode's help answers follow what the shop sells", () => {
  it("a clothing shop's answers have no book words; a books shop's are the help centre's as written", () => {
    const clothing = helpAnswersFrom(articlesFor("both", "clothing"));
    const books = helpAnswersFrom(articlesFor("both", "books"));
    for (const q of SETUP_QUESTIONS) {
      expect(clothing.get(q.id), q.id).toBeTruthy();
      expect(clothing.get(q.id)!.answer.join(" "), q.id).not.toMatch(/\bbooks?\b/i);
    }
    expect(books.get("bring-books")!.answer.join(" ")).toMatch(/\bbooks?\b/);
  });
});
