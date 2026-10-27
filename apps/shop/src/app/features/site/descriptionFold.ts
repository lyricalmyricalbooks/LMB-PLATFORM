// "Read more" fold for long book descriptions (Studio › Style › Book page · photos & layout › Extras on the page ›
// pdpDescriptionFold, off by default). Pure rules; the component is DescriptionFold.tsx. The whole text always stays
// in the page (search engines and screen readers read it); only its height is limited until the shopper opens it.

export const FOLD_LINES_DEFAULT = 8;

/** Lines shown while folded: Studio's `pdpDescriptionFoldLines`, 3–40, default 8. */
export function foldLines(design: any): number {
  const n = Number(design?.pdpDescriptionFoldLines);
  if (!Number.isFinite(n) || n <= 0) return FOLD_LINES_DEFAULT;
  return Math.max(3, Math.min(40, Math.round(n)));
}

/** True when the switch is on. */
export function descriptionFoldOn(design: any): boolean {
  return design?.pdpDescriptionFold === true;
}

/**
 * A first guess, before the page can measure, at whether `text` runs past `lines` lines. It counts each paragraph at
 * a phone's ~40 characters a line, so it errs towards folding; once drawn, the real height decides (`overflows`).
 */
export function mightOverflow(text: unknown, lines: number, charsPerLine = 40): boolean {
  if (typeof text !== "string" || !text.trim()) return false;
  let count = 0;
  for (const para of text.split("\n")) {
    count += Math.max(1, Math.ceil(para.trim().length / charsPerLine));
    if (count > lines) return true;
  }
  return false;
}

/** After drawing: the folded box hides something (2 px slack for rounding). A hidden box (0 high) can't tell. */
export function overflows(scrollHeight: number, clientHeight: number): boolean | null {
  if (!(clientHeight > 0)) return null;
  return scrollHeight > clientHeight + 2;
}
