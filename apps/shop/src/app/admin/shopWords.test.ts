import { describe, expect, it } from "vitest";
import { goodsWords } from "../../shared/shopSells";
import { COPY_SCHEMA } from "../features/site/storeCopy";
import { wordCatalog } from "./shopWords";
import { STYLE_GROUPS } from "./studio/styleSchema";

const same = (text: string) => text;
const BOOK_WORD = /(?<![-\w{])(books?|authors?|editions?)\b/i;

describe("wordCatalog", () => {
  it("hands a books shop the very same list", () => {
    expect(wordCatalog(STYLE_GROUPS, same)).toBe(STYLE_GROUPS);
  });

  it("changes only the words people read, and gives the same list back each time", () => {
    const list = [{ id: "bookCard", title: "Book cards", hint: "Use {author} for the author.", fields: [{ key: "bookTitle", label: "Book title", default: "Our books", options: [{ value: "book", label: "Book" }] }] }];
    const out = wordCatalog(list, goodsWords);
    expect(out).toEqual([{ id: "bookCard", title: "Product cards", hint: "Use {author} for the maker.", fields: [{ key: "bookTitle", label: "Product title", default: "Our books", options: [{ value: "book", label: "Product" }] }] }]);
    expect(wordCatalog(list, goodsWords)).toBe(out);
    expect(list[0].title).toBe("Book cards");
  });

  it("leaves no book word in Theme settings or Text & labels for a shop that doesn't sell books", () => {
    const left: string[] = [];
    for (const g of wordCatalog(STYLE_GROUPS, goodsWords)) {
      for (const text of [g.title, g.hint, ...g.fields.flatMap(f => [f.label, ...("options" in f ? f.options.map(o => o.label) : [])])]) if (text && BOOK_WORD.test(text)) left.push(text);
    }
    for (const g of wordCatalog(COPY_SCHEMA, goodsWords)) for (const f of g.fields) for (const text of [f.label, f.hint]) if (text && BOOK_WORD.test(text)) left.push(text);
    expect(left).toEqual([]);
  });

  it("keeps every key, id, value and default", () => {
    const strip = (list: any) => JSON.parse(JSON.stringify(list, (key, value) => (["label", "title", "hint", "description", "blurb", "note"].includes(key) ? undefined : value)));
    expect(strip(wordCatalog(STYLE_GROUPS, goodsWords))).toEqual(strip(STYLE_GROUPS));
    expect(strip(wordCatalog(COPY_SCHEMA, goodsWords))).toEqual(strip(COPY_SCHEMA));
  });
});
