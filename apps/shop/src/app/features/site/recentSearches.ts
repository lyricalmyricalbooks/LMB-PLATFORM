// "Recent searches" in the search pop-up: the last few things this shopper looked for, kept only in
// this browser (localStorage) and never sent anywhere. Pure list rules are separate from storage.

export const RECENT_SEARCHES_KEY = "lm:recent-searches";
export const MAX_RECENT_SEARCHES = 5;
const MAX_TERM = 60;

export const addRecentSearch = (list: string[], term: string): string[] => {
  const t = String(term ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TERM);
  if (t.length < 2) return list;
  const lower = t.toLowerCase();
  return [t, ...list.filter(x => x.toLowerCase() !== lower)].slice(0, MAX_RECENT_SEARCHES);
};

export const readRecentSearches = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
};

export const writeRecentSearches = (list: string[]): void => {
  try {
    if (list.length) localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {}
};
