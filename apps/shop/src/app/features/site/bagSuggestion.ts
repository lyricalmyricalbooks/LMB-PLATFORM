// The bag's "Complete your collection" card shows one book a day: the same book for every shopper on a
// Toronto calendar day, a different one the next day. Pure, so it can be tested without a browser.
import { shopDayKey } from "../../lib/shopDay";

const DAY = 86_400_000;

/** Whole days since 1970 for a Toronto day key ("2026-10-21"). */
const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY);

/**
 * Today's book from `candidates` (books that can be added right now). Books sharing a category with the bag
 * are preferred when there are any. Candidates are ordered by id first, so the pick does not depend on the
 * order the catalog happened to load in.
 */
export function dailyBagSuggestion<T extends { id: string; categories?: string[] }>(
  candidates: T[],
  bagCategories: Set<string>,
  now: number = Date.now(),
): T | undefined {
  const related = candidates.filter((b) => b.categories?.some((cat) => bagCategories.has(cat)));
  const pool = (related.length ? related : candidates).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!pool.length) return undefined;
  const n = dayNumber(shopDayKey(now));
  return pool[((n % pool.length) + pool.length) % pool.length];
}
