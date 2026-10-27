import type { CSSProperties } from "react";

// The "sold out" mark on book photos (shop grid, wishlist, product page). One component so every
// surface follows Studio › Style › Product cards & grid › Sold-out badge:
//   soldOutBadgeStyle    tag (default) · stamp · band · classic (the old small box)
//   soldOutBadgeBg       badge / stamp ink colour (empty = the look's own colour)
//   soldOutBadgeText     badge text colour (empty = the look's own colour)
//   soldOutBadgeSize     text size in px (0 = automatic)
//   soldOutBadgePosition corner for tag/classic: top-left · top-right · bottom-left · bottom-right
//   soldOutPhotoFade     how much the photo is greyed/dimmed, 0–90 % (empty = the look's default)
// The words come from `soldOutLabel` (Style › Badges & shop labels › Sold-out text).

export type SoldOutLook = "tag" | "stamp" | "band" | "classic";
export const SOLD_OUT_LOOKS: SoldOutLook[] = ["tag", "stamp", "band", "classic"];

export function soldOutLook(design: any): SoldOutLook {
  const v = design?.soldOutBadgeStyle;
  return SOLD_OUT_LOOKS.includes(v) ? v : "tag";
}

const DEFAULT_FADE: Record<SoldOutLook, number> = { tag: 35, stamp: 60, band: 55, classic: 0 };

/** 0–0.9: how much the photo of a sold-out book is knocked back. */
export function soldOutFade(design: any): number {
  const raw = design?.soldOutPhotoFade;
  const n = raw === undefined || raw === null || raw === "" ? DEFAULT_FADE[soldOutLook(design)] : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(90, n)) / 100 : 0;
}

/** Style for the <img> of a sold-out book (empty when the photo is left alone). */
export function soldOutPhotoStyle(design: any): CSSProperties {
  const f = soldOutFade(design);
  if (!f) return {};
  return { filter: `grayscale(${Math.min(1, f * 1.4).toFixed(2)})`, opacity: +(1 - f * 0.75).toFixed(2) };
}

function corner(design: any): CSSProperties {
  const p = String(design?.soldOutBadgePosition || "top-left");
  const inset = 0;
  return {
    ...(p.startsWith("bottom") ? { bottom: inset } : { top: inset }),
    ...(p.endsWith("right") ? { right: inset } : { left: inset }),
  };
}

const size = (design: any, auto: number, scale = 1) => {
  const n = Number(design?.soldOutBadgeSize);
  return Number.isFinite(n) && n > 0 ? n : Math.round(auto * scale);
};

/**
 * Absolutely positioned sold-out mark; place it inside the (relative) photo frame.
 * `scale` lets a big product-page photo carry a bigger mark than a grid card.
 */
export function SoldOutBadge({ design, label, scale = 1 }: { design: any; label: string; scale?: number }) {
  const look = soldOutLook(design);
  const bg = design?.soldOutBadgeBg;
  const fg = design?.soldOutBadgeText;
  const common = {
    "data-studio-target": "style:products",
    "data-studio-label": "Sold-out badge",
  } as any;

  if (look === "stamp") {
    const ink = bg || "var(--accent, #e8402a)";
    return (
      <div className="fm-soldout fm-soldout-stamp absolute inset-0 grid place-items-center pointer-events-none" {...common}>
        <span
          className="uppercase"
          style={{
            fontFamily: "var(--heading-font, 'Anton', Impact, sans-serif)",
            fontSize: size(design, 26, scale),
            lineHeight: 1,
            letterSpacing: "0.08em",
            color: fg || ink,
            border: `3px solid ${ink}`,
            outline: `1.5px solid ${ink}`,
            outlineOffset: 3,
            padding: "0.28em 0.55em 0.22em",
            transform: "rotate(-12deg)",
            backgroundColor: "rgba(var(--accent-rgb, 232, 64, 42), 0.08)",
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  if (look === "band") {
    return (
      <div className="fm-soldout fm-soldout-band absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none" {...common}>
        <span
          className="block text-center uppercase"
          style={{
            fontFamily: "'DM Mono', ui-monospace, monospace",
            fontSize: size(design, 12, scale),
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "0.42em",
            color: fg || "var(--fg, #f4f1ec)",
            backgroundColor: bg || "var(--bg-color, #0b0b0a)",
            borderTop: `2px solid ${fg || "var(--fg, #f4f1ec)"}`,
            borderBottom: `2px solid ${fg || "var(--fg, #f4f1ec)"}`,
            padding: "1.15em 0 1.05em",
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  if (look === "classic") {
    return (
      <span
        className="fm-soldout fm-soldout-classic absolute m-3 text-[8px] tracking-widest px-2 py-1 uppercase border border-white/20"
        style={{
          ...corner(design),
          backgroundColor: bg || design?.badgeBgSecondary || "var(--badge-bg-secondary, #e0e0e0)",
          color: fg || design?.badgeTextSecondary || "var(--badge-text-secondary, #000000)",
          ...(Number(design?.soldOutBadgeSize) > 0 ? { fontSize: Number(design.soldOutBadgeSize) } : {}),
        }}
        {...common}
      >
        {label}
      </span>
    );
  }

  // tag (default)
  return (
    <span
      className="fm-soldout fm-soldout-tag absolute uppercase pointer-events-none"
      style={{
        ...corner(design),
        fontFamily: "var(--heading-font, 'Anton', Impact, sans-serif)",
        fontSize: size(design, 14, scale),
        lineHeight: 1,
        letterSpacing: "0.12em",
        color: fg || "var(--on-accent, #100f0d)",
        backgroundColor: bg || "var(--accent, #e8402a)",
        padding: "0.65em 0.85em 0.58em",
        boxShadow: "4px 4px 0 var(--fg, #f4f1ec)",
      }}
      {...common}
    >
      {label}
    </span>
  );
}

/**
 * A layer that greys and dims whatever photo sits underneath it, for surfaces whose <img> is animated
 * (product page) or shared, so its own opacity can't be touched. Same amount as soldOutPhotoStyle.
 */
export function SoldOutVeil({ design }: { design: any }) {
  const f = soldOutFade(design);
  if (!f) return null;
  return (
    <div
      className="fm-soldout-veil absolute inset-0 pointer-events-none"
      style={{
        backdropFilter: `grayscale(${Math.min(1, f * 1.4).toFixed(2)})`,
        WebkitBackdropFilter: `grayscale(${Math.min(1, f * 1.4).toFixed(2)})`,
        backgroundColor: `rgba(var(--overlay-rgb, 0, 0, 0), ${(f * 0.75).toFixed(2)})`,
      }}
    />
  );
}
