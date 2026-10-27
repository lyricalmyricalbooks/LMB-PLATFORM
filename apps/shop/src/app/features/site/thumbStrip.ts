// Book page thumbnail strip that fills its box edge to edge (Studio › Style › Book page · photos & layout ›
// "Stretch thumbnails to fill the width"). Pure: ThumbStrip measures the strip and asks here how many
// thumbnails go on a row and how big each one is. Without a measurement (prerendered HTML, a strip beside the
// photo on a computer) it answers null and the strip keeps its fixed-size look.

export type ThumbLastRow = "stretch" | "left" | "center";

export function thumbLastRow(value: unknown): ThumbLastRow {
  return value === "left" || value === "center" ? value : "stretch";
}

export type ThumbLayoutInput = {
  count: number;      // thumbnails in the strip
  width: number;      // the strip's inner width in px
  size: number;       // Style › Thumbnail size (the smallest a thumbnail should get when columns are automatic)
  gap: number;        // Style › Gap between thumbnails
  perRow: number;     // Style › Thumbnails per row (0 = automatic)
  wrap: boolean;      // Style › Thumbnails on several rows
  ratio: number;      // thumbnail width ÷ height
};

export type ThumbLayout = { cols: number; cellWidth: number; cellHeight: number };

export function thumbLayout({ count, width, size, gap, perRow, wrap, ratio }: ThumbLayoutInput): ThumbLayout | null {
  if (!(count > 0) || !(width > 0) || !(ratio > 0)) return null;
  const g = Math.max(0, gap || 0);
  const fit = Math.max(1, Math.floor((width + g) / (Math.max(1, size) + g)));
  let cols: number;
  if (perRow > 0) cols = Math.min(count, Math.round(perRow));
  else if (!wrap) cols = Math.min(count, fit); // one line: the visible thumbnails fill it, the rest scroll
  else {
    // Several rows: as few rows as the size allows, then the columns are balanced so the last row is as
    // full as it can be (14 photos that fit 8 a row → 7 + 7, not 8 + 6).
    const rows = Math.ceil(count / fit);
    cols = Math.ceil(count / rows);
  }
  const cellWidth = (width - (cols - 1) * g) / cols;
  if (!(cellWidth > 0)) return null;
  return { cols, cellWidth, cellHeight: cellWidth / ratio };
}
