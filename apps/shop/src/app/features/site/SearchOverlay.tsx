import { isLiveBook } from "./liveBook";
import { searchScore } from "./bookSearch";
import { searchResultsPath } from "./searchResultsLink";
import { displayPrice } from "./displayPrice";
import { regionProps } from "./storefrontRegions";
import { addRecentSearch, readRecentSearches, writeRecentSearches } from "./recentSearches";
import { artistCounts, creditLine, markMatches, matchingArtists, matchingCategories, newestBooks, stockState, visibleCategoryCounts, type CategoryCount, type StockState } from "./searchPanel";
import { bookFormats } from "./CatalogControls";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { m, AnimatePresence } from "motion/react";
import { useCurrency } from "../../CurrencyContext";
import { designNumber } from "./designNumber";
import { getCopy } from "./storeCopy";
import { funnelApi } from "../../lib/commerce";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { gridPhotoSizes, photoSrcSet, smallPhotoUrl } from "./photoSources";

type Book = any;

const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function bookSlug(b: Book) {
  return b.slug || slugify(b.title || "");
}

const collectionPath = (name: string) => `/collections/${slugify(name)}`;

// The shop's poster face for the typing line and the no-results heading (Style › Typography › heading font).
const DISPLAY_FONT = "var(--heading-font, 'Anton', Impact, sans-serif)";
const STOCK_COLOR: Record<StockState, string> = {
  in: "var(--success, #3ddc97)",
  low: "var(--warning, #ffc93c)",
  preorder: "var(--accent, #e8402a)",
  soon: "var(--accent, #e8402a)",
  out: "rgba(var(--fg-rgb, 255, 255, 255), 0.4)",
};
const STOCK_COPY: Record<StockState, string> = {
  in: "searchStockIn", low: "searchStockLow", preorder: "searchStockPreorder", soon: "searchStockSoon", out: "searchStockOut",
};

/** Text with the typed words marked in the accent colour. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {markMatches(text, query).map((part, i) =>
        part.mark ? (
          <mark key={i} className="fm-search-mark" style={{ background: "none", color: "var(--accent, #e8402a)", fontWeight: 700 }}>{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

// New in the shop: 2 columns on phones, 4 on wider screens, then 4 inside the wide left column (about 44% of the drawer).
const NEW_IN_SIZES = gridPhotoSizes([{ from: 0, cols: 2 }, { from: 640, cols: 4 }, { from: 768, cols: 9 }], { frame: "3 / 4" });
const capClass = "font-mono text-[10.5px] tracking-[0.2em] uppercase text-white/40";
const chipClass = "border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white hover:text-white";
const linkRowClass = "flex items-baseline justify-between gap-3 border-b border-white/10 py-2 text-[15px] text-white hover:text-white";

function Column({ heading, count, children, attrs }: { heading: string; count?: number; children: ReactNode; attrs?: Record<string, string> }) {
  return (
    <div {...attrs} className="fm-search-col grid min-w-0 content-start gap-3 px-5 py-5 md:px-7 md:pb-6">
      <h3 className={`${capClass} m-0 flex items-baseline justify-between`}>
        <span>{heading}</span>
        {count !== undefined && <span>{count}</span>}
      </h3>
      {children}
    </div>
  );
}

export function SearchOverlay({
  open,
  onClose,
  books,
  design,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  books: Book[];
  design?: any;
  /** Shop categories (Studio › Menus › Shop categories) for Browse and the Categories column. */
  categories?: any[];
}) {
  const c = (key: string, vars?: Record<string, string | number>) => getCopy(design, key, vars);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const showRecent = design?.showRecentSearches !== false && recent.length > 0;
  // Remember a search only once the shopper acts on it (opens a result or "see all"); never in the Studio preview.
  const remember = () => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true") return;
    if (window.self !== window.top) return;
    writeRecentSearches(addRecentSearch(readRecentSearches(), query));
  };
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { formatBookPrice } = useCurrency();
  // aria-modal: keep Tab inside the dialog and hand focus back to the search button on close.
  useFocusTrap(dialogRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setQuery("");
    else setRecent(readRecentSearches());
  }, [open]);
  useEffect(() => setActive(0), [query]);

  // Only books shoppers can open and buy (no drafts, archived or not-yet-released titles).
  const liveBooks = useMemo(() => (books || []).filter(b => isLiveBook(b as any)), [books]);
  const trimmed = query.trim();

  const { results, totalMatches } = useMemo(() => {
    if (!trimmed) return { results: [] as any[], totalMatches: 0 };
    const ranked = liveBooks
      .map(b => ({ book: b, s: searchScore(b, trimmed) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return {
      results: ranked.slice(0, Math.max(1, designNumber(design, "searchResultLimit", 8))).map(x => x.book),
      totalMatches: ranked.length,
    };
  }, [trimmed, liveBooks, design]);
  // Counted once per catalog while the drawer is open; each keystroke only filters these lists by name.
  const allArtists = useMemo(() => (open ? artistCounts(liveBooks) : []), [open, liveBooks]);
  const allCategories = useMemo(() => (open ? visibleCategoryCounts(categories || [], liveBooks) : []), [open, categories, liveBooks]);
  const artists = useMemo(() => (trimmed ? matchingArtists(allArtists, trimmed, limitOf(design, "searchArtistLimit", 6)) : []), [trimmed, allArtists, design]);
  const catMatches = useMemo(() => (trimmed ? matchingCategories(allCategories, trimmed, limitOf(design, "searchCategoryLimit", 6)) : []), [trimmed, allCategories, design]);
  const browse = trimmed ? [] : allCategories;
  const newIn = useMemo(() => (open && !trimmed ? newestBooks(liveBooks, limitOf(design, "searchNewInCount", 4)) : []), [open, trimmed, liveBooks, design]);
  const nothingFound = !!trimmed && !results.length && !artists.length && !catMatches.length;
  const showSeeAll = design?.showSearchSeeAll !== false && totalMatches > 0;
  // A catalog refresh can shorten the list without a new query: keep the highlighted row inside it.
  useEffect(() => { setActive(i => (i >= results.length ? Math.max(0, results.length - 1) : i)); }, [results.length]);

  // Once shoppers stop typing, note what they looked for and whether it found anything (never stored with a name).
  useEffect(() => {
    if (!open || !trimmed) return;
    const t = setTimeout(() => { funnelApi.trackSearch(query, results.length); }, 1200);
    return () => clearTimeout(t);
  }, [open, query, trimmed, results.length]);

  const suggestions = useMemo(() => {
    const raw = typeof design?.searchSuggestions === "string" ? design.searchSuggestions : "";
    return [...new Set(raw.split(/[,\n]/).map((t: string) => t.trim()).filter(Boolean))].slice(0, 12) as string[];
  }, [design?.searchSuggestions]);

  const lowAt = designNumber(design, "lowStockCardThreshold", 5);
  const pick = (term: string) => { setQuery(term); inputRef.current?.focus(); };
  // Books sold in editions list their editions' formats; "Other" (a "Signed" edition, say) says nothing, so it is left out.
  const formatWords = (b: Book) => {
    const own = String(b?.format || "").trim();
    const hasEditions = Array.isArray(b?.variants) && b.variants.length > 0;
    if (own && !hasEditions) return own;
    const words = bookFormats(b).filter(k => k !== "other").map(k => c(`filterFormat_${k}`));
    return words.length ? words.join(" / ") : own;
  };
  const coverBox = (b: Book, width: number, className: string, sizes?: string) => {
    const photo = smallPhotoUrl(b.photos?.[0], width) || b.coverPhoto?.url || "";
    return (
      <span {...regionProps("searchPhoto")} className={`block aspect-[3/4] overflow-hidden border-2 border-white fm-surface-2 ${className}`}>
        {photo && <img src={photo} {...(sizes ? photoSrcSet(b.photos?.[0], sizes) : {})} alt={b.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
      </span>
    );
  };
  const close = () => { remember(); onClose(); };

  const chips = (terms: string[]) => (
    <div className="flex flex-wrap gap-2">
      {terms.map(term => (
        <button key={term} type="button" onClick={() => pick(term)} className={chipClass}>{term}</button>
      ))}
    </div>
  );

  let body: ReactNode;
  if (!trimmed) {
    const third = showRecent || suggestions.length > 0;
    // Only the columns that have something to show share the width (New in the shop is the wide one).
    const template = [newIn.length > 0 && "1.6fr", browse.length > 0 && "1fr", third && "1fr"].filter(Boolean).join(" ") || "1fr";
    body = (
      <div className="fm-search-cols grid md:grid-cols-[var(--fm-search-cols)] md:divide-x divide-white/10 max-md:divide-y" style={{ ["--fm-search-cols" as any]: template }}>
        {newIn.length > 0 && (
          <Column heading={c("searchNewInLabel")} attrs={regionProps("searchNewIn")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {newIn.map(b => (
                <Link key={b.id} to={`/books/${bookSlug(b)}`} onClick={onClose} className="fm-card grid content-start gap-1.5 text-white">
                  {coverBox(b, 240, "w-full", NEW_IN_SIZES)}
                  <span className="fm-card-title text-xs leading-snug" data-studio-target="style:products" data-studio-label="Card title & price">{b.title}</span>
                  {displayPrice(b) > 0 && (
                    <span translate="no" className="fm-card-price-wrap fm-card-price font-mono text-[11px] text-white/60" data-studio-target="style:products" data-studio-label="Card title & price">{formatBookPrice(b)}</span>
                  )}
                </Link>
              ))}
            </div>
          </Column>
        )}
        {browse.length > 0 && (
          <Column heading={c("searchBrowseLabel")} attrs={regionProps("searchBrowse")}>
            <div>
              {browse.map(cat => (
                <Link key={cat.category.id} to={collectionPath(cat.name)} onClick={onClose} className={`${linkRowClass} ${cat.child ? "pl-4" : ""}`}>
                  <span className="min-w-0 truncate">{cat.name}</span>
                  <span className="font-mono text-[11px] text-white/40">{cat.count}</span>
                </Link>
              ))}
            </div>
          </Column>
        )}
        {third && (
          <div className="fm-search-col grid min-w-0 content-start gap-5 px-5 py-5 md:px-7 md:pb-6">
            {showRecent && (
              <div {...regionProps("searchRecent")} className="grid gap-3">
                <h3 className={`${capClass} m-0 flex items-baseline justify-between gap-3`}>
                  <span>{c("searchRecentLabel")}</span>
                  <button
                    type="button"
                    onClick={() => { writeRecentSearches([]); setRecent([]); inputRef.current?.focus(); }}
                    className="border border-white/20 px-2 py-0.5 font-mono text-[10.5px] tracking-[0.12em] text-white/60 hover:border-white hover:text-white"
                  >
                    {c("searchRecentClear")}
                  </button>
                </h3>
                {chips(recent)}
              </div>
            )}
            {suggestions.length > 0 && (
              <div {...regionProps("searchSuggestions")} className="grid gap-3">
                <h3 className={`${capClass} m-0`}>{c("searchSuggestionsLabel")}</h3>
                {chips(suggestions)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  } else if (nothingFound) {
    body = (
      <div {...regionProps("searchEmpty")} className="grid max-w-[60ch] gap-3.5 px-5 py-8 md:px-7 md:py-10">
        <p className="m-0 text-3xl uppercase leading-none text-white md:text-[34px]" style={{ fontFamily: DISPLAY_FONT, fontWeight: 400 }}>
          {c("searchNoResults", { query: trimmed })}
        </p>
        <p className="m-0 text-sm text-white/60">{c("searchNoResultsHint")}</p>
        <NoResultsTry counts={allCategories} limit={limitOf(design, "searchTryLimit", 8)} heading={c("searchTryLabel")} onPick={onClose} />
      </div>
    );
  } else {
    body = (
      <>
        <div className="fm-search-cols grid md:grid-cols-[1.6fr_1fr_1fr] md:divide-x divide-white/10 max-md:divide-y">
          <Column heading={c("searchBooksLabel")} count={totalMatches}>
            {results.length === 0 && <p className="m-0 text-[13px] text-white/40">{c("searchNoBooks")}</p>}
            <div id="fm-search-results" role="listbox" data-ga-list="Search results" className="grid" hidden={results.length === 0}>
              {results.map((b, idx) => {
                const price = displayPrice(b);
                const stock = stockState(b, lowAt);
                const credit = creditLine(b);
                const format = formatWords(b);
                return (
                  <Link {...regionProps("searchResult")}
                    key={b.id}
                    id={`fm-search-opt-${b.id}`}
                    role="option"
                    aria-selected={idx === active}
                    to={`/books/${bookSlug(b)}`}
                    onClick={close}
                    onMouseEnter={() => setActive(idx)}
                    className={`-mx-2 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3.5 border-2 p-2 text-white ${idx === active ? "border-white bg-white/5" : ""}`}
                    style={idx === active ? undefined : { borderColor: "transparent" }}
                  >
                    {coverBox(b, 96, "w-11")}
                    <span className="min-w-0">
                      <span className="fm-card-title block truncate text-[15px] font-bold leading-tight" data-studio-target="style:products" data-studio-label="Card title & price"><Marked text={b.title || ""} query={trimmed} /></span>
                      <span className="block truncate text-xs text-white/60">
                        {credit && <span {...regionProps("searchAuthor")}><Marked text={credit} query={trimmed} /></span>}
                        {credit && format && " · "}
                        {format}
                        {(credit || format) && " · "}
                        <span {...regionProps("searchStock")} style={{ color: STOCK_COLOR[stock.state] }}>{c(STOCK_COPY[stock.state], { count: stock.count })}</span>
                      </span>
                    </span>
                    {price > 0 ? (
                      <span translate="no" className="fm-card-price-wrap fm-card-price font-mono text-xs text-white/60" data-studio-target="style:products" data-studio-label="Card title & price">
                        {formatBookPrice(b)}
                      </span>
                    ) : <span />}
                  </Link>
                );
              })}
            </div>
          </Column>
          <Column heading={c("searchArtistsLabel")} count={artists.length} attrs={regionProps("searchArtists")}>
            {artists.length === 0 ? <p className="m-0 text-[13px] text-white/40">{c("searchNoArtists")}</p> : (
              <div>
                {artists.map(a => (
                  <Link key={a.name} to={searchResultsPath(a.name)} onClick={close} className={linkRowClass}>
                    <span className="min-w-0 truncate"><Marked text={a.name} query={trimmed} /></span>
                    <span className="flex-none font-mono text-[11px] text-white/40">{a.count === 1 ? c("searchArtistBook") : c("searchArtistBooks", { count: a.count })}</span>
                  </Link>
                ))}
              </div>
            )}
          </Column>
          <Column heading={c("searchCategoriesLabel")} count={catMatches.length} attrs={regionProps("searchCategories")}>
            {catMatches.length === 0 ? <p className="m-0 text-[13px] text-white/40">{c("searchNoCategories")}</p> : (
              <div>
                {catMatches.map(cat => (
                  <Link key={cat.category.id} to={collectionPath(cat.name)} onClick={close} className={linkRowClass}>
                    <span className="min-w-0 truncate"><Marked text={cat.name} query={trimmed} /></span>
                    <span className="flex-none font-mono text-[11px] text-white/40">{cat.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </Column>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10 px-5 py-3 font-mono text-[11px] text-white/40 md:px-7">
          <span {...regionProps("searchKeys")} className="fm-search-keys max-md:hidden">
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> {c("searchKeyMove")} · <Kbd>{c("searchKeyEnter")}</Kbd> {c("searchKeyOpen")} · <Kbd>{c("searchKeyEsc")}</Kbd> {c("searchKeyClose")}
          </span>
          {showSeeAll && (
            <Link {...regionProps("searchSeeAll")}
              to={searchResultsPath(query)}
              onClick={close}
              className="ml-auto border-b-2 pb-px uppercase tracking-[0.12em] text-white"
              style={{ borderColor: "var(--accent, #e8402a)" }}
            >
              {c("searchSeeAll", { count: totalMatches, query: trimmed })}
            </Link>
          )}
        </div>
      </>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm"
          onClick={onClose}
          ref={dialogRef}
          role="dialog"
          data-studio-target="copy:Search & filters" data-studio-label="Search overlay"
          aria-modal="true"
          aria-label={c("searchDialogAria")}
        >
          <m.div {...regionProps("searchPanel")}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fm-search-drawer absolute inset-x-0 top-0 overflow-y-auto border-b-2 border-white text-white max-md:bottom-0 md:max-h-[88vh]"
            style={{ background: "var(--bg-color, #000)", boxShadow: "0 6px 0 var(--accent, #e8402a)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Phones floor input text at max(16px, 1em) (index.css), so the row carries the typing line's phone size. */}
            <div className="flex items-center gap-4 border-b border-white/10 px-4 py-4 text-[26px] md:px-7 md:py-5 md:text-base">
              <span {...regionProps("searchPrompt")} className={`${capClass} flex-none max-md:hidden`}>{c("searchPrompt")}</span>
              <input {...regionProps("searchField")}
                ref={inputRef}
                data-autofocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls={results.length > 0 ? "fm-search-results" : undefined}
                aria-activedescendant={results[active] ? `fm-search-opt-${results[active].id}` : undefined}
                onKeyDown={e => {
                  // No book matched: Enter follows the first artist or category, or opens the full results page.
                  if (!results.length) {
                    if (e.key !== "Enter" || !trimmed) return;
                    e.preventDefault();
                    const to = artists[0] ? searchResultsPath(artists[0].name) : catMatches[0] ? collectionPath(catMatches[0].name) : searchResultsPath(trimmed);
                    remember(); navigate(to); onClose();
                    return;
                  }
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => (i + 1) % results.length); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => (i - 1 + results.length) % results.length); }
                  else if (e.key === "Enter") {
                    e.preventDefault();
                    const hit = results[Math.min(active, results.length - 1)];
                    if (hit) { remember(); navigate(`/books/${bookSlug(hit)}`); onClose(); }
                  }
                }}
                placeholder={c("searchPlaceholder")}
                className="fm-search-input min-w-0 flex-1 bg-transparent text-[26px] uppercase leading-tight text-white outline-none placeholder:text-[var(--muted)] md:text-[clamp(28px,4.4vw,52px)]"
                style={{ fontFamily: DISPLAY_FONT, fontWeight: 400, caretColor: "var(--accent, #e8402a)" }}
              />
              <button {...regionProps("searchClose")}
                type="button"
                onClick={onClose}
                aria-label={c("searchCloseAria")}
                className="flex-none border-2 border-white px-2.5 py-1.5 font-mono text-[11px] tracking-[0.14em] text-white hover:bg-white/10 max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center max-md:text-base"
              >
                <span className="max-md:hidden">{c("searchCloseLabel")} </span><span aria-hidden="true">✕</span>
              </button>
            </div>
            {body}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** A list length from Studio › Style (Search pop-up numbers): whole, at least 1. */
function limitOf(design: any, key: string, fallback: number): number {
  return Math.max(1, Math.round(designNumber(design, key, fallback)));
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="border border-white/20 px-1.5 py-px font-mono text-[10.5px] text-white/60">{children}</kbd>;
}

/** No results: the shop's categories as chips to try instead. */
function NoResultsTry({ counts, limit, heading, onPick }: { counts: CategoryCount[]; limit: number; heading: string; onPick: () => void }) {
  // The shelves themselves: PUBLICATIONS (every book) only when nothing else has books.
  const filled = counts.filter(cat => cat.count > 0);
  const shelves = filled.filter(cat => cat.name !== "PUBLICATIONS");
  const cats = (shelves.length ? shelves : filled).slice(0, limit);
  if (!cats.length) return null;
  return (
    <div {...regionProps("searchTry")} className="grid gap-3">
      <span className={capClass}>{heading}</span>
      <div className="flex flex-wrap gap-2">
        {cats.map(cat => (
          <Link key={cat.category.id} to={collectionPath(cat.name)} onClick={onPick} className={chipClass}>{cat.name}</Link>
        ))}
      </div>
    </div>
  );
}
