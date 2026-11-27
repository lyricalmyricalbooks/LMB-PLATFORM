import { emptyBagPicks } from "../../emptyBagPicks";
import { isLiveBook } from "../../liveBook";
import { quickAddChoice } from "../../buyable";

export const NOT_FOUND_PICKS = 4;

/**
 * The products a missing page offers (plan "Starters on par", step 7): published, on sale now and in stock, featured first
 * then newest, the same order an empty bag's suggestions use, so the pick never depends on the order the catalog loaded in.
 */
export function notFoundPicks<T extends { id: string; status?: string }>(books: T[] | null | undefined, count = NOT_FOUND_PICKS): T[] {
  const live = (books || []).filter((b) => b.status === "published" && isLiveBook(b as any) && quickAddChoice(b).inStock);
  return emptyBagPicks(live, count);
}

/** Where the missing page's search box sends a shopper: the shop page, filtered by their words. */
export function notFoundSearchPath(words: string): string {
  const q = words.trim();
  return q ? `/collections/all?q=${encodeURIComponent(q)}` : "/collections/all";
}
