import type { CSSProperties } from "react";
import { designNumber } from "./designNumber";

// The short messages that pop up for a moment ("Removed from your bag · Undo", "Link copied", an add-to-bag
// problem, account sign-in notices). Studio › Theme settings › Site-wide design › Short notice messages sets
// where they appear and how they look; with nothing set they look exactly as they always have.

export type ToastPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

const POSITIONS: ToastPosition[] = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

export function toastPosition(design: any): ToastPosition {
  const p = design?.toastPosition || "top-center";
  return (POSITIONS as string[]).includes(p) ? (p as ToastPosition) : "top-center";
}

export function toastStyle(design: any): CSSProperties {
  const d = design || {};
  const borderWidth = designNumber(d, "toastBorderWidth", 0);
  return {
    background: d.toastBg || "var(--surface-2, #171717)",
    color: d.toastTextColor || "var(--text-color, #fff)",
    fontSize: `${designNumber(d, "toastFontSize", 12)}px`,
    letterSpacing: `${designNumber(d, "toastTracking", 0.05)}em`,
    borderRadius: `${designNumber(d, "toastRadius", 8)}px`,
    maxWidth: `${designNumber(d, "toastMaxWidth", 350)}px`,
    ...(borderWidth > 0 ? { border: `${borderWidth}px solid ${d.toastBorderColor || "currentColor"}` } : {}),
    zIndex: 99999,
  };
}
