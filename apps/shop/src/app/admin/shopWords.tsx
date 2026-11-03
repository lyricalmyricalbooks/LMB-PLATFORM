// The admin's words for what the shop sells (plan 10.23, sells.ts `adminWordsFor`). Dashboard provides it from the
// sign-up answer; a books shop, or one with no answer, gets its words unchanged.
import { createContext, useContext } from "react";

export const ShopWordsContext = createContext<(text: string) => string>((text) => text);

/** `w("Add book")` is "Add book" in a books shop and "Add product" in one that sells something else. */
export const useShopWords = () => useContext(ShopWordsContext);

/** The sign-up answer itself ("clothing", "books"…, or null), for what more than words depends on (plan 10.6). */
/** Fired by Settings › What you sell so the admin changes its words at once. */
export const SELLS_CHANGED_EVENT = "lm-sells-changed";
export const ShopSellsContext = createContext<string | null>(null);

export const useShopSells = () => useContext(ShopSellsContext);
