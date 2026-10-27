import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Check, X } from "lucide-react";
import type { AddedLine } from "../../CartContext";
import { getCopy } from "./storeCopy";
import { ADDED_NOTICE_CSS, addedNoticeSeconds, noticeAllowedOn } from "./addedNotice";
import { cartDrawerCss } from "./cartDrawerStyle";

// Studio › Style › Cart drawer (shopping bag) › After adding a book › "Show a small notice" (off by
// default). Rendered by the bag drawer, which owns the bag's look; words: Text & labels › Cart.
export function AddedToBagNotice({ design, added, count, onDismiss, onViewBag, formatPrice }: {
  design: any;
  added: AddedLine | null | undefined;
  count: number;
  onDismiss: () => void;
  onViewBag: () => void;
  formatPrice: (amount: number) => string;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [paused, setPaused] = useState(false);
  const firstPath = useRef(pathname);

  // Moving to another page (Buy it now goes straight to checkout) closes the notice.
  useEffect(() => {
    if (!added) return;
    firstPath.current = pathname;
  }, [added?.at]);
  useEffect(() => {
    if (added && pathname !== firstPath.current) onDismiss();
  }, [pathname]);

  // Closes itself after the chosen seconds, but never while the pointer or keyboard focus is on it.
  const seconds = addedNoticeSeconds(design);
  useEffect(() => {
    if (!added || paused || seconds === 0) return;
    const timer = window.setTimeout(onDismiss, seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [added?.at, paused, seconds]);

  if (!added || !noticeAllowedOn(pathname)) return null;
  const { item, quantity } = added;
  const close = String(getCopy(design, "cartAddedClose") ?? "");
  return (
    <section
      className="fm-bag fm-bag-notice"
      data-fm-store
      data-side={design?.cartDrawerSide === "left" ? "left" : "right"}
      aria-label={String(getCopy(design, "cartAddedTitle") ?? "") || undefined}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false); }}
      onKeyDown={(e) => { if (e.key === "Escape") onDismiss(); }}
      data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Added-to-bag notice"
    >
      <style>{cartDrawerCss(design)}</style>
      <style>{ADDED_NOTICE_CSS}</style>
      <div className="fm-bag-notice-head">
        <p className="fm-bag-meta" role="status" data-studio-copy="cartAddedTitle">
          <Check size={12} strokeWidth={3} aria-hidden="true" /> {getCopy(design, "cartAddedTitle")}
        </p>
        <button type="button" className="fm-bag-close" onClick={onDismiss} aria-label={close || undefined}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="fm-bag-notice-row">
        <div className="fm-bag-thumb">
          {item.photoUrl && <img src={item.photoUrl} alt="" decoding="async" className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="fm-bag-name max-md:[overflow-wrap:anywhere]">{item.title}</p>
          {item.variantName && <p className="fm-bag-meta">{item.variantName}</p>}
          <p className="fm-bag-meta">
            {getCopy(design, "cartAddedQty", { count: quantity })} · <span translate="no">{formatPrice(item.price * quantity)}</span>
          </p>
        </div>
      </div>
      <div className="fm-bag-notice-actions">
        <button type="button" className="fm-bag-cta" onClick={() => { onDismiss(); onViewBag(); }}>
          {getCopy(design, "cartAddedViewBag", { count })}
        </button>
        <button type="button" className="fm-bag-cta" onClick={() => { onDismiss(); navigate("/checkout"); }}>
          {getCopy(design, "cartAddedCheckout")}
        </button>
        <button type="button" className="fm-bag-notice-link fm-bag-meta" onClick={onDismiss}>
          {getCopy(design, "cartAddedContinue")}
        </button>
      </div>
    </section>
  );
}
