import { useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { useCart } from "../../CartContext";
import { useCurrency } from "../../CurrencyContext";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { quickAddChoice } from "./buyable";
import { getCopy } from "./storeCopy";
import { placeholderImage } from "./constants";
import { photoSrcSet } from "./photoSources";
import { framingStyle } from "./photoFraming";
import { PhotoToneDefs } from "./PhotoToneDefs";

/** Plain-text blurb from a book's description (which may hold HTML), cut on a word. */
export function quickViewBlurb(description: unknown, max = 320): string {
  const text = String(description ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40))}…`;
}

/** A book that needs an edition, extra or amount chosen first is bought on its own page. */
export function quickViewNeedsChoice(book: any): boolean {
  return (Array.isArray(book?.variants) && book.variants.length > 1)
    || (Array.isArray(book?.addOns) && book.addOns.length > 0)
    || book?.productType === "giftCard"
    || (Array.isArray(book?.bundleItems) && book.bundleItems.length > 0);
}

/**
 * Shopify-style "Quick view": a pop-up on a shop card with the photo, price, a short blurb and
 * Add to bag. Switched on by Studio › Style › Book cards › Quick view (`showQuickView`, off by default).
 */
export function QuickView({ book, design, onClose }: { book: any; design: any; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { addToCart } = useCart();
  const { formatBookPrice } = useCurrency();
  useFocusTrap(ref, true, onClose);
  const slug = book.slug || book.id;
  const choice = quickAddChoice(book);
  const needsChoice = quickViewNeedsChoice(book);
  const canBuy = choice.inStock && !needsChoice;
  const photo = book.photos?.[0];
  const blurb = quickViewBlurb(book.description);
  const title = getCopy(design, "quickViewAria", { title: book.title });
  const viewer = (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-studio-target="style:products|copy:Catalog & empty states"
        data-studio-label="Quick view"
        className="fm-surface fm-quick-view relative w-full max-w-3xl max-h-[90vh] overflow-auto border border-white/10 grid md:grid-cols-2"
        style={{ color: "rgb(var(--fg-rgb, 255, 255, 255))" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={getCopy(design, "quickViewClose")}
          className="absolute top-2 right-2 z-10 w-10 h-10 flex items-center justify-center border border-white/20 bg-black/40"
        >
          <X size={16} />
        </button>
        <div className="relative aspect-[3/4] md:aspect-auto md:min-h-[24rem] overflow-hidden">
          <img
            src={photo?.url || placeholderImage(design)}
            {...photoSrcSet(photo, "(min-width: 768px) 384px, 90vw")}
            alt={book.title}
            className="absolute inset-0 w-full h-full object-cover"
            style={framingStyle(photo)}
          />
          <PhotoToneDefs photo={photo} />
        </div>
        <div className="p-6 flex flex-col gap-4">
          <h2 className="text-xl font-black tracking-tight leading-tight pr-10">{book.title}</h2>
          <p translate="no" className="font-mono text-base font-bold">{formatBookPrice(book)}</p>
          {blurb && <p className="text-sm leading-relaxed text-white/70">{blurb}</p>}
          <div className="mt-auto flex flex-col gap-2">
            {canBuy && (
              <button
                type="button"
                data-autofocus
                onClick={() => {
                  if (addToCart(book, choice.variant)) onClose();
                  else toast.error(getCopy(design, "addToBagFailed"));
                }}
                className="fm-active min-h-[44px] text-[10px] font-bold tracking-[0.2em] uppercase"
              >
                {getCopy(design, "quickAddButton")}
              </button>
            )}
            <Link
              to={`/books/${slug}`}
              onClick={onClose}
              className="min-h-[44px] flex items-center justify-center text-[10px] font-bold tracking-[0.2em] uppercase border border-current"
            >
              {getCopy(design, needsChoice ? "quickAddChoose" : "quickViewDetails")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(<div data-fm-store style={{ display: "contents" }}>{viewer}</div>, document.body);
}
