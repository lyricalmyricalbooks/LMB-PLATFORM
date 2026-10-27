import { backgroundImageValue } from "../features/site/backgroundSources";
import { m, useMotionValue, useSpring } from "motion/react";
import { quickAddChoice } from "../features/site/buyable";
import { displayPrice, showsSale } from "../features/site/displayPrice";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Send, ChevronLeft, ChevronRight, MapPin, Clock } from "lucide-react";
import { useCurrency } from "../CurrencyContext";
import { useCart } from "../CartContext";
import { resolveStaffNoteRows } from "../features/site/staffNotes";
import { textGradientStyle, hoverEffectClassName, hoverEffectGlowStyle, imageFilterCss, imageObjectPositionFromFocal } from "./sectionStyleHelpers";
import { resolveSharedBlocks } from "../features/site/sharedBlocks";
import { UP_TO } from "../features/site/breakpoints";
import { fb } from "./sectionFallbacks";
import { submitContactMessage } from "../features/site/contactMessages";
import { useSectionCopy, useSectionDesign, useSectionPage } from "./sectionCopy";
import { isEmailAddress, subscribeNewsletter } from "../features/site/newsletterSignup";
import { slugify } from "../features/site/storeMenu";
import { pickBook, sectionBookQuery, selectBooks } from "../features/site/merchandising";
import { aspectRatioValue } from "../features/site/imageAspect";
import { ResponsiveImage } from "./ResponsiveImage";
import { mediaKey } from "../features/site/mediaRef";
import { gridPhotoSizes, photoSrcSet, FEATURE_PHOTO_SIZES, smallPhotoUrl } from "../features/site/photoSources";
import { framingStyle } from "../features/site/photoFraming";
import { PhotoToneDefs } from "../features/site/PhotoToneDefs";
import { shopInstant } from "../features/site/shopTime";

// ──────────────────────────────
// Animation helper
// ──────────────────────────────

function AnimationContainer({ children, enabled, delay = 0, className }: any) {
  if (!enabled) return children;
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, delay, ease: [0.215, 0.61, 0.355, 1] }}
    >
      {children}
    </m.div>
  );
}

// Blocks can be hidden from the editor's outline tree without deleting them.
function visibleBlocks(list: any[]): any[] {
  return (list || []).filter((b: any) => !b?.hidden);
}

function blockEditAttrs(block: any, idx: number) {
  const id = block?.id || `block-${idx}`;
  return { "data-fm-block": id, "data-block-id": id };
}

/** Rotate / size / see-through for one block at one screen size (3.0 phase 3), or nothing when unset. */
export function compositionLook(look: any): { transform?: string; opacity?: number } {
  const n = (v: any, lo: number, hi: number) => { const x = Number(v); return v === "" || v == null || !Number.isFinite(x) ? null : Math.max(lo, Math.min(hi, x)); };
  const rotate = n(look?.rotate, -45, 45), scale = n(look?.scale, 50, 150), opacity = n(look?.opacity, 10, 100);
  const parts = [rotate ? `rotate(${rotate}deg)` : "", scale != null && scale !== 100 ? `scale(${scale / 100})` : ""].filter(Boolean);
  return { ...(parts.length ? { transform: parts.join(" ") } : {}), ...(opacity != null && opacity !== 100 ? { opacity: opacity / 100 } : {}) };
}

function compositionResponsiveStyle(block: any): Record<string, any> {
  const desktop = block.grid?.desktop || {};
  return {
    ...compositionLook(block.responsive?.desktop),
    gridColumn: desktop.column ? `${desktop.column} / span ${desktop.span || 4}` : undefined,
    gridRow: desktop.row ? `${desktop.row} / span ${desktop.rowSpan || 1}` : undefined,
    zIndex: desktop.z || undefined,
    textAlign: block.responsive?.desktop?.align || undefined,
  };
}

function compositionBreakpointCss(blocks: any[], sectionId: string) {
  const safe = (value: any) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const rules: string[] = [];
  const walk = (items: any[]) => (items || []).forEach(block => {
    const id = safe(block.id); if (!id) return;
    for (const [device, query] of [["tablet", UP_TO.tablet], ["mobile", UP_TO.mobile]] as const) {
      const grid = block.grid?.[device] || {}, responsive = block.responsive?.[device] || {};
      // !important: the desktop placement is an inline style, which would otherwise beat these rules.
      const body = [
        grid.column ? `grid-column:${grid.column} / span ${grid.span || 4}` : "",
        grid.row ? `grid-row:${grid.row} / span ${grid.rowSpan || 1}` : "",
        grid.z != null ? `z-index:${grid.z}` : "",
        responsive.align ? `text-align:${responsive.align}` : "",
        responsive.hidden ? "display:none" : "",
        ...Object.entries(compositionLook(responsive)).map(([k, v]) => `${k}:${v}`),
      ].filter(Boolean).map(rule => `${rule}!important`).join(";");
      if (body) rules.push(`@media ${query}{#section-${safe(sectionId)} [data-fm-block="${id}"]{${body}}}`);
    }
    walk(block.children || []);
  });
  walk(blocks); return rules.join("\n");
}

function CompositionBlock({ block, index = 0, depth = 0 }: any) {
  if (block.hidden || depth >= 3) return null;
  const attrs = blockEditAttrs(block, index);
  const style = compositionResponsiveStyle(block);
  if (block.type === "group") return (
    <div {...attrs} className="fm-composition-group" style={style}>
      {(block.children || []).map((child: any, i: number) => <CompositionBlock key={child.id || i} block={child} index={i} depth={depth + 1} />)}
    </div>
  );
  if (block.type === "image") return <figure {...attrs} className="fm-composition-block" style={style}>
    {block.imageUrl && <ResponsiveImage src={block.imageUrl} media={block[mediaKey("imageUrl")]} sizes="(min-width: 768px) 50vw, 100vw" alt={block.alt || ""} loading="lazy" className="w-full h-auto object-cover" />}
    {block.title && <figcaption data-theme-field="title">{block.title}</figcaption>}
  </figure>;
  if (block.type === "button") return <div {...attrs} className="fm-composition-block" style={style}><a href={siteHref(block.url)} className="inline-flex min-h-11 items-center border border-current px-5 py-3 font-bold" data-theme-field="text">{block.text || fb("CompositionSection.block.text")}</a></div>;
  return <div {...attrs} className="fm-composition-block space-y-3" style={style}>
    {block.title && <h3 className="text-2xl font-bold" data-theme-field="title">{block.title}</h3>}
    {block.body && <p className="leading-relaxed" data-theme-field="body">{block.body}</p>}
    {(block.children || []).map((child: any, i: number) => <CompositionBlock key={child.id || i} block={child} index={i} depth={depth + 1} />)}
  </div>;
}

export function CompositionSection({ settings }: any) {
  const blocks = resolveSharedBlocks(settings.items || settings.blocks || [], settings.__sharedBlocks || []);
  const columns = Math.max(1, Math.min(24, Number(settings.gridColumns) || 12));
  const breakpointCss = compositionBreakpointCss(blocks, settings.__sectionId);
  return <section style={bgStyle(settings)}>
    {breakpointCss && <style>{breakpointCss}</style>}
    <div className={`py-16 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
      {settings.title && <h2 className="text-3xl font-bold mb-8" style={hStyle(settings)} data-theme-field="title">{settings.title}</h2>}
      <div className="fm-composition-grid" data-studio-gap="gridGap" data-studio-gap-property="gap" style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: `${settings.gridGap ?? 24}px` }}>
        {blocks.map((block: any, index: number) => <CompositionBlock key={block.id || index} block={block} index={index} />)}
      </div>
    </div>
  </section>;
}

// ──────────────────────────────
// Per-section style helpers
// ──────────────────────────────

function hStyle(s: any) {
  return {
    ...(s.headingColor && { color: s.headingColor }),
    ...(s.headingSize && { fontSize: `${s.headingSize}px` }),
    ...(s.headingWeight && { fontWeight: s.headingWeight }),
    ...(s.textTransform && { textTransform: s.textTransform }),
    ...(s.letterSpacingOverride != null && s.letterSpacingOverride !== 0 && { letterSpacing: `${s.letterSpacingOverride}em` }),
    ...(s.lineHeightOverride != null && { lineHeight: s.lineHeightOverride }),
    // Gradient wins over solid headingColor when both are configured.
    ...textGradientStyle(s.headingGradientFrom, s.headingGradientTo),
  };
}

function bStyle(s: any) {
  return {
    ...(s.bodyColor && { color: s.bodyColor }),
    ...(s.lineHeightOverride != null && { lineHeight: s.lineHeightOverride }),
  };
}

function aClass(s: any) {
  return s.align === "left" ? "text-left" : s.align === "right" ? "text-right" : "text-center";
}

// Background: gradient > solid color > image > nothing
function bgStyle(s: any): Record<string, any> {
  if (s.bgGradientFrom && s.bgGradientTo) {
    return { background: `linear-gradient(${s.bgGradientDir || "to bottom"}, ${s.bgGradientFrom}, ${s.bgGradientTo})` };
  }
  if (s.bgColor) return { backgroundColor: s.bgColor };
  // Only one gradient end set: show it as a solid colour instead of nothing.
  if (s.bgGradientFrom || s.bgGradientTo) return { backgroundColor: s.bgGradientFrom || s.bgGradientTo };
  if (s.bgImageUrl) {
    return {
      // Library pictures read a screen-sized copy from --fm-bg-img (features/site/backgroundSources.ts).
      backgroundImage: backgroundImageValue(s),
      backgroundSize: s.bgImageSize || "cover",
      backgroundPosition: s.bgImagePosition || "center",
      backgroundRepeat: "no-repeat",
    };
  }
  return {};
}

// Spacing overrides (applied to the inner content container)
function spacingStyle(s: any) {
  return {
    ...(s.paddingTop != null && { paddingTop: `${s.paddingTop}px` }),
    ...(s.paddingBottom != null && { paddingBottom: `${s.paddingBottom}px` }),
    ...(s.paddingLeft != null && { paddingLeft: `${s.paddingLeft}px` }),
    ...(s.paddingRight != null && { paddingRight: `${s.paddingRight}px` }),
  };
}

// Container max-width: section setting (containerWidth) > content field (maxWidth) > default
const MW_MAP: Record<string, string> = {
  xs: "max-w-2xl",  narrow: "max-w-2xl",
  sm: "max-w-4xl",  normal: "max-w-4xl",
  md: "max-w-5xl",
  lg: "max-w-6xl",  wide: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-none",
};

function mw(s: any, fallback = "max-w-7xl"): string {
  return MW_MAP[s.containerWidth] || MW_MAP[s.maxWidth] || fallback;
}

// Button overrides (spread on top of default button style)
function btnS(s: any): Record<string, any> {
  const r: Record<string, any> = {};
  const st = s.btnStyle;
  if (st === "outline") {
    r.backgroundColor = "transparent";
    r.border = `1.5px solid ${s.btnBg || "currentColor"}`;
    r.color = s.btnText || s.btnBg || undefined;
  } else if (st === "ghost") {
    r.backgroundColor = "transparent";
    r.border = "none";
    r.color = s.btnText || s.btnBg || undefined;
  } else {
    if (s.btnBg) r.backgroundColor = s.btnBg;
    if (s.btnText) r.color = s.btnText;
  }
  if (s.btnRadius != null) r.borderRadius = `${s.btnRadius}px`;
  if (s.btnUppercase != null) r.textTransform = s.btnUppercase ? "uppercase" : "none";
  return r;
}

// ──────────────────────────────
// Magnetic button — small cursor-tracking spring-physics wrapper used by any
// section's primary CTA button when settings.btnMagnetic is true. Renders a
// plain <button> with zero motion overhead when `magnetic` is falsy.
// ──────────────────────────────

const MAGNETIC_SPRING = { damping: 15, stiffness: 150, mass: 0.6 };
const MAGNETIC_PULL = 0.35; // fraction of cursor offset the button translates by

function MagneticButton({ magnetic, children, className, style, onClick, ...rest }: any) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, MAGNETIC_SPRING);
  const springY = useSpring(y, MAGNETIC_SPRING);

  if (!magnetic) {
    return (
      <button className={className} style={style} onClick={onClick} {...rest}>
        {children}
      </button>
    );
  }

  const handleMouseMove = (e: any) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - (rect.left + rect.width / 2);
    const offsetY = e.clientY - (rect.top + rect.height / 2);
    x.set(offsetX * MAGNETIC_PULL);
    y.set(offsetY * MAGNETIC_PULL);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <m.button
      ref={ref}
      className={className}
      style={{ ...style, x: springX, y: springY }}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      {children}
    </m.button>
  );
}

// ──────────────────────────────
// Styled image — applies the optional per-field image style companion keys
// (`${fieldKey}__fit`, `__focalX`/`__focalY`, `__filter`, `__overlayColor`/
// `__overlayOpacity`, `__hoverZoom`) written by the editor's "Image style"
// panel (ThemeEditorExtensions.tsx `ImageStyleControls`). `settings` is
// whichever record owns the field — section settings for a section-level
// `imageUrl`, or the block/slide object for a block-level one. Renders a
// plain, behavior-preserving `<img>` (wrapped in a sizing div) when none of
// the companion keys are set.
// ──────────────────────────────

function StyledImage({ src, alt = "", settings, fieldKey, className = "", imgClassName = "", loading, decoding, fetchPriority, sizes }: any) {
  if (!src) return null;
  const s = settings || {};
  const k = (suffix: string) => `${fieldKey}__${suffix}`;
  const fit = s[k("fit")] || "cover";
  const filter = imageFilterCss(s[k("filter")]);
  const objectPosition = imageObjectPositionFromFocal(s[k("focalX")], s[k("focalY")]);
  const overlayColor = s[k("overlayColor")];
  const overlayOpacity = s[k("overlayOpacity")] ?? 0;
  const hoverZoom = !!s[k("hoverZoom")];

  return (
    <div className={`relative w-full h-full ${hoverZoom ? "group overflow-hidden" : ""} ${className}`}>
      <ResponsiveImage
        src={src}
        media={s[k("media")]}
        sizes={sizes}
        alt={alt}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        className={`w-full h-full ${hoverZoom ? "transition-transform duration-500 group-hover:scale-110" : ""} ${imgClassName}`}
        style={{ objectFit: fit, objectPosition, ...(filter ? { filter } : {}) }}
      />
      {overlayColor && overlayOpacity > 0 && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: overlayColor, opacity: overlayOpacity }} />
      )}
    </div>
  );
}

// ──────────────────────────────
// HERO
// ──────────────────────────────

export function HeroSection({ settings, onCtaClick, enableAnimations }: any) {
  const heightCls =
    settings.height === "full"
      ? "h-screen min-h-[600px]"
      : settings.height === "medium"
      ? "h-[70vh] min-h-[480px]"
      : settings.height === "small"
      ? "h-[50vh] min-h-[320px]"
      : "h-screen min-h-[600px]";

  return (
    <section
      className={`relative w-full ${heightCls} flex items-center overflow-hidden ${
        settings.align === "left" ? "justify-start" : settings.align === "right" ? "justify-end" : "justify-center"
      }`}
      style={{ backgroundColor: settings.backgroundColor || "#000", ...bgStyle(settings) }}
    >
      {settings.imageUrl && (
        <div className="absolute inset-0">
          <StyledImage src={settings.imageUrl} alt="" settings={settings} fieldKey="imageUrl" loading="eager" decoding="async" fetchPriority="high" />
        </div>
      )}
      <div className="absolute inset-0" style={{ backgroundColor: "rgb(var(--overlay-rgb))", opacity: settings.overlayOpacity ?? 0.5 }} />
      <div
        className={`relative z-10 px-6 ${mw(settings, "max-w-3xl")} ${
          settings.align === "left" ? "text-left" : settings.align === "right" ? "text-right" : "text-center"
        }`}
      >
        <AnimationContainer enabled={enableAnimations}>
          {settings.eyebrow && (
            <p
              className="text-[10px] tracking-[0.3em] font-bold uppercase mb-4"
              style={{ color: settings.eyebrowColor || settings.accentColor || "var(--accent, #e8402a)" }}
              data-theme-field="eyebrow"
            >
              {settings.eyebrow}
            </p>
          )}
          <h1
            className="text-4xl md:text-6xl font-black tracking-tight uppercase mb-6 leading-none text-white"
            style={{ ...(settings.titleItalic ? { fontStyle: "italic" } : {}), ...hStyle(settings) }}
            data-theme-field="title"
          >
            {settings.title ?? fb("HeroSection.title")}
          </h1>
          <p
            className="text-sm md:text-md tracking-[0.3em] font-medium text-white/70 uppercase mb-10"
            style={bStyle(settings)}
            data-theme-field="subtitle"
          >
            {settings.subtitle ?? fb("HeroSection.subtitle")}
          </p>
          <div className={`flex flex-wrap items-center gap-4 ${
            settings.align === "left" ? "justify-start" : settings.align === "right" ? "justify-end" : "justify-center"
          }`}>
            <MagneticButton
              magnetic={!!settings.btnMagnetic}
              onClick={() => {
                const url = settings.ctaUrl;
                if (!url) { onCtaClick?.(); return; }
                if (/^https?:\/\//i.test(url)) { window.open(url, "_blank", "noopener"); return; }
                // Site-relative URLs need the GitHub Pages sub-path prefix.
                const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
                window.location.assign(keepPreviewParam(url.startsWith("/") ? base + url : url));
              }}
              className={`px-8 py-3.5 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase ${
                settings.hoverEffect ? hoverEffectClassName(settings.hoverEffect) : "hover:scale-105 transition-transform"
              }`}
              style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #e8402a)", color: "var(--btn-text, #100f0d)", ...btnS(settings) }}
            >
              <span data-theme-field="ctaText">{settings.ctaText ?? fb("HeroSection.ctaText")}</span>
            </MagneticButton>
            {/* A second button with nowhere to go is a dead click: shoppers see it once it has a link
                (the Studio preview keeps showing it so the owner can see where to add one). */}
            {settings.secondaryCtaText && (settings.secondaryCtaUrl || inStudioPreview()) && (
              <button type="button" onClick={() => followBannerLink(settings.secondaryCtaUrl)} className="px-8 py-3.5 rounded-full border border-white/30 text-[10px] tracking-[0.3em] font-semibold uppercase hover:bg-white/10 transition-colors text-white">
                <span data-theme-field="secondaryCtaText">{settings.secondaryCtaText}</span>
              </button>
            )}
            {settings.metaText && (
              <span className="text-xs text-white/60" data-theme-field="metaText">{settings.metaText}</span>
            )}
          </div>
        </AnimationContainer>
      </div>
      {settings.sideImageUrl && (
        <div
          className="hidden lg:block absolute right-[8%] top-1/2 -translate-y-1/2 z-10 w-[280px] rounded-[2px] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.5)]"
          style={{ aspectRatio: "4 / 5", transform: "translateY(-50%) rotate(-2deg)" }}
        >
          <StyledImage src={settings.sideImageUrl} alt="" settings={settings} fieldKey="sideImageUrl" sizes="(min-width: 768px) 50vw, 100vw" loading="lazy" decoding="async" />
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────
// IMAGE BANNER
// ──────────────────────────────

const BANNER_HEIGHTS: Record<string, string> = {
  small: "min-h-[360px] md:min-h-[420px]",
  medium: "min-h-[480px] md:min-h-[560px]",
  large: "min-h-[580px] md:min-h-[720px]",
  full: "min-h-screen",
};

const BANNER_POSITIONS: Record<string, string> = {
  "top-left": "items-start justify-start",
  "top-center": "items-start justify-center",
  "top-right": "items-start justify-end",
  "center-left": "items-center justify-start",
  "center-center": "items-center justify-center",
  "center-right": "items-center justify-end",
  "bottom-left": "items-end justify-start",
  "bottom-center": "items-end justify-center",
  "bottom-right": "items-end justify-end",
};

const inStudioPreview = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true";
/** Empty sections show a "how to fill me" sample only in the Studio preview — shoppers never see sample content. */
const sampleInPreview = <T,>(items: T[], sample: T[]): T[] => (items.length ? items : inStudioPreview() ? sample : []);
const sampleHtml = (html: string | undefined, sample: string) => html || (inStudioPreview() ? sample : "");

/** Site-relative links keep ?preview=true so a Studio preview never reloads into the live design. */
/**
 * Links typed in Studio ("/page/news", "/?catalog=true") are paths within the shop,
 * which lives under a sub-path on GitHub Pages; a raw href would leave the site.
 */
function siteHref(url: string | undefined | null): string | undefined {
  // No link set: no href at all, so the button/card renders the same but isn't a dead "#" jump to the top.
  if (!url || !String(url).trim()) return undefined;
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return keepPreviewParam(base + url);
}

function keepPreviewParam(href: string) {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("preview") !== "true") return href;
  try {
    const next = new URL(href, window.location.href);
    if (next.origin !== window.location.origin) return href;
    next.searchParams.set("preview", "true");
    return next.pathname + next.search + next.hash;
  } catch { return href; }
}

function followBannerLink(url: string | undefined, fallback?: () => void) {
  if (!url) return fallback?.();
  if (/^https?:\/\//i.test(url)) return window.open(url, "_blank", "noopener");
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  window.location.assign(keepPreviewParam(url.startsWith("/") ? base + url : url));
}

export function ImageBannerSection({ settings, onCtaClick, enableAnimations }: any) {
  const position = BANNER_POSITIONS[settings.contentPosition] || BANNER_POSITIONS["center-center"];
  const textAlign = settings.textAlign || "center";
  const textAlignClass = textAlign === "left" ? "text-left" : textAlign === "right" ? "text-right" : "text-center";
  const imageAlt = settings.imageAlt || "";
  return (
    <section
      className={`relative flex overflow-hidden ${BANNER_HEIGHTS[settings.height] || BANNER_HEIGHTS.large}`}
      style={{ backgroundColor: settings.backgroundColor || "#171717" }}
    >
      {settings.imageUrl ? (
        <>
          <div className={settings.mobileImageUrl ? "absolute inset-0 hidden md:block" : "absolute inset-0"}>
            <StyledImage src={settings.imageUrl} alt={imageAlt} settings={settings} fieldKey="imageUrl" loading="lazy" decoding="async" />
          </div>
          {settings.mobileImageUrl && (
            <div className="absolute inset-0 md:hidden">
              <StyledImage src={settings.mobileImageUrl} alt={imageAlt} settings={settings} fieldKey="mobileImageUrl" loading="lazy" decoding="async" />
            </div>
          )}
        </>
      ) : inStudioPreview() ? (
        // Owner guidance: shown in the Studio preview only, never to shoppers.
        <div className="absolute inset-0 grid place-items-center text-xs font-bold uppercase tracking-[0.25em] text-white/40">
          Add a banner image
        </div>
      ) : null}
      <div className="absolute inset-0" style={{ backgroundColor: "rgb(var(--overlay-rgb, 0, 0, 0))", opacity: settings.overlayOpacity ?? 0.4 }} />
      <div className={`relative z-10 flex w-full p-6 md:p-12 ${position}`}>
        <AnimationContainer enabled={enableAnimations}>
          <div className={`${mw(settings, "max-w-2xl")} ${textAlignClass} text-white`}>
            {settings.eyebrow && (
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: settings.accentColor || "currentColor" }} data-theme-field="eyebrow">
                {settings.eyebrow}
              </p>
            )}
            <h2 className="text-4xl font-black leading-none tracking-tight md:text-6xl" style={hStyle(settings)} data-theme-field="title">
              {settings.title ?? fb("ImageBannerSection.title")}
            </h2>
            {settings.body && <p className="mt-5 text-base leading-relaxed text-white/80 md:text-lg" style={bStyle(settings)} data-theme-field="body">{settings.body}</p>}
            {(settings.ctaText || settings.secondaryCtaText) && (
              <div className={`mt-8 flex flex-wrap gap-3 ${textAlign === "left" ? "justify-start" : textAlign === "right" ? "justify-end" : "justify-center"}`}>
                {settings.ctaText && (
                  <button type="button" onClick={() => followBannerLink(settings.ctaUrl, onCtaClick)} className="min-h-11 px-7 py-3 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #fff)", color: "var(--btn-text, #000)", ...btnS(settings) }}>
                    <span data-theme-field="ctaText">{settings.ctaText}</span>
                  </button>
                )}
                {settings.secondaryCtaText && (
                  <button type="button" onClick={() => followBannerLink(settings.secondaryCtaUrl)} className="min-h-11 border border-white/70 px-7 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white hover:bg-white/10">
                    <span data-theme-field="secondaryCtaText">{settings.secondaryCtaText}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// FEATURE GRID
// ──────────────────────────────

export function FeatureGridSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const cols = settings.columns ?? 3;
  const textAlign = aClass(settings);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className={`mb-10 ${textAlign}`}>
            <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">
              {settings.title ?? fb("FeatureGridSection.title")}
            </h2>
            {settings.subtitle && (
              <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
            )}
          </div>
        </AnimationContainer>
        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {sampleInPreview(items, [{ title: "Feature One", description: "Describe your value." }]).map((item: any, idx: number) => (
            <AnimationContainer key={idx} enabled={enableAnimations} delay={idx * 0.1}>
              <div {...blockEditAttrs(item, idx)} className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl">
                {item.icon && <div className="text-3xl mb-3">{item.icon}</div>}
                <h3 className="text-sm font-bold uppercase text-white" style={bStyle(settings)} data-theme-field="title">{item.title}</h3>
                <p className="text-xs text-white/50 mt-2" style={bStyle(settings)} data-theme-field="description">{item.description}</p>
              </div>
            </AnimationContainer>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────
// NEWSLETTER
// ──────────────────────────────

export function NewsletterSection({ settings, enableAnimations }: any) {
  const textAlign = aClass(settings);
  return (
    <section className="border-t border-white/5 bg-white/[0.02]" style={bgStyle(settings)}>
      <div className="py-24 px-6 mx-auto" data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className={`${mw(settings, "max-w-xl")} mx-auto space-y-8 ${textAlign}`}>
            <div className="space-y-3">
              <h2 className="text-2xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">
                {settings.title ?? fb("NewsletterSection.title")}
              </h2>
              <p className="text-xs text-white/40 tracking-widest leading-relaxed" style={bStyle(settings)}>
                <span data-theme-field="description">
                  {settings.description ?? fb("NewsletterSection.description")}
                </span>
              </p>
            </div>
            <NewsletterForm settings={settings} type="NewsletterSection" source="website-section" />
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// TESTIMONIALS
// ──────────────────────────────

export function TestimonialsSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const textAlign = aClass(settings);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings, "max-w-6xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className={`mb-8 ${textAlign}`}>
            <h2 className="text-3xl font-bold tracking-tight uppercase leading-tight text-white" style={hStyle(settings)} data-theme-field="title">
              {settings.title ?? fb("TestimonialsSection.title")}
            </h2>
            {settings.subtitle && (
              <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {sampleInPreview(items, [{ quote: "An incredible independent shop.", author: "Customer" }]).map((item: any, idx: number) => (
              <div
                key={idx}
                {...blockEditAttrs(item, idx)}
                className={`p-6 bg-white/[0.03] rounded-2xl border border-white/10 ${hoverEffectClassName(settings.hoverEffect)}`}
                style={hoverEffectGlowStyle(settings.hoverEffect, settings.accentColor)}
              >
                <p className="text-white/70 text-lg leading-relaxed font-light" style={bStyle(settings)}>"<span data-theme-field="quote">{item.quote}</span>"</p>
                <p className="text-white/40 text-xs mt-4 uppercase tracking-widest" style={bStyle(settings)}><span data-theme-field="author">{item.author}</span></p>
                {item.role && <p className="text-white/30 text-[10px] mt-1" style={bStyle(settings)}><span data-theme-field="role">{item.role}</span></p>}
              </div>
            ))}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// FAQ
// ──────────────────────────────

export function FAQSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings, "max-w-4xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight uppercase leading-tight text-white" style={hStyle(settings)} data-theme-field="title">
              {settings.title ?? fb("FAQSection.title")}
            </h2>
            {settings.subtitle && (
              <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
            )}
          </div>
          <div className="space-y-3">
            {sampleInPreview(items, [{ question: "Sample question?", answer: "Sample answer." }]).map((item: any, idx: number) => (
              <details key={idx} {...blockEditAttrs(item, idx)} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <summary className="text-sm font-bold text-white cursor-pointer" style={bStyle(settings)} data-theme-field="question">{item.question}</summary>
                <p className="text-white/60 text-sm mt-3" style={bStyle(settings)} data-theme-field="answer">{item.answer}</p>
              </details>
            ))}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// TEXT CONTENT
// ──────────────────────────────

export function TextContentSection({ settings, enableAnimations }: any) {
  const textAlign = aClass(settings);
  const hasHtml = settings.content && /<[a-z][\s\S]*>/i.test(settings.content);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings, "max-w-4xl")} ${textAlign}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className="space-y-5">
            {settings.eyebrow && (
              <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/50" style={bStyle(settings)} data-theme-field="eyebrow">
                {settings.eyebrow}
              </p>
            )}
            {settings.title && (
              <h2 className="text-3xl font-bold tracking-tight uppercase leading-tight text-white" style={hStyle(settings)} data-theme-field="title">
                {settings.title}
              </h2>
            )}
            {settings.subtitle && (
              <p className="text-lg text-white/70 leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
            )}
            {settings.content && (
              hasHtml ? (
                <div className="prose prose-invert max-w-none" data-theme-field="content" style={bStyle(settings)} dangerouslySetInnerHTML={{ __html: settings.content }} />
              ) : (
                <p className="text-white/60 text-lg leading-relaxed font-light" style={bStyle(settings)}>{settings.content}</p>
              )
            )}
            {!settings.title && !settings.content && inStudioPreview() && (
              <p className="text-white/60 text-lg leading-relaxed font-light">Add your mission statement or store introduction here.</p>
            )}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// IMAGE WITH TEXT
// ──────────────────────────────

export function ImageWithTextSection({ settings, enableAnimations }: any) {
  const sc = useSectionCopy();
  const reverse = settings.layout === "text-left";
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className={`grid md:grid-cols-2 gap-12 items-center ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
            <div
              className={`aspect-[4/3] overflow-hidden rounded-2xl bg-white/5 border border-white/10 ${hoverEffectClassName(settings.hoverEffect)}`}
              style={hoverEffectGlowStyle(settings.hoverEffect, settings.accentColor)}
            >
              {settings.imageUrl ? (
                <StyledImage src={settings.imageUrl} settings={settings} fieldKey="imageUrl" loading="lazy" decoding="async" alt={settings.imageAlt || ""} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20 text-xs uppercase tracking-widest">{sc("sectionNoImage")}</div>
              )}
            </div>
            <div className="space-y-5">
              {settings.eyebrow && (
                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/50" style={bStyle(settings)} data-theme-field="eyebrow">{settings.eyebrow}</p>
              )}
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white" style={hStyle(settings)} data-theme-field="title">
                {settings.title ?? fb("ImageWithTextSection.title")}
              </h2>
              <p className="text-white/60 leading-relaxed" style={bStyle(settings)} data-theme-field="body">
                {settings.body ?? fb("ImageWithTextSection.body")}
              </p>
              {settings.ctaText && (
                <a
                  href={siteHref(settings.ctaUrl)}
                  className="inline-block px-7 py-3 rounded-full text-[10px] font-bold tracking-[0.3em] uppercase"
                  style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #e8402a)", color: "var(--btn-text, #100f0d)", ...btnS(settings) }}
                >
                  <span data-theme-field="ctaText">{settings.ctaText}</span>
                </a>
              )}
            </div>
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// RICH TEXT
// ──────────────────────────────

export function RichTextSection({ settings, enableAnimations }: any) {
  const align = settings.align || "center";
  return (
    <section style={bgStyle(settings)}>
      <div className="py-20 px-6" data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div
            className={`${mw(settings, "max-w-3xl")} mx-auto prose prose-invert ${align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center"}`}
            style={bStyle(settings)}
            data-theme-field="html"
            dangerouslySetInnerHTML={{ __html: sampleHtml(settings.html, "<p>Use this rich text section to share information with your customers.</p>") }}
          />
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// SCROLLING TEXT (marquee)
// ──────────────────────────────

export function MarqueeSection({ settings }: any) {
  const text = settings.text ?? fb("MarqueeSection.text");
  const separator = settings.separator || "·";
  const speed = Math.max(5, Math.min(120, settings.speed ?? 20));
  const fontSize = Math.max(10, Math.min(120, settings.fontSize ?? 28));
  const bold = settings.bold ?? true;
  const uppercase = settings.uppercase ?? true;
  const background = settings.background || "transparent";
  const color = settings.color || undefined;

  const phrase = Array.from({ length: 4 }).map(() => text).join(`  ${separator}  `);

  return (
    <section className="overflow-hidden py-8" style={{ background, ...bgStyle(settings) }}>
      <div className="flex w-max animate-marquee" style={{ ["--marquee-duration" as any]: `${speed}s` }}>
        {[0, 1].map((copy) => (
          <span
            key={copy}
            aria-hidden={copy === 1}
            className={`px-6 ${bold ? "font-black" : "font-medium"} ${uppercase ? "uppercase" : ""} tracking-tight`}
            style={{
              fontSize,
              color,
              ...(settings.fontWeight != null ? { fontWeight: settings.fontWeight } : {}),
              ...(settings.letterSpacing != null ? { letterSpacing: `${settings.letterSpacing}em` } : {}),
            }}
          >
            {phrase}
            {`  ${separator}  `}
          </span>
        ))}
      </div>
    </section>
  );
}

// ──────────────────────────────
// MULTICOLUMN (with column blocks)
// ──────────────────────────────

export function MulticolumnSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const cols = Math.max(2, Math.min(6, settings.columns ?? 3));
  const textAlign = aClass(settings);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.title || settings.subtitle) && (
            <div className={`mb-12 ${textAlign}`}>
              {settings.title && (
                <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">
                  {settings.title}
                </h2>
              )}
              {settings.subtitle && (
                <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
              )}
            </div>
          )}
        </AnimationContainer>
        <div className="grid gap-8" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {items.map((item: any, idx: number) => (
            <AnimationContainer key={idx} enabled={enableAnimations} delay={idx * 0.1}>
              <div {...blockEditAttrs(item, idx)} className={`space-y-4 ${textAlign}`}>
                {item.imageUrl && (
                  <div className="aspect-square w-32 mx-auto rounded-full overflow-hidden border border-white/10">
                    <ResponsiveImage src={item.imageUrl} media={item[mediaKey("imageUrl")]} sizes="128px" loading="lazy" decoding="async" className="w-full h-full object-cover" alt={item.title || ""} />
                  </div>
                )}
                <h3 className="text-lg font-bold text-white" style={bStyle(settings)}>{item.title || fb("MulticolumnSection.item.title")}</h3>
                <p className="text-white/60 text-sm" style={bStyle(settings)}>{item.body || ""}</p>
                {Array.isArray(item.links) && item.links.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {item.links.map((link: any, linkIdx: number) => (
                      <a
                        key={linkIdx}
                        href={siteHref(link.url)}
                        className="text-xs font-bold tracking-widest uppercase text-white/80 underline"
                      >
                        {link.text}
                      </a>
                    ))}
                  </div>
                ) : (
                  item.linkText && (
                    <a href={siteHref(item.linkUrl)} className="text-xs font-bold tracking-widest uppercase text-white/80 underline">
                      {item.linkText}
                    </a>
                  )
                )}
              </div>
            </AnimationContainer>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────
// SLIDESHOW (with slide blocks)
// ──────────────────────────────

export function SlideshowSection({ settings, enableAnimations }: any) {
  const slides = visibleBlocks(settings.slides || settings.items || settings.blocks || []);
  const [active, setActive] = useState(0);
  const [inspecting, setInspecting] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("preview") !== "true") return;
    const select = (event: Event) => {
      const id = (event as CustomEvent).detail?.blockId;
      const index = slides.findIndex((slide: any) => slide.id === id);
      if (index >= 0) { setActive(index); setInspecting(true); }
    };
    const mode = (event: Event) => setInspecting((event as CustomEvent).detail === "edit");
    window.addEventListener("studio:selection", select); window.addEventListener("studio:mode", mode);
    return () => { window.removeEventListener("studio:selection", select); window.removeEventListener("studio:mode", mode); };
  }, [slides]);

  // Autoplay waits a full interval after every change (arrows and dots too), stops while the shopper points at
  // or tabs into the slideshow, and never runs for shoppers who asked their device for reduced motion.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (inspecting || hovered || focused || !settings.autoplay || slides.length <= 1) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % slides.length), Math.max(2000, settings.autoplaySpeed || 5000));
    return () => clearTimeout(t);
  }, [active, slides.length, settings.autoplay, settings.autoplaySpeed, inspecting, hovered, focused]);

  if (slides.length === 0) {
    // Owner guidance: the Studio preview shows how to fill it; shoppers see nothing.
    if (!inStudioPreview()) return null;
    return (
      <section className="h-[60vh] flex items-center justify-center bg-white/[0.02] text-white/30 text-xs uppercase tracking-widest">
        Add slides to this slideshow
      </section>
    );
  }

  const slide = slides[active] || slides[0];

  return (
    <section
      className="relative w-full h-[70vh] min-h-[480px] overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
    >
      {slide.imageUrl && (
        <div className="absolute inset-0">
          <StyledImage src={slide.imageUrl} settings={slide} fieldKey="imageUrl" loading="lazy" decoding="async" alt={slide.title || ""} />
        </div>
      )}
      <div className="absolute inset-0" style={{ backgroundColor: "rgb(var(--overlay-rgb))", opacity: slide.overlayOpacity ?? 0.4 }} />
      <AnimationContainer enabled={enableAnimations}>
        <div
          {...blockEditAttrs(slide, active)}
          className={`relative z-10 h-full flex flex-col items-center justify-center text-center px-6 ${mw(settings, "max-w-3xl")} mx-auto`}
        >
          {slide.eyebrow && (
            <p className="text-[10px] tracking-[0.3em] font-bold uppercase text-white/70 mb-4" data-theme-field="eyebrow">{slide.eyebrow}</p>
          )}
          <h2 className="text-4xl md:text-6xl font-black uppercase text-white mb-4" data-theme-field="title">{slide.title}</h2>
          {slide.subtitle && <p className="text-white/70 text-lg mb-8" data-theme-field="subtitle">{slide.subtitle}</p>}
          {slide.ctaText && (
            <a
              href={siteHref(slide.ctaUrl)}
              className="px-8 py-3.5 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase text-black"
              style={{ backgroundColor: slide.accentColor || "#fff" }}
              data-theme-field="ctaText"
            >
              {slide.ctaText}
            </a>
          )}
        </div>
      </AnimationContainer>
      {slides.length > 1 && (
        <>
          <button
            onClick={() => setActive((a) => (a - 1 + slides.length) % slides.length)}
            aria-label={settings.prevAria ?? fb("SlideshowSection.prevAria")}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center backdrop-blur hover:bg-white/20"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setActive((a) => (a + 1) % slides.length)}
            aria-label={settings.nextAria ?? fb("SlideshowSection.nextAria")}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center backdrop-blur hover:bg-white/20"
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2">
            {slides.map((_: any, i: number) => (
              <button key={i} type="button" onClick={() => setActive(i)} aria-current={i === active ? "true" : undefined} aria-label={(settings.dotAria ?? fb("SlideshowSection.dotAria")).replace("{n}", String(i + 1))} className={`w-2 h-2 rounded-full transition-all ${i === active ? "bg-white w-6" : "bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ──────────────────────────────
// VIDEO
// ──────────────────────────────

// YouTube watch / youtu.be / shorts / embed / live links and Vimeo (incl. player.vimeo.com/video/…) links.
// A link on one of these hosts is never handed to <video>, which can't play a web page.
const youtubeIdOf = (url: string) => url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{6,})/i)?.[1];
const vimeoIdOf = (url: string) => url.match(/vimeo\.com\/(?:video\/)?(\d+)/i)?.[1];
const isVideoPageHost = (url: string) => /youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com/i.test(url);

export function VideoSection({ settings, enableAnimations }: any) {
  const url = settings.videoUrl || "";
  let embed = "";
  const ytId = youtubeIdOf(url);
  const vmId = ytId ? undefined : vimeoIdOf(url);
  if (ytId) embed = `https://www.youtube.com/embed/${ytId}?rel=0`;
  else if (vmId) embed = `https://player.vimeo.com/video/${vmId}`;

  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings, "max-w-6xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.eyebrow || settings.title || settings.subtitle) && (
            <div className="text-center mb-8">
              {settings.eyebrow && (
                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/50 mb-3" style={bStyle(settings)} data-theme-field="eyebrow">{settings.eyebrow}</p>
              )}
              {settings.title && (
                <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">{settings.title}</h2>
              )}
              {settings.subtitle && (
                <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
              )}
            </div>
          )}
          <div className="aspect-video w-full overflow-hidden rounded-2xl fm-surface border border-white/10">
            {embed ? (
              <iframe src={embed} title={settings.title ?? fb("VideoSection.title")} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="w-full h-full" />
            ) : url && !isVideoPageHost(url) ? (
              <video src={url} controls poster={settings.posterUrl} className="w-full h-full object-cover" />
            ) : inStudioPreview() ? (
              // Owner guidance: shown in the Studio preview only, never to shoppers.
              <div className="w-full h-full flex items-center justify-center text-white/30 text-xs uppercase tracking-widest">
                Paste a YouTube, Vimeo or MP4 URL
              </div>
            ) : null}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// LOGO LIST
// ──────────────────────────────

export function LogoListSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-16 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.title || settings.subtitle) && (
            <div className="text-center mb-8">
              {settings.title && (
                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40" style={hStyle(settings)} data-theme-field="title">{settings.title}</p>
              )}
              {settings.subtitle && (
                <p className="mt-2 text-white/40 text-xs" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {items.map((item: any, idx: number) => (
              <div key={idx} {...blockEditAttrs(item, idx)} className="opacity-60 hover:opacity-100 transition-opacity">
                {item.logoUrl ? (
                  <ResponsiveImage src={item.logoUrl} media={item[mediaKey("logoUrl")]} sizes="160px" alt={item.alt || ""} loading="lazy" decoding="async" className="h-10 w-auto object-contain" />
                ) : (
                  <span className="text-white/40 text-sm font-bold uppercase tracking-widest">{item.alt || fb("LogoListSection.item.alt")}</span>
                )}
              </div>
            ))}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// COLLAPSIBLE / ACCORDION
// ──────────────────────────────

export function CollapsibleSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-20 px-6 mx-auto ${mw(settings, "max-w-3xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.title || settings.subtitle) && (
            <div className="text-center mb-8">
              {settings.title && (
                <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">{settings.title}</h2>
              )}
              {settings.subtitle && (
                <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
              )}
            </div>
          )}
          <div className="border-t border-white/10">
            {items.map((item: any, idx: number) => (
              <details key={idx} {...blockEditAttrs(item, idx)} className="border-b border-white/10 group">
                <summary className="flex items-center justify-between cursor-pointer py-5 text-white text-sm font-bold tracking-wide uppercase" style={bStyle(settings)}>
                  {item.heading || fb("CollapsibleSection.item.heading")}
                  <span aria-hidden="true" className="text-white/40 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <div
                  className="text-white/60 text-sm pb-6 prose prose-invert max-w-none"
                  style={bStyle(settings)}
                  data-theme-field="content"
                  dangerouslySetInnerHTML={{ __html: item.content || "" }}
                />
              </details>
            ))}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// COLLECTION LIST
// ──────────────────────────────

export function CollectionListSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const cols = Math.max(2, Math.min(5, settings.columns ?? 3));
  const textAlign = aClass(settings);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.title || settings.subtitle) && (
            <div className={`mb-10 ${textAlign}`}>
              {settings.title && (
                <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">{settings.title}</h2>
              )}
              {settings.subtitle && (
                <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
              )}
            </div>
          )}
        </AnimationContainer>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {items.map((item: any, idx: number) => (
            <AnimationContainer key={idx} enabled={enableAnimations} delay={idx * 0.05}>
              <a href={siteHref(item.linkUrl)} {...blockEditAttrs(item, idx)} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-white/5">
                {item.imageUrl && (
                  <ResponsiveImage src={item.imageUrl} media={item[mediaKey("imageUrl")]} sizes="(min-width: 768px) 33vw, 50vw" alt={item.title || ""} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <h3 className="text-white text-lg font-bold uppercase tracking-tight">{item.title || fb("CollectionListSection.item.title")}</h3>
                  {item.subtitle && <p className="text-white/70 text-xs">{item.subtitle}</p>}
                </div>
              </a>
            </AnimationContainer>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────
// FEATURED PRODUCT
// ──────────────────────────────

export function FeaturedProductSection({ settings, books, onProductClick, enableAnimations }: any) {
  const { formatBookPrice } = useCurrency();
  const target: any = pickBook(books, settings);

  if (!target) return null;

  const photo = target.photos?.[0]?.url;

  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings, "max-w-6xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div
              className={`aspect-[3/4] overflow-hidden rounded-2xl bg-white/5 ${hoverEffectClassName(settings.hoverEffect)}`}
              style={hoverEffectGlowStyle(settings.hoverEffect, settings.accentColor)}
            >
              {photo ? <><PhotoToneDefs photo={target.photos?.[0]} /><img loading="lazy" src={photo} {...photoSrcSet(target.photos?.[0], FEATURE_PHOTO_SIZES)} decoding="async" className="w-full h-full object-cover" style={framingStyle(target.photos?.[0])} alt={target.title} /></> : null}
            </div>
            <div className="space-y-5">
              <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/50" style={bStyle(settings)}>{settings.eyebrow ?? fb("FeaturedProductSection.eyebrow")}</p>
              <h2 className="text-3xl md:text-4xl font-bold text-white" style={hStyle(settings)}>{target.title}</h2>
              {target.subtitle && <p className="text-white/60" style={bStyle(settings)}>{target.subtitle}</p>}
              <p className="text-2xl font-bold text-white" style={bStyle(settings)}>{formatBookPrice(target)}</p>
              <p className="text-white/60 text-sm leading-relaxed line-clamp-4" style={bStyle(settings)}>{target.description || ""}</p>
              <MagneticButton
                magnetic={!!settings.btnMagnetic}
                onClick={() => onProductClick?.(target)}
                className="px-8 py-3.5 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase"
                style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #e8402a)", color: "var(--btn-text, #100f0d)", ...btnS(settings) }}
              >
                {settings.ctaText ?? fb("FeaturedProductSection.ctaText")}
              </MagneticButton>
            </div>
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// REFERENCE PRODUCT GRID
// ──────────────────────────────

const productSlug = (book: any) => book?.slug || book?.title?.toLowerCase?.().replace(/[^a-z0-9]+/g, "-");

// Every catalog-driven section picks its books through one rule
// (features/site/merchandising.ts `selectBooks`: all / featured / picked / category /
// newest / on sale / pre-orders, plus sort). The shop's categories come from the page design.
function useSectionBooks(books: any[], settings: any): any[] {
  const design = useSectionDesign();
  return selectBooks(books, sectionBookQuery(settings, design?.categories));
}

// Inline-SVG film grain (fractal noise) — self-contained data URI, safe under
// the GitHub Pages sub-path since no asset request is made.
const GRAIN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

function GrainOverlay({ opacity }: { opacity?: number }) {
  if (!opacity || opacity <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none mix-blend-overlay"
      style={{ backgroundImage: GRAIN_BG, backgroundSize: "160px", opacity: Math.min(1, opacity) }}
    />
  );
}

export function ProductGridHeaderSection({ settings, books, onProductClick, enableAnimations }: any) {
  const { formatBookPrice } = useCurrency();
  const candidates = useSectionBooks(books, settings);
  const limit = Math.max(1, Math.min(24, settings.productLimit ?? 6));
  const items = candidates.slice(0, limit);
  const cols = Math.max(2, Math.min(6, settings.columnsDesktop ?? 3));
  const mobileCols = Math.max(1, Math.min(3, settings.columnsMobile ?? 1));
  const aspect = aspectRatioValue(settings.imageAspectRatio, "1 / 1");
  const text = settings.textColor || "#ffffff";
  const rule = settings.ruleColor || "#B1B1AA";
  const bg = settings.backgroundColor || "#000000";
  const fit = settings.imageFit === "contain" ? "contain" : "cover";
  const focal = `${Math.max(0, Math.min(100, settings.focalX ?? 50))}% ${Math.max(0, Math.min(100, settings.focalY ?? 50))}%`;

  return (
    <section style={{ background: bg, color: text }}>
      <style>{`
        .reference-product-grid-${settings.__sectionId || "section"} {
          grid-template-columns: repeat(${mobileCols}, minmax(0, 1fr));
        }
        @media (min-width: 1024px) {
          .reference-product-grid-${settings.__sectionId || "section"} {
            grid-template-columns: repeat(${cols}, minmax(0, 1fr));
          }
        }
      `}</style>
      <div className={`px-6 py-8 mx-auto ${mw(settings, "max-w-7xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className="flex items-start justify-between gap-6">
            <h2
              className="font-black tracking-tight leading-none"
              data-theme-field="title"
              style={{ fontSize: `clamp(${settings.mastheadMobile ?? 38}px, 5vw, ${settings.mastheadDesktop ?? 58}px)`, ...hStyle(settings) }}
            >
              {settings.title ?? fb("ProductGridHeaderSection.title")}
            </h2>
            <p className="text-lg md:text-2xl font-black whitespace-nowrap" data-theme-field="cartTotalText">
              {settings.cartLabel ?? fb("ProductGridHeaderSection.cartLabel")} | {settings.cartTotalText ?? fb("ProductGridHeaderSection.cartTotalText")}
            </p>
          </div>
          <div className="mt-6" style={{ borderTop: `${settings.headerRuleWidth ?? 4}px solid ${rule}` }} />
          <div className="py-5 flex flex-wrap font-black text-base" data-studio-gap="navGap" style={{ gap: settings.navGap ?? 40 }}>
            {(settings.navText ?? fb("ProductGridHeaderSection.navText"))
              .split("·")
              .map((label: string, idx: number) => (
                <span key={idx} data-theme-field={idx === 0 ? "navText" : undefined}>{label.trim()}</span>
              ))}
          </div>
          <div style={{ borderTop: `${settings.headerRuleWidth ?? 4}px solid ${rule}` }} />
        </AnimationContainer>
        <div
          className={`reference-product-grid-${settings.__sectionId || "section"} grid mt-6`}
          data-studio-gap="gridGap" data-studio-row-gap="rowGap" style={{ columnGap: settings.gridGap ?? 18, rowGap: settings.rowGap ?? 54 }}
        >
          {items.map((book: any, idx: number) => {
            const onSale = showsSale(book);
            const price = displayPrice(book);
            return (
              <AnimationContainer className="min-w-0" key={book.id || idx} enabled={enableAnimations} delay={idx * 0.04}>
                <button
                  type="button"
                  onClick={() => onProductClick?.(book)}
                  {...blockEditAttrs({ id: book.id || productSlug(book) }, idx)}
                  className="fm-card group block w-full min-w-0 text-left"
                >
                  <div className="relative overflow-hidden bg-white/5" style={{ aspectRatio: aspect }}>
                    {book.photos?.[0]?.url && (
                      <img
                        src={book.photos[0].url}
                        {...photoSrcSet(book.photos[0], gridPhotoSizes([{ from: 0, cols: mobileCols }, { from: 1024, cols }], { photo: book.photos[0], frame: aspect, cover: fit === "cover" }))}
                        alt={book.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full transition-transform duration-700 group-hover:scale-105"
                        style={{ objectFit: fit, objectPosition: focal, ...framingStyle(book.photos[0]) }}
                      />
                    )}
                    <PhotoToneDefs photo={book.photos?.[0]} />
                    {settings.showBadges !== false && onSale && (
                      <span
                        className="absolute top-3 right-3 rounded-full px-4 py-3 text-[10px] font-black"
                        style={{ background: settings.badgeColor || "var(--badge-bg-primary, #e8402a)", color: settings.badgeTextColor || "var(--badge-text-primary, #100f0d)" }}
                      >
                        {settings.saleLabel ?? fb("ProductGridHeaderSection.saleLabel")}
                      </span>
                    )}
                  </div>
                  {/* fm-card-*: Studio › Style › Product cards & grid (title/price colour, size, font) applies here too. */}
                  <h3 className="fm-card-title mt-3 text-lg md:text-xl font-black leading-tight" style={{ color: text, textTransform: settings.titleTransform || "none" }}>
                    {book.title}
                  </h3>
                  {settings.showPrices !== false && price > 0 && (
                    <p className="fm-card-price-wrap mt-1 text-lg" style={{ color: text }}>
                      <span className="fm-card-price">{formatBookPrice(book)}</span>
                    </p>
                  )}
                </button>
              </AnimationContainer>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────
// COVER CAROUSEL HERO — full-height hero auto-cycling through book covers
// with a serif wordmark overlay, violet duotone and film grain.
// ──────────────────────────────

export function ProductCoverCarouselSection({ settings, books, onCtaClick }: any) {
  const sc = useSectionCopy();
  const covers = useSectionBooks(books, settings)
    .map((book: any) => ({ id: book.id || productSlug(book), url: book.photos?.[0]?.url, title: book.title }))
    .filter((c: any) => !!c.url)
    .slice(0, Math.max(1, Math.min(24, settings.productLimit ?? 12)));
  const [active, setActive] = useState(0);
  const autoplayMs = Math.max(1500, settings.autoplayMs ?? 4000);

  // A dot press restarts the wait; pointing at or tabbing into the carousel pauses it.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (covers.length <= 1 || hovered || focused) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % covers.length), autoplayMs);
    return () => clearTimeout(t);
  }, [active, covers.length, autoplayMs, hovered, focused]);

  const height =
    settings.height === "full" ? "100vh" : settings.height === "medium" ? "70vh" : "min(88vh, 780px)";
  const current = covers.length ? active % covers.length : 0;
  const scrim = Math.max(0, Math.min(1, settings.scrimOpacity ?? 0.55));
  const overlayColor = settings.colorOverlay || "";
  const overlayOpacity = Math.max(0, Math.min(1, settings.colorOverlayOpacity ?? 0.3));

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ height, minHeight: 420, ...bgStyle(settings) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
    >
      {covers.length === 0 ? (
        // Owner guidance: shown in the Studio preview only, never to shoppers.
        inStudioPreview() ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs uppercase tracking-widest">
            Add books with cover photos to fill this carousel
          </div>
        ) : null
      ) : (
        covers.map((cover: any, i: number) => (
          <div
            key={cover.id || i}
            className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
            style={{ opacity: i === current ? 1 : 0 }}
            aria-hidden={i !== current}
          >
            <img
              src={cover.url}
              alt={i === current ? cover.title || "" : ""}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="w-full h-full object-cover"
            />
          </div>
        ))
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(180deg, rgba(var(--overlay-rgb, 0, 0, 0),${scrim * 0.18}) 0%, rgba(var(--overlay-rgb, 0, 0, 0),${scrim}) 60%, rgba(var(--overlay-rgb, 0, 0, 0),${Math.min(1, scrim * 1.75)}) 100%)` }}
      />
      {overlayColor && overlayOpacity > 0 && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: overlayColor, opacity: overlayOpacity, mixBlendMode: settings.colorOverlayBlend === false ? undefined : ("color" as any) }}
        />
      )}
      <GrainOverlay opacity={settings.grainOpacity ?? 0.45} />
      <div className="absolute left-6 right-6 bottom-12 md:left-12 md:right-12 z-10">
        <h1
          className="text-white leading-none tracking-tight"
          style={{
            fontStyle: settings.titleItalic === false ? undefined : "italic",
            fontSize: "clamp(2.8rem, 8vw, 6.5rem)",
            lineHeight: 0.95,
            ...hStyle(settings),
            // Always light: this text sits on the image scrim, not on the theme background.
            color: settings.slideTextColor || "#ffffff",
          }}
          data-theme-field="title"
        >
          {settings.title ?? fb("ProductCoverCarouselSection.title")}
        </h1>
        {settings.tagline && (
          <p className="mt-3.5 text-[15px] max-w-lg" style={{ ...bStyle(settings), color: settings.taglineColor || "rgba(255,255,255,0.88)" }} data-theme-field="tagline">
            {settings.tagline}
          </p>
        )}
        {settings.ctaText && (
          <MagneticButton
            magnetic={!!settings.btnMagnetic}
            onClick={onCtaClick}
            className="mt-6 px-8 py-3.5 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase"
            style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #e8402a)", color: "var(--btn-text, #ffffff)", ...btnS(settings) }}
          >
            <span data-theme-field="ctaText">{settings.ctaText}</span>
          </MagneticButton>
        )}
      </div>
      {settings.showDots !== false && covers.length > 1 && (
        <div className="absolute right-6 bottom-12 md:right-12 z-10 flex gap-2">
          {covers.map((cover: any, i: number) => (
            <button
              key={cover.id || i}
              onClick={() => setActive(i)}
              aria-label={sc("sectionGoToCover", { n: i + 1 })}
              aria-current={i === current}
              className={`h-2 rounded-full transition-all ${i === current ? "w-5" : "w-2"}`}
              style={{ backgroundColor: settings.slideTextColor || "#ffffff", opacity: i === current ? 1 : 0.45 }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────
// SHOWCASE PRODUCT GRID — editorial book grid with category tags, quick-add
// and duotone/grain cover treatment.
// ──────────────────────────────

export function ProductShowcaseGridSection({ settings, books, onProductClick, enableAnimations }: any) {
  const sc = useSectionCopy();
  const { formatBookPrice } = useCurrency();
  const { addToCart } = useCart();
  const items = useSectionBooks(books, settings).slice(0, Math.max(1, Math.min(24, settings.productLimit ?? 12)));
  const cols = Math.max(1, Math.min(4, settings.columnsDesktop ?? 3));
  const mobileCols = Math.max(1, Math.min(2, settings.columnsMobile ?? 1));
  const aspect = aspectRatioValue(settings.imageAspectRatio, "4 / 5");
  const overlayColor = settings.overlayColor || "";
  const overlayOpacity = Math.max(0, Math.min(1, settings.overlayOpacity ?? 0.22));
  const gridId = `showcase-grid-${settings.__sectionId || "section"}`;

  const openBook = (book: any) => onProductClick?.(book);

  return (
    <section style={bgStyle(settings)}>
      <style>{`
        .${gridId} { grid-template-columns: repeat(${mobileCols}, minmax(0, 1fr)); }
        @media (min-width: 1024px) { .${gridId} { grid-template-columns: repeat(${cols}, minmax(0, 1fr)); } }
      `}</style>
      <div className={`py-16 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.eyebrow || settings.title) && (
            <div className="mb-8">
              {settings.eyebrow && (
                <p className="text-[10px] tracking-[0.3em] font-bold uppercase mb-2" style={{ color: "var(--accent, #e8402a)" }} data-theme-field="eyebrow">
                  {settings.eyebrow}
                </p>
              )}
              {settings.title && (
                <h2 className="text-3xl md:text-4xl tracking-tight" style={hStyle(settings)} data-theme-field="title">
                  {settings.title}
                </h2>
              )}
            </div>
          )}
        </AnimationContainer>
        <div className={`${gridId} grid gap-6`}>
          {items.map((book: any, idx: number) => {
            const onSale = showsSale(book);
            // Books sold in editions are added as an in-stock edition (see buyable.ts).
            const quick = quickAddChoice(book);
            const soldOut = !quick.inStock;
            const category = book.categories?.[0] || "";
            return (
              <AnimationContainer className="min-w-0" key={book.id || idx} enabled={enableAnimations} delay={idx * 0.05}>
                <div
                  {...blockEditAttrs({ id: book.id || productSlug(book) }, idx)}
                  className="fm-card group relative min-w-0 cursor-pointer"
                  role="link"
                  tabIndex={0}
                  aria-label={sc("sectionViewBook", { title: book.title })}
                  onClick={() => openBook(book)}
                  onKeyDown={(e: any) => {
                    // Keys pressed on the "+" quick-add button inside the card belong to that button.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openBook(book);
                    }
                  }}
                >
                  <div className="relative overflow-hidden rounded-[2px] bg-white/5" style={{ aspectRatio: aspect }}>
                    {book.photos?.[0]?.url && (
                      <img
                        src={book.photos[0].url}
                        {...photoSrcSet(book.photos[0], gridPhotoSizes([{ from: 0, cols: mobileCols }, { from: 1024, cols }], { photo: book.photos[0], frame: aspect }))}
                        alt={book.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        style={framingStyle(book.photos[0])}
                      />
                    )}
                    <PhotoToneDefs photo={book.photos?.[0]} />
                    {overlayColor && overlayOpacity > 0 && (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: overlayColor, opacity: overlayOpacity, mixBlendMode: settings.overlayBlend === false ? undefined : ("color" as any) }}
                      />
                    )}
                    <GrainOverlay opacity={settings.grainOpacity ?? 0.35} />
                    {settings.showCategoryTag !== false && category && (
                      <span
                        className="absolute left-3 top-3 rounded-[2px] px-2 py-1 text-[10px] font-bold tracking-[0.12em] uppercase"
                        style={{ background: settings.tagBg || "rgba(0,0,0,0.7)", color: settings.tagText || "rgba(255,255,255,0.75)" }}
                      >
                        {category}
                      </span>
                    )}
                    {/* Coming soon books have nothing to add yet: the card links to their page and its signup. */}
                    {settings.showQuickAdd !== false && !quick.comingSoon && (
                      <button
                        type="button"
                        aria-label={sc(soldOut ? "sectionSoldOutAria" : "sectionQuickAddAria", { title: book.title })}
                        disabled={soldOut}
                        onClick={(e: any) => {
                          e.stopPropagation();
                          if (!soldOut && !addToCart(book, quick.variant)) {
                            // Loaded only when needed: section renderers are also imported by server-side tests and the prerender.
                            const message = sc("addToBagFailed");
                            import("react-hot-toast").then((mod) => mod.default.error(message)).catch(() => {});
                          }
                        }}
                        className={`absolute right-3 bottom-3 w-8 h-8 max-md:before:absolute max-md:before:-inset-1.5 max-md:before:content-[''] rounded-full border text-base leading-none flex items-center justify-center transition-colors ${
                          soldOut
                            ? "opacity-40 cursor-not-allowed border-white/20 bg-black/60 text-white/60"
                            : "border-white/30 bg-black/70 text-white hover:border-transparent"
                        }`}
                        onMouseEnter={(e: any) => { if (!soldOut) e.currentTarget.style.backgroundColor = "var(--accent, #e8402a)"; }}
                        onMouseLeave={(e: any) => { e.currentTarget.style.backgroundColor = ""; }}
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-baseline justify-between gap-3">
                    <h3 className="fm-card-title min-w-0 text-[17px] leading-snug" style={hStyle(settings)}>{book.title}</h3>
                    {settings.showPrices !== false && (
                      <p className="fm-card-price-wrap text-sm whitespace-nowrap fm-muted">
                        {onSale ? (
                          <>
                            <span className="fm-card-price-old line-through opacity-60 mr-1.5">{formatBookPrice({ ...book, isOnSale: false })}</span>
                            <span className="fm-card-price">{formatBookPrice(book)}</span>
                          </>
                        ) : (
                          <span className="fm-card-price">{formatBookPrice(book)}</span>
                        )}
                      </p>
                    )}
                  </div>
                  {settings.showFormatLine !== false && book.format && (
                    <p className="mt-0.5 text-xs fm-muted">{book.format}</p>
                  )}
                </div>
              </AnimationContainer>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────
// STAFF NOTES TABLE — books-driven editorial table; rows open the book.
// ──────────────────────────────

export function StaffNotesTableSection({ settings, books, onProductClick, enableAnimations }: any) {
  const sc = useSectionCopy();
  const rows = resolveStaffNoteRows(settings.items || settings.blocks || [], books, settings.fallbackLimit ?? 8);
  const showCategory = settings.showCategory !== false;
  const showFormat = settings.showFormat !== false;
  const open = (book: any) => onProductClick?.(book);

  return (
    <section style={{ ...(settings.backgroundColor ? { backgroundColor: settings.backgroundColor } : {}), ...bgStyle(settings) }}>
      <div className={`py-16 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {settings.title && (
            <h2 className="text-3xl md:text-4xl tracking-tight mb-8" style={hStyle(settings)} data-theme-field="title">
              {settings.title}
            </h2>
          )}
        </AnimationContainer>
        {rows.length === 0 ? (
          // Owner guidance: shown in the Studio preview only, never to shoppers.
          inStudioPreview() ? <p className="py-12 text-center text-sm fm-muted">Add book notes to fill this table.</p> : null
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-2 text-[11px] font-bold tracking-[0.12em] fm-muted">{settings.colTitleLabel ?? fb("StaffNotesTableSection.colTitleLabel")}</th>
                  {showCategory && <th className="text-left py-3 px-2 text-[11px] font-bold tracking-[0.12em] fm-muted">{settings.colCategoryLabel ?? fb("StaffNotesTableSection.colCategoryLabel")}</th>}
                  {showFormat && <th className="text-left py-3 px-2 text-[11px] font-bold tracking-[0.12em] fm-muted">{settings.colFormatLabel ?? fb("StaffNotesTableSection.colFormatLabel")}</th>}
                  <th className="text-left py-3 px-2 text-[11px] font-bold tracking-[0.12em] fm-muted">{settings.colNoteLabel ?? fb("StaffNotesTableSection.colNoteLabel")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ book, note }, idx) => (
                  <tr
                    key={book.id || idx}
                    className="border-b border-white/10 cursor-pointer transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.06] outline-none"
                    tabIndex={0}
                    aria-label={sc("sectionViewBook", { title: book.title })}
                    onClick={() => open(book)}
                    onKeyDown={(e: any) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(book);
                      }
                    }}
                  >
                    <td className="py-3.5 px-2 text-base" style={hStyle(settings)}>{book.title}</td>
                    {showCategory && <td className="py-3.5 px-2 text-[13px] fm-muted">{book.categories?.[0] || ""}</td>}
                    {showFormat && <td className="py-3.5 px-2 text-[13px] fm-muted">{book.format || ""}</td>}
                    <td className="py-3.5 px-2 text-[13px] fm-muted">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────
// EPHEMERA ROW — decorative pure-CSS publishing objects.
// ──────────────────────────────

function shadeColor(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{6})$/i.exec(hex || "");
  if (!m) return hex || "#e8402a";
  const num = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((num >> 16) & 255) + amount);
  const g = clamp(((num >> 8) & 255) + amount);
  const b = clamp((num & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function EphemeraObject({ item, settings = {} }: { item: any; settings?: any }) {
  const ink = settings.ephemeraInkColor || "#0a0910";
  const film = settings.ephemeraFilmColor || "#2a1a06";
  const color = item.color || "#e8402a";
  const rotation = `rotate(${Math.max(-12, Math.min(12, item.rotation ?? -3))}deg)`;
  const shadow = "0 10px 24px rgba(0,0,0,0.4)";
  switch (item.kind) {
    case "negative":
      return (
        <div className="relative w-[170px] h-28 rounded-[2px] overflow-hidden" style={{ background: film, boxShadow: shadow, transform: rotation }}>
          <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(90deg, transparent 0 30px, rgba(var(--overlay-rgb, 0, 0, 0), 0.5) 30px 32px)" }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${color}59, transparent 30%, transparent 70%, ${color}59)` }} />
        </div>
      );
    case "seal":
      return (
        <div
          className="w-[90px] h-[90px] rounded-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${shadeColor(color, 24)}, ${shadeColor(color, -48)} 75%)`,
            boxShadow: `${shadow}, inset 0 2px 6px rgba(var(--fg-rgb, 255, 255, 255), 0.15)`,
            transform: rotation,
          }}
        >
          {item.label && <span className="italic text-[1.4rem] text-white/90" style={{ fontWeight: 600 }}>{item.label}</span>}
        </div>
      );
    case "ribbon":
      return (
        <div
          className="w-[42px] h-[180px]"
          style={{
            background: `linear-gradient(180deg, ${color}, ${shadeColor(color, -60)})`,
            clipPath: "polygon(0 0, 100% 0, 100% 85%, 50% 100%, 0 85%)",
            boxShadow: shadow,
            transform: rotation,
          }}
        />
      );
    case "sticker":
      return (
        <div className="w-[118px] h-[76px] rounded-[2px] p-2 flex flex-col gap-1.5" style={{ background: item.color || settings.ephemeraPaperColor || color, boxShadow: shadow, transform: rotation }}>
          <div className="h-[22px]" style={{ background: `repeating-linear-gradient(90deg, ${ink} 0 2px, transparent 2px 5px)` }} />
          {item.label && <span className="text-[0.55rem] tracking-[0.06em] text-black/90">{item.label}</span>}
        </div>
      );
    case "spine":
    default:
      return (
        <div
          className="w-16 h-[190px] rounded-[2px] flex items-center justify-center"
          style={{
            background: `linear-gradient(200deg, ${shadeColor(color, -100)} 0%, ${color} 60%, ${ink} 100%)`,
            boxShadow: shadow,
            transform: rotation,
          }}
        >
          {item.label && (
            <span className="text-[0.62rem] font-bold tracking-[0.16em] text-white/85 whitespace-nowrap" style={{ writingMode: "vertical-rl" }}>
              {item.label}
            </span>
          )}
        </div>
      );
  }
}

export function EphemeraRowSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const justify = settings.align === "left" ? "justify-start" : settings.align === "right" ? "justify-end" : "justify-center";
  return (
    <section style={bgStyle(settings)} aria-hidden="true">
      <div className={`py-12 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className={`flex flex-wrap items-end ${justify}`} data-studio-gap="gap" style={{ gap: settings.gap ?? 24 }}>
            {items.map((item: any, idx: number) => (
              <div key={item.id || idx} {...blockEditAttrs(item, idx)}>
                <EphemeraObject item={item} settings={settings} />
              </div>
            ))}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// CUSTOM HTML
// ──────────────────────────────

export function CustomHTMLSection({ settings }: any) {
  return (
    <section className={settings.fullBleed ? "" : `py-12 px-6 ${mw(settings)} mx-auto`} style={bgStyle(settings)}>
      <div data-theme-field="html" dangerouslySetInnerHTML={{ __html: settings.html || "<!-- Add custom HTML in the editor -->" }} />
    </section>
  );
}


// ──────────────────────────────
// BLOG POSTS
// ──────────────────────────────

function formatArticleDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function BlogPostsSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const columns = Math.max(1, Math.min(4, settings.columns ?? 3));
  const align = aClass(settings);
  const cards = sampleInPreview(items, [
    { title: "Add an article", date: "", excerpt: "Create article cards in the blocks editor to share news, releases, and reading guides.", imageUrl: "", linkUrl: "#" },
  ]);

  return (
    <section style={bgStyle(settings)}>
      <div className={`py-20 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.eyebrow || settings.title || settings.subtitle) && (
            <div className={`mb-10 ${align}`}>
              {settings.eyebrow && (
                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/50 mb-3" style={bStyle(settings)} data-theme-field="eyebrow">
                  {settings.eyebrow}
                </p>
              )}
              {settings.title && (
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">
                  {settings.title}
                </h2>
              )}
              {settings.subtitle && (
                <p className="mt-3 text-sm md:text-base text-white/60 leading-relaxed max-w-2xl mx-auto" style={bStyle(settings)} data-theme-field="subtitle">
                  {settings.subtitle}
                </p>
              )}
            </div>
          )}
        </AnimationContainer>

        <div className="grid grid-cols-1 gap-6 md:[grid-template-columns:var(--blog-post-columns)]" style={{ ["--blog-post-columns" as any]: `repeat(${columns}, minmax(0, 1fr))` }}>
          {cards.map((article: any, idx: number) => (
            <AnimationContainer key={article.id || idx} enabled={enableAnimations} delay={idx * 0.05}>
              <article {...blockEditAttrs(article, idx)} className="h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]">
                <a href={siteHref(article.linkUrl)} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-3xl">
                  <div className="aspect-[4/3] bg-white/5 overflow-hidden">
                    {article.imageUrl ? (
                      <ResponsiveImage src={article.imageUrl} media={article[mediaKey("imageUrl")]} sizes="(min-width: 768px) 33vw, 100vw" alt={article.title || fb("BlogPostsSection.article.title")} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px] font-bold uppercase tracking-[0.3em]">
                        Article Image
                      </div>
                    )}
                  </div>
                  <div className="p-6 md:p-7">
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">
                      {article.tag && <span style={bStyle(settings)} data-theme-field="tag">{article.tag}</span>}
                      {settings.showDates !== false && article.date && <time dateTime={article.date}>{formatArticleDate(article.date)}</time>}
                    </div>
                    <h3 className="mt-4 text-xl font-bold leading-tight text-white" style={hStyle(settings)} data-theme-field="title">{article.title || fb("BlogPostsSection.article.title@1797")}</h3>
                    {settings.showExcerpts !== false && article.excerpt && (
                      <p className="mt-3 text-sm leading-relaxed text-white/60" style={bStyle(settings)} data-theme-field="excerpt">{article.excerpt}</p>
                    )}
                    <span className="mt-6 inline-flex items-center text-[10px] font-bold uppercase tracking-[0.25em] underline underline-offset-4" style={{ color: settings.accentColor || undefined }} data-theme-field="ctaText">
                      {settings.ctaText ?? fb("BlogPostsSection.ctaText")}
                    </span>
                  </div>
                </a>
              </article>
            </AnimationContainer>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────
// COUNTDOWN
// ──────────────────────────────

export function CountdownSection({ settings, enableAnimations }: any) {
  // With no date set, count down a fixed day from when the section first showed (not a fresh day each tick).
  const [defaultTarget] = useState(() => Date.now() + 86400000);
  // The date box has no time zone: it means the shop's own (Toronto) time, wherever the shopper is.
  const chosen = settings.targetDate ? shopInstant(settings.targetDate) : NaN;
  const target = Number.isFinite(chosen) ? chosen : defaultTarget;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, target - now);
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const textAlign = aClass(settings);
  const flexAlign = settings.align === "left" ? "justify-start" : settings.align === "right" ? "justify-end" : "justify-center";

  return (
    <section style={{ background: settings.backgroundColor || "transparent", ...bgStyle(settings) }}>
      <div className={`py-20 px-6 ${textAlign}${MW_MAP[settings.containerWidth] ? ` ${MW_MAP[settings.containerWidth]} mx-auto` : ""}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {settings.eyebrow && (
            <p className={`text-[10px] font-bold tracking-[0.3em] uppercase text-white/60 mb-4 flex items-center gap-2 ${flexAlign}`} style={bStyle(settings)}>
              <Clock size={12} />
              <span data-theme-field="eyebrow">{settings.eyebrow}</span>
            </p>
          )}
          <h2 className="text-3xl md:text-4xl font-bold uppercase text-white mb-2" style={hStyle(settings)} data-theme-field="title">
            {settings.title ?? fb("CountdownSection.title")}
          </h2>
          {settings.subtitle && <p className="text-white/60 mb-8" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>}
          <div className={`flex gap-4 md:gap-8 mt-8 ${flexAlign}`}>
            {[
              { label: settings.labelDays ?? fb("CountdownSection.labelDays"), v: days },
              { label: settings.labelHours ?? fb("CountdownSection.labelHours"), v: hours },
              { label: settings.labelMinutes ?? fb("CountdownSection.labelMinutes"), v: minutes },
              { label: settings.labelSeconds ?? fb("CountdownSection.labelSeconds"), v: seconds },
            ].map((u) => (
              <div key={u.label} className="text-center">
                <div className="text-4xl md:text-6xl font-black text-white tabular-nums" style={hStyle(settings)}>{String(u.v).padStart(2, "0")}</div>
                <div className="text-[10px] tracking-[0.3em] uppercase text-white/50 mt-1" style={bStyle(settings)}>{u.label}</div>
              </div>
            ))}
          </div>
          {settings.ctaText && (
            <a
              href={siteHref(settings.ctaUrl)}
              className="inline-block mt-10 px-8 py-3.5 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase"
              style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #e8402a)", color: "var(--btn-text, #100f0d)", ...btnS(settings) }}
            >
              <span data-theme-field="ctaText">{settings.ctaText}</span>
            </a>
          )}
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// CONTACT FORM
// ──────────────────────────────

export function ContactFormSection({ settings, enableAnimations }: any) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
  const set = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fieldCls = "w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white outline-none focus:border-white/30";
  const submit = async (e: any) => {
    e.preventDefault();
    if (status === "sending") return;
    // Bots fill the hidden field; pretend success so they move on.
    if (form.website) { setStatus("sent"); return; }
    // Never send from the Studio preview — show the thank-you state instead.
    if (typeof window !== "undefined" && /[?&]preview=true/.test(window.location.search)) { setStatus("sent"); return; }
    setStatus("sending");
    try {
      await submitContactMessage({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: settings.showPhone ? form.phone.trim() : "",
        subject: settings.showSubject ? form.subject.trim() : "",
        message: form.message.trim(),
        page: typeof window !== "undefined" ? window.location.pathname : "",
      });
      setStatus("sent");
    } catch (err) {
      console.error("Contact form failed", err);
      setStatus("error");
    }
  };
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-24 px-6 mx-auto ${mw(settings, "max-w-2xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className="text-center mb-10">
            {settings.eyebrow && (
              <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/50 mb-3" style={bStyle(settings)} data-theme-field="eyebrow">{settings.eyebrow}</p>
            )}
            <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">
              {settings.title ?? fb("ContactFormSection.title")}
            </h2>
            {settings.subtitle && (
              <p className="text-white/60 mt-3" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
            )}
          </div>
          {status === "sent" ? (
            <div className="text-center text-white/80 py-12" role="status" data-theme-field="successMessage">{settings.successMessage ?? fb("ContactFormSection.successMessage")}</div>
          ) : (
            <form className="space-y-3" onSubmit={submit}>
              {/* Honeypot: hidden from people, filled in by spam bots. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set("website")} />
              <input type="text" required maxLength={120} autoComplete="name" aria-label={settings.namePlaceholder ?? fb("ContactFormSection.namePlaceholder")} placeholder={settings.namePlaceholder ?? fb("ContactFormSection.namePlaceholder")} value={form.name} onChange={set("name")} className={fieldCls} />
              <input type="email" required maxLength={254} autoComplete="email" aria-label={settings.emailPlaceholder ?? fb("ContactFormSection.emailPlaceholder")} placeholder={settings.emailPlaceholder ?? fb("ContactFormSection.emailPlaceholder")} value={form.email} onChange={set("email")} className={fieldCls} />
              {settings.showPhone && (
                <input type="tel" maxLength={40} autoComplete="tel" aria-label={settings.phonePlaceholder ?? fb("ContactFormSection.phonePlaceholder")} placeholder={settings.phonePlaceholder ?? fb("ContactFormSection.phonePlaceholder")} value={form.phone} onChange={set("phone")} className={fieldCls} />
              )}
              {settings.showSubject && (
                <input type="text" maxLength={200} aria-label={settings.subjectPlaceholder ?? fb("ContactFormSection.subjectPlaceholder")} placeholder={settings.subjectPlaceholder ?? fb("ContactFormSection.subjectPlaceholder")} value={form.subject} onChange={set("subject")} className={fieldCls} />
              )}
              <textarea required maxLength={5000} aria-label={settings.messagePlaceholder ?? fb("ContactFormSection.messagePlaceholder")} placeholder={settings.messagePlaceholder ?? fb("ContactFormSection.messagePlaceholder")} rows={5} value={form.message} onChange={set("message")} className={`${fieldCls} resize-none`} />
              {status === "error" && (
                <p className="text-sm text-red-400" role="alert" data-theme-field="errorMessage">{settings.errorMessage ?? fb("ContactFormSection.errorMessage")}</p>
              )}
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full py-4 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase disabled:opacity-60"
                style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #e8402a)", color: "var(--btn-text, #100f0d)", ...btnS(settings) }}
              >
                <span data-theme-field="buttonLabel">{status === "sending" ? (settings.sendingLabel ?? fb("ContactFormSection.sendingLabel")) : (settings.buttonLabel ?? fb("ContactFormSection.buttonLabel"))}</span>
              </button>
            </form>
          )}
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// MAP
// ──────────────────────────────

export function MapSection({ settings, enableAnimations }: any) {
  const query = settings.address ?? fb("MapSection.address");
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-12 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.title || settings.subtitle) && (
            <div className="text-center mb-8">
              {settings.title && (
                <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">{settings.title}</h2>
              )}
              {settings.subtitle && (
                <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
              )}
              {settings.address && (
                <p className="text-white/60 mt-2 flex items-center justify-center gap-2 text-sm" style={bStyle(settings)}>
                  <MapPin size={14} />
                  <span data-theme-field="address">{settings.address}</span>
                </p>
              )}
            </div>
          )}
          {!settings.title && settings.address && (
            <div className="text-center mb-8">
              <p className="text-white/60 flex items-center justify-center gap-2 text-sm">
                <MapPin size={14} />
                <span data-theme-field="address">{settings.address}</span>
              </p>
            </div>
          )}
          <div className="aspect-[16/9] rounded-2xl overflow-hidden border border-white/10 bg-white/5">
            <iframe src={src} title={settings.title ?? fb("MapSection.title")} loading="lazy" className="w-full h-full border-0" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// ROW (multi-column layout where each column holds any block kind)
// ──────────────────────────────

function RowBlock({ block, blockIndex = 0, accentFallback, settings }: any) {
  const sc = useSectionCopy();
  const kind = block.kind || "text";

  if (kind === "image") {
    return (
      <div {...blockEditAttrs(block, blockIndex)} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {block.imageUrl ? (
          <ResponsiveImage src={block.imageUrl} media={block[mediaKey("imageUrl")]} sizes="(min-width: 768px) 50vw, 100vw" alt={block.title || ""} loading="lazy" decoding="async" className="w-full h-auto object-cover" />
        ) : (
          <div className="aspect-video w-full flex items-center justify-center text-white/20 text-xs uppercase tracking-widest">{sc("sectionNoImage")}</div>
        )}
      </div>
    );
  }

  if (kind === "button") {
    const buttonStyle = {
      backgroundColor: block.accentColor || accentFallback || "var(--btn-bg, #e8402a)",
      color: "var(--btn-text, #100f0d)",
      ...(settings ? btnS(settings) : {}),
    };
    if (Array.isArray(block.buttons) && block.buttons.length > 0) {
      return (
        <div {...blockEditAttrs(block, blockIndex)} className="flex flex-wrap items-center justify-center gap-3">
          {block.buttons.map((btn: any, btnIdx: number) => (
            <a
              key={btnIdx}
              href={siteHref(btn.url)}
              className="inline-block px-8 py-3.5 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase"
              style={buttonStyle}
            >
              {btn.text || fb("RowSection.btn.text")}
            </a>
          ))}
        </div>
      );
    }
    return (
      <div {...blockEditAttrs(block, blockIndex)} className="flex justify-center">
        <a
          href={siteHref(block.buttonUrl)}
          className="inline-block px-8 py-3.5 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase"
          style={buttonStyle}
        >
          {block.buttonText || fb("RowSection.block.buttonText")}
        </a>
      </div>
    );
  }

  if (kind === "video") {
    const url = block.videoUrl || "";
    const ytId = youtubeIdOf(url);
    const vimeoId = ytId ? undefined : vimeoIdOf(url);
    const embed = ytId ? `https://www.youtube.com/embed/${ytId}?rel=0` : vimeoId ? `https://player.vimeo.com/video/${vimeoId}` : "";
    return (
      <div {...blockEditAttrs(block, blockIndex)} className="aspect-video w-full overflow-hidden rounded-2xl fm-surface border border-white/10">
        {embed ? (
          <iframe src={embed} title={block.title || fb("RowSection.block.title")} allow="autoplay; fullscreen" allowFullScreen className="w-full h-full" />
        ) : url && !isVideoPageHost(url) ? (
          <video src={url} controls className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs uppercase tracking-widest">{sc("sectionNoVideo")}</div>
        )}
      </div>
    );
  }

  // text (default)
  return (
    <div {...blockEditAttrs(block, blockIndex)} className="space-y-4">
      {block.title && <h3 className="text-2xl font-bold tracking-tight text-white" style={settings ? hStyle(settings) : {}}>{block.title}</h3>}
      {block.body && <p className="text-white/60 leading-relaxed text-sm" style={settings ? bStyle(settings) : {}}>{block.body}</p>}
      {block.buttonText && (
        <a
          href={siteHref(block.buttonUrl)}
          className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase underline underline-offset-4"
          style={{ color: block.accentColor || accentFallback || undefined }}
        >
          {block.buttonText}
        </a>
      )}
    </div>
  );
}

export function RowSection({ settings, enableAnimations }: any) {
  const blocks = visibleBlocks(settings.items || settings.blocks || []);
  const template =
    ({
      "50-50": "1fr 1fr",
      "33-67": "1fr 2fr",
      "67-33": "2fr 1fr",
      thirds: "1fr 1fr 1fr",
      quarters: "1fr 1fr 1fr 1fr",
    } as Record<string, string>)[settings.layout || "50-50"] || "1fr 1fr";
  const alignItems = settings.verticalAlign === "top" ? "start" : settings.verticalAlign === "bottom" ? "end" : "center";
  const gap = Math.max(8, Math.min(120, settings.gap ?? 48));

  return (
    <section style={bgStyle(settings)}>
      <div className={`py-20 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {settings.title && (
            <h2 className="text-3xl font-bold tracking-tight uppercase text-white mb-12 text-center" style={hStyle(settings)} data-theme-field="title">
              {settings.title}
            </h2>
          )}
          <div
            className="grid grid-cols-1 md:[grid-template-columns:var(--row-template)]"
            data-studio-gap="gap" style={{ ["--row-template" as any]: template, gap, alignItems }}
          >
            {sampleInPreview(blocks, [{ kind: "text", title: "Add columns", body: "Use the Row section to combine text, images, buttons and video side by side." }]).map(
              (block: any, idx: number) => (
                <RowBlock key={idx} block={block} blockIndex={idx} accentFallback={settings.accentColor} settings={settings} />
              ),
            )}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// IMAGE GALLERY
// ──────────────────────────────

export function GallerySection({ settings, enableAnimations }: any) {
  const sc = useSectionCopy();
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const cols = Math.max(2, Math.min(6, settings.columns ?? 3));
  const textAlign = aClass(settings);
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-20 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.title || settings.subtitle) && (
            <div className={`mb-8 ${textAlign}`}>
              {settings.title && (
                <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="title">{settings.title}</h2>
              )}
              {settings.subtitle && (
                <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="subtitle">{settings.subtitle}</p>
              )}
            </div>
          )}
        </AnimationContainer>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {items.map((item: any, idx: number) => {
            // A tile is a link only when it has one (never the raw image file); only outside sites open a new tab.
            const linked = !!String(item.linkUrl || "").trim();
            const external = linked && /^https?:\/\//i.test(item.linkUrl);
            const Tile: any = linked ? "a" : "div";
            return (
            <Tile
              key={idx}
              {...blockEditAttrs(item, idx)}
              {...(linked ? { href: siteHref(item.linkUrl), ...(external ? { target: "_blank", rel: "noreferrer" } : {}) } : {})}
              className="block aspect-square overflow-hidden rounded-xl bg-white/5"
            >
              {item.imageUrl && (
                <StyledImage
                  src={item.imageUrl}
                  alt={item.alt || (linked ? sc("sectionGalleryImageAlt", { n: idx + 1 }) : "")}
                  settings={item}
                  fieldKey="imageUrl"
                  sizes="(min-width: 768px) 25vw, 50vw"
                  loading="lazy"
                  decoding="async"
                  imgClassName="transition-transform duration-500 hover:scale-105"
                />
              )}
            </Tile>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────
// VIDEO HERO
// ──────────────────────────────

export function VideoHeroSection({ settings, onCtaClick }: any) {
  const url = settings.videoUrl || "";
  // Background embeds need autoplay + mute + loop + no chrome.
  let bgEmbed = "";
  const ytId = youtubeIdOf(url);
  if (ytId) {
    const id = ytId;
    bgEmbed = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&controls=0&playlist=${id}&rel=0&playsinline=1`;
  } else {
    const id = vimeoIdOf(url);
    if (id) bgEmbed = `https://player.vimeo.com/video/${id}?background=1&autoplay=1&loop=1&muted=1`;
  }
  const isFile = !!url && !bgEmbed && !isVideoPageHost(url);

  const overlay = Math.max(0, Math.min(90, settings.overlayOpacity ?? 40)) / 100;
  const align = settings.textAlign === "left" ? "items-start text-left" : settings.textAlign === "right" ? "items-end text-right" : "items-center text-center";

  return (
    <section
      className="relative w-full overflow-hidden flex flex-col justify-center"
      style={{ minHeight: settings.minHeight || "80vh", ...bgStyle(settings) }}
    >
      {bgEmbed ? (
        <iframe
          src={bgEmbed}
          title={settings.headline ?? fb("VideoHeroSection.headline")}
          allow="autoplay; fullscreen; picture-in-picture"
          className="absolute inset-0 w-full h-full pointer-events-none object-cover"
          style={{ border: 0 }}
        />
      ) : isFile ? (
        <video src={url} autoPlay muted loop playsInline poster={settings.posterUrl} className="absolute inset-0 w-full h-full object-cover" />
      ) : null}
      <div className="absolute inset-0 bg-black" style={{ opacity: overlay }} />
      <div className={`relative z-10 w-full mx-auto px-6 flex flex-col ${align} ${mw(settings, "max-w-5xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        {settings.headline && (
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="headline">{settings.headline}</h2>
        )}
        {settings.subheadline && (
          <p className="mt-4 text-white/70 text-base md:text-lg leading-relaxed max-w-2xl" style={bStyle(settings)} data-theme-field="subheadline">{settings.subheadline}</p>
        )}
        {settings.ctaText && (
          <a
            href={siteHref(settings.ctaLink) ?? (onCtaClick ? "#" : undefined)}
            onClick={(e) => { if (onCtaClick && !settings.ctaLink) { e.preventDefault(); onCtaClick(); } }}
            className="mt-8 inline-block px-8 py-3 text-[11px] font-bold tracking-[0.25em] uppercase bg-white text-black rounded-full transition-transform hover:scale-105"
            style={btnS(settings)}
          >
            <span data-theme-field="ctaText">{settings.ctaText}</span>
          </a>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────
// STATS COUNTER
// ──────────────────────────────

/** Animated count-up for a stat value. Falls back to the raw string when the
 *  value has no parseable number, or when animations are off / reduced-motion. */
function StatNumber({ value, prefix, suffix, animate }: { value: string; prefix?: string; suffix?: string; animate?: boolean }) {
  const raw = String(value ?? "");
  const match = raw.match(/[\d.,]+/);
  const target = match ? parseFloat(match[0].replace(/,/g, "")) : NaN;
  const grouped = !!match && match[0].includes(",");
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const canAnimate = animate && !reduce && match && Number.isFinite(target);
  const [display, setDisplay] = useState<string>(canAnimate ? "" : raw);

  useEffect(() => {
    if (!canAnimate) { setDisplay(raw); return; }
    let frame = 0;
    const duration = 1400;
    const start = performance.now();
    const fmt = (n: number) => {
      const rounded = Math.round(n);
      const str = grouped ? rounded.toLocaleString() : String(rounded);
      return raw.replace(match![0], str);
    };
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(fmt(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [raw, canAnimate, target, grouped]);

  return (
    <span>
      {prefix}{display || raw}{suffix}
    </span>
  );
}

export function StatsCounterSection({ settings, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const cols = Math.max(1, Math.min(4, items.length || 1));
  const bg = settings.backgroundColor && settings.backgroundColor !== "transparent" ? settings.backgroundColor : undefined;
  return (
    <section style={{ ...bgStyle(settings), ...(bg && { backgroundColor: bg }) }}>
      <div className={`py-20 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {settings.sectionTitle && (
            <h2 className="text-3xl font-bold tracking-tight uppercase text-white text-center mb-12" style={hStyle(settings)} data-theme-field="sectionTitle">{settings.sectionTitle}</h2>
          )}
        </AnimationContainer>
        <div className="grid gap-8" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {items.map((item: any, idx: number) => (
            <div key={idx} {...blockEditAttrs(item, idx)} className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                <StatNumber value={item.value} prefix={item.prefix} suffix={item.suffix} animate={enableAnimations} />
              </div>
              {item.label && <p className="mt-3 text-sm font-semibold tracking-wide uppercase text-white/80">{item.label}</p>}
              {item.description && <p className="mt-1 text-xs text-white/50">{item.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────
// PRICING TABLE
// ──────────────────────────────

export function PricingTableSection({ settings, onCtaClick, enableAnimations }: any) {
  const items = visibleBlocks(settings.items || settings.blocks || []);
  const cols = Math.max(1, Math.min(4, items.length || 1));
  const highlightName = settings.highlightPlan;
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-20 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.sectionTitle || settings.sectionSubtitle) && (
            <div className="text-center mb-12">
              {settings.sectionTitle && (
                <h2 className="text-3xl font-bold tracking-tight uppercase text-white" style={hStyle(settings)} data-theme-field="sectionTitle">{settings.sectionTitle}</h2>
              )}
              {settings.sectionSubtitle && (
                <p className="mt-3 text-white/60 text-sm leading-relaxed" style={bStyle(settings)} data-theme-field="sectionSubtitle">{settings.sectionSubtitle}</p>
              )}
            </div>
          )}
        </AnimationContainer>
        <div className="grid gap-6 items-stretch" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {items.map((item: any, idx: number) => {
            const highlighted = item.isHighlighted === true || item.isHighlighted === "true" || (highlightName && item.planName === highlightName);
            const features = Array.isArray(item.features)
              ? item.features.map((f: string) => String(f || "").trim()).filter(Boolean)
              : String(item.features || "").split("\n").map((f: string) => f.trim()).filter(Boolean);
            return (
              <div
                key={idx}
                {...blockEditAttrs(item, idx)}
                className={`flex flex-col rounded-2xl p-8 border ${highlighted ? "border-white/40 bg-white/[0.07] shadow-2xl md:scale-[1.03]" : "border-white/10 bg-white/[0.03]"}`}
              >
                {highlighted && (
                  <span className="self-start mb-4 px-3 py-1 text-[9px] font-bold tracking-[0.2em] uppercase rounded-full bg-white text-black">{settings.highlightLabel ?? fb("PricingTableSection.highlightLabel")}</span>
                )}
                {item.planName && <h3 className="text-lg font-bold tracking-wide uppercase text-white">{item.planName}</h3>}
                <div className="mt-3 flex items-baseline gap-1">
                  {item.price && <span className="text-4xl font-bold text-white">{item.price}</span>}
                  {item.period && <span className="text-sm text-white/50">{item.period}</span>}
                </div>
                {item.description && <p className="mt-3 text-sm text-white/60 leading-relaxed">{item.description}</p>}
                {features.length > 0 && (
                  <ul className="mt-6 space-y-2 text-sm text-white/70 flex-1">
                    {features.map((f: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1 text-white/40">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.ctaText && (
                  <a
                    href={siteHref(item.ctaLink) ?? (onCtaClick ? "#" : undefined)}
                    onClick={(e) => { if (onCtaClick && (!item.ctaLink || item.ctaLink === "/")) { e.preventDefault(); onCtaClick(); } }}
                    className={`mt-8 inline-block text-center px-6 py-3 text-[11px] font-bold tracking-[0.2em] uppercase rounded-full transition-transform hover:scale-105 ${highlighted ? "bg-white text-black" : "bg-white/10 text-white border border-white/20"}`}
                    style={btnS(settings)}
                  >
                    {item.ctaText}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** The custom page (title + body) currently being viewed; provided by PageView. */
// The page being shown, plus the site-wide page look (Studio › Style › Custom pages) that every
// "Page content" section follows unless its "Style this page on its own" switch is on.
export const CurrentPageContext = createContext<{ title?: string; body?: string; pageStyle?: Record<string, any> } | null>(null);
const PAGE_STYLE_KEYS = [
  "showEyebrow", "eyebrow", "titleSize", "titleUppercase", "bodySize", "align", "maxWidth", "textColor", "headingColor",
  "titleFont", "titleSizePx", "titleSizePxMobile", "titleWeight", "showRule", "ruleColor", "ruleWidth", "ruleSpacing",
  "textMeasure", "textWidthPx", "topSpacing", "headerWidth",
];
/** Text width choices (Studio › Style › Custom pages › Text width); "full" = the whole column. */
const PAGE_TEXT_MEASURES: Record<string, string> = { readable: "62ch", comfortable: "75ch", wide: "90ch" };
const pageNum = (v: any, min: number, max: number) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? undefined : Math.max(min, Math.min(max, n));
};

const PAGE_TITLE_SIZES: Record<string, string> = { sm: "text-3xl", md: "text-4xl md:text-5xl", lg: "text-5xl md:text-7xl", xl: "text-6xl md:text-8xl" };
const PAGE_BODY_SIZES: Record<string, string> = { sm: "text-[15px]", md: "text-[17px]", lg: "text-[20px]" };

/** Renders a custom page's own title and text, so it can be placed, styled and reordered like any section. */
export function PageContentSection({ settings: own, enableAnimations }: any) {
  const page = useContext(CurrentPageContext);
  // Default: follow the site-wide page look so every custom page matches. "Use its own style"
  // (ownStyle) lets one page keep the section's own values instead.
  const settings = own?.ownStyle || !page?.pageStyle
    ? own
    : { ...own, ...Object.fromEntries(PAGE_STYLE_KEYS.map((k) => [k, page.pageStyle![k]])) };
  const titleId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const align = aClass({ align: settings.align || "left" });
  const title = settings.titleOverride || page?.title || fb("PageContentSection.page.title");
  const body = settings.bodyOverride
    ? settings.bodyOverride.split(/\n{2,}/).map((p: string) => `<p>${p.replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]).replace(/\n/g, "<br/>")}</p>`).join("")
    : sampleHtml(page?.body, "<p>Your page text appears here. Write it in Studio › Pages.</p>");
  // Option D "Ruled" pieces — each value comes from Style › Custom pages or the section's own fields.
  const lineUp = settings.maxWidth === "header";
  // "full", a side-margin width (`min(…)` from contentMaxWidth) or a px Content width (up to 2560, like the header).
  const headerWidth = settings.headerWidth === "full" ? "100%"
    : typeof settings.headerWidth === "string" && /^min\(100%, max\(320px, calc\(100% - \d+(\.\d+)?vw\)\)\)$/.test(settings.headerWidth) ? settings.headerWidth
    : pageNum(settings.headerWidth, 800, 2560) ?? 1200;
  const sizeD = pageNum(settings.titleSizePx, 0, 200) || 0;
  const sizeM = pageNum(settings.titleSizePxMobile, 0, 120) || sizeD;
  const ruleSpacing = pageNum(settings.ruleSpacing, 0, 96);
  const topSpacing = pageNum(settings.topSpacing, 0, 160);
  const ruleWidth = pageNum(settings.ruleWidth, 0, 8) ?? 2;
  // An exact width (px) wins over the named choice; "full" (or nothing set) leaves the whole column.
  const textWidthPx = pageNum(settings.textWidthPx, 0, 2000) || 0;
  const textMax = textWidthPx ? `${textWidthPx}px` : PAGE_TEXT_MEASURES[settings.textMeasure];
  const textPlace = settings.align === "center" ? { marginInline: "auto" } : settings.align === "right" ? { marginLeft: "auto" } : {};
  const titleCss = [
    sizeM ? `@media (max-width:767px){[data-page-title="${titleId}"]{font-size:${sizeM}px !important;}}` : "",
    sizeD ? `@media (min-width:768px){[data-page-title="${titleId}"]{font-size:${sizeD}px !important;}}` : "",
  ].join("");
  const titleStyle: Record<string, any> = {
    // "Uppercase title" off must also beat the Riso heading treatment (h1 is uppercased by the theme CSS).
    ...(settings.titleUppercase === false ? { textTransform: "none" } : {}),
    ...hStyle(settings),
    ...(settings.titleFont ? { fontFamily: `'${String(settings.titleFont).replace(/['"\\;{}<>]/g, "")}', var(--heading-font, sans-serif)` } : {}),
    ...(settings.titleWeight ? { fontWeight: Number(settings.titleWeight) || undefined } : {}),
    ...(sizeD || sizeM ? { lineHeight: 0.92 } : {}),
    ...(ruleSpacing != null ? { marginBottom: settings.showRule ? 0 : ruleSpacing } : {}),
  };
  return (
    <section style={{ ...bgStyle(settings), ...(settings.textColor ? { color: settings.textColor } : {}) }}>
      {titleCss && <style>{titleCss}</style>}
      <div
        className={`py-16 px-6 mx-auto ${lineUp ? "" : mw(settings, "max-w-2xl")}`}
        data-studio-spacing=""
        style={{ ...(lineUp ? { maxWidth: headerWidth } : {}), ...(topSpacing != null ? { paddingTop: topSpacing } : {}), ...spacingStyle(settings) }}
      >
        <AnimationContainer enabled={enableAnimations}>
          <div className={align}>
            {settings.showEyebrow !== false && settings.eyebrow && (
              <p className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-50 mb-4" style={bStyle(settings)} data-theme-field="eyebrow">{settings.eyebrow}</p>
            )}
            {settings.showTitle !== false && (
              <h1
                data-page-title={titleId}
                className={`${PAGE_TITLE_SIZES[settings.titleSize] || PAGE_TITLE_SIZES.md} ${settings.titleWeight ? "" : "font-black"} tracking-tight ${ruleSpacing != null || settings.showRule ? "" : "mb-10"} ${settings.titleUppercase === false ? "" : "uppercase"}`}
                style={titleStyle}
              >
                {title}
              </h1>
            )}
          </div>
          {settings.showRule && (
            <hr
              aria-hidden="true"
              style={{
                border: 0,
                borderTop: `${ruleWidth}px solid ${settings.ruleColor || "rgb(var(--fg-rgb, 255, 255, 255))"}`,
                marginBlock: `${ruleSpacing ?? 32}px`,
              }}
            />
          )}
          {settings.showBody !== false && (
            <div
              className={`leading-[1.8] ${PAGE_BODY_SIZES[settings.bodySize] || PAGE_BODY_SIZES.md} ${align} ${textMax ? "" : "max-w-none"}
                [&_p]:mb-6 [&_h1]:text-4xl [&_h1]:font-black [&_h1]:mb-8 [&_h1]:mt-12 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-5 [&_h2]:mt-10
                [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mb-4 [&_h3]:mt-8 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-6 [&_li]:mb-2
                [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-6 [&_strong]:font-bold [&_em]:italic [&_img]:my-8 [&_img]:max-w-full
                [&_a]:underline [&_a]:underline-offset-4 [&_a]:text-[var(--accent)] [&_a]:hover:opacity-80
                [&_blockquote]:border-l-4 [&_blockquote]:border-current/20 [&_blockquote]:pl-6 [&_blockquote]:italic [&_blockquote]:opacity-80 [&_blockquote]:my-8
                [&_h4]:text-lg [&_h4]:font-bold [&_h4]:mb-3 [&_h4]:mt-6 [&_s]:line-through [&_img]:inline-block [&_img]:h-auto
                [&_.ql-align-center]:text-center [&_.ql-align-right]:text-right [&_.ql-align-justify]:text-justify
                [&_.ql-indent-1]:pl-8 [&_.ql-indent-2]:pl-16 [&_.ql-indent-3]:pl-24 [&_.ql-indent-4]:pl-32
                [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:my-8 [&_iframe]:border-0
                [&_hr]:my-10 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-current/20`}
              style={{ ...bStyle(settings), ...(textMax ? { maxWidth: textMax, ...textPlace } : {}) }}
              dangerouslySetInnerHTML={{ __html: body }}
            />
          )}
        </AnimationContainer>
      </div>
    </section>
  );
}

// ──────────────────────────────
// STUDIO 2.6 SECTION LIBRARY
// ──────────────────────────────

/** The email box shared by Newsletter and Newsletter sign-up (pop-up): it really signs people up. */
function NewsletterForm({ settings, type, source, buttonClassName = "" }: { settings: any; type: string; source: string; buttonClassName?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const word = (key: string) => settings[key] ?? fb(`${type}.${key}`);
  const inputId = useId();
  const submit = async (e: any) => {
    e.preventDefault();
    if (status === "sending") return;
    if (!isEmailAddress(email)) { setStatus("error"); return; }
    // The Studio preview shows the thank-you message without adding the address to the list.
    if (inStudioPreview()) { setStatus("done"); return; }
    setStatus("sending");
    try { await subscribeNewsletter(email, source); setStatus("done"); setEmail(""); }
    catch { setStatus("error"); }
  };
  if (status === "done") {
    return <p role="status" className="text-sm" style={bStyle(settings)} data-theme-field="successMessage">{word("successMessage")}</p>;
  }
  return (
    <>
      <form className="flex gap-2" onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="sr-only">{word("placeholder")}</label>
        <input
          id={inputId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
          aria-invalid={status === "error" || undefined}
          placeholder={word("placeholder")}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-xs text-white focus:border-white/30 transition-all outline-none"
        />
        <MagneticButton
          magnetic={!!settings.btnMagnetic}
          type="submit"
          disabled={status === "sending"}
          className={`fm-active rounded-full px-8 py-3 text-[10px] font-bold tracking-widest flex items-center gap-2 ${hoverEffectClassName(settings.hoverEffect) || "transition-all"} ${buttonClassName}`}
          style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #fff)", color: "var(--btn-text, #000)", ...btnS(settings) }}
        >
          <Send size={12} aria-hidden="true" />
          <span data-theme-field="buttonLabel">{word("buttonLabel")}</span>
        </MagneticButton>
      </form>
      {status === "error" && <p role="alert" className="text-xs" style={{ color: "var(--danger, #e8402a)" }} data-theme-field="errorMessage">{word("errorMessage")}</p>}
    </>
  );
}

// FEATURED COLLECTION — books from one shop category, with a "View all" link to that collection.
export function FeaturedCollectionSection({ settings, books, onProductClick, enableAnimations }: any) {
  const sc = useSectionCopy();
  const design = useSectionDesign();
  const { formatBookPrice } = useCurrency();
  const category = String(settings.productCategory || "").trim();
  const limit = Math.max(1, Math.min(12, settings.productLimit ?? 4));
  const items = selectBooks(books, { source: "category", category, sort: settings.productSort, categories: design?.categories }).slice(0, limit);
  const cols = Math.max(2, Math.min(6, settings.columnsDesktop ?? 4));
  const mobileCols = Math.max(1, Math.min(3, settings.columnsMobile ?? 2));
  const gridId = `featured-collection-${settings.__sectionId || "section"}`;
  const title = settings.title ?? fb("FeaturedCollectionSection.title");
  const viewAll = settings.viewAllText ?? fb("FeaturedCollectionSection.viewAllText");
  const href = siteHref(category ? `/collections/${slugify(category)}` : "/?catalog=true");
  if (!items.length) return null;
  return (
    <section style={bgStyle(settings)}>
      <style>{`
        .${gridId} { grid-template-columns: repeat(${mobileCols}, minmax(0, 1fr)); }
        @media (min-width: 768px) { .${gridId} { grid-template-columns: repeat(${cols}, minmax(0, 1fr)); } }
      `}</style>
      <div className={`py-16 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className={`mb-8 flex flex-wrap items-end gap-4 ${settings.align === "center" ? "justify-center text-center" : settings.align === "right" ? "justify-end text-right" : "justify-between"}`}>
            <div>
              {settings.eyebrow && <p className="text-[10px] tracking-[0.3em] font-bold uppercase mb-2" style={{ color: "var(--accent, #e8402a)" }} data-theme-field="eyebrow">{settings.eyebrow}</p>}
              {title && <h2 className="text-3xl md:text-4xl tracking-tight uppercase" style={hStyle(settings)} data-theme-field="title">{title}</h2>}
            </div>
            {viewAll && <a href={href} className="text-[11px] font-bold tracking-[0.2em] uppercase underline underline-offset-4" style={bStyle(settings)} data-theme-field="viewAllText">{viewAll}</a>}
          </div>
        </AnimationContainer>
        <div className={`${gridId} grid gap-6`}>
          {items.map((book: any, idx: number) => (
            <AnimationContainer className="min-w-0" key={book.id || idx} enabled={enableAnimations} delay={idx * 0.05}>
              <div
                className="fm-card group min-w-0 cursor-pointer"
                role="link"
                tabIndex={0}
                aria-label={sc("sectionViewBook", { title: book.title })}
                onClick={() => onProductClick?.(book)}
                onKeyDown={(e: any) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onProductClick?.(book); } }}
              >
                <div className="fm-photo-frame relative overflow-hidden bg-white/5" style={{ aspectRatio: "3 / 4" }}>
                  {book.photos?.[0]?.url && <><PhotoToneDefs photo={book.photos[0]} /><img loading="lazy" src={book.photos[0].url} {...photoSrcSet(book.photos[0], gridPhotoSizes([{ from: 0, cols: mobileCols }, { from: 768, cols }], { photo: book.photos[0], frame: "3 / 4" }))} alt={book.title} decoding="async" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"  style={framingStyle(book.photos[0])} /></>}
                </div>
                <h3 className="fm-card-title mt-3 text-[15px] leading-snug" style={hStyle(settings)}>{book.title}</h3>
                {settings.showPrices !== false && (
                  <p className="fm-card-price-wrap text-sm fm-muted">
                    {showsSale(book) && <span className="fm-card-price-old line-through opacity-60 mr-1.5">{formatBookPrice({ ...book, isOnSale: false })}</span>}
                    <span className="fm-card-price">{formatBookPrice(book)}</span>
                  </p>
                )}
              </div>
            </AnimationContainer>
          ))}
        </div>
      </div>
    </section>
  );
}

// BOOK SPOTLIGHT — one book, large. Blank book = the book on a book page, else the first book.
export function BookSpotlightSection({ settings, books, onProductClick, enableAnimations }: any) {
  const { book: pageBook } = useSectionPage();
  const { formatBookPrice } = useCurrency();
  const target: any = settings.productSlug ? pickBook(books, settings) : (pageBook || pickBook(books, settings));
  if (!target) return null;
  const photo = target.photos?.[0]?.url;
  const coverRight = settings.imagePosition === "right";
  const eyebrow = settings.eyebrow ?? fb("BookSpotlightSection.eyebrow");
  const cta = settings.ctaText ?? fb("BookSpotlightSection.ctaText");
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-20 px-6 mx-auto ${mw(settings, "max-w-6xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          <div className="fm-card grid md:grid-cols-2 gap-10 items-center">
            <div className={`fm-photo-frame aspect-[3/4] overflow-hidden bg-white/5 ${coverRight ? "md:order-2" : ""}`}>
              {photo ? <><PhotoToneDefs photo={target.photos?.[0]} /><img loading="lazy" src={photo} {...photoSrcSet(target.photos?.[0], FEATURE_PHOTO_SIZES)} decoding="async" className="w-full h-full object-cover" style={framingStyle(target.photos?.[0])} alt={target.title} /></> : null}
            </div>
            <div className="space-y-5">
              {eyebrow && <p className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ color: settings.accentColor || "var(--accent, #e8402a)" }} data-theme-field="eyebrow">{eyebrow}</p>}
              <h2 className="fm-card-title text-3xl md:text-5xl font-bold uppercase leading-none" style={hStyle(settings)}>{target.title}</h2>
              {target.authorName && <p className="text-sm fm-muted" style={bStyle(settings)}>{target.authorName}</p>}
              {settings.quote && (
                <blockquote className="border-l-2 pl-4 space-y-2" style={{ borderColor: settings.accentColor || "var(--accent, #e8402a)" }}>
                  <p className="text-lg leading-relaxed" style={bStyle(settings)} data-theme-field="quote">“{settings.quote}”</p>
                  {settings.quoteSource && <footer className="text-[11px] tracking-[0.2em] uppercase fm-muted" data-theme-field="quoteSource">{settings.quoteSource}</footer>}
                </blockquote>
              )}
              {settings.showDescription !== false && target.description && (
                <p className="text-sm leading-relaxed line-clamp-4 fm-muted" style={bStyle(settings)}>{String(target.description).replace(/<[^>]+>/g, " ")}</p>
              )}
              {settings.showPrice !== false && <p className="fm-card-price-wrap text-2xl font-bold" style={bStyle(settings)}><span className="fm-card-price">{formatBookPrice(target)}</span></p>}
              {cta && (
                <MagneticButton
                  magnetic={!!settings.btnMagnetic}
                  onClick={() => onProductClick?.(target)}
                  className="px-8 py-3.5 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase"
                  style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #e8402a)", color: "var(--btn-text, #100f0d)", ...btnS(settings) }}
                >
                  <span data-theme-field="ctaText">{cta}</span>
                </MagneticButton>
              )}
            </div>
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// PRAISE & PRESS QUOTES
const QUOTE_SIZES: Record<string, string> = { sm: "text-base", md: "text-xl", lg: "text-2xl md:text-3xl" };
export function PraiseQuotesSection({ settings, enableAnimations }: any) {
  const items = sampleInPreview(visibleBlocks(settings.items || settings.blocks || []), [{ quote: "Add quotes from reviews or other writers as blocks.", source: "Studio" }]);
  const title = settings.title ?? fb("PraiseQuotesSection.title");
  const textAlign = aClass(settings);
  const grid = settings.layout === "grid";
  if (!items.length) return null;
  return (
    <section style={bgStyle(settings)}>
      <div className={`py-20 px-6 mx-auto ${mw(settings, "max-w-5xl")}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {(settings.eyebrow || title) && (
            <div className={`mb-10 ${textAlign}`}>
              {settings.eyebrow && <p className="text-[10px] tracking-[0.3em] font-bold uppercase mb-2" style={{ color: "var(--accent, #e8402a)" }} data-theme-field="eyebrow">{settings.eyebrow}</p>}
              {title && <h2 className="text-3xl tracking-tight uppercase" style={hStyle(settings)} data-theme-field="title">{title}</h2>}
            </div>
          )}
          <div className={grid ? "grid md:grid-cols-2 gap-6" : "space-y-12"}>
            {items.map((item: any, idx: number) => (
              <figure key={item.id || idx} {...blockEditAttrs(item, idx)} className={`${textAlign} ${grid ? "p-6 border border-white/10" : ""}`}>
                <span aria-hidden="true" className="block text-5xl leading-none font-bold" style={{ color: settings.accentColor || "var(--accent, #e8402a)" }}>“</span>
                <blockquote className={`${QUOTE_SIZES[settings.quoteSize] || QUOTE_SIZES.lg} leading-snug`} style={bStyle(settings)}>
                  <span data-theme-field="quote">{item.quote}</span>
                </blockquote>
                {(item.source || item.publication) && (
                  <figcaption className="mt-4 text-[11px] tracking-[0.2em] uppercase fm-muted">
                    <span data-theme-field="source">{item.source}</span>
                    {item.publication && <>{item.source ? " · " : ""}{item.linkUrl ? <a href={siteHref(item.linkUrl)} className="underline underline-offset-4"><cite data-theme-field="publication">{item.publication}</cite></a> : <cite data-theme-field="publication">{item.publication}</cite>}</>}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// IMAGE COLLAGE — mosaic (first picture large), staggered row or even strip.
export function ImageCollageSection({ settings, enableAnimations }: any) {
  const sc = useSectionCopy();
  const items = sampleInPreview(visibleBlocks(settings.items || settings.blocks || []), [{ imageUrl: "", caption: "Add pictures as blocks" }, { imageUrl: "" }, { imageUrl: "" }]).slice(0, 6);
  const layout = settings.layout || "mosaic";
  const gap = Math.max(0, Math.min(48, settings.gap ?? 12));
  const id = `collage-${settings.__sectionId || "section"}`;
  if (!items.length) return null;
  const cell = (idx: number) => layout === "mosaic" && idx === 0 ? "md:col-span-2 md:row-span-2" : "";
  return (
    <section style={bgStyle(settings)}>
      <style>{`
        .${id} { display: grid; gap: ${gap}px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (min-width: 768px) { .${id} { grid-template-columns: repeat(${layout === "mosaic" ? 4 : Math.min(items.length, 5)}, minmax(0, 1fr)); } }
        ${layout === "stagger" ? `@media (min-width: 768px) { .${id} > :nth-child(even) { margin-top: ${gap * 4}px; } }` : ""}
      `}</style>
      <div className={`py-16 px-6 mx-auto ${mw(settings)}`} data-studio-spacing="" style={spacingStyle(settings)}>
        <AnimationContainer enabled={enableAnimations}>
          {settings.title && <h2 className="mb-8 text-3xl tracking-tight uppercase" style={hStyle(settings)} data-theme-field="title">{settings.title}</h2>}
          <div className={id}>
            {items.map((item: any, idx: number) => {
              const picture = (
                <div className={`overflow-hidden bg-white/5 ${layout === "mosaic" && idx === 0 ? "aspect-square" : layout === "strip" ? "aspect-[3/4]" : "aspect-[4/5]"}`}>
                  {item.imageUrl
                    ? <StyledImage src={item.imageUrl} alt={item.alt || ""} settings={item} fieldKey="imageUrl" sizes="(min-width: 768px) 33vw, 50vw" loading="lazy" decoding="async" />
                    : <div className="w-full h-full grid place-items-center text-xs fm-muted">{inStudioPreview() ? sc("sectionNoImage") : null}</div>}
                </div>
              );
              return (
                <figure key={item.id || idx} {...blockEditAttrs(item, idx)} className={cell(idx)}>
                  {item.linkUrl ? <a href={siteHref(item.linkUrl)} className="block">{picture}</a> : picture}
                  {settings.showCaptions !== false && item.caption && <figcaption className="mt-2 text-xs fm-muted" data-theme-field="caption">{item.caption}</figcaption>}
                </figure>
              );
            })}
          </div>
        </AnimationContainer>
      </div>
    </section>
  );
}

// PROMO STRIP — slim line of text with a link, made for the "Under the header" group.
const PROMO_SIZES: Record<string, string> = { xs: "text-[10px]", sm: "text-xs", md: "text-sm" };
export function PromoStripSection({ settings }: any) {
  const text = settings.text ?? fb("PromoStripSection.text");
  if (!text && !settings.linkText) return null;
  const justify = settings.align === "left" ? "justify-start text-left" : settings.align === "right" ? "justify-end text-right" : "justify-center text-center";
  return (
    <section style={bgStyle(settings)}>
      <div className={`px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-bold uppercase tracking-[0.2em] ${PROMO_SIZES[settings.size] || PROMO_SIZES.sm} ${justify}`} data-studio-spacing="" style={{ ...bStyle(settings), ...spacingStyle(settings) }}>
        {text && <span data-theme-field="text">{text}</span>}
        {settings.linkText && <a href={siteHref(settings.linkUrl || "/?catalog=true")} className="underline underline-offset-4" data-theme-field="linkText">{settings.linkText}</a>}
      </div>
    </section>
  );
}

// NEWSLETTER SIGN-UP (POP-UP) — picture + invitation + a real email sign-up, made for the Pop-up group.
export function NewsletterPopupSection({ settings, enableAnimations }: any) {
  const word = (key: string) => settings[key] ?? fb(`NewsletterPopupSection.${key}`);
  return (
    <section style={bgStyle(settings)}>
      <div className={`grid ${settings.imageUrl ? "md:grid-cols-2" : ""}`}>
        {settings.imageUrl && (
          <div className="min-h-[200px] overflow-hidden">
            <StyledImage src={settings.imageUrl} alt={settings.imageAlt || ""} settings={settings} fieldKey="imageUrl" sizes="(min-width: 768px) 280px, 100vw" loading="lazy" decoding="async" />
          </div>
        )}
        <div className="p-8 md:p-10 space-y-5" data-studio-spacing="" style={spacingStyle(settings)}>
          <AnimationContainer enabled={enableAnimations}>
            <div className="space-y-3">
              {settings.eyebrow && <p className="text-[10px] tracking-[0.3em] font-bold uppercase" style={{ color: "var(--accent, #e8402a)" }} data-theme-field="eyebrow">{settings.eyebrow}</p>}
              <h2 className="text-3xl font-bold uppercase leading-none" style={hStyle(settings)} data-theme-field="title">{word("title")}</h2>
              <p className="text-sm leading-relaxed fm-muted" style={bStyle(settings)} data-theme-field="description">{word("description")}</p>
            </div>
            <div className="mt-5 space-y-3">
              <NewsletterForm settings={settings} type="NewsletterPopupSection" source="website-popup" />
              {settings.smallPrint && <p className="text-[10px] tracking-widest fm-muted" data-theme-field="smallPrint">{settings.smallPrint}</p>}
            </div>
          </AnimationContainer>
        </div>
      </div>
    </section>
  );
}

// STICKY ADD-TO-BAG — on a book page, a bar fixed to the bottom once the buy box (.fm-pdp-card) scrolls out of view.
export function StickyAddToBagSection({ settings }: any) {
  const { book } = useSectionPage();
  const { addToCart } = useCart();
  const { formatBookPrice } = useCurrency();
  const preview = inStudioPreview();
  const [show, setShow] = useState(preview);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (preview || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    const card = document.querySelector(".fm-pdp-card");
    if (!card) return;
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(card);
    return () => io.disconnect();
  }, [preview, book?.id]);
  if (!book) return null;
  const word = (key: string) => settings[key] ?? fb(`StickyAddToBagSection.${key}`);
  // Only a plain book (one way to buy it, no add-ons, not a pre-order) is added straight from the bar;
  // anything with choices sends the shopper back to the buy box, which handles them.
  const variants = Array.isArray(book.variants) ? book.variants : [];
  const quick = quickAddChoice(book);
  const needsChoice = variants.length > 1 || (Array.isArray(book.addOns) && book.addOns.length > 0) || book.preorder === true || book.comingSoon === true || book.productType === "giftCard";
  const soldOut = !needsChoice && !quick.inStock;
  const photo = smallPhotoUrl(book.photos?.[0], 96);
  const act = () => {
    if (needsChoice) { document.querySelector(".fm-pdp-card")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (addToCart(book, quick.variant)) { setAdded(true); window.setTimeout(() => setAdded(false), 2500); }
  };
  return (
    <section aria-label={book.title} className={settings.showOnPhonesOnly ? "lg:hidden" : ""}>
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 transition-transform duration-300 ${show ? "translate-y-0" : "translate-y-full"}`}
        style={{ background: "var(--bg-color, Canvas)", ...bgStyle(settings) }}
        aria-hidden={!show || undefined}
      >
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3" data-studio-spacing="" style={spacingStyle(settings)}>
          {photo && <img loading="lazy" src={photo} alt="" className="h-12 w-9 object-cover" decoding="async" />}
          <div className="min-w-0 flex-1">
            <p className="fm-card-title truncate text-sm font-bold" style={hStyle(settings)}>{book.title}</p>
            {settings.showPrice !== false && <p className="fm-card-price-wrap text-xs fm-muted"><span className="fm-card-price">{formatBookPrice(book)}</span></p>}
          </div>
          <button
            type="button"
            tabIndex={show ? 0 : -1}
            disabled={soldOut}
            onClick={act}
            className="px-6 py-3 text-[10px] font-bold tracking-[0.2em] uppercase disabled:opacity-50"
            style={{ backgroundColor: settings.accentColor || "var(--btn-bg, #e8402a)", color: "var(--btn-text, #100f0d)", ...btnS(settings) }}
          >
            {soldOut ? <span data-theme-field="soldOutText">{word("soldOutText")}</span> : needsChoice ? <span data-theme-field="optionsText">{word("optionsText")}</span> : <span data-theme-field="ctaText">{word("ctaText")}</span>}
          </button>
          <span role="status" className="sr-only">{added ? word("addedText") : ""}</span>
        </div>
      </div>
    </section>
  );
}
