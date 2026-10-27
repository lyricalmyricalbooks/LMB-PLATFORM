// Product page photo frames that adapt to each photo (Studio › Style › Product page photos ›
// "Frame size"). Pure: BookDetail measures each photo once and asks here for its frame.
//  • "fixed"       — every photo uses Photo shape (today's look, the default);
//  • "orientation" — upright photos use Photo shape, wide ones use "Shape for landscape photos",
//                    near-square photos (within 8%) use a square frame;
//  • "exact"       — the frame takes each photo's own proportions, so nothing is cropped.
// A photo's shape comes from its saved width/height (set when it is uploaded, or by the photo-copy sweep), else
// from the photo once it loads; until then it uses Photo shape, so the page never waits on a download.
import { aspectRatioValue } from "./imageAspect";

export type FrameMode = "fixed" | "orientation" | "exact";

export function frameMode(value: unknown): FrameMode {
  return value === "orientation" || value === "exact" ? value : "fixed";
}

/** Width ÷ height of a loaded photo, or undefined when it can't be measured. */
export function photoRatio(width: unknown, height: unknown): number | undefined {
  const w = Number(width), h = Number(height);
  return w > 0 && h > 0 && Number.isFinite(w / h) ? w / h : undefined;
}

/** "3 / 4" → 0.75 (a frameAspect value as a number), or undefined. */
export function aspectNumber(value: string): number | undefined {
  const m = value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
  return m ? photoRatio(m[1], m[2]) : undefined;
}

export function frameAspect(mode: FrameMode, ratio: number | undefined, portraitAspect: string, landscapeShape: unknown): string {
  if (mode === "fixed" || ratio === undefined) return portraitAspect;
  if (mode === "exact") {
    const clamped = Math.min(4, Math.max(0.25, ratio)); // keep strips and needles inside the layout
    return `${Math.round(clamped * 1000)} / 1000`;
  }
  if (ratio > 1.08) return aspectRatioValue(landscapeShape, "3 / 2");
  if (ratio >= 0.92) return "1 / 1";
  return portraitAspect;
}
