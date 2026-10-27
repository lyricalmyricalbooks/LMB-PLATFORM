import { useEffect, useRef, useState } from "react";
import { cardRating, starStates, type CardRating } from "./cardRating";

// Star rating under a shop card (Studio › Style › Book cards in the shop grid › showCardRating, off by default).
// The count is asked for only once the card comes near the screen (one Firestore read per book, kept five minutes),
// so a long grid never reads every book's reviews up front. Books with no approved reviews show nothing.
export default function CardRatingStars({ bookId, label, countText }: {
  bookId: string;
  /** Read-aloud sentence, already filled with the average and count by the caller's copy. */
  label: (rating: CardRating) => string;
  countText: (rating: CardRating) => string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [rating, setRating] = useState<CardRating | null>(null);
  useEffect(() => {
    const el = anchor.current;
    if (!el || !bookId) return;
    let live = true;
    const load = () => {
      import("../../lib/reviews")
        .then(({ reviewsApi }) => reviewsApi.cardSummary(bookId))
        .then(summary => { if (live) setRating(cardRating(summary)); }, () => {});
    };
    if (typeof IntersectionObserver === "undefined") { load(); return () => { live = false; }; }
    const watcher = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { watcher.disconnect(); load(); }
    }, { rootMargin: "300px 0px" });
    watcher.observe(el);
    return () => { live = false; watcher.disconnect(); };
  }, [bookId]);
  if (!rating) return <span ref={anchor} hidden />;
  return (
    <p ref={anchor as any} className="fm-card-rating mt-1.5 flex items-center gap-1 text-xs leading-none text-white/70" translate="no">
      <span className="sr-only">{label(rating)}</span>
      <span aria-hidden="true" className="fm-card-rating-stars tracking-tight" style={{ color: "var(--accent, currentColor)" }}>
        {starStates(rating.stars).map((state, i) => (
          <span key={i} data-star={state} style={state === "half" ? { opacity: 0.6 } : state === "empty" ? { opacity: 0.25 } : undefined}>★</span>
        ))}
      </span>
      <span aria-hidden="true" className="fm-card-rating-count">{countText(rating)}</span>
    </p>
  );
}
