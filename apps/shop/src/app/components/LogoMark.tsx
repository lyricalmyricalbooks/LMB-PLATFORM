import type React from "react";
import { getCopy } from "../features/site/storeCopy";
// ──────────────────────────────
// Brand logo (image, tinted image, or wordmark text)
//
// Reads logo styling from the theme design object:
//   - logoUrl    : uploaded logo image
//   - logoTint   : recolor the image with logoColor (best for single-color logos)
//   - logoColor  : color applied to the wordmark text, or the tinted image
//   - logoText   : wordmark text shown when no image is uploaded
//   - logoHeight : rendered height in px (clamped 20–64)
// ──────────────────────────────
// Second-word styling shared by the header wordmark and footer brand: an explicit
// colour (wordmarkSecondaryColor) wins; otherwise it is dimmed unless the toggle is off.
export function wordmarkSecondaryStyle(design: any, dim = 0.6): React.CSSProperties | undefined {
  const color = design?.wordmarkSecondaryColor;
  if (color) return { color };
  return design?.wordmarkSecondaryMuted === false ? undefined : { opacity: dim };
}

/**
 * Colour the wordmark turns while it is pointed at, pressed or focused — Studio › Style ›
 * Logo & wordmark › "Wordmark color when pointed at or clicked" (`logoHoverColor`); empty = the
 * site's link hover colour. Emitted by StorefrontOverrides on every storefront surface.
 */
export function logoHoverCss(design: any): string {
  const color = design?.logoHoverColor || "var(--link-hover-color, var(--accent))";
  const on = [":hover", ":active", ":focus-visible"].flatMap((s) => [`a${s} .fm-logo`, `button${s} .fm-logo`]);
  return `.fm-logo,.fm-logo span{transition:color .15s ease,background-color .15s ease;}`
    + `${on.join(",")},${on.map((x) => `${x} span`).join(",")}{color:${color}!important;}`
    + `${on.map((x) => `${x}-tint`).join(",")}{background-color:${color}!important;}`;
}

export function LogoMark({ design, defaultText = "F✶M" }: { design?: any; defaultText?: string }) {
  const height = Math.max(20, Math.min(64, design?.logoHeight ?? 24));
  const logoColor = design?.logoColor;
  const text = design?.logoText ?? defaultText;

  // Two-part wordmark ("Lyricalmyrical Books"): both words share the same
  // size and (heading) font; the second word can be muted.
  if (design?.wordmarkStyle === "two-part") {
    const size = design?.wordmarkSize ?? 1.75;
    const weight = design?.wordmarkWeight ?? 600;
    return (
      <span
        className="fm-logo flex items-baseline gap-2 whitespace-nowrap normal-case"
        style={{
          ...((design?.wordmarkFont || design?.headingFont) ? { fontFamily: `'${design.wordmarkFont || design.headingFont}', serif` } : {}),
          fontSize: `min(${size}rem, 6vw)`, // shrinks on phones so the header never overflows
          fontWeight: weight,
          letterSpacing: "-0.01em",
          lineHeight: 1,
          ...(logoColor ? { color: logoColor } : {}),
        }}
      >
        <span data-studio-style-text="wordmarkPrimary">{design?.wordmarkPrimary ?? "Lyricalmyrical"}</span>
        <span data-studio-style-text="wordmarkSecondary" style={wordmarkSecondaryStyle(design, 0.56)}>
          {design?.wordmarkSecondary ?? "Books"}
        </span>
      </span>
    );
  }

  if (design?.logoUrl) {
    // Recolor (tint) a single-color / transparent logo with the theme's logo color.
    if (design?.logoTint) {
      const maskUrl = `url("${design.logoUrl}")`;
      return (
        <span
          className="fm-logo fm-logo-tint"
          aria-label={getCopy(design, "logoAlt")}
          style={{
            display: "inline-block",
            height,
            backgroundColor: logoColor || "currentColor",
            WebkitMaskImage: maskUrl,
            maskImage: maskUrl,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskPosition: "left center",
            maskPosition: "left center",
          }}
        >
          {/* Invisible image sizes the span to the logo's natural aspect ratio */}
          <img src={design.logoUrl} alt="" aria-hidden className="object-contain" style={{ height, opacity: 0 }} />
        </span>
      );
    }
    return <img src={design.logoUrl} alt={getCopy(design, "logoAlt")} className="object-contain" style={{ height }} />;
  }

  return <span className="fm-logo" data-studio-style-text="logoText" style={logoColor ? { color: logoColor } : undefined}>{text}</span>;
}

export default LogoMark;
