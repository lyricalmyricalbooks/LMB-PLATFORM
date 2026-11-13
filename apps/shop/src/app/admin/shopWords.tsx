// The admin's words for what the shop sells (plan 10.23, sells.ts `adminWordsFor`). Dashboard provides it from the
// sign-up answer; a books shop, or one with no answer, gets its words unchanged.
import { createContext, useCallback, useContext } from "react";

export const ShopWordsContext = createContext<(text: string) => string>((text) => text);

/** `w("Add book")` is "Add book" in a books shop and "Add product" in one that sells something else. */
export const useShopWords = () => useContext(ShopWordsContext);

/** The sign-up answer itself ("clothing", "books"…, or null), for what more than words depends on (plan 10.6). */
/** Fired by Settings › What you sell so the admin changes its words at once. */
export const SELLS_CHANGED_EVENT = "lm-sells-changed";
export const ShopSellsContext = createContext<string | null>(null);

export const useShopSells = () => useContext(ShopSellsContext);

// Lists of settings (Studio's style groups, Text & labels, page parts) carry their names as data. `wordCatalog` gives
// the same list in this shop's words: only the words people read (label, title, hint, description, blurb, note) change,
// never a key, an id, a value or a default. The answer is remembered per list, so the same list comes back each time.
const READ_KEYS = new Set(["label", "title", "hint", "description", "blurb", "note"]);
const worded = new WeakMap<(text: string) => string, WeakMap<object, unknown>>();

export function wordCatalog<T>(catalog: T, w: (text: string) => string): T {
  if (!catalog || typeof catalog !== "object" || w("book") === "book") return catalog;
  let seen = worded.get(w);
  if (!seen) worded.set(w, (seen = new WeakMap()));
  // A {token} is a code the shop fills in ({author}, {title}), so it keeps its spelling.
  const words = (text: string) => text.split(/(\{[^{}]*\})/).map((part, i) => (i % 2 ? part : w(part))).join("");
  const walk = (node: any): any => {
    if (!node || typeof node !== "object") return node;
    if (seen!.has(node)) return seen!.get(node);
    const proto = Object.getPrototypeOf(node);
    if (!Array.isArray(node) && proto !== Object.prototype && proto !== null) return node;
    const out: any = Array.isArray(node) ? [] : {};
    seen!.set(node, out);
    seen!.set(out, out);
    for (const key of Object.keys(node)) {
      const value = node[key];
      out[key] = typeof value === "string" ? (READ_KEYS.has(key) ? words(value) : value) : walk(value);
    }
    return out;
  };
  return walk(catalog);
}

/** `cw(STYLE_GROUPS)` is the list in this shop's words (the list itself in a books shop). */
export function useCatalogWords(): <T>(catalog: T) => T {
  const w = useShopWords();
  return useCallback(<T,>(catalog: T) => wordCatalog(catalog, w), [w]);
}
