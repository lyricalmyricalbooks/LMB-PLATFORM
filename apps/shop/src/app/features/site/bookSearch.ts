// One search matcher for the search pop-up and the shop-page search box.
// Every typed word must match (any order), accents and case are ignored, ISBNs match with or
// without hyphens, and a long word may be one letter off ("hobbbit" still finds "hobbit").

type Book = any;

export const normalizeSearch = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

interface Fields { title: string; subtitle: string; author: string; tags: string; other: string; digits: string; words: string[] }
const cache = new WeakMap<Book, Fields>();

function fieldsOf(book: Book): Fields {
  let f = cache.get(book);
  if (f) return f;
  const title = normalizeSearch(book.title);
  const subtitle = normalizeSearch(book.subtitle);
  const author = normalizeSearch(book.authorName);
  const tags = normalizeSearch([...(book.categories || []), ...(book.genres || []), ...(book.tags || [])].join(" "));
  const other = normalizeSearch([book.publisher, book.series, book.isbn, book.sku].filter(Boolean).join(" "));
  const digits = String(book.isbn ?? "").replace(/\D/g, "");
  const words = [...new Set(`${title} ${subtitle} ${author}`.split(" ").filter(Boolean))];
  f = { title, subtitle, author, tags, other, digits, words };
  cache.set(book, f);
  return f;
}

// True when a and b differ by at most one inserted, deleted, changed or swapped letter.
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

function tokenScore(f: Fields, t: string, isDigits: boolean): number {
  if (isDigits && t.length >= 4 && f.digits.includes(t)) return 70;
  if (f.title.startsWith(t)) return 100;
  if (f.title.split(" ").some(w => w.startsWith(t))) return 85;
  if (f.title.includes(t)) return 75;
  if (f.subtitle.includes(t)) return 60;
  if (f.author.includes(t)) return 50;
  if (f.tags.includes(t)) return 30;
  if (f.other.includes(t)) return 25;
  if (t.length >= 5 && f.words.some(w => w.length >= 4 && (withinOneEdit(w, t) || withinOneEdit(w.slice(0, t.length), t)))) return 15;
  return 0;
}

/** 0 = no match. Higher = better. Every word in the query has to match somewhere. */
export function searchScore(book: Book, query: string): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const f = fieldsOf(book);
  const tokens = q.split(" ");
  let total = 0;
  for (const t of tokens) {
    const s = tokenScore(f, t, /^\d+$/.test(t));
    if (!s) return 0;
    total += s;
  }
  const avg = total / tokens.length;
  // A phrase that is the start of the title, or the whole title, ranks above scattered words.
  return avg + (f.title.startsWith(q) ? 20 : 0) + (f.title === q ? 20 : 0);
}

export function matchesSearch(book: Book, query: string): boolean {
  return !normalizeSearch(query) || searchScore(book, query) > 0;
}
