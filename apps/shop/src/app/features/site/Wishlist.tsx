import { isLiveBook } from "./liveBook";
import { displayPrice } from "./displayPrice";
import { regionProps } from "./storefrontRegions";
import { quickAddChoice } from "./buyable";
import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router";
import toast from "react-hot-toast";
import { Heart, ArrowLeft, ShoppingBag, Trash2, Share2 } from "lucide-react";
import { useWishlist } from "../../lib/wishlist";
import { useSiteData } from "./useSiteData";
import { useCart } from "../../CartContext";
import { placeholderImage } from "./constants";
import { useSEO } from "../../lib/seo";
import { useCurrency } from "../../CurrencyContext";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { getCopy } from "./storeCopy";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { SoldOutBadge, SoldOutVeil } from "./SoldOutBadge";
import { StoreChrome, useInStoreChrome } from "./StoreChrome";
import { gridPhotoSizes, photoSrcSet } from "./photoSources";
import { framingStyle } from "./photoFraming";
import { PhotoToneDefs } from "./PhotoToneDefs";
import { layerDesign } from "./designModel";
import { idsToMerge, sharedWishlistIds, wishlistShareUrl } from "./wishlistShare";

/** The wishlist, inside the one shop header and footer (Studio 2.0 · 2.1). */
export default function WishlistPage() {
  return <StoreChrome surface="wishlistPage"><WishlistContent /></StoreChrome>;
}

function WishlistContent() {
  // Under the shop header this title bar is a plain row, not a second <header>.
  const TitleBar = useInStoreChrome() ? "div" : "header";
  const { ids: ownIds, remove, addMany } = useWishlist();
  const { books, settings, loading, loadError, retry } = useSiteData();
  const { addToCart } = useCart();
  const { formatBookPrice } = useCurrency();
  const { search } = useLocation();
  // Studio › Style › Book cards in the shop grid › Wishlist share button (off by default). While it
  // is off a ?shared= link opens the shopper's own list, as before.
  const surface = "wishlistPage";
  const shareOn = layerDesign(settings?.design || {}, (settings?.design || {})[surface]).showWishlistShare === true;
  const sharedIds = useMemo(() => (shareOn ? sharedWishlistIds(search) : null), [shareOn, search]);
  const viewingShared = sharedIds !== null;
  const ids = viewingShared ? sharedIds : ownIds;

  useSEO({
    title: getCopy(settings?.design, "seoWishlistTitle"),
    description: getCopy(settings?.design, "seoWishlistDescription"),
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("preview=true")) {
      window.parent.postMessage({ type: "PREVIEW_READY" }, "*");
    }
  }, []);

  // A hearted book that was later unpublished drops off the list instead of staying buyable.
  const items = books.filter(b => ids.includes(b.id) && isLiveBook(b as any));
  const design = settings?.design;

  async function shareList() {
    const url = wishlistShareUrl(items.map(b => b.id), window.location.origin, import.meta.env.BASE_URL || "/");
    if (!url) return;
    try {
      if (navigator.share) { await navigator.share({ title: getCopy(design, "wishlistShareTitle"), url }); return; }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(getCopy(design, "wishlistShareCopied"));
    } catch {
      toast.error(getCopy(design, "wishlistShareFailed"));
    }
  }

  function addAllToBag() {
    let added = 0;
    for (const book of items) {
      const choice = quickAddChoice(book);
      if (choice.inStock && addToCart(book, choice.variant)) added += 1;
    }
    if (added) toast.success(getCopy(design, "wishlistAddAllDone", { count: added }));
    else toast.error(getCopy(design, "addToBagFailed"));
  }

  function saveShared() {
    const added = addMany(idsToMerge(ownIds, items.map(b => b.id)));
    toast.success(getCopy(design, "wishlistSaveSharedDone", { count: added }));
  }

  if (loading) {
    return (
      <div data-fm-store data-studio-target="copy:Collection & wishlist pages" data-studio-label="Wishlist page" className="min-h-screen fm-page text-white flex items-center justify-center">
        <StorefrontThemeStyle design={settings?.design} />
        <p className="text-[10px] tracking-[0.4em] text-white/40 uppercase">{getCopy(settings?.design, "pageLoading")}</p>
      </div>
    );
  }

  return (
    <div data-fm-store data-studio-target="copy:Collection & wishlist pages" data-studio-label="Wishlist page" className="min-h-screen fm-page text-white">
      <StorefrontThemeStyle design={settings?.design} />
      <TitleBar {...regionProps("wishlistHeader")} className="border-b border-white/10 px-6 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-white/50 hover:text-white uppercase">
          <ArrowLeft size={14} /> {getCopy(settings?.design, "backToCatalog")}
        </Link>
        <span {...regionProps("wishlistTitle")} className="text-[10px] tracking-[0.4em] text-white/40 uppercase">{getCopy(settings?.design, viewingShared ? "wishlistSharedTitle" : "wishlistTitle")}</span>
        <span {...regionProps("wishlistCount")} className="text-[10px] tracking-[0.4em] text-white/40 uppercase">{getCopy(settings?.design, "wishlistCount", { count: items.length })}</span>
      </TitleBar>

      {shareOn && items.length > 0 && (
        <div {...regionProps("wishlistShareBar")} className="max-w-6xl mx-auto px-6 pt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] tracking-[0.3em] text-white/50 uppercase">
            {getCopy(design, viewingShared ? "wishlistSharedNote" : "wishlistShareNote")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {viewingShared ? (
              <>
                <button type="button" onClick={saveShared} className="max-md:min-h-10 border border-white/20 px-5 py-2.5 rounded-full text-[9px] tracking-[0.3em] uppercase hover:bg-white/5 transition-colors">
                  {getCopy(design, "wishlistSaveShared")}
                </button>
                <button type="button" onClick={addAllToBag} className="max-md:min-h-10 flex items-center gap-2 fm-active px-5 py-2.5 rounded-full text-[9px] tracking-[0.3em] uppercase font-bold hover:bg-white/90 transition-colors">
                  <ShoppingBag size={11} /> {getCopy(design, "wishlistAddAll")}
                </button>
              </>
            ) : (
              <button type="button" onClick={shareList} className="max-md:min-h-10 flex items-center gap-2 border border-white/20 px-5 py-2.5 rounded-full text-[9px] tracking-[0.3em] uppercase hover:bg-white/5 transition-colors">
                <Share2 size={11} /> {getCopy(design, "wishlistShare")}
              </button>
            )}
          </div>
        </div>
      )}

      {items.length === 0 && loadError && ids.length > 0 ? (
        // The catalog read failed: an error with Try again, not a false "your wishlist is empty".
        <div {...regionProps("wishlistEmpty")} className="flex flex-col items-center justify-center py-32 gap-6 px-6 text-center">
          <p role="alert" className="text-white/50 text-xs tracking-[0.3em] uppercase">{getCopy(settings?.design, "catalogLoadError")}</p>
          <button
            type="button"
            onClick={retry}
            className="border border-white/20 px-8 py-3 rounded-full text-[10px] tracking-[0.4em] uppercase hover:bg-white/5 transition-all"
          >
            {getCopy(settings?.design, "catalogRetry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div {...regionProps("wishlistEmpty")} className="flex flex-col items-center justify-center py-32 gap-6">
          <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center">
            <Heart size={20} strokeWidth={1.4} className="text-white/40" />
          </div>
          <p className="text-white/50 text-xs tracking-[0.3em] uppercase">{getCopy(settings?.design, "wishlistEmpty")}</p>
          <Link
            to="/"
            className="border border-white/20 px-8 py-3 rounded-full text-[10px] tracking-[0.4em] uppercase hover:bg-white/5 transition-all"
          >
            {getCopy(settings?.design, "wishlistBrowse")}
          </Link>
        </div>
      ) : (
        <div {...regionProps("wishlistGrid")} data-ga-list="Wishlist" className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {items.map(book => {
            // No saved slug: link by id, which the product page also resolves.
            const slug = (book as any).slug || book.id;
            const choice = quickAddChoice(book);
            const out = !choice.inStock;
            return (
              <article key={book.id} className="fm-card group min-w-0">
                <Link to={`/books/${slug}`} className="block">
                  <div {...regionProps("wishlistPhoto")} className="relative aspect-[3/4] fm-surface rounded-2xl overflow-hidden mb-3 border border-white/[0.05]">
                    <img loading="lazy" decoding="async"
                      src={(book as any).photos?.[0]?.url || placeholderImage(settings?.design)}
                      {...photoSrcSet((book as any).photos?.[0], gridPhotoSizes([{ from: 0, cols: 2 }, { from: 768, cols: 3 }, { from: 1024, cols: 4 }], { photo: (book as any).photos?.[0], frame: "3 / 4", maxWidth: 1152 }))}
                      alt={book.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      style={framingStyle((book as any).photos?.[0])}
                    />
                    <PhotoToneDefs photo={(book as any).photos?.[0]} />
                    {/* Coming soon: the badge alone (it isn't sold out); words in Text & labels › Product page */}
                    {choice.comingSoon && (
                      <SoldOutBadge design={settings?.design} label={getCopy(settings?.design, "comingSoonBadge")} />
                    )}
                    {out && !choice.comingSoon && (
                      <>
                        <SoldOutVeil design={settings?.design} />
                        <SoldOutBadge design={settings?.design} label={getCopy(settings?.design, "soldOutLabel")} />
                      </>
                    )}
                  </div>
                  <div data-studio-target="style:products" data-studio-label="Card title & price">
                    <h3 className="fm-card-title text-[11px] tracking-widest uppercase text-white/80">{book.title}</h3>
                    {displayPrice(book) > 0 ? (
                      <p className="fm-card-price-wrap fm-card-price text-[10px] text-white/40 mt-1">{formatBookPrice(book)}</p>
                    ) : null}
                  </div>
                </Link>
                <div {...regionProps("wishlistActions")} className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => { if (!addToCart(book, choice.variant)) toast.error(getCopy(settings?.design, "addToBagFailed")); }}
                    disabled={out}
                    className="flex-1 max-md:min-h-10 flex items-center justify-center gap-2 fm-active py-2.5 rounded-full text-[9px] tracking-[0.3em] uppercase font-bold disabled:opacity-30 hover:bg-white/90 transition-all"
                  >
                    <ShoppingBag size={11} /> {getCopy(settings?.design, choice.comingSoon ? "comingSoonBadge" : "wishlistAdd")}
                  </button>
                  {!viewingShared && <button
                    onClick={() => remove(book.id)}
                    aria-label={getCopy(settings?.design, "wishlistRemoveAria")}
                    className="relative p-2.5 max-md:before:absolute max-md:before:-inset-1.5 max-md:before:content-[''] rounded-full border border-white/10 text-white/40 hover:text-rose-400 hover:border-rose-400/30 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <TemplateSections design={settings?.design} templateId="wishlistPage" books={books} />
      <GlobalSections design={settings?.design} books={books} />
    </div>
  );
}
