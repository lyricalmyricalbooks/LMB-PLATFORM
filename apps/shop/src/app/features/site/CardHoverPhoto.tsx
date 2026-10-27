import { useEffect, useRef, useState } from "react";
import { photoSrcSet } from "./photoSources";
import { PhotoToneDefs } from "./PhotoToneDefs";
import { framingStyle } from "./photoFraming";

// The second photo on a shop card, faded in while a mouse is over the card or the card's link has focus
// (Studio › Style › Book cards in the shop grid › showCardHoverPhoto). Storage downloads are billed, so the
// photo is fetched only once the shopper first points at (or tabs to) that card, never for every card shown.
// Touch screens never see it: a tap opens the book. No alt text: the cover under it already names the book.
export default function CardHoverPhoto({ photo, sizes, className, focal }: {
  photo: { url: string };
  sizes: string;
  className?: string;
  /** The grid's focal point for photos with no crop of their own. */
  focal?: { x: number; y: number };
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (armed) return;
    const card = anchor.current?.closest(".fm-card");
    if (!card) return;
    const onPointer = (e: Event) => { if ((e as PointerEvent).pointerType === "mouse") setArmed(true); };
    const onFocus = () => setArmed(true);
    card.addEventListener("pointerenter", onPointer);
    card.addEventListener("focusin", onFocus);
    return () => {
      card.removeEventListener("pointerenter", onPointer);
      card.removeEventListener("focusin", onFocus);
    };
  }, [armed]);
  if (!armed) return <span ref={anchor} hidden />;
  return (
    <>
      <img
        src={photo.url}
        {...photoSrcSet(photo, sizes)}
        alt=""
        aria-hidden="true"
        data-fm-hover-photo=""
        decoding="async"
        className={`fm-card-hover-photo absolute inset-0 w-full h-full opacity-0 pointer-fine:group-hover:opacity-100 group-focus-within:opacity-100 ${className || ""}`}
        style={framingStyle(photo, focal)}
      />
      <PhotoToneDefs photo={photo} />
    </>
  );
}
