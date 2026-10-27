import { describe, expect, it } from "vitest";
import { relatedRow } from "./relatedArtist";

const book = (id: string, subtitle: string, extra: Record<string, any> = {}) =>
  ({ id, title: id, subtitle, status: "published", categories: ["Zines"], ...extra }) as any;

const current = book("a", "Mina Park & Leo Hart");
const catalog = [
  current,
  book("b", "Someone Else"),
  book("c", "leo hart"),
  book("d", "Mina Park", { status: "draft" }),
  book("e", "Mina Park, Ana Ruiz"),
];

describe("relatedRow", () => {
  it("keeps the usual row while the switch is off", () => {
    const row = relatedRow(current, catalog);
    expect(row.artist).toBeUndefined();
    expect(row.books.map(b => b.id)).toEqual(["b", "c", "e"]);
  });

  it("shows only published books sharing an artist, names compared case-insensitively", () => {
    const row = relatedRow(current, catalog, { byArtist: true });
    expect(row.books.map(b => b.id)).toEqual(["c", "e"]);
    expect(row.artist).toBe("Leo Hart");
  });

  it("falls back to the usual row when the artist has nothing else", () => {
    const lone = book("z", "Nobody Known");
    const row = relatedRow(lone, [lone, ...catalog], { byArtist: true });
    expect(row.artist).toBeUndefined();
    expect(row.books.length).toBe(4);
  });

  it("lets a curated selection win", () => {
    const curated = { ...current, relatedBookIds: ["b"] };
    const row = relatedRow(curated, catalog, { byArtist: true });
    expect(row.artist).toBeUndefined();
    expect(row.books.map(b => b.id)).toEqual(["b"]);
  });

  it("ignores group credits", () => {
    const various = book("v", "Various artists");
    expect(relatedRow(various, [various, book("w", "Various artists")], { byArtist: true }).artist).toBeUndefined();
  });

  it("respects the limit", () => {
    const many = [current, ...Array.from({ length: 6 }, (_, i) => book(`m${i}`, "Mina Park"))];
    expect(relatedRow(current, many, { byArtist: true, limit: 4 }).books.length).toBe(4);
  });
});
