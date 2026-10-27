import type { Book } from "./types";
import { recommendedBooks } from "./merchandising";
import { bookCreators } from "../../lib/bookSeo";

/** Studio › Style › Book page › “More by this artist” (`relatedByArtist`): the related-books row shows only other
 *  published books credited to one of this book's artists (names compared case-insensitively, as `bookCreators`
 *  splits them), with `artist` = the name to put in the heading. A curated selection (`relatedBookIds`) always wins,
 *  and a book whose artists have nothing else in the shop keeps the usual row (`artist` undefined). Display only. */
export function relatedRow(book: any, catalog: Book[], options: { byArtist?: boolean; limit?: number } = {}): { books: Book[]; artist?: string } {
  const limit = options.limit ?? 4;
  const usual = () => ({ books: recommendedBooks(book, catalog, limit) });
  if (!options.byArtist || !book || Array.isArray(book.relatedBookIds)) return usual();
  const mine = bookCreators(book);
  if (!mine.length) return usual();
  const key = (name: string) => name.toLocaleLowerCase();
  const wanted = new Set(mine.map(key));
  const matches = catalog.filter(candidate => candidate.id !== book.id && candidate.status === "published"
    && bookCreators(candidate as any).some(name => wanted.has(key(name))));
  if (!matches.length) return usual();
  const shared = new Set(bookCreators(matches[0] as any).map(key));
  return { books: matches.slice(0, limit), artist: mine.find(name => shared.has(key(name))) };
}
