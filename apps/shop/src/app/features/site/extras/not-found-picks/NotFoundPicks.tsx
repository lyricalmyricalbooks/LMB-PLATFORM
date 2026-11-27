// A search box and a few products under a missing page's message (see feature.ts). Display only.
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Search } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import { smallPhotoUrl } from "../../photoSources";
import { productHref } from "../../../../lib/productHref";
import { useCurrency } from "../../../../CurrencyContext";
import { catalogUnitPrice } from "../../../../CartContext";
import { quickAddChoice } from "../../buyable";
import { notFoundPicks, notFoundSearchPath } from "./pickRules";

export function NotFoundPicks({ design, books }: { design: any; books?: any[] }) {
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const id = useId();
  const [words, setWords] = useState("");
  const showSearch = design?.showNotFoundSearch === true;
  const picks = design?.showNotFoundProducts === true ? notFoundPicks(books) : [];
  if (!showSearch && !picks.length) return null;
  return (
    <div className="w-full max-w-5xl flex flex-col items-center gap-12 pt-4 pb-16">
      {showSearch && (
        <form
          {...regionProps("notFoundSearch")}
          role="search"
          className="fm-notfound-search w-full max-w-md flex items-stretch gap-2"
          onSubmit={(event) => { event.preventDefault(); navigate(notFoundSearchPath(words)); }}
        >
          <label htmlFor={`${id}-q`} className="sr-only">{getCopy(design, "notFoundSearchLabel")}</label>
          <input
            id={`${id}-q`}
            type="search"
            value={words}
            onChange={(event) => setWords(event.target.value)}
            placeholder={getCopy(design, "notFoundSearchLabel")}
            className="flex-1 min-w-0 min-h-[48px] px-4 bg-transparent border"
            style={{ borderColor: "var(--border-color, currentColor)", borderRadius: "var(--btn-radius, 0px)" }}
          />
          <button type="submit" className="fm-btn min-h-[48px] px-5 inline-flex items-center gap-2" style={{ background: "var(--btn-bg, var(--accent))", color: "var(--btn-text, var(--on-accent))", borderRadius: "var(--btn-radius, 0px)" }}>
            <Search size={16} aria-hidden="true" />
            {getCopy(design, "notFoundSearchButton")}
          </button>
        </form>
      )}
      {picks.length > 0 && (
        <section {...regionProps("notFoundProducts")} aria-labelledby={`${id}-picks`} className="w-full flex flex-col gap-6">
          <h2 id={`${id}-picks`} className="text-center text-lg">{getCopy(design, "notFoundPicksHeading")}</h2>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
            {picks.map((book) => (
              <li key={book.id}>
                <Link to={productHref(book.slug)} className="fm-card group flex flex-col gap-3">
                  <span className="block aspect-[4/5] overflow-hidden" style={{ background: "var(--surface, transparent)" }}>
                    {book.photos?.[0] && <img loading="lazy" decoding="async" src={smallPhotoUrl(book.photos[0])} alt="" className="w-full h-full object-cover" />}
                  </span>
                  <span className="fm-card-title block">{book.title}</span>
                  <span className="fm-card-price block opacity-80" translate="no">{formatPrice(catalogUnitPrice(book, quickAddChoice(book).variant))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
