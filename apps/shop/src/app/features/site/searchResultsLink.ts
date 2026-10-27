// "See all results" from the search pop-up opens the shop's All view with the typed words filled in.
// The shop page reads them back from ?q= (pure helpers so both sides agree).

export const MAX_SEARCH_QUERY = 100;

export const searchResultsPath = (query: string): string =>
  `/collections/all?q=${encodeURIComponent(String(query ?? "").trim().slice(0, MAX_SEARCH_QUERY))}`;

export const queryFromSearch = (search: string): string => {
  try {
    return (new URLSearchParams(search).get("q") || "").trim().slice(0, MAX_SEARCH_QUERY);
  } catch {
    return "";
  }
};
