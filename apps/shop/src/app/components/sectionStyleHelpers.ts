// ─────────────────────────────────────────────────────────────────────────────
// Shared section-level "visual effects & micro-interactions" helpers.
//
// These are pure functions (no JSX) that resolve optional section.settings
// keys into real CSS/style values. Both the theme editor's settings UI
// (ThemeEditorExtensions.tsx, for the option lists in <select>s) and the
// storefront renderers (SectionComponents.tsx / sectionRender.tsx, for
// applying the actual styles) import from here so there's a single source of
// truth for the option → value mapping.
//
// Every key here is optional/additive: `undefined` (or "none"/"" where noted)
// means "off / inherit", and all existing sections keep working unchanged if
// these keys are absent from `settings`.
// ─────────────────────────────────────────────────────────────────────────────

export type OptionItem = { value: string; label: string };

// ── Box shadow ──────────────────────────────────────────────────────────────

export const BOX_SHADOW_LEVELS: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
};

export const BOX_SHADOW_OPTIONS: OptionItem[] = [
  { value: "", label: "— Inherit —" },
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
  { value: "2xl", label: "2XL" },
];

export function boxShadowValue(level?: string): string | undefined {
  if (!level) return undefined;
  return BOX_SHADOW_LEVELS[level];
}

// ── Corner radius ───────────────────────────────────────────────────────────

export const CORNER_RADIUS_LEVELS: Record<string, number> = {
  square: 0,
  sm: 4,
  md: 12,
  lg: 24,
  xl: 40,
  full: 9999,
};

export const CORNER_RADIUS_OPTIONS: OptionItem[] = [
  { value: "", label: "— Inherit —" },
  { value: "square", label: "Square" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
  { value: "full", label: "Pill / full" },
];

export function cornerRadiusValue(level?: string): string | undefined {
  if (!level) return undefined;
  const px = CORNER_RADIUS_LEVELS[level];
  return px == null ? undefined : `${px}px`;
}

// ── Backdrop blur ───────────────────────────────────────────────────────────

export const BACKDROP_BLUR_LEVELS: Record<string, number> = {
  none: 0,
  light: 4,
  medium: 10,
  strong: 20,
};

export const BACKDROP_BLUR_OPTIONS: OptionItem[] = [
  { value: "", label: "— Inherit —" },
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

export function backdropBlurValue(level?: string): string | undefined {
  if (!level || level === "none") return undefined;
  const px = BACKDROP_BLUR_LEVELS[level];
  return px ? `blur(${px}px)` : undefined;
}

// ── Hover effects ───────────────────────────────────────────────────────────

export const HOVER_EFFECTS: OptionItem[] = [
  { value: "", label: "— Inherit —" },
  { value: "none", label: "None" },
  { value: "float", label: "Float (lift up)" },
  { value: "scale", label: "Scale up" },
  { value: "glow", label: "Glow" },
];

/** Tailwind transition className for a given hover effect (float/scale). Glow is handled separately via hoverEffectGlowStyle + a scoped <style> block. */
export function hoverEffectClassName(effect?: string): string {
  switch (effect) {
    case "float":
      return "transition-all duration-300 ease-out hover:-translate-y-2";
    case "scale":
      return "transition-transform duration-300 ease-out hover:scale-105";
    case "glow":
      return "transition-shadow duration-300 ease-out fm-hover-glow";
    default:
      return "";
  }
}

/**
 * Returns a CSS custom property carrying the glow color, plus the scoped CSS
 * rule (keyed by a unique className) needed to apply a box-shadow glow on
 * `:hover` — kept this way (rather than inline styles) because inline styles
 * can't express `:hover` pseudo-state.
 */
export function hoverEffectGlowStyle(effect: string | undefined, accentColor?: string): Record<string, any> {
  if (effect !== "glow") return {};
  return { ["--glow-color" as any]: accentColor || "#A855F7" };
}

/** Scoped CSS for the `.fm-hover-glow` utility class — render once via a <style> tag (see ShapeDivider/SectionScopedCss pattern). */
export const HOVER_GLOW_CSS = `.fm-hover-glow:hover{box-shadow:0 0 0 1px var(--glow-color, #A855F7), 0 0 32px 4px var(--glow-color, #A855F7);}`;

// ── Shape dividers ──────────────────────────────────────────────────────────

export const SHAPE_DIVIDER_STYLES: OptionItem[] = [
  { value: "none", label: "None" },
  { value: "slope", label: "Slope" },
  { value: "curve", label: "Curve" },
  { value: "wave", label: "Wave" },
];

/**
 * Procedural SVG path for a section-transition shape divider. viewBox is a
 * fixed 0 0 1440 100 convention; `position` flips the path vertically so the
 * same style reads correctly at the top vs. bottom edge of a section.
 */
export function shapeDividerSvgPath(style: "slope" | "curve" | "wave", position: "top" | "bottom" = "bottom"): string {
  const flip = position === "top";
  // Each path fills the bottom (or top, when flipped) of the 1440x100 box.
  if (style === "slope") {
    return flip ? "M0,100 L1440,0 L1440,100 L0,100 Z" : "M0,0 L1440,100 L1440,100 L0,100 Z";
  }
  if (style === "curve") {
    return flip
      ? "M0,100 Q720,0 1440,100 L1440,0 L0,0 Z"
      : "M0,0 Q720,100 1440,0 L1440,100 L0,100 Z";
  }
  // wave — a gentle double curve (sine-like)
  if (flip) {
    return "M0,60 C 240,0 480,100 720,50 C 960,0 1200,100 1440,40 L1440,0 L0,0 Z";
  }
  return "M0,40 C 240,100 480,0 720,50 C 960,100 1200,0 1440,60 L1440,100 L0,100 Z";
}

// ── Text gradient ────────────────────────────────────────────────────────────

export function textGradientStyle(from?: string, to?: string, angle?: number): Record<string, any> {
  if (!from || !to) return {};
  return {
    background: `linear-gradient(${angle ?? 90}deg, ${from}, ${to})`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    color: "transparent",
  };
}

// ── Image styling (focal point, object-fit, filter presets, overlay, hover zoom) ─
//
// These apply to every `kind: "image"` field across the editor. Per-field
// companion settings are stored under sibling keys named `${field.key}__suffix`
// (e.g. a field with key "imageUrl" has style keys "imageUrl__fit",
// "imageUrl__focalX", "imageUrl__focalY", "imageUrl__filter",
// "imageUrl__overlayColor", "imageUrl__overlayOpacity", "imageUrl__hoverZoom").
// All optional/additive — absent keys mean "default browser behavior".

export const IMAGE_FILTER_PRESETS: OptionItem[] = [
  { value: "none", label: "None" },
  { value: "grayscale", label: "Grayscale" },
  { value: "blur", label: "Blur" },
  { value: "darken", label: "Darken" },
  { value: "grayscale-darken", label: "Grayscale + darken" },
];

/** Returns a CSS `filter` string for a preset, or undefined for "none"/unset. */
export function imageFilterCss(preset?: string): string | undefined {
  switch (preset) {
    case "grayscale":
      return "grayscale(100%)";
    case "blur":
      return "blur(4px)";
    case "darken":
      return "brightness(50%)";
    case "grayscale-darken":
      return "grayscale(100%) brightness(50%)";
    default:
      return undefined;
  }
}

/** Returns a CSS `object-position` value like "30% 70%" from focal percentages (default "50% 50%"). */
export function imageObjectPositionFromFocal(focalX?: number, focalY?: number): string {
  const x = Math.max(0, Math.min(100, focalX ?? 50));
  const y = Math.max(0, Math.min(100, focalY ?? 50));
  return `${x}% ${y}%`;
}

// Font choices offered for per-section overrides (matches the editor's core set).
export const SECTION_FONT_OPTIONS = [
  "Inter", "Outfit", "DM Sans", "Montserrat", "Syne", "Fraunces",
  "Cormorant", "Playfair Display", "Lora", "EB Garamond", "Space Mono", "Bebas Neue",
];

export const SECTION_ANIMATIONS = [
  { value: "", label: "Inherit (default)" },
  { value: "none", label: "None" },
  { value: "fade-up", label: "Fade up" },
  { value: "fade", label: "Fade in" },
  { value: "slide-left", label: "Slide from right" },
  { value: "slide-right", label: "Slide from left" },
  { value: "zoom", label: "Zoom in" },
];
