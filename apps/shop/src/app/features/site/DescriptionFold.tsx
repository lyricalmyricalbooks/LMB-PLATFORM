import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { getCopy } from "./storeCopy";
import { descriptionFoldOn, foldLines, mightOverflow, overflows } from "./descriptionFold";

// Wraps a book description: with Studio › Style › Book page · photos & layout › "Read more" for long descriptions on
// (pdpDescriptionFold, off by default) a long text shows its first lines, fading out, and a Read more / Show less
// button. Off = the children exactly as before. Words: Text & labels › Product page (`pdpDescriptionMore/Less`).
export default function DescriptionFold({ design, look, text, children }: { design: any; look: any; text: unknown; children: ReactNode }) {
  const on = descriptionFoldOn(look);
  const lines = foldLines(look);
  const [open, setOpen] = useState(false);
  // null = not measured yet (use the guess); false = it fits, so no fold at all.
  const [fits, setFits] = useState<boolean | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const guess = on && mightOverflow(text, lines);

  useEffect(() => { setOpen(false); setFits(null); }, [text, lines, on]);

  useEffect(() => {
    const el = boxRef.current;
    if (!guess || open || fits === false || !el) return;
    const measure = () => {
      const result = overflows(el.scrollHeight, el.clientHeight);
      if (result === false) setFits(false);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // A description inside a closed accordion or tab is 0 high: measure again once it is shown.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [guess, open, fits]);

  if (!guess || fits === false) return <>{children}</>;
  const folded = !open;
  const fade = "linear-gradient(to bottom, rgba(var(--fg-rgb, 0, 0, 0), 1) 55%, rgba(var(--fg-rgb, 0, 0, 0), 0))";
  return (
    <>
      <div
        ref={boxRef}
        id={id}
        className="fm-pdp-desc-fold"
        data-folded={folded ? "true" : "false"}
        style={folded ? { maxHeight: `calc(${lines} * 1lh)`, overflow: "hidden", WebkitMaskImage: fade, maskImage: fade } : undefined}
      >
        {children}
      </div>
      <button
        type="button"
        className="fm-pdp-desc-more fm-pdp-meta underline underline-offset-2 mt-2"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {getCopy(design, open ? "pdpDescriptionLess" : "pdpDescriptionMore")}
      </button>
    </>
  );
}
