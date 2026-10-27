import { m, AnimatePresence } from "motion/react";
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Send, Heart, Zap } from "lucide-react";
import { queryFromSearch } from "../features/site/searchResultsLink";
import { catalogStateInUrlOn, catalogUrlSearch, readCatalogUrl } from "../features/site/catalogUrlState";
import { inEditorPreview } from "../lib/trackingGuard";
import { Link, useNavigate, useLocation, useParams } from "react-router";
import { CATEGORIES, placeholderImage, DEFAULT_SOCIAL } from "../features/site/constants";
import { subscribePreview } from "../features/site/previewTab";
import { aspectRatioValue } from "../features/site/imageAspect";
import { getFilteredItems, getPublishedBooks, resolveLogoDesign, resolveLogoPosition } from "../features/site/selectors";
import type { Book } from "../features/site/types";
import { useSiteData } from "../features/site/useSiteData";
import { BootSplash } from "./BootSplash";
import { buildStorefrontTokenVars, RISO_STOREFRONT_CSS, risoGrainCss, STOREFRONT_TOKEN_CSS } from "../features/site/themeTokens";
import { wantsHome } from "../features/site/homeLink";
import { getCopy } from "../features/site/storeCopy";
import { preorderActive } from "../features/site/preorder";
import { comingSoonActive } from "../features/site/comingSoon";
import { buildNavItems, categoryNames, parentOf } from "../features/site/navItems";
import { RADIUS_SCALES } from "../features/site/designTokens";
import { catalogHeaderMaxWidth, contentMaxWidth } from "../features/site/headerNav";
import { shopFilterBarCategories, shopFilterBarCounts, shopFilterBarInStock, showShopFilterBar } from "../features/site/shopFilterBar";
import { StorefrontThemeStyle } from "../features/site/StorefrontThemeStyle";
import { StorefrontOverrides } from "../features/site/StorefrontOverrides";
import { schemeButtonColors } from "../features/site/colorSchemes";
import { googleFontHref } from "../features/site/fonts";
import { useCurrency } from "../CurrencyContext";
import { useCart } from "../CartContext";
import { quickAddChoice } from "../features/site/buyable";
import { QuickView } from "../features/site/QuickView";
import { isEmailAddress, subscribeNewsletter } from "../features/site/newsletterSignup";
import { SectionList, GlobalSections, TemplateSections } from "./sectionRender";
import { SectionPageContext } from "./sectionCopy";
import { useWishlist } from "../lib/wishlist";
import { displayPrice as cardDisplayPrice, showsSale, salePercentOff } from "../features/site/displayPrice";
import { useSEO } from "../lib/seo";
import { ga4FilterUse } from "../lib/ga4";
import { breadcrumbData, collectionStructuredData, leadSentences, profileLinks, seoTopicList, siteStructuredData } from "../lib/bookSeo";
import { CatalogControls, applyCatalogControls, soldOutLastOn, appliedFilters, filterView, EMPTY_FILTERS, type CatalogFilterState, type SortKey } from "../features/site/CatalogControls";
import RecentlyViewedRow from "../features/site/RecentlyViewedRow";
import { StoreHeader } from "../features/site/StoreHeader";
import { StoreFooter } from "../features/site/StoreFooter";
import { designNumber } from "../features/site/designNumber";
import { catalogAutoLoadOn, catalogPageSize, nextShown, shouldAutoLoad, visibleCount } from "../features/site/catalogPaging";
import { resolveMainDesign } from "../features/site/surfaceDesign";
import { categoryTemplateSurface, previewTemplate } from "../features/site/templateAlternates";
import { regionProps } from "../features/site/storefrontRegions";
import { collectionIntro } from "../features/site/collectionIntro";
import { SoldOutBadge, soldOutPhotoStyle } from "../features/site/SoldOutBadge";
import { gridPhotoSizes, photoSrcSet } from "../features/site/photoSources";
import CardHoverPhoto from "../features/site/CardHoverPhoto";
import { cardHoverPhoto } from "../features/site/cardHoverPhoto";
import { cardFormats } from "../features/site/cardFormats";
import { cardCreator } from "../features/site/cardCreator";
import CardRatingStars from "../features/site/CardRatingStars";
import { framingStyle } from "../features/site/photoFraming";
import { PhotoToneDefs } from "../features/site/PhotoToneDefs";
import { arrivedPrerendered } from "../lib/prerenderedPage";

const catNameForSEO = (category: any) => typeof category === "string" ? category : category?.name;

export function storefrontCategories(value: unknown) {
  return (Array.isArray(value) ? value : CATEGORIES).filter(
    (category: any) => typeof category === "string" || (category && typeof category === "object"),
  );
}

// ──────────────────────────────
// Image with skeleton loader
// ──────────────────────────────
function SkeletonImage({ src, srcSet, sizes, alt, className, style, frameStyle, priority }: { src: string; srcSet?: string; sizes?: string; alt: string; className?: string; style?: CSSProperties; frameStyle?: CSSProperties; priority?: "high" | "eager" }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // A photo the browser already has (the page's own HTML loaded it, or an earlier visit) shows at once
  // instead of fading in again from the skeleton.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [src]);
  return (
    <div className="relative w-full h-full" style={frameStyle}>
      {!loaded && (
        <div data-fm-skeleton className="absolute inset-0 fm-surface-2 animate-pulse" />
      )}
      <img
        ref={imgRef}
        data-fm-fade
        // The first row is on screen at once: fetch it straight away (the first photos first).
        loading={priority ? "eager" : "lazy"}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        fetchPriority={priority === "high" ? "high" : undefined}
        decoding="async"
        className={`${className} transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        style={style}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

// ──────────────────────────────
// Maintenance splash
// ──────────────────────────────
function MaintenancePage({ message, design }: { message?: string; design?: any }) {
  const debug = typeof window !== "undefined" && window.location.search.includes("debug=true");
  const adminPath = debug ? "/admin?debug=true" : "/admin";
  const c = (key: string) => getCopy(design, key);

  return (
    <div data-fm-store data-studio-target="copy:Maintenance page" data-studio-label="Maintenance page" className="fm-page min-h-screen text-white flex flex-col items-center justify-center gap-6 text-center px-6">
      <StorefrontThemeStyle design={design} />
      <span className="rotate-1 border-2 border-[var(--rp-outline)] bg-[var(--accent)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-[var(--on-accent)] shadow-[4px_4px_0_var(--rp-shadow-color)]">
        {c("maintenanceTag")}
      </span>
      <h1 className="text-5xl md:text-7xl uppercase leading-none">{c("maintenanceTitle")}</h1>
      <p className="text-white/60 text-sm max-w-sm leading-relaxed">
        {message || c("maintenanceMessage")}
      </p>
      <div className="mt-4 flex flex-col items-center gap-6">
        <p className="text-[9px] tracking-[0.4em] text-white/40 uppercase">{c("maintenanceFooter")}</p>
        <Link
          to={adminPath}
          className="px-5 py-2.5 border-2 border-[var(--rp-outline)] text-[9px] tracking-[0.2em] uppercase font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          {c("maintenanceAdmin")}
        </Link>
      </div>
    </div>
  );
}

// ──────────────────────────────
// Newsletter sign-up
// ──────────────────────────────
function Newsletter({ design }: { design?: any }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const buttonBg = design?.buttonColor || design?.primaryColor || "#ffffff";
  const buttonText = design?.buttonTextColor || "#100f0d";
  const buttonRadius = Math.max(0, Math.min(999, design?.buttonRadius ?? 999));
  const buttonStyle = design?.buttonStyle || "solid";
  const buttonUppercase = design?.buttonUppercase ?? true;
  const buttonShadow = design?.buttonShadow ?? true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailAddress(email)) { setStatus("error"); return; }
    setStatus("loading");
    try {
      await subscribeNewsletter(email, "website-footer");
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div {...regionProps("newsletterPanel")} data-studio-target="style:catalogElements|copy:Newsletter" data-studio-label="Newsletter box" className="py-16 border-t border-white/10 text-center space-y-6">
      <div className="space-y-2">
        <h3 {...regionProps("newsletterHeading")} className="text-lg font-bold tracking-tight">{getCopy(design, "newsletterHeading")}</h3>
        <p {...regionProps("newsletterText")} className="text-white/40 text-xs tracking-widest max-w-sm mx-auto">
          {getCopy(design, "newsletterText")}
        </p>
      </div>
      {status === "success" ? (
        <m.p {...regionProps("newsletterStatus")}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] tracking-[0.4em] text-white/60 uppercase"
        >
          {getCopy(design, "newsletterSuccess")}
        </m.p>
      ) : (
        <form {...regionProps("newsletterForm")} onSubmit={handleSubmit} className="flex gap-2 max-w-sm mx-auto">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={getCopy(design, "newsletterPlaceholder")}
            required
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-xs text-white placeholder-white/30 outline-none focus:border-white/30 transition-all"
          />
          <button {...regionProps("newsletterButton")}
            type="submit"
            disabled={status === "loading"}
            className={`px-5 py-3 text-[10px] font-bold tracking-widest transition-all disabled:opacity-50 flex items-center gap-2 hover:scale-[1.02] ${
              buttonShadow ? "shadow-xl" : ""
            } ${buttonUppercase ? "uppercase" : ""}`}
            style={{
              backgroundColor: buttonStyle === "solid" ? buttonBg : "transparent",
              color: buttonStyle === "solid" ? buttonText : buttonBg,
              border: buttonStyle !== "solid" ? `1px solid ${buttonBg}` : "none",
              borderRadius: buttonRadius,
            }}
          >
            <Send size={12} />
            {getCopy(design, status === "loading" ? "newsletterLoading" : "newsletterButton")}
          </button>
        </form>
      )}
      {status === "error" && (
        <p {...regionProps("newsletterStatus")} className="text-red-400 text-[10px] tracking-widest">{getCopy(design, "newsletterError")}</p>
      )}
    </div>
  );
}

// ──────────────────────────────
// Hook for real-time theme sync
// ──────────────────────────────
function useThemePreview(initialDesign: any) {
  const [designOverride, setDesignOverride] = useState<any>(null);
  const isPreview = window.location.search.includes("preview=true");

  useEffect(() => {
    // Studio's unsaved design (one shared listener, previewTab.ts). Nothing posts THEME_UPDATE on the old
    // "site_preview_updates" channel any more (the book editor sends BOOK_PREVIEW_UPDATE there, read by useSiteData).
    if (!isPreview) return;
    const stopPreview = subscribePreview((preview) => setDesignOverride(preview.design));
    window.parent.postMessage({ type: "PREVIEW_READY" }, window.location.origin);
    return stopPreview;
  }, [isPreview]);

  return designOverride || initialDesign;
}

// ──────────────────────────────
// Dynamic Font Loader
// ──────────────────────────────
function GoogleFontLoader({ font }: { font: string }) {
  useEffect(() => {
    if (!font || font === "Inter") return;
    const linkId = `google-font-${font.replace(/\s+/g, "-").toLowerCase()}`;
    if (document.getElementById(linkId)) return;

    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = googleFontHref(font);
    document.head.appendChild(link);
  }, [font]);
  return null;
}

// ──────────────────────────────
// Typography tokens — turns the editor's type settings into real CSS.
// Applied via a scoped <style> targeting [data-fm-store] so heading vs body
// fonts, weights, base size, line-height and tracking work site-wide without
// editing every component. (rem-based Tailwind sizes are left intact.)
// ──────────────────────────────
export function resolveTypography(design: any) {
  // Typography › "Theme font" overrides Body font (its label says so, and every other page already
  // reads it first through StorefrontThemeStyle); the home/catalog view read Body font first.
  const body = design?.font || design?.bodyFont || "Inter";
  const heading = design?.headingFont || design?.font || design?.bodyFont || "Inter";
  const base = design?.baseFontSize ?? (design?.fontSize === "sm" ? 15 : design?.fontSize === "lg" ? 18 : 16);
  const tracking =
    design?.letterSpacing === "ultra" ? "0.08em" : design?.letterSpacing === "wide" ? "0.03em" : "normal";
  const lineHeight = design?.lineHeight ?? 1.6;
  const headingWeight = design?.headingWeight ?? 800;
  const bodyWeight = design?.bodyWeight ?? 400;
  // Modular type scale (Type Scale Designer): a ratio like 1.25 computes h1–h6
  // from the base size. 0/undefined = off (Tailwind sizes stay untouched).
  const typeScale = design?.typeScale || 0;
  return { body, heading, base, tracking, lineHeight, headingWeight, bodyWeight, typeScale };
}

function TypographyTokens({ design }: { design: any }) {
  const t = resolveTypography(design);
  // Global button colors — every CTA reads these vars unless a section
  // overrides its own accent.
  const btnBg = design?.buttonColor || design?.primaryColor || "#e8402a";
  const btnText = design?.buttonTextColor || "#100f0d";
  let css = `
[data-fm-store]{
  font-family:'${t.body}',sans-serif;
  font-size:${t.base}px;
  line-height:${t.lineHeight};
  font-weight:${t.bodyWeight};
  ${buildStorefrontTokenVars(design)}
  --btn-bg:${btnBg};
  --btn-text:${btnText};
  --bg-color:${design?.backgroundColor || "#000000"};
  --text-color:${design?.textColor || "#ffffff"};
  --link-hover-color:${design?.linkColorHover || "#ff6b55"};
  --border-color:${design?.borderColor || "rgba(255,255,255,0.05)"};
  --btn-hover-bg:${design?.buttonHoverBgColor || "#C1BBBB"};
  --btn-hover-text:${design?.buttonHoverTextColor || "#FFFFFF"};
  --badge-text-primary:${design?.badgeTextPrimary || "#000000"};
  --badge-bg-primary:${design?.badgeBgPrimary || "#F63737"};
  --badge-text-secondary:${design?.badgeTextSecondary || "#000000"};
  --badge-bg-secondary:${design?.badgeBgSecondary || "#E0E0E0"};
  --low-inventory-color:${design?.lowInventoryColor || "#056FFA"};
}
[data-fm-store] h1,[data-fm-store] h2,[data-fm-store] h3,[data-fm-store] h4,[data-fm-store] h5,[data-fm-store] h6{
  font-family:'${t.heading}',sans-serif;
  font-weight:${t.headingWeight};
  letter-spacing:${t.tracking};
}
[data-fm-store] a:hover, [data-fm-store] button.hover-text-accent:hover {
  color: var(--link-hover-color) !important;
}
/* Keep the legacy plain border-b tied to the configurable Border color. */
[data-fm-store] .border-b {
  border-color: var(--border-color) !important;
}
/* Style hover transitions for buttons */
[data-fm-store] button.store-btn-primary:hover, [data-fm-store] a.store-btn-primary:hover {
  background-color: var(--btn-hover-bg) !important;
  color: var(--btn-hover-text) !important;
}
/* Semantic token layer: remaps white/black alpha utilities + fm-* helpers. */
${STOREFRONT_TOKEN_CSS}
${design?.themeStyle === "riso" ? RISO_STOREFRONT_CSS + risoGrainCss(design) : ""}
`;
  if (t.typeScale) {
    const size = (steps: number) => Math.round(t.base * Math.pow(t.typeScale, steps) * 10) / 10;
    css += `
[data-fm-store] h1{font-size:${size(5)}px;line-height:1.1;}
[data-fm-store] h2{font-size:${size(4)}px;line-height:1.15;}
[data-fm-store] h3{font-size:${size(3)}px;line-height:1.2;}
[data-fm-store] h4{font-size:${size(2)}px;line-height:1.25;}
[data-fm-store] h5{font-size:${size(1)}px;line-height:1.3;}
[data-fm-store] h6{font-size:${t.base}px;line-height:1.4;}
`;
  }
  // Density system: one control rescales the vertical rhythm of every section.
  const density = design?.density;
  // Header & menu font: applies to the whole header (links, currency, cart). Empty = body font.
  const navFont = design?.navFont;
  if (navFont) css += `[data-fm-store] header[data-section="navigation"]{font-family:'${String(navFont).replace(/'/g, "")}',sans-serif;}\n`;
  if (density === "compact") {
    css += `[data-fm-store] [data-section-id] > section{padding-top:3rem;padding-bottom:3rem;}`;
  } else if (density === "spacious") {
    css += `[data-fm-store] [data-section-id] > section{padding-top:8.5rem;padding-bottom:8.5rem;}`;
  }
  return (
    <>
      <GoogleFontLoader font={t.body} />
      <GoogleFontLoader font={t.heading} />
      {navFont && <GoogleFontLoader font={navFont} />}
      {design?.wordmarkFont && <GoogleFontLoader font={design.wordmarkFont} />}
      <style>{css}</style>
      {/* Card title/price + small-print controls — the same layer every other storefront page renders. */}
      <StorefrontOverrides design={design} />
    </>
  );
}

// ──────────────────────────────
// Per-section helpers: font overrides + entrance animations
// ──────────────────────────────

// Section rendering helpers (SectionFontOverride, SectionReveal, sectionInWindow)
// and the GlobalSections component now live in ./sectionRender so they can be
// shared with the standalone storefront pages (product/collection/page/cart).
// GlobalSections is imported at the top of this file.

// ──────────────────────────────
// Main exported component
// ──────────────────────────────
/** The category a /collections/<slug> URL opens. An unknown or renamed slug opens every book, never the first category's books under the wrong URL. */
function collectionCategory(collectionSlug: string, categories: any[]): any {
  if (collectionSlug === "all") return "ALL";
  const slugOf = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return categories.find((c: any) => categoryNames(c).some((n: string) => slugOf(n) === collectionSlug)) ?? "ALL";
}

export default function MainSite({ setShowCatalog, showCatalog }: any) {
  // Landing here as server-rendered HTML: the books are already on screen, so they don't fade in a second time.
  const [skipEntrance] = useState(arrivedPrerendered);
  const navigate = useNavigate();
  const location = useLocation();
  const { formatBookPrice, convertPrice } = useCurrency();
  const { addToCart } = useCart();
  const { books, settings, pages, loading, loadError, retry } = useSiteData();

  // Auto-open catalog view when the editor previews the shop tab
  const isCatalogPreview = window.location.search.includes("catalog=true");
  useEffect(() => {
    if (isCatalogPreview && setShowCatalog) setShowCatalog(true);
  }, [isCatalogPreview, setShowCatalog]);
  
  // Real-time preview override
  const activeDesign = useThemePreview(settings?.design || {});
  
  const legacyDesign = activeDesign;
  const heroDesign = resolveMainDesign(legacyDesign, false, false);
  const onCollectionRoute = location.pathname.startsWith("/collections/");
  // "Skip straight to the shop" is known on the first render; waiting for the effect below to flip
  // showCatalog drew one frame with the Home layout and shifted the page (layout shift on load).
  const catalogOpen = showCatalog || legacyDesign?.showHero === false;
  const storefrontDesign = resolveMainDesign(legacyDesign, catalogOpen || isCatalogPreview, onCollectionRoute);
  const storefrontLogoDesign = resolveLogoDesign(legacyDesign.storefront, [legacyDesign.heroPage, legacyDesign]);
  const storefrontLogoPosition = resolveLogoPosition(legacyDesign.storefront, [legacyDesign.heroPage, legacyDesign]);

  // Prioritize global categories if they exist (new behavior), otherwise fall back to storefront or legacy
  // Published designs can outlive older editor schemas. Never let a malformed
  // legacy category value crash the storefront when returning from checkout.
  // Keyed on the categories' content: storefrontCategories() returns a new array every
  // render, which re-ran the category effects below on every render (a category click
  // snapped back on /collections pages, "ALL" never stuck, string lists looped).
  const categorySource = legacyDesign?.categories || activeDesign?.categories || storefrontDesign?.categories;
  const categoryKey = JSON.stringify(categorySource ?? null);
  const categories = useMemo(() => storefrontCategories(categorySource).map((cat: any, i: number) => {
    if (typeof cat === "string") {
      return { id: `cat-${i}`, name: cat, description: "", showInNav: true };
    }
    return cat;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [categoryKey]);
  // Categories and in-menu pages share one header bar; Studio › Menus › Header bar order sets the sequence.
  const navOrder = activeDesign?.navOrder || storefrontDesign?.navOrder || legacyDesign?.navOrder;
  const navItems = useMemo(() => buildNavItems(categories, pages || [], navOrder), [categories, pages, navOrder]);

  // "Skip straight to the shop": the homepage shows the catalog. Remember when we forced
  // it, so switching the setting back (e.g. live in the Studio preview) returns to Home.
  const forcedCatalog = useRef(false);
  useEffect(() => {
    if (legacyDesign?.showHero === false && !showCatalog) {
      forcedCatalog.current = true;
      setShowCatalog(true);
    } else if (legacyDesign?.showHero !== false && showCatalog && forcedCatalog.current && !isCatalogPreview) {
      forcedCatalog.current = false;
      setShowCatalog(false);
    }
  }, [legacyDesign?.showHero, showCatalog, setShowCatalog, isCatalogPreview]);

  // With no shop categories at all, open on "ALL" (every book) instead of `undefined`, which matched
  // nothing. autoAll remembers that "ALL" was this fallback rather than the shopper's pick, so
  // categories that arrive later (catalog load, Studio edit) still open on the first one as before.
  // /collections/<slug> (header links on other pages, product breadcrumbs) opens this shop on that category.
  const { slug: collectionSlug } = useParams();
  // On a collection URL the first render already shows that category: starting on the first category and
  // switching in an effect drew one frame of the wrong books (a layout shift on load).
  const [activeCategory, setActiveCategory] = useState<any>(() => (collectionSlug ? collectionCategory(collectionSlug, categories) : categories[0]) ?? "ALL");
  const autoAll = useRef(categories.length === 0);
  // Connected section fields (Studio 2.7) read the open category.
  const categoryContext = useMemo(() => ({ category: activeCategory && activeCategory !== "ALL" ? activeCategory : undefined }), [activeCategory]);
  const pickCategory = (cat: any) => {
    autoAll.current = false;
    setActiveCategory(cat);
    setShowCatalog(true);
  };

  useEffect(() => {
    if (!collectionSlug) return;
    pickCategory(collectionCategory(collectionSlug, categories));
  }, [collectionSlug, categories]);

  // Sync activeCategory if categories change
  useEffect(() => {
    // The route effect above owns selection on collection URLs, including first load.
    if (collectionSlug) return;
    if (categories.length === 0) {
      if (activeCategory !== "ALL") { autoAll.current = true; setActiveCategory("ALL"); }
      return;
    }
    if (activeCategory === "ALL") {
      if (autoAll.current) { autoAll.current = false; setActiveCategory(categories[0]); }
      return;
    }
    {
      const currentName = typeof activeCategory === "string" ? activeCategory : activeCategory?.name;
      const exists = categories.find((c: any) => c.name === currentName);
      if (!exists) {
        setActiveCategory(categories[0]);
      } else if (typeof activeCategory === "string" || activeCategory?.id !== exists.id) {
        // Update to full object if it was a string or outdated
        setActiveCategory(exists);
      }
    }
  }, [categories, collectionSlug]);

  // The category synchronization above compares stable names/IDs. Do not also
  // reset by object identity: a fresh catalog snapshot recreates category objects
  // and would overwrite the category selected by the collection-route effect.

  const baseFilteredItems = useMemo(
    () =>
      activeCategory === "ALL"
        ? getPublishedBooks(books)
        : getFilteredItems(books, activeCategory, new Date().toISOString(), categories),
    [books, activeCategory, categories],
  );
  const publishedBooks = useMemo(() => getPublishedBooks(books), [books]);

  // Category filter chip counts ("ALL (8)", "EPHEMERA (2)", …)
  const categoryChipCounts = useMemo(() => {
    const nowISO = new Date().toISOString();
    const counts: Record<string, number> = { ALL: getPublishedBooks(books).length };
    for (const cat of categories) {
      const name = typeof cat === "string" ? cat : cat?.name;
      if (name) counts[name] = getFilteredItems(books, cat, nowISO, categories).length;
    }
    return counts;
  }, [books, categories]);

  // Catalog controls: search + sort + in-stock filter
  // "See all results" from the search pop-up arrives as /collections/all?q=…
  const urlQuery = queryFromSearch(location.search);
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  useEffect(() => { if (urlQuery) setSearchQuery(urlQuery); }, [urlQuery]);
  // The header logo / shop name (HOME_LINK_STATE) returns to the shop's first view from any page, every click:
  // Home, or with "Show a Home page" off the first category. Keyed on the navigation, so a click on "/" counts too.
  const homeKey = wantsHome(location.state) ? location.key : null;
  useEffect(() => {
    if (!homeKey) return;
    setSearchQuery("");
    if (legacyDesign?.showHero !== false) setShowCatalog(false);
    else if (categories.length > 0) pickCategory(categories[0]);
    else { autoAll.current = true; setActiveCategory("ALL"); }
    window.scrollTo({ top: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey]);
  const [sort, setSort] = useState<SortKey>("featured");
  const [inStockOnly, setInStockOnly] = useState(false);
  // Format and price filters (Shopify-style); price boxes are typed in the shopper's currency.
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilterState>(EMPTY_FILTERS);
  const catalogView = useMemo(() => filterView(baseFilteredItems), [baseFilteredItems]);
  const displayRate = convertPrice(1);

  // Studio › Style › Shop page heading & filters › Book order › keep search, sort and filters in the address (off by
  // default). Read once when the switch is on, then rewritten in place (replaceState keeps the router's own entry, so
  // Back from a book returns to the same view). Never in the Studio preview.
  const stateInUrl = catalogStateInUrlOn(storefrontDesign) && !inEditorPreview();
  const [urlStateReady, setUrlStateReady] = useState(false);
  useEffect(() => {
    if (!stateInUrl || urlStateReady || typeof window === "undefined") return;
    const fromUrl = readCatalogUrl(window.location.search);
    if (fromUrl.query) setSearchQuery(fromUrl.query);
    setSort(fromUrl.sort);
    setInStockOnly(fromUrl.inStockOnly);
    setCatalogFilters(fromUrl.filters);
    setUrlStateReady(true);
  }, [stateInUrl, urlStateReady]);
  useEffect(() => {
    if (!stateInUrl || !urlStateReady || typeof window === "undefined") return;
    const search = catalogUrlSearch(window.location.search, { query: searchQuery, sort, inStockOnly, filters: catalogFilters });
    if (search === window.location.search) return;
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    } catch { /* Safari refuses very rapid rewrites; the next change writes it */ }
  }, [stateInUrl, urlStateReady, searchQuery, sort, inStockOnly, catalogFilters, location.pathname, location.search]);

  // Studio › Style › Shop page heading & filters › Book order (off by default).
  const soldOutLast = soldOutLastOn(storefrontDesign);
  const filteredItems = useMemo(() => {
    const applied = appliedFilters(catalogFilters, catalogView, displayRate);
    return applyCatalogControls(baseFilteredItems, searchQuery, sort, inStockOnly, applied.priceRange, applied.formats, applied.onSale, soldOutLast);
  }, [baseFilteredItems, searchQuery, sort, inStockOnly, catalogFilters, catalogView, displayRate, soldOutLast]);

  // Studio › Style › Shop page heading & filters › "Show more books" paging (0 = every book).
  const pageSize = catalogPageSize(storefrontDesign);
  const [shownCount, setShownCount] = useState(0);
  const [autoRounds, setAutoRounds] = useState(0);
  // A new category, search, sort or filter starts again from the first page.
  useEffect(() => { setShownCount(0); setAutoRounds(0); }, [baseFilteredItems, searchQuery, sort, inStockOnly, catalogFilters]);
  const shownItems = useMemo(
    () => filteredItems.slice(0, visibleCount(filteredItems.length, pageSize, shownCount)),
    [filteredItems, pageSize, shownCount],
  );
  // Studio › Style › Shop page heading & filters › Show more button › load by themselves (off by default).
  const autoLoad = catalogAutoLoadOn(storefrontDesign);
  const showMoreRef = useRef<HTMLDivElement>(null);
  const hasMoreBooks = shownItems.length < filteredItems.length;
  useEffect(() => {
    const el = showMoreRef.current;
    if (!el || !hasMoreBooks || !shouldAutoLoad(autoLoad, autoRounds) || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      setShownCount(count => nextShown(filteredItems.length, pageSize, count));
      setAutoRounds(rounds => rounds + 1);
    }, { rootMargin: "0px 0px 400px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoLoad, autoRounds, hasMoreBooks, filteredItems.length, pageSize]);

  const { has: isWished, toggle: toggleWish } = useWishlist();

  const getBookSlug = (book: Book) =>
    (book as any).slug || book.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const routeCategory = collectionSlug === "all" ? { name: getCopy(activeDesign, "catalogAllCategories") } : categories.find((category: any) => categoryNames(category).some(name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") === collectionSlug));
  const routeCategoryName = routeCategory?.name || "";
  useSEO({
    // Use category membership before shopper search/stock filters.
    noindex: !!urlQuery || onCollectionRoute && (!routeCategory || (collectionSlug === "all"
      ? publishedBooks.length === 0
      : getFilteredItems(books, routeCategory, new Date().toISOString(), categories).length === 0)),
    url: onCollectionRoute && routeCategory ? new URL(`${import.meta.env.BASE_URL}collections/${collectionSlug === "all" ? "all" : routeCategoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`, window.location.origin).href : undefined,
    title: onCollectionRoute ? getCopy(activeDesign, "seoCollectionTitle", { category: routeCategoryName }) : catalogOpen ? (getCopy(settings?.design, "seoArchiveTitle") || undefined) : undefined,
    // The category's own description, else the intro the page shows (Text & labels › Collection & wishlist
    // pages), else the generic Site & sharing sentence — so each collection has its own search snippet.
    description: onCollectionRoute ? routeCategory?.description || leadSentences(collectionIntro(activeDesign, collectionSlug, routeCategory)) || getCopy(activeDesign, "seoCollectionDescription", { category: routeCategoryName.toLowerCase() }) : settings?.info?.description,
    // Style › Logo & wordmark › Share image, else the first book's cover. Never `assets.profileUrl`: the shop's
    // default settings ship a 100px stock photo there, which became every shared/search preview of the home page.
    image: settings?.design?.shareImageUrl || publishedBooks.find((book: any) => book?.photos?.[0]?.url)?.photos?.[0]?.url || undefined,
    type: "website",
    jsonLd: (() => {
      const siteBase = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      const siteName = settings?.info?.name || getCopy(settings?.design, "siteName");
      if (onCollectionRoute && routeCategory) {
        const collectionUrl = new URL(`collections/${collectionSlug === "all" ? "all" : routeCategoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`, siteBase).href;
        const collectionBooks = (collectionSlug === "all" ? publishedBooks : getFilteredItems(books, routeCategory, new Date().toISOString(), categories))
          .filter((book: any) => book.seoNoindex !== true)
          .map((book: any) => ({ name: book.title, url: new URL(`books/${encodeURIComponent(getBookSlug(book))}`, siteBase).href, image: book.photos?.[0]?.url }));
        return [
          collectionStructuredData({ name: routeCategoryName, description: collectionIntro(activeDesign, collectionSlug, routeCategory) || undefined, url: collectionUrl, books: collectionBooks }),
          breadcrumbData([{ name: getCopy(activeDesign, "breadcrumbHome"), url: siteBase }, { name: routeCategoryName, url: collectionUrl }]),
        ];
      }
      return siteStructuredData({
        name: siteName,
        url: siteBase,
        description: settings?.info?.description || getCopy(settings?.design, "siteDefaultDescription"),
        logo: storefrontLogoDesign?.logoUrl || settings?.design?.shareImageUrl,
        sameAs: [...Object.values(settings?.design?.social ?? DEFAULT_SOCIAL), ...profileLinks(getCopy(settings?.design, "seoProfiles"))],
        topics: seoTopicList(getCopy(settings?.design, "seoTopics")),
        email: settings?.info?.email,
        area: { city: settings?.location?.city, region: settings?.location?.state, country: settings?.location?.country },
      });
    })(),
  });


  const storefrontBg = storefrontDesign?.backgroundColor || "#000000";
  const storefrontText = storefrontDesign?.textColor || "#ffffff";
  const storefrontAccent = storefrontDesign?.primaryColor || "#e8402a";
  const storefrontButtonBg = storefrontDesign?.buttonColor || storefrontAccent;
  const storefrontButtonText = storefrontDesign?.buttonTextColor || "#100f0d";
  // Book cards following a colour scheme use its button roles (Theme settings › Colour schemes).
  const cardButton = schemeButtonColors(storefrontDesign, "cards", { bg: storefrontButtonBg, text: storefrontButtonText });
  const storefrontMaxWidth = contentMaxWidth(storefrontDesign);
  // Default legacy storefronts into the requested photo-reference design. The
  // previous implementation only changed sites after a merchant manually applied
  // the preset, so existing published Firestore designs still rendered the old
  // catalog.
  const isReferenceCatalog = storefrontDesign?.catalogLayoutStyle !== "modern";
  const storefrontMobileColumns = Math.max(1, Math.min(3, storefrontDesign?.productColumnsMobile ?? 1));
  const storefrontDesktopColumns = Math.max(2, Math.min(6, storefrontDesign?.productColumnsDesktop ?? (isReferenceCatalog ? 3 : 4)));
  // Theme settings › Design scales › Corner set, when chosen, gives shop cards its middle corner too.
  const storefrontCardRadius = Math.max(0, Math.min(30, RADIUS_SCALES[storefrontDesign?.radiusScale]?.m ?? storefrontDesign?.cardRadius ?? 8));
  const storefrontGridGap = Math.max(8, Math.min(72, storefrontDesign?.catalogGridGap ?? 20));
  const storefrontHeaderMaxWidth = catalogHeaderMaxWidth(storefrontDesign);
  const storefrontImageFit = storefrontDesign?.catalogImageFit === "contain" ? "object-contain" : "object-cover";
  const storefrontTitleTransform = (storefrontDesign?.catalogTitleTransform || (isReferenceCatalog ? "none" : "uppercase")) as any;
  const catalogImageFocalX = Math.max(0, Math.min(100, storefrontDesign?.catalogImageFocalX ?? 50));
  const catalogImageFocalY = Math.max(0, Math.min(100, storefrontDesign?.catalogImageFocalY ?? 50));
  const storefrontButtonRadius = Math.max(0, Math.min(999, storefrontDesign?.buttonRadius ?? 999));
  const storefrontButtonStyle = storefrontDesign?.buttonStyle || "solid";
  const storefrontButtonUppercase = storefrontDesign?.buttonUppercase ?? true;
  const storefrontButtonShadow = storefrontDesign?.buttonShadow ?? true;

  const storefrontCtaText = storefrontDesign?.productCTA || "VIEW";
  // Same source as the book page (Text & labels override, then the Style label), so both pages agree.
  const soldOutLabel = getCopy(storefrontDesign, "soldOutLabel");
  const showCollectionMeta = storefrontDesign?.showCollectionMeta ?? true;
  const cardRuleWidth = Math.max(0, Math.min(8, storefrontDesign?.catalogCardRuleWidth ?? 2));
  // Studio › Style › Product cards & grid › Card style: editorial (default) · card (framed panel) · minimal (no frame, plain price).
  const cardStyle = (storefrontDesign?.productCardStyle || "editorial") as "card" | "minimal" | "editorial";
  const priceTagBoxed = (storefrontDesign?.catalogPriceStyle ?? (cardStyle === "minimal" ? "plain" : "boxed")) !== "plain";
  const priceOnHover = storefrontDesign?.showPriceOnHover === true;
  const showSoldOutBadge = storefrontDesign?.showSoldOutBadge ?? true;
  // Studio › Style › Product cards & grid › Quick add button (off by default).
  const showQuickAdd = storefrontDesign?.showQuickAdd === true;
  // Shopify-style quick view: off until the owner switches it on in Studio.
  const showQuickView = storefrontDesign?.showQuickView === true;
  const [quickViewBook, setQuickViewBook] = useState<any>(null);
  const showCardWishlist = storefrontDesign?.showCardWishlist !== false;
  const showSaleBadge = storefrontDesign?.showSaleBadge ?? true;
  const showSalePercent = storefrontDesign?.showSalePercent ?? false;
  const showCardHoverPhoto = storefrontDesign?.showCardHoverPhoto === true;
  const showCardFormats = storefrontDesign?.showCardFormats === true;
  const showCardCreator = storefrontDesign?.showCardCreator === true;
  const showCardRating = storefrontDesign?.showCardRating === true;
  const showPreorderBadge = storefrontDesign?.showPreorderBadge ?? true;
  const showComingSoonBadge = storefrontDesign?.showComingSoonBadge ?? true;
  const saleBadgeLabel = storefrontDesign?.saleBadgeLabel || "SALE";
  const showNewBadge = storefrontDesign?.showNewBadge ?? false;
  const newBadgeLabel = storefrontDesign?.newBadgeLabel || "NEW";
  const newBadgeDays = Math.max(1, Math.min(365, storefrontDesign?.newBadgeDays ?? 30));
  const showCatalogControls = (storefrontDesign?.showCatalogControls ?? !isReferenceCatalog) || !!urlQuery;
  // Style › Catalog page header & filters › shop filter bar (All · categories · In stock), off by default.
  const filterBarOn = showShopFilterBar(storefrontDesign);
  const filterBarCounts = shopFilterBarCounts(storefrontDesign);
  const filterBarInStock = shopFilterBarInStock(storefrontDesign);
  

  const shopSectionSpacing = Math.max(24, Math.min(120, storefrontDesign?.sectionSpacing ?? 64));
  const imageAspect = storefrontDesign?.imageAspectRatio || (isReferenceCatalog ? "1:1" : "3:4");
  const imageAspectStyle = aspectRatioValue(imageAspect);
  // The grid shows the phone column count until 1024px (lg), then the desktop count: photos ask for that width.
  const gridSteps = [{ from: 0, cols: storefrontMobileColumns }, { from: 1024, cols: storefrontDesktopColumns }];
  const mobileColsClass = storefrontMobileColumns === 1 ? "grid-cols-1" : storefrontMobileColumns === 3 ? "grid-cols-3" : "grid-cols-2";
  const desktopColsClass =
    storefrontDesktopColumns === 2
      ? "lg:grid-cols-2"
      : storefrontDesktopColumns === 3
      ? "lg:grid-cols-3"
      : storefrontDesktopColumns === 5
      ? "lg:grid-cols-5"
      : storefrontDesktopColumns === 6
      ? "lg:grid-cols-6"
      : "lg:grid-cols-4";

  if (loading) {
    return (
      <BootSplash />
    );
  }

  // Maintenance mode gate
  if (settings?.maintenance?.enabled) {
    return <MaintenancePage message={settings.maintenance.message} design={activeDesign} />;
  }

  // One storefront shell (Riso header, footer) for every view. "Home" swaps the catalog
  // grid for the Home template's sections; with no Home sections it shows the catalog.
  const homeSections: any[] = heroDesign.sections || heroDesign.homepageSections || activeDesign.homepageSections || [];
  const onHome = !catalogOpen && homeSections.length > 0;
  {
    return (
      <div
        data-seo-collection={!loading && onCollectionRoute && routeCategory && (collectionSlug === "all" ? activeCategory === "ALL" : catNameForSEO(activeCategory) === routeCategoryName) ? collectionSlug : undefined} data-fm-store data-studio-target="style:colors|style:type|style:layout" data-studio-label="Page background, colours & fonts"
        className="flex min-h-screen flex-col overflow-y-auto selection:bg-white selection:text-black"
        style={{ fontFamily: `'${resolveTypography(storefrontDesign).body}', sans-serif`, backgroundColor: storefrontBg, color: storefrontText }}
      >
        <TypographyTokens design={storefrontDesign} />
        {storefrontDesign?.customCss && <style>{storefrontDesign.customCss}</style>}
        {/* The shop could not be read and nothing was cached: say so with Retry instead of showing an empty shop. */}
        {loadError && books.length === 0 && (
          <div role="alert" {...regionProps("catalogLoadNotice")} className="flex flex-wrap items-center justify-center gap-4 px-6 py-3 text-center text-[11px] uppercase tracking-[0.2em]" style={{ backgroundColor: storefrontText, color: storefrontBg }}>
            <span>{getCopy(activeDesign, "catalogLoadError")}</span>
            <button type="button" onClick={retry} className="underline underline-offset-4">{getCopy(activeDesign, "catalogRetry")}</button>
          </div>
        )}
        {/* The one storefront header (announcement bar, logo, category bar, icons, phone menu, search). */}
        <StoreHeader
          design={activeDesign}
          pages={pages || []}
          books={books}
          shop={{
            surface: storefrontDesign,
            hero: heroDesign,
            logoDesign: storefrontLogoDesign,
            logoPosition: storefrontLogoPosition,
            categories,
            activeCategory,
            onPickCategory: pickCategory,
            showCatalog: catalogOpen,
            announcement: settings?.announcements?.[0]?.message,
            siteName: settings?.info?.name,
          }}
        />

        {onHome ? (
          <main className="relative w-auto flex-1 overflow-hidden">
            <SectionList
              sections={homeSections}
              colorSchemes={heroDesign.colorSchemes?.length > 0 ? heroDesign.colorSchemes : activeDesign.colorSchemes}
              books={books}
              onCtaClick={() => setShowCatalog(true)}
              onProductClick={(book: any) =>
                navigate(`/books/${(book as any).slug || book.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)
              }
              enableAnimations={heroDesign?.enableAnimations ?? true}
              dataSection="homepage"
              sharedBlocks={activeDesign.sharedBlocks || []}
              design={activeDesign}
            />
          </main>
        ) : (
        <main className="mx-auto w-full flex-1 px-6 py-12 md:py-20" style={{ maxWidth: isReferenceCatalog ? storefrontHeaderMaxWidth : storefrontMaxWidth }}>
          {/* Theme-editor sections authored for the storefront page template */}
          <SectionPageContext.Provider value={categoryContext}>
            <TemplateSections design={activeDesign} templateId={onCollectionRoute ? categoryTemplateSurface(activeDesign, categories.find((c: any) => c?.id && c.id === activeCategory?.id) || activeCategory, previewTemplate()) : "storefront"} books={books} />
          </SectionPageContext.Provider>

          {/* Catalog heading + title count, with the shop filter bar beside them (Style › Catalog page header & filters) */}
          {(storefrontDesign?.catalogHeading || storefrontDesign?.showCatalogCount || filterBarOn) && (
            <div data-studio-target="style:catalog" data-studio-label="Catalog heading" className={`flex justify-between flex-wrap gap-4 mb-8 ${filterBarOn ? "items-end" : "items-baseline"}`}>
              {(storefrontDesign?.catalogHeading || storefrontDesign?.showCatalogCount) && (
                <div className="flex items-baseline flex-wrap gap-4">
                  {storefrontDesign?.catalogHeading && (
                    // A collection page's one <h1> is its category name (below), so the catalog heading steps down there.
                    onCollectionRoute
                      ? <h2 className="fm-catalog-heading text-3xl md:text-5xl tracking-tight m-0">{storefrontDesign.catalogHeading}</h2>
                      : <h1 className="fm-catalog-heading text-3xl md:text-5xl tracking-tight m-0">{storefrontDesign.catalogHeading}</h1>
                  )}
                  {storefrontDesign?.showCatalogCount && (
                    <span className="text-xs fm-muted">
                      {getCopy(activeDesign, filteredItems.length === 1 ? "catalogCountOne" : "catalogCountMany", { count: filteredItems.length })}
                    </span>
                  )}
                </div>
              )}
              {filterBarOn && (
                <div role="group" aria-label={getCopy(activeDesign, "filterBarAria")} data-studio-target="style:catalog|menus:categories|copy:Search & filters" data-studio-label="Shop filter bar" className="fm-filter-bar">
                  {[{ name: "ALL", value: "ALL" as any }, ...shopFilterBarCategories(categories).map((c: any) => ({ name: typeof c === "string" ? c : c.name, value: c }))].map((chip: any) => {
                    const isActive = chip.value === "ALL"
                      ? activeCategory === "ALL"
                      : (typeof activeCategory === "string" ? activeCategory : activeCategory?.name) === chip.name;
                    return (
                      <button key={chip.name} type="button" onClick={() => { if (!isActive) ga4FilterUse("category", chip.value === "ALL" ? "all" : chip.name); pickCategory(chip.value); }} aria-pressed={isActive}>
                        {chip.value === "ALL" ? getCopy(activeDesign, "catalogAllCategories") : chip.name}
                        {filterBarCounts && ` · ${categoryChipCounts[chip.name] ?? 0}`}
                      </button>
                    );
                  })}
                  {filterBarInStock && (
                    <button type="button" onClick={() => { ga4FilterUse("in_stock", inStockOnly ? "off" : "on"); setInStockOnly(!inStockOnly); }} aria-pressed={inStockOnly}>
                      {getCopy(activeDesign, "filterInStock")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Category filter chips */}
          {storefrontDesign?.showCategoryChips && (
            <div data-studio-target="menus:categories|style:catalog" data-studio-label="Category chips" className="flex gap-2.5 flex-wrap mb-10">
              {[{ name: "ALL", value: "ALL" as any }, ...categories.filter((c: any) => c.showInNav !== false).map((c: any) => ({ name: typeof c === "string" ? c : c.name, value: c }))].map((chip: any) => {
                const isActive = chip.value === "ALL"
                  ? activeCategory === "ALL"
                  : (typeof activeCategory === "string" ? activeCategory : activeCategory?.name) === chip.name;
                const count = categoryChipCounts[chip.name] ?? 0;
                return (
                  <button
                    key={chip.name}
                    onClick={() => pickCategory(chip.value)}
                    aria-pressed={isActive}
                    className={`rounded-full border px-4 py-2 text-[11px] font-bold tracking-[0.06em] uppercase transition-colors ${
                      isActive ? "fm-active border-transparent" : "border-white/10 fm-muted hover:border-white/40"
                    }`}
                  >
                    {chip.value === "ALL" ? getCopy(activeDesign, "catalogAllCategories") : chip.name}
                    {storefrontDesign?.categoryChipShowCounts !== false && ` (${count})`}
                  </button>
                );
              })}
              {navItems.filter((i) => i.kind === "page").map((i: any) => (
                <Link
                  key={i.key}
                  to={`/page/${i.page.slug}`}
                  className="rounded-full border border-white/10 fm-muted hover:border-white/40 px-4 py-2 text-[11px] font-bold tracking-[0.06em] uppercase transition-colors"
                >
                  {i.label}
                </Link>
              ))}
            </div>
          )}

          {/* Category Header */}
          <AnimatePresence mode="wait">
            {activeCategory && activeCategory !== "ALL" && (activeCategory.description || activeCategory.imageUrl || onCollectionRoute) && (
              <m.div
                key={activeCategory.id || activeCategory.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                {...regionProps("categoryBanner")}
                data-studio-target={regionProps("categoryBanner")["data-studio-target"] + "|menus:categories"}
                className="mb-16 space-y-8"
              >
                {activeCategory.imageUrl && (
                  <div {...regionProps("categoryBannerImage")} className="aspect-[21/9] w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                    <img loading="lazy" src={activeCategory.imageUrl} decoding="async" className="w-full h-full object-cover" alt={activeCategory.name} />
                  </div>
                )}
                <div className="max-w-3xl">
                  {storefrontDesign?.showCollectionBreadcrumbs === true && (() => {
                    // Style › Show or hide whole features › Breadcrumbs above a shop category: Home / Parent / Category.
                    const parentId = parentOf(activeCategory, categories);
                    const parent = parentId ? categories.find((c: any) => c?.id === parentId) : null;
                    const sep = getCopy(activeDesign, "breadcrumbSeparator");
                    const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                    return (
                      <nav aria-label={getCopy(activeDesign, "breadcrumbAria")} data-studio-target="style:elements|copy:Collection & wishlist pages" data-studio-label="Category breadcrumb"
                        className="fm-collection-crumb flex flex-wrap items-center gap-2 mb-3 text-[11px] uppercase tracking-[0.16em] fm-muted">
                        <Link to="/" className="hover:underline">{getCopy(activeDesign, "breadcrumbHome")}</Link>
                        {parent?.name && <>{sep && <span aria-hidden="true">{sep}</span>}<Link to={`/collections/${slug(parent.name)}`} className="hover:underline">{parent.name}</Link></>}
                        {sep && <span aria-hidden="true">{sep}</span>}
                        <span aria-current="page">{activeCategory.name}</span>
                      </nav>
                    );
                  })()}
                  {/* On /collections/<slug> the category name is the page's single <h1> (in the prerendered HTML too). */}
                  {onCollectionRoute ? (
                    <h1 {...regionProps("categoryBannerTitle")} data-studio-target={regionProps("categoryBannerTitle")["data-studio-target"] + "|menus:categories"} className="text-3xl md:text-5xl font-bold tracking-tighter mb-4 uppercase">
                      {activeCategory.name}
                    </h1>
                  ) : (
                    <h2 {...regionProps("categoryBannerTitle")} data-studio-target={regionProps("categoryBannerTitle")["data-studio-target"] + "|menus:categories"} className="text-3xl md:text-5xl font-bold tracking-tighter mb-4 uppercase">
                      {activeCategory.name}
                    </h2>
                  )}
                  {(() => {
                    const intro = onCollectionRoute ? collectionIntro(activeDesign, collectionSlug, activeCategory) : activeCategory.description;
                    return intro ? (
                      <p {...regionProps("categoryBannerText")} data-studio-target={regionProps("categoryBannerText")["data-studio-target"] + "|menus:categories"} className="text-sm md:text-base text-white/60 leading-relaxed font-medium">
                        {intro}
                      </p>
                    ) : null;
                  })()}
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {showCatalogControls && (
            <CatalogControls
              query={searchQuery}
              setQuery={setSearchQuery}
              sort={sort}
              setSort={setSort}
              inStockOnly={inStockOnly}
              setInStockOnly={setInStockOnly}
              resultCount={filteredItems.length}
              design={storefrontDesign}
              filters={catalogFilters}
              setFilters={setCatalogFilters}
              availableFormats={catalogView.availableFormats}
              showPrice={catalogView.showPrice}
              hasSale={catalogView.hasSale}
            />
          )}

          {filteredItems.length === 0 && (
            <p {...regionProps("catalogEmptyMessage")} className="py-20 text-center text-[10px] tracking-[0.4em] text-white/30 uppercase">
              {getCopy(storefrontDesign, "catalogEmpty")}
            </p>
          )}

          <div data-ga-list={activeCategory && activeCategory !== "ALL" && catNameForSEO(activeCategory) ? `Shop · ${catNameForSEO(activeCategory)}` : "Shop"} data-studio-target="style:products|style:catalogLayout|copy:Catalog & empty states" data-studio-label="Product grid" className={`grid ${mobileColsClass} ${desktopColsClass}`} style={{ gap: storefrontGridGap, rowGap: Math.min(isReferenceCatalog ? Math.max(40, storefrontGridGap * 3) : shopSectionSpacing, storefrontGridGap * 1.5) }}>
            {shownItems.map((item: any, index: number) => {
              const slug = getBookSlug(item);
              const stock = item.stockLevel ?? 999;
              // Coming soon books often have no stock yet: they get their own badge, never "Sold out".
              const isComingSoon = comingSoonActive(item);
              const isOutOfStock = !isComingSoon && stock === 0;
              const isLowStock = stock > 0 && stock !== 999 && stock <= designNumber(activeDesign, "lowStockCardThreshold", 5);
              // A book sold in editions shows its cheapest edition and never a SALE badge (formatBookPrice does the same).
              const onSale = showsSale(item);
              const displayPrice = cardDisplayPrice(item);
              const isNewArrival = (() => {
                if (!item.createdAt) return false;
                const created = new Date(item.createdAt).getTime();
                if (Number.isNaN(created)) return false;
                return (Date.now() - created) <= newBadgeDays * 86_400_000;
              })();
              const wished = isWished(item.id);
              return (
                <m.article
                  key={item.id || index}
                  initial={skipEntrance ? false : (storefrontDesign?.enableAnimations ?? true) ? { opacity: 0, y: 30 } : { opacity: 1, y: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={(storefrontDesign?.enableAnimations ?? true)
                    // Stagger only the first rows: deep in a big catalog, cards must not sit invisible for seconds.
                    ? { duration: 0.8, delay: Math.min(index, 12) * 0.05, ease: [0.22, 1, 0.36, 1] }
                    : { duration: 0 }
                  }
                  // CSS transitions skip opacity/transform, which the entrance animation drives every frame.
                  className={`fm-card group relative min-w-0 transition-[translate,background-color,border-color,box-shadow] duration-500 ${storefrontDesign?.productHoverEffect === "lift" ? "hover:-translate-y-2" : ""} ${cardStyle === "card" ? "fm-surface border border-white/10 p-3" : ""}`}
                  style={cardStyle === "card" ? { borderRadius: storefrontCardRadius } : undefined}
                >
                  {showCardWishlist && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWish(item.id); }}
                    aria-label={getCopy(activeDesign, wished ? "wishlistRemoveAria" : "wishlistAddAria")}
                    className={`absolute top-3 right-3 z-10 w-9 h-9 max-md:before:absolute max-md:before:-inset-1.5 max-md:before:content-[''] rounded-full backdrop-blur-md flex items-center justify-center transition-colors ${
                      wished
                        ? "fm-favorite-active border"
                        : "bg-black/40 text-white/70 border border-white/10 hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    }`}
                  >
                    <Heart size={13} fill={wished ? "currentColor" : "none"} />
                  </button>
                  )}
                  <Link to={`/books/${slug}`}>
                    <div className={`relative fm-surface fm-photo-frame mb-4 overflow-hidden ${isReferenceCatalog || cardStyle === "minimal" ? "" : "border border-white/5 shadow-2xl"}`} style={{ borderRadius: storefrontCardRadius, aspectRatio: imageAspectStyle }}>
                      <SkeletonImage
                        src={item.photos?.[0]?.url || placeholderImage(activeDesign)}
                        {...photoSrcSet(item.photos?.[0], gridPhotoSizes(gridSteps, { photo: item.photos?.[0], frame: imageAspect, cover: storefrontImageFit === "object-cover" }))}
                        alt={item.title}
                        priority={index < 2 ? "high" : index < 4 ? "eager" : undefined}
                        className={`w-full h-full ${storefrontImageFit} transition-transform duration-700 ease-out ${storefrontDesign?.productHoverEffect === "zoom" ? "group-hover:scale-110" : ""}`}
                        style={framingStyle(item.photos?.[0], { x: catalogImageFocalX, y: catalogImageFocalY })}
                        frameStyle={isOutOfStock && showSoldOutBadge ? soldOutPhotoStyle(storefrontDesign) : undefined}
                      />
                      <PhotoToneDefs photo={item.photos?.[0]} />
                      {showCardHoverPhoto && !(isOutOfStock && showSoldOutBadge) && (() => {
                        const second = cardHoverPhoto(item);
                        return second ? (
                          <CardHoverPhoto
                            photo={second}
                            sizes={gridPhotoSizes(gridSteps, { photo: second, frame: imageAspect, cover: storefrontImageFit === "object-cover" })}
                            className={`${storefrontImageFit} transition-[opacity,scale,transform] duration-700 ease-out ${storefrontDesign?.productHoverEffect === "zoom" ? "group-hover:scale-110" : ""}`}
                            focal={{ x: catalogImageFocalX, y: catalogImageFocalY }}
                          />
                        ) : null;
                      })()}
                      {isOutOfStock && showSoldOutBadge && <SoldOutBadge design={storefrontDesign} label={soldOutLabel} />}
                      {/* Status ribbons */}
                      <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
                        {isComingSoon && showComingSoonBadge && (
                          <span
                            data-studio-target="style:labels|copy:Product page"
                            data-studio-label="Coming soon badge"
                            style={{ backgroundColor: storefrontDesign?.badgeBgPrimary || "var(--accent, #e8402a)", color: storefrontDesign?.badgeTextPrimary || "var(--on-accent, #100f0d)" }}
                            className="fm-coming-soon-badge text-[8px] font-bold tracking-widest px-2 py-1 uppercase border border-white/10 rounded-sm"
                          >
                            {getCopy(activeDesign, "comingSoonBadge")}
                          </span>
                        )}
                        {!isOutOfStock && !isComingSoon && showPreorderBadge && preorderActive(item) && (
                          <span
                            data-studio-target="style:labels|copy:Product page"
                            data-studio-label="Pre-order badge"
                            style={{ backgroundColor: storefrontDesign?.badgeBgPrimary || "var(--accent, #e8402a)", color: storefrontDesign?.badgeTextPrimary || "var(--on-accent, #100f0d)" }}
                            className="fm-preorder-badge text-[8px] font-bold tracking-widest px-2 py-1 uppercase border border-white/10 rounded-sm"
                          >
                            {getCopy(activeDesign, "preorderBadge")}
                          </span>
                        )}
                        {!isOutOfStock && onSale && showSaleBadge && (
                          <span 
                            style={{ backgroundColor: storefrontDesign?.badgeBgPrimary || "rgb(244 63 94 / 0.9)", color: storefrontDesign?.badgeTextPrimary || "#ffffff" }}
                            className="text-[8px] font-bold tracking-widest px-2 py-1 uppercase border border-white/10 rounded-sm"
                          >
                            {(() => { const pct = showSalePercent ? salePercentOff(item) : 0; return pct ? getCopy(activeDesign, "saleBadgePercent", { label: saleBadgeLabel, percent: pct }) : saleBadgeLabel; })()}
                          </span>
                        )}
                        {!isOutOfStock && isNewArrival && showNewBadge && (
                          <span 
                            style={{ backgroundColor: storefrontDesign?.badgeBgPrimary || "rgb(16 185 129 / 0.9)", color: storefrontDesign?.badgeTextPrimary || "#000000" }}
                            className="text-[8px] font-bold tracking-widest px-2 py-1 uppercase border border-white/10 rounded-sm"
                          >
                            {newBadgeLabel}
                          </span>
                        )}
                        {!isOutOfStock && !isComingSoon && isLowStock && (
                          <span 
                            style={{ 
                              color: storefrontDesign?.lowInventoryColor || "#f59e0b",
                              borderColor: `${storefrontDesign?.lowInventoryColor || "#f59e0b"}40`,
                              backgroundColor: `${storefrontDesign?.lowInventoryColor || "#f59e0b"}15`
                            }}
                            className="flex items-center gap-1 border backdrop-blur-md text-[8px] tracking-widest px-2 py-1 uppercase rounded-full"
                          >
                            <Zap size={9} /> {getCopy(activeDesign, "onlyLeft", { count: stock })}
                          </span>
                        )}
                      </div>
                      {/* Hover overlay — show "VIEW" instead of add directly */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                        <span
                          style={{
                            backgroundColor: storefrontButtonStyle === "solid" ? cardButton.bg : "transparent",
                            color: storefrontButtonStyle === "solid" ? cardButton.text : cardButton.bg,
                            border: storefrontButtonStyle !== "solid" ? `1px solid ${cardButton.bg}` : "none",
                            borderRadius: storefrontButtonRadius,
                          }}
                          className={`w-full py-3 text-[10px] tracking-[0.2em] font-bold text-center transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 store-btn-primary ${storefrontButtonShadow ? "shadow-xl" : ""} ${storefrontButtonUppercase ? "uppercase" : ""}`}
                        >
                          {isOutOfStock ? soldOutLabel : isComingSoon ? getCopy(activeDesign, "comingSoonBadge") : storefrontCtaText}
                        </span>
                      </div>
                    </div>
                    <div
                      data-studio-target="style:products"
                      data-studio-label="Card title & price"
                      className={cardRuleWidth > 0 ? "pt-3" : ""}
                      style={cardRuleWidth > 0 ? { borderTop: `${cardRuleWidth}px solid rgba(var(--fg-rgb), 0.85)` } : undefined}
                    >
                      <div className="fm-card-meta flex items-start justify-between gap-3">
                        <h3
                          className={`fm-card-title ${isReferenceCatalog ? "text-lg md:text-xl font-black tracking-tight" : "text-sm tracking-wider font-medium"} leading-tight min-w-0 break-words`}
                          style={{ color: storefrontDesign?.productTitleColor || storefrontText, textTransform: storefrontTitleTransform }}
                        >
                          {item.title}
                        </h3>
                        {displayPrice > 0 && (
                          <span
                            translate="no"
                            className={`fm-card-price-wrap shrink-0 flex flex-col items-end leading-none font-mono tabular-nums ${priceOnHover ? "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100" : ""}`}
                            style={{ color: storefrontDesign?.productPriceColor || storefrontText }}
                          >
                            <span
                              className={`fm-card-price ${priceTagBoxed ? "fm-card-price-tag px-2 py-1" : ""} text-sm md:text-base font-bold whitespace-nowrap`}
                              style={priceTagBoxed ? { border: "2px solid currentColor" } : undefined}
                            >
                              {formatBookPrice(item)}
                            </span>
                            {onSale && (
                              <span className="fm-card-price-old mt-1 text-[10px] line-through opacity-50">{formatBookPrice(item, true)}</span>
                            )}
                          </span>
                        )}
                      </div>
                      {showCardCreator && (() => {
                        const credit = cardCreator(item);
                        return credit ? (
                          <p className="fm-card-creator mt-1.5 text-xs leading-snug text-white/70 break-words">
                            <span className="sr-only">{getCopy(activeDesign, "cardCreatorLead")} </span>
                            {credit}
                          </p>
                        ) : null;
                      })()}
                      {showCardRating && item.id && (
                        <CardRatingStars
                          bookId={item.id}
                          label={r => getCopy(activeDesign, "cardRatingLabel", { average: r.average, count: r.count })}
                          countText={r => getCopy(activeDesign, "cardRatingCount", { average: r.average, count: r.count })}
                        />
                      )}
                      {showCardFormats && (() => {
                        const formats = cardFormats(item);
                        return formats.length ? (
                          <p className="fm-card-formats mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                            <span className="sr-only">{getCopy(activeDesign, "cardFormatsLead")} </span>
                            {formats.map(key => getCopy(activeDesign, "filterFormat_" + key)).join(" · ")}
                          </p>
                        ) : null;
                      })()}
                      {showCollectionMeta && (
                        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                          {item.genres?.[0] || item.categories?.[0] || getCopy(activeDesign, "categoryFallback")}
                        </p>
                      )}
                    </div>
                  </Link>
                  {showQuickAdd && !isOutOfStock && (() => {
                    // A book with several editions, extras or a gift-card amount needs a choice first: send it to its page.
                    const needsChoice = (Array.isArray(item.variants) && item.variants.length > 1) || (Array.isArray(item.addOns) && item.addOns.length > 0) || item.productType === "giftCard" || (Array.isArray(item.bundleItems) && item.bundleItems.length > 0);
                    const choice = quickAddChoice(item);
                    const btnClass = "fm-card-quickadd mt-3 w-full min-h-[44px] flex items-center justify-center text-[10px] font-bold tracking-[0.2em] uppercase border border-current hover:opacity-80 transition-opacity";
                    if (needsChoice || !choice.inStock) {
                      return needsChoice ? <Link to={`/books/${slug}`} data-studio-target="style:products|copy:Product page" data-studio-label="Quick add button" className={btnClass}>{getCopy(activeDesign, "quickAddChoose")}</Link> : null;
                    }
                    return (
                      <button
                        type="button"
                        data-studio-target="style:products|copy:Product page"
                        data-studio-label="Quick add button"
                        onClick={() => addToCart(item, choice.variant)}
                        className={btnClass}
                      >
                        {getCopy(activeDesign, "quickAddButton")}
                      </button>
                    );
                  })()}
                  {showQuickView && (
                    <button
                      type="button"
                      data-studio-target="style:products|copy:Catalog & empty states"
                      data-studio-label="Quick view button"
                      onClick={() => setQuickViewBook(item)}
                      aria-haspopup="dialog"
                      className="fm-card-quickview mt-2 w-full min-h-[44px] flex items-center justify-center text-[10px] font-bold tracking-[0.2em] uppercase border border-white/20 hover:opacity-80 transition-opacity"
                    >
                      {getCopy(activeDesign, "quickViewButton")}
                    </button>
                  )}
                </m.article>
              );
            })}
          </div>
          {hasMoreBooks && (
            <div ref={showMoreRef} {...regionProps("catalogShowMore")} data-studio-target="style:catalog|copy:Catalog & empty states" data-studio-label="Show more books" className="fm-catalog-more mt-12 flex flex-col items-center gap-3">
              <p aria-live="polite" className="text-[10px] tracking-[0.2em] uppercase fm-muted">
                {getCopy(activeDesign, "catalogShowingCount", { shown: shownItems.length, total: filteredItems.length })}
              </p>
              <button
                type="button"
                onClick={() => setShownCount(nextShown(filteredItems.length, pageSize, shownCount))}
                className="min-h-[44px] px-8 py-3 text-[10px] font-bold tracking-[0.2em] uppercase border border-white/30 hover:opacity-80 transition-opacity"
                style={{ borderRadius: storefrontButtonRadius }}
              >
                {getCopy(activeDesign, "catalogShowMore")}
              </button>
            </div>
          )}
          {quickViewBook && <QuickView book={quickViewBook} design={activeDesign} onClose={() => setQuickViewBook(null)} />}
        </main>
        )}

        <GlobalSections
          design={activeDesign}
          books={books}
          onCtaClick={() => setShowCatalog(true)}
          onProductClick={(book: any) =>
            navigate(`/books/${(book as any).slug || book.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)
          }
        />
        {!onHome && !activeDesign?.hideRecentlyViewed && <RecentlyViewedRow />}
        {!onHome && !activeDesign?.hideNewsletter && <Newsletter design={settings?.design} />}
        <StoreFooter settings={{ ...settings, design: storefrontDesign }} pages={pages} />
        {(storefrontDesign?.showPoweredBy ?? false) && (
          <p data-studio-target="copy:Header|style:footer" data-studio-label="Powered-by line" className="text-center pb-8 text-[9px] tracking-[0.3em] uppercase opacity-50">{getCopy(activeDesign, "poweredBy")}</p>
        )}

      </div>
    );
  }

}
