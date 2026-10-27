import { catName, categoryNames } from "./navItems";
import { describedAlt } from "./photoAlt";
import { inEditorPreview } from "../../lib/trackingGuard";
import { relatedRow } from "./relatedArtist";
import { shownDetailRows } from "./detailRows";
import { m } from "motion/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useParams, Link, useNavigate, useLocation } from "react-router";
import {
  ChevronLeft, ChevronRight, ShoppingBag, ArrowLeft,
  Package, Share2, Check, BookOpen, Globe, Ruler,
  Weight, Tag, Zap, Heart, ChevronDown, Minus, Plus, Bell, Maximize2, Play
} from "lucide-react";
import { useCart, catalogUnitPrice, lineQuantityCap, backorderable } from "../../CartContext";
import { useCurrency } from "../../CurrencyContext";
import { useSiteData } from "./useSiteData";
import { StoreHeader } from "./StoreHeader";
import { contentMaxWidth } from "./headerNav";
import { StoreFooter } from "./StoreFooter";
import { TemplateSections, GlobalSections } from "../../components/sectionRender";
import { SectionPageContext } from "../../components/sectionCopy";
import { useMissingRedirect } from "./useMissingRedirect";
import { getCopy } from "./storeCopy";
import { preorderActive, releaseDateOf, formatReleaseDate } from "./preorder";
import { comingSoonActive } from "./comingSoon";
import { designNumber } from "./designNumber";
import { placeholderImage } from "./constants";
import type { Book } from "./types";
import { trackBookView } from "../../lib/recentlyViewed";
import { useWishlist } from "../../lib/wishlist";
import { bookMetadata, bookStructuredData, breadcrumbData, canonicalUrl, creatorLinks, defaultBookTitle, returnPolicyData, shippingDetailsData } from "../../lib/bookSeo";
import { findCountry } from "./shippingZones";
import { parseWeightGrams, quoteShipping } from "./shippingEngine";
import { catalogFulfillmentItems } from "./checkoutFulfillment";
import { loadShippingProfiles } from "./shippingProfilesLoad";
import { reviewsApi } from "../../lib/reviews";
import { useSEO } from "../../lib/seo";
import { funnelApi } from "../../lib/commerce";
import ReviewsSection from "./ReviewsSection";
import { PhotoLightbox } from "./PhotoLightbox";
import { galleryPhotos, isVideoItem, muteVideo } from "./bookVideo";
import { PhotoCarousel } from "./PhotoCarousel";
import { PhotoMagnifier } from "./PhotoMagnifier";
import { magnifierLevel, magnifierOn } from "./photoMagnifier";
import RecentlyViewedRow from "./RecentlyViewedRow";
import BackInStockForm from "./BackInStockForm";
import PickupAvailability from "./PickupAvailability";
import { isPickupItem, pickupSpots } from "./pickupAvailability";
import PdpFreeShipping from "./extras/pdp-free-shipping/PdpFreeShipping";
import PdpShipBy from "./extras/pdp-ship-by/PdpShipBy";
import PdpAskQuestion from "./extras/pdp-ask-question/PdpAskQuestion";
import PdpInBag from "./extras/pdp-in-bag/PdpInBag";
import PdpPaymentIcons from "./extras/pdp-payment-icons/PdpPaymentIcons";
import { resolveFooterBadges } from "./paymentBadges";
import PdpTaxNote from "./extras/pdp-tax-note/PdpTaxNote";
import { taxCollectionOn } from "./taxRate";
import SaleEndsLine from "./extras/pdp-sale-countdown/SaleEndsLine";
import ReleaseCountdownText from "./extras/pdp-release-countdown/ReleaseCountdownText";
import { pdpFreeShipping } from "./extras/pdp-free-shipping/pdpFreeShipping";
import { pdpPolicyEntries } from "./pdpPolicyTab";
import { policyHtml, policySlug, policyTitle } from "./policyPages";
import { quickAddChoice } from "./buyable";
import { buildStorefrontTokenVars, RISO_STOREFRONT_CSS, risoGrainCss, STOREFRONT_TOKEN_CSS } from "./themeTokens";
import { StorefrontOverrides } from "./StorefrontOverrides";
import { resolveProductDesign } from "./surfaceDesign";
import { bookTemplateSurface, previewTemplate } from "./templateAlternates";
import { blockLabel, cardSections, productBlocks, ruledSections, type ProductBlock } from "./productBlocks";
import { resolveDynamicSettings } from "./dynamicSources";
import { aspectRatioValue } from "./imageAspect";
import { aspectNumber, frameAspect, frameMode, photoRatio } from "./photoFrame";
import { regionProps, regionVisible } from "./storefrontRegions";
import { orderTabs } from "./pdpTabOrder";
import { DescriptionText } from "./DescriptionText";
import DescriptionFold from "./DescriptionFold";
import { googleFontHref } from "./fonts";
import { productPageCss, productPageFontNames, titleFitSize } from "./productPageStyle";
import { schemeButtonColors } from "./colorSchemes";

import { findProduct } from "./productRoutes";
import { bookAddOns, bundleWeightGrams, isBundle, isGiftCardProduct, saleActive, saleEndDate, type GiftCardDetails } from "./promotions";
import { displayPrice, salePercentOff } from "./displayPrice";
import { ga4Once, ga4PageNotFound, ga4PdpInteract, pdpTabName } from "../../lib/ga4";
import { SoldOutBadge, SoldOutVeil } from "./SoldOutBadge";
import { AddOnPicker, BoxSetContents, GiftCardForm, addOnRequest, giftFormValid, missingWording, type AddOnPicks } from "./ProductOptions";
import { gridPhotoSizes, THUMB_PHOTO_SIZES, pdpPhotoSizes, photoSrcSet, smallPhotoUrl } from "./photoSources";
import { adjustStyle, framingStyle, motionFraming } from "./photoFraming";
import { PhotoToneDefs } from "./PhotoToneDefs";
import { ThumbStrip } from "./ThumbStrip";
import { PHONE_MAX } from "./breakpoints";
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** The title's inline variables: Studio's "Title size" preset and the phone cap that keeps its longest word whole. */
function titleStyle(autoSize: string | undefined, title: unknown): React.CSSProperties | undefined {
  const fit = titleFitSize(title);
  if (!autoSize && !fit) return undefined;
  return { ...(autoSize ? { "--pdp-title-auto": autoSize } : {}), ...(fit ? { "--pdp-title-fit": fit } : {}) } as React.CSSProperties;
}

// ── small helper ────────────────────────────────────────────────────────────
function SpecItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 hover:border-white/[0.14] transition-colors">
      <div className="flex items-center gap-2 text-white/30">
        {icon}
        <span className="text-[8px] font-black tracking-[0.35em] uppercase">{label}</span>
      </div>
      <p className="text-[13px] font-medium text-white/80 leading-tight whitespace-pre-line">{value}</p>
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────
export default function BookDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { books, settings, pages, loading: siteLoading, fresh, loadError, retry } = useSiteData();
  const { addToCart, setIsCartOpen, cart } = useCart();
  const { currency, formatPrice, formatBookPrice, getBookPrice, convertPrice } = useCurrency();

  const primaryColor  = settings?.design?.primaryColor || "#e8402a";
  const font          = settings?.design?.font || "Inter";

  const [activePhoto, setActivePhoto] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // A format with its own photo shows it when chosen; picking a thumbnail afterwards wins.
  const [variantPhotoPinned, setVariantPhotoPinned] = useState(true);
  const pickPhoto = (next: number | ((p: number) => number)) => { setVariantPhotoPinned(false); setActivePhoto(next as any); };
  const [added, setAdded]             = useState(false);
  // Coming soon: the button opens the "email me when it's out" signup.
  const [soonOpen, setSoonOpen]       = useState(false);
  const [addingBoth, setAddingBoth]   = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  // Width ÷ height of each product photo, measured once it loads (adaptive frames, photoFrame.ts).
  const [photoRatios, setPhotoRatios] = useState<Record<string, number>>({});
  // The gallery whose remaining photos the shopper has reached for (see the loading-ahead effect below).
  const [warmGalleryKey, setWarmGalleryKey] = useState("");
  const notePhotoSize = (url: string | undefined, el: HTMLImageElement | null) => {
    const r = el ? photoRatio(el.naturalWidth, el.naturalHeight) : undefined;
    if (url && r !== undefined) setPhotoRatios((prev) => (prev[url] === r ? prev : { ...prev, [url]: r }));
  };
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [qty, setQty]                 = useState(1);
  // Buy-card extras: ticked add-ons (with inscription wording) and a gift card's recipient.
  const [addOnPicks, setAddOnPicks]   = useState<AddOnPicks>({});
  const [addOnError, setAddOnError]   = useState("");
  const [editionError, setEditionError] = useState("");
  const emptyGift: GiftCardDetails = { recipientName: "", recipientEmail: "", senderName: "", message: "" };
  const [giftForm, setGiftForm]       = useState<GiftCardDetails>(emptyGift);
  const [giftError, setGiftError]     = useState("");

  const book: Book | undefined = findProduct(books, slug, new URLSearchParams(window.location.search).get("preview") === "true");
  // A book published after this browser cached the catalog isn't in that cache yet: keep showing
  // Loading (and stay indexable) until this mount's fresh read, rather than a false "not found" + noindex.
  const loading = siteLoading || (!book && !fresh);
  useMissingRedirect(!book && !loading && !loadError);
  const sectionPage = useMemo(() => ({ book }), [book]);

  // Keep the chosen edition's data fresh after a refresh, and start each edition at quantity 1.
  useEffect(() => {
    if (!selectedVariant) return;
    const fresh = (book?.variants || []).find((v: any) => v.id === selectedVariant.id);
    if (fresh && fresh !== selectedVariant) setSelectedVariant(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);
  useEffect(() => { setQty(1); setVariantPhotoPinned(true); }, [selectedVariant?.id]);
  // A new book starts with no extras and an empty gift form.
  useEffect(() => { setAddOnPicks({}); setAddOnError(""); setGiftForm(emptyGift); setGiftError(""); setSoonOpen(false); }, [book?.id]);

  // Studio 2.8: the book's alternate template (Books › edit › Page template); the Studio preview can ask for one.
  const productSurface         = bookTemplateSurface(settings?.design, book, previewTemplate());
  const storefrontDesign       = resolveProductDesign(settings?.design, productSurface);
  const productImageLayout     = storefrontDesign.productImageLayout     || "slider";
  const productContentPosition = storefrontDesign.productContentPosition || "right";
  const showRelatedProducts    = storefrontDesign.showRelatedProducts    ?? true;
  const showSoldOutBadge       = storefrontDesign.showSoldOutBadge       ?? true;
  const showSocialShare        = storefrontDesign.showSocialShare        ?? true;
  const showPdpWishlist        = storefrontDesign.showPdpWishlist        ?? true;
  const showBackInStock        = storefrontDesign.showBackInStock        ?? true;
  const showComingSoonSignup   = storefrontDesign.showComingSoonSignup   ?? true;
  const showPdpPickup          = storefrontDesign.showPdpPickup === true;
  const showPdpFreeShipping    = storefrontDesign.showPdpFreeShipping === true;
  const showPdpShipBy          = storefrontDesign.showPdpShipBy === true;
  const showPdpAskQuestion     = storefrontDesign.showPdpAskQuestion === true;
  const showPdpInBag           = storefrontDesign.showPdpInBag === true;
  const showPdpPaymentIcons    = storefrontDesign.showPdpPaymentIcons === true;
  const showPdpTaxNote         = storefrontDesign.showPdpTaxNote === true;
  const ruledCls               = storefrontDesign.pdpRuledEveryLine === true ? " fm-pdp-desc-ruled" : "";
  const showPdpPolicyTab       = storefrontDesign.showPdpPolicyTab === true;
  const showPdpArtistBio       = storefrontDesign.showPdpArtistBio !== false;

  // Autonomy controls for book detail page
  const showAmbientGlow        = storefrontDesign.showAmbientGlow        ?? settings?.design?.showAmbientGlow        ?? true;
  const glowOpacity            = (storefrontDesign.glowIntensity ?? settings?.design?.glowIntensity ?? 18) / 100;
  const showSpecs              = storefrontDesign.showSpecs              ?? settings?.design?.showSpecs              ?? true;
  const showBundleWidget       = storefrontDesign.showBundleWidget       ?? settings?.design?.showBundleWidget       ?? true;

  // Redesign autonomy settings
  const productTitleSize       = storefrontDesign.productTitleSize       || "large";
  const productAlignment       = storefrontDesign.productAlignment       || "left";
  const productSubtitleWeight  = storefrontDesign.productSubtitleWeight  || "light";
  const productBorderRadius    = storefrontDesign.productBorderRadius    ?? settings?.design?.productBorderRadius ?? 32;
  const productImageGlowColor  = storefrontDesign.productImageGlowColor  || primaryColor;
  const productImageShadow     = storefrontDesign.productImageShadow     || "none";
  // "Image zoom" off turns the hover zoom off entirely, whatever the zoom amount is set to.
  // Style › Book page · photos & layout › Photos › Zoom follows the mouse (off by default): it replaces the
  // gentle hover zoom, so the two never stack.
  const pdpMagnifier           = magnifierOn(storefrontDesign);
  const pdpMagnifierLevel      = magnifierLevel(storefrontDesign);
  const productImageHoverScale  = storefrontDesign.showZoom === false || pdpMagnifier ? 1 : (storefrontDesign.productImageHoverScale ?? 1.05);
  const productFrameMode       = frameMode(storefrontDesign.productImageFrameMode);
  const productImageFitClass   = storefrontDesign.productImageFit === "contain" ? "object-contain" : "object-cover";
  const productImageFit        = storefrontDesign.productImageFit === "contain" ? "contain" : "cover";
  const productImageMaxWidth   = Math.max(320, Math.min(900, Number(storefrontDesign.productImageMaxWidth) || 560));
  const productImageAspect     = aspectRatioValue(storefrontDesign.productImageAspect && storefrontDesign.productImageAspect !== "grid" ? storefrontDesign.productImageAspect : storefrontDesign.imageAspectRatio || "3:4");
  // A measured shape wins over the saved one (it is what the shopper sees); they agree for every normal photo.
  const frameFor = (url: string | undefined) =>
    frameAspect(productFrameMode, url ? (photoRatios[url] ?? savedRatios[url]) : undefined, productImageAspect, storefrontDesign.productImageAspectLandscape);
  // The main photo's `sizes` uses the saved shape only, so it never changes (and re-downloads) as photos load.
  const photoSizes = (photo: any) => {
    const ratio = photo?.url ? savedRatios[photo.url] : undefined;
    const frame = aspectNumber(frameAspect(productFrameMode, ratio, productImageAspect, storefrontDesign.productImageAspectLandscape));
    return pdpPhotoSizes({ maxWidth: productImageMaxWidth, photoRatio: ratio, frameRatio: frame, cover: productImageFit === "cover" });
  };
  const productDetailsLayout   = storefrontDesign.productDetailsLayout   || "tabs";
  const productCtaAnimation    = storefrontDesign.productCtaAnimation    || "none";
  const productCtaWidth        = storefrontDesign.productCtaWidth        || "full";
  // Style › Product page › Edition picker: "dropdown" makes the shopper choose an edition themselves.
  const editionDropdown        = storefrontDesign.pdpEditionPicker === "dropdown";
  const editionShowPrice       = storefrontDesign.pdpChipShowPrice !== false;
  // Style › Product page › Sticky add-to-bag bar: a bar that follows the shopper once the buy button has scrolled away.
  const stickyBar              = storefrontDesign.pdpStickyBar === true;
  const stickyPhoneOnly        = storefrontDesign.pdpStickyPhoneOnly !== false;
  // Style › Product page › "Buy it now" button: adds the chosen copy and opens checkout straight away.
  const showBuyNow             = storefrontDesign.pdpShowBuyNow === true;
  // Keyed on the book's id: a background catalog refresh hands us a new book
  // object, and that must not snap the shopper's chosen edition back to the first.
  useEffect(() => {
    if (book?.variants && book.variants.length > 0) {
      setSelectedVariant(editionDropdown && book.variants.length > 1 ? null : book.variants[0]);
    } else {
      setSelectedVariant(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, editionDropdown]);
  const productCtaSize         = storefrontDesign.productCtaSize         || "large";
  const productBundleLayout    = storefrontDesign.productBundleLayout    || "bordered";
  const showQtyStepper         = storefrontDesign.showQtyStepper         ?? settings?.design?.showQtyStepper         ?? false;
  const productDescriptionStyle = storefrontDesign.productDescriptionStyle || settings?.design?.productDescriptionStyle || "plain";

  // Tab & Accordion states
  const [detailsTab, setDetailsTab] = useState<"description" | "artist" | "specs" | "policies" | "reviews">("description");
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    description: true,
    specs: false,
    reviews: false
  });
  const toggleAccordion = (section: string) => {
    setOpenAccordions(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const buttonBg = storefrontDesign?.buttonColor || settings?.design?.buttonColor || settings?.design?.primaryColor || "#e8402a";
  const buttonText = storefrontDesign?.buttonTextColor || settings?.design?.buttonTextColor || "#000000";
  const buttonRadius = Math.max(0, Math.min(999, storefrontDesign?.buttonRadius ?? settings?.design?.buttonRadius ?? 999));
  const buttonStyle = storefrontDesign?.buttonStyle || settings?.design?.buttonStyle || "solid";
  const buttonUppercase = storefrontDesign?.buttonUppercase ?? settings?.design?.buttonUppercase ?? true;
  const buttonShadow = storefrontDesign?.buttonShadow ?? settings?.design?.buttonShadow ?? true;

  const storefrontBg       = settings?.design?.backgroundColor || "#050508";
  const storefrontText     = settings?.design?.textColor || "#ffffff";

  const btnHoverBg = settings?.design?.buttonHoverBgColor || "#C1BBBB";
  const btnHoverText = settings?.design?.buttonHoverTextColor || "#FFFFFF";
  const badgeTextPrimary = settings?.design?.badgeTextPrimary || "#000000";
  const badgeBgPrimary = settings?.design?.badgeBgPrimary || "#F63737";
  const badgeTextSecondary = settings?.design?.badgeTextSecondary || "#000000";
  const badgeBgSecondary = settings?.design?.badgeBgSecondary || "#E0E0E0";
  const lowInventoryColor = settings?.design?.lowInventoryColor || "#056FFA";
  const borderColor = settings?.design?.borderColor || "rgba(255,255,255,0.05)";
  const linkHoverColor = settings?.design?.linkColorHover || "#F61515";

  // Merge top-level design with storefront-level overrides so tokens can be set
  // at either level (storefront wins).
  const tokenSource = { ...(settings?.design || {}), ...(storefrontDesign || {}) };
  // Visibility and words follow the template being shown, including an alternate template's own settings (2.8/2.9).
  const regionDesign = tokenSource;
  const inPreview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "true";
  // Add to bag sits in the buy card: when the buy card follows a colour scheme, it uses the scheme's
  // button roles (the inline --btn-* would otherwise override the variables schemeCss puts on the card).
  const buyButton = schemeButtonColors(tokenSource, "buyCard", { bg: buttonBg, text: buttonText });
  // Same column as the header (Style › Layout › Content width) so the page lines up with the logo.
  const pageMaxWidth = contentMaxWidth(tokenSource);

  // Catalogue-card layout (Studio › Style › Product page · buy card & details).
  const pdpShowBackLink   = tokenSource.pdpShowBackLink   ?? true;
  const pdpShowBreadcrumb = tokenSource.pdpShowBreadcrumb ?? true;
  const pdpShowBackArrow  = tokenSource.pdpShowBackArrow  ?? true;
  const crumbSeparator    = getCopy(settings?.design, "pdpCrumbSeparator");
  const pdpShowTag        = tokenSource.pdpShowTag        ?? true;
  const pdpTagStyle       = tokenSource.pdpTagStyle === "outline" ? "outline" : "filled";
  const pdpShowStock      = tokenSource.pdpShowStock      ?? true;
  const pdpRuledRows      = tokenSource.pdpRuledRows      !== false;
  const pdpShowCaption    = tokenSource.pdpShowCaption    ?? true;
  const pdpThumbPosition  = tokenSource.pdpThumbPosition  || "side";
  // Room the side thumbnail rail takes from the photo column (Style › Thumbnail size; 64px → 90px).
  const thumbRailWidth    = Math.min(160, Math.max(40, Number(tokenSource.pdpThumbSize) || 64)) + 26;
  // Studio › Style › Book page · photos & layout › Gap between thumbnails / Thumbnail shape.
  const thumbGap          = Math.min(24, Math.max(0, Number(tokenSource.pdpThumbGap ?? 10) || 0));
  const thumbAspect       = tokenSource.pdpThumbShape ? aspectRatioValue(tokenSource.pdpThumbShape, productImageAspect) : productImageAspect;
  // Style › Thumbnails on phones (pdpThumbsPhone): "row" keeps one sideways line on phones even when
  // "Thumbnails on several rows" is on (CSS in productPageStyle.ts `phoneThumbsCss`; ThumbStrip then sizes a line).
  const thumbsPhoneRow    = tokenSource.pdpThumbsPhone === "row";
  const [onPhone, setOnPhone] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(`(max-width:${PHONE_MAX}px)`).matches);
  useEffect(() => {
    if (!thumbsPhoneRow || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(`(max-width:${PHONE_MAX}px)`);
    const sync = () => setOnPhone(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, [thumbsPhoneRow]);
  const pdpDetailsBelow   = (tokenSource.pdpDetailsPlacement || "below") === "below";
  const pdpSpecsRecord    = (tokenSource.pdpSpecsStyle || "record") === "record";
  const headingFontName   = tokenSource.headingFont || tokenSource.font || tokenSource.bodyFont;
  const pageFontNames     = Array.from(new Set([headingFontName, ...productPageFontNames(tokenSource)].filter(Boolean).map(String)));
  const titleAutoSize     = productTitleSize === "medium" ? "clamp(28px, 3.4vw, 44px)" : productTitleSize === "xlarge" ? "clamp(40px, 6vw, 84px)" : undefined;

  const css = `
    [data-fm-store] {
      ${buildStorefrontTokenVars(tokenSource)}
      --bg-color: ${storefrontBg};
      --text-color: ${storefrontText};
      --link-hover-color: ${linkHoverColor};
      --border-color: ${borderColor};
      --btn-hover-bg: ${btnHoverBg};
      --btn-hover-text: ${btnHoverText};
      --badge-text-primary: ${badgeTextPrimary};
      --badge-bg-primary: ${badgeBgPrimary};
      --badge-text-secondary: ${badgeTextSecondary};
      --badge-bg-secondary: ${badgeBgSecondary};
      --low-inventory-color: ${lowInventoryColor};
      --heading-font: ${headingFontName ? `'${String(headingFontName).replace(/['"\\;{}<>]/g, "")}', Impact, sans-serif` : "inherit"};
    }
    [data-fm-store] .custom-btn {
      background-color: var(--btn-bg) !important;
      color: var(--btn-text) !important;
      border: var(--btn-border) !important;
      box-shadow: var(--btn-shadow) !important;
    }
    [data-fm-store] .custom-btn:hover {
      background-color: var(--btn-hover-bg) !important;
      color: var(--btn-hover-text) !important;
      box-shadow: none !important;
    }
    ${STOREFRONT_TOKEN_CSS}
    ${(tokenSource as any)?.themeStyle === "riso" ? RISO_STOREFRONT_CSS + risoGrainCss(tokenSource as any) : ""}
    ${productPageCss(tokenSource)}
  `;

  const related = relatedRow(book, books, { byArtist: storefrontDesign.relatedByArtist === true });
  const otherBooks = related.books;

  const { has: isWished, toggle: toggleWish } = useWishlist();
  const wished = book ? isWished(book.id) : false;

  // ── catalogue-card helpers ─────────────────────────────────────────────────
  const bk            = (book || {}) as any;
  // Only real shop categories (Studio › Menus › Shop categories) — never old genre tags like "Photography".
  const configuredCategories = settings?.design?.categories;
  const shopCats      = (Array.isArray(configuredCategories) ? configuredCategories : []).filter((c: any) => !categoryNames(c).includes("PUBLICATIONS"));
  const safeBookCategories = Array.isArray(bk.categories) ? bk.categories : [];
  const shopCat       = shopCats.find((c: any) => safeBookCategories.some((t: string) => categoryNames(c).includes(t)));
  const categoryLabel: string | undefined = shopCat ? catName(shopCat) : undefined;

  // Approved reviews feed the search-result star rating; the snapshot waits for this read.
  const [seoReviews, setSeoReviews] = useState<{ bookId: string; list: any[]; summary: { count: number; average: number } | null } | null>(null);
  useEffect(() => {
    if (!book?.id) return;
    let cancelled = false;
    // The newest reviews give the snippets; Firestore's own count/average give the star rating over all of them.
    Promise.all([reviewsApi.listApproved(book.id), reviewsApi.summary(book.id).catch(() => null)])
      .then(([list, summary]) => { if (!cancelled) setSeoReviews({ bookId: book.id, list, summary }); })
      .catch(() => { if (!cancelled) setSeoReviews({ bookId: book.id, list: [], summary: null }); });
    return () => { cancelled = true; };
  }, [book?.id]);
  const reviewsReady = !!book && seoReviews?.bookId === book.id;

  // Shipping rules (Settings › Shipping) give the search listing what one copy costs to ship within the shop's
  // own country (Text & labels › Site & sharing › shipping on book listings). The snapshot waits for this read too.
  const [shippingProfiles, setShippingProfiles] = useState<any[] | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadShippingProfiles().then((profiles) => { if (!cancelled) setShippingProfiles(profiles); });
    return () => { cancelled = true; };
  }, []);
  const shopCountry = findCountry(String(settings?.location?.country || "Canada"))?.code;
  const seoShipping = useMemo(() => {
    if (!book || !shippingProfiles || !String(getCopy(settings?.design, "seoShippingOnListings")).trim()) return null;
    const variant = selectedVariant || null;
    const unit = catalogUnitPrice(book, variant || undefined);
    if (!Number.isFinite(unit)) return null;
    const line = catalogFulfillmentItems([{ id: book.id, variantId: variant?.id, price: unit, quantity: 1 }], new Map([[book.id, book]]))?.[0];
    if (!line?.physical) return null;
    const weightGrams = parseWeightGrams(variant?.weight) ?? parseWeightGrams((book as any).weight) ?? bundleWeightGrams(book, new Map(books.map((b: any) => [b.id, b])));
    const quote = quoteShipping([{ price: unit, quantity: 1, shippingProfileId: (book as any).shippingProfileId || null, weightGrams }], { country: String(settings?.location?.country || "Canada") }, shippingProfiles)
      .find((q) => q.type !== "pickup");
    return shippingDetailsData(quote, shopCountry, undefined, getCopy(settings?.design, "seoHandlingDays"));
  }, [book, selectedVariant, shippingProfiles, settings, books, shopCountry]);
  // Free-shipping line (off by default): the bag's printed books count toward the shop-wide threshold.
  const freeShipInfo = useMemo(() => {
    if (!showPdpFreeShipping || !book) return null;
    const bagItems = catalogFulfillmentItems(cart, new Map((books || []).map((b: any) => [b.id, b])));
    return pdpFreeShipping(shippingProfiles, book, selectedVariant, bagItems);
  }, [showPdpFreeShipping, book, selectedVariant, shippingProfiles, cart, books]);
  const siteBase = new URL(import.meta.env.BASE_URL, window.location.origin).href;

  const bookUrl = canonicalUrl(new URL(`${import.meta.env.BASE_URL}books/${encodeURIComponent(book?.slug || book?.id || slug || "")}`, window.location.origin).href);
  const seoBook = selectedVariant && book ? {
    ...book,
    variants: [],
    stockLevel: selectedVariant.stockLevel ?? selectedVariant.stock ?? 0,
    onBackorder: selectedVariant.onBackorder,
    sku: selectedVariant.sku || book.sku,
    edition: selectedVariant.name || book.edition,
    format: (selectedVariant as any).format || book.format,
  } : book;
  const seoPrice = book ? (selectedVariant ? convertPrice(selectedVariant.price) : getBookPrice(book)) : 0;
  const seoOffer = seoBook ? bookStructuredData(seoBook, { currency, price: seoPrice, url: bookUrl }).offers.availability : "";
  useSEO(book ? {
    ...bookMetadata(book),
    // No custom search title: "Title by Author" (Text & labels › Site & sharing) while it stays short.
    ...(bookMetadata(book).exactTitle ? {} : { title: defaultBookTitle(book, (title, author) => getCopy(settings?.design, "seoBookTitleByline", { title, author })) }),
    description: bookMetadata(book).description || getCopy(settings?.design, "seoBookDescription", { title: book.title }),
    url: bookUrl,
    type: "product",
    product: { price: seoPrice, currency, availability: seoOffer.endsWith("InStock") ? "in stock" : seoOffer.endsWith("BackOrder") ? "backorder" : "out of stock" },
    noindex: book.seoNoindex === true || (!!book.status && book.status !== "published"),
    jsonLd: [
      bookStructuredData(seoBook!, {
        currency,
        price: seoPrice,
        url: bookUrl,
        reviews: reviewsReady ? seoReviews!.list : [],
        ratingSummary: reviewsReady ? seoReviews!.summary : null,
        seller: getCopy(settings?.design, "siteName"),
        shopUrl: siteBase,
        returnPolicy: returnPolicyData(getCopy(settings?.design, "seoReturnDays"), shopCountry),
        shipping: seoShipping,
      }),
      breadcrumbData([
        { name: getCopy(settings?.design, "pdpCrumbShop"), url: siteBase },
        ...(categoryLabel ? [{ name: categoryLabel, url: new URL(`collections/${slugify(categoryLabel)}`, siteBase).href }] : []),
        { name: book.title, url: bookUrl },
      ]),
    ],
  } : { title: getCopy(settings?.design, "seoBookLoadingTitle"), noindex: !loading });

  useEffect(() => {
    if (book?.id) {
      trackBookView(book.id);
      funnelApi.track("view");
      funnelApi.trackProductView(book.id);
      // Sold out (every edition) or coming soon: Overview › Stock › "Wanted but can't be bought".
      if (!quickAddChoice(book).inStock) funnelApi.trackUnavailableView(book.id);
      const price = Math.round((displayPrice(book) || 0) * 100) / 100;
      ga4Once(`view_${book.id}`, "view_item", { currency: "CAD", value: price, items: [{ item_id: book.id, item_name: String(book.title || "Book").slice(0, 100), price, quantity: 1 }] });
      const bookCategories = (book as any)?.categories || (book as any)?.genres || [];
      bookCategories.forEach((cat: string) => {
        funnelApi.trackCategory(cat);
      });
    }
    // Once per book: a background catalog refresh hands us a new `book` object for the same title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);

  // Google Analytics: a swipe through the photos counts once per book per visit; a missing book only once the
  // fresh read confirms it (the same condition as the "not found" view and its redirect).
  const gaPhotoSwipe = () => { if (book?.id) ga4Once(`photo_swipe_${book.id}`, "pdp_interact", { action: "photo_swipe" }); };
  const gaMissing = !book && !loading && !loadError;
  useEffect(() => { if (gaMissing) ga4PageNotFound(); }, [gaMissing, slug]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setActivePhoto(0);
    setImageLoaded(false);
    setQty(1);
    if (typeof window !== "undefined" && window.location.search.includes("preview=true")) {
      window.parent.postMessage({ type: "PREVIEW_READY" }, "*");
    }
  }, [slug]);

  // What goes with this line: the extras and, for a gift card, its recipient. Null (with a message
  // shown) when an inscription has no wording or the recipient email is malformed.
  const lineOptions = () => {
    const missing = missingWording(addOns, addOnPicks);
    if (missing) { setAddOnError(getCopy(settings?.design, "pdpAddOnMissingText", { label: missing.label })); return null; }
    setAddOnError("");
    if (isGiftCard && !giftFormValid(giftForm)) { setGiftError(getCopy(settings?.design, "pdpGiftEmailError")); return null; }
    setGiftError("");
    return { addOns: addOnRequest(addOns, addOnPicks), ...(isGiftCard ? { giftCardDetails: giftForm } : {}) };
  };

  // Coming soon button: open the signup and put the cursor in its email box; a second press closes it.
  const openComingSoon = () => {
    if (soonOpen) { setSoonOpen(false); return; }
    setSoonOpen(true);
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>("#pdp-coming-soon-signup input[type=email]");
      input?.focus();
    }, 0);
  };

  const handleAddToCart = () => {
    // While "Added" shows, a second tap must not add another copy.
    if (!book || added) return;
    if (book.variants?.length && !selectedVariant) {
      setEditionError(getCopy(settings?.design, "pdpEditionMissing"));
      document.getElementById("pdp-edition-select")?.focus();
      return;
    }
    const stock = selectedVariant ? (selectedVariant.stockLevel ?? selectedVariant.stock ?? 0) : ((book as any).stockLevel ?? 999);
    if (Number(stock) <= 0) return;
    const options = lineOptions();
    if (!options) return;
    // Only confirm "Added" when a line really went into the bag.
    if (!addToCart(book, selectedVariant || undefined, showQtyStepper ? qty : 1, options)) {
      // Already at the most this line can hold: open the bag, where the line shows its limit,
      // instead of a click that seems to do nothing.
      if (inBag > 0) setIsCartOpen(true);
      else toast.error(getCopy(settings?.design, "addToBagFailed"));
      return;
    }
    funnelApi.track("add_to_cart");
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  // "Buy it now": the same checks as Add to bag, then straight to checkout. A line already at its
  // limit is still in the bag, so checkout is the right place to go.
  const handleBuyNow = () => {
    if (!book || isOutOfStock) return;
    if (book.variants?.length && !selectedVariant) {
      setEditionError(getCopy(settings?.design, "pdpEditionMissing"));
      document.getElementById("pdp-edition-select")?.focus();
      return;
    }
    const options = lineOptions();
    if (!options) return;
    const ok = addToCart(book, selectedVariant || undefined, showQtyStepper ? qty : 1, options);
    if (!ok && inBag <= 0) { toast.error(getCopy(settings?.design, "addToBagFailed")); return; }
    if (ok) funnelApi.track("add_to_cart");
    setIsCartOpen(false);
    navigate("/checkout");
  };

  // "Add both" only pairs with a companion that can actually go in the bag.
  const bundleBook = otherBooks.find(b => quickAddChoice(b).inStock);

  const handleAddBothToBag = () => {
    if (!book || !bundleBook || isOutOfStock) return;
    // Same rule as Add to bag: a book sold in editions needs one picked first.
    if (book.variants?.length && !selectedVariant) {
      setEditionError(getCopy(settings?.design, "pdpEditionMissing"));
      document.getElementById("pdp-edition-select")?.focus();
      return;
    }
    const options = lineOptions();
    if (!options) return;
    // The edition the shopper has selected (with its extras), and an in-stock edition of the companion book.
    const addedThis = addToCart(book, selectedVariant || undefined, 1, options);
    const companion = quickAddChoice(bundleBook);
    const addedCompanion = companion.inStock ? addToCart(bundleBook, companion.variant) : false;
    // Nothing went in (both lines already at their limit): just show the bag.
    if (!addedThis && !addedCompanion) { setIsCartOpen(true); return; }
    setAddingBoth(true);
    funnelApi.track("add_to_cart");
    setTimeout(() => {
      setAddingBoth(false);
      setIsCartOpen(true);
    }, 1000);
  };

  const handleShare = async () => {
    ga4PdpInteract("share");
    if (navigator.share) {
      // Closing the share sheet is not an error.
      await navigator.share({ title: book?.title, url: window.location.href }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(getCopy(settings?.design, "bookLinkCopied"));
    } catch {
      // Clipboard blocked: say so instead of a false "copied" (or nothing at all).
      toast.error(getCopy(settings?.design, "bookShareCopyFailed"));
    }
  };

  const configuredPhotos = (book as any)?.photos;
  // Videos sit in the photo list (Books › edit › Images › Add video); Studio › Style › Product page ›
  // Show book videos can leave them out. Their `url` is a still frame, so everything below that only
  // knows photos (preloading, frame shape, thumbnails) works on them unchanged.
  const shownPhotos   = Array.isArray(configuredPhotos) ? galleryPhotos(configuredPhotos, storefrontDesign.showProductVideos !== false) : [];
  const photos        = shownPhotos.length > 0
    ? shownPhotos
    : [{ url: placeholderImage(settings?.design) }];
  // Each photo's shape from the width/height saved with it (uploads and the photo-copy sweep record them).
  const savedRatios: Record<string, number> = {};
  for (const p of photos) {
    const r = p?.url ? photoRatio(p.width, p.height) : undefined;
    if (r !== undefined) savedRatios[p.url] = r;
  }
  const stockLevel    = selectedVariant ? (selectedVariant.stockLevel ?? selectedVariant.stock ?? 0) : ((book as any)?.stockLevel ?? 999);
  // Copies of this edition already in the bag count toward its stock and the 99-per-line limit.
  // Lines of this edition with different extras share its stock, so all of them count.
  const inBag = cart.filter(item => item.id === book?.id && (item.variantId || undefined) === (selectedVariant?.id || undefined)).reduce((n, item) => n + item.quantity, 0);
  const qtyMax = Math.max(1, lineQuantityCap(stockLevel === 999 || backorderable(book, selectedVariant) ? undefined : Number(stockLevel)) - inBag);
  useEffect(() => { setQty(q => Math.min(q, qtyMax)); }, [qtyMax]);
  // The sticky bar shows only after the real Add to bag button has scrolled out of view (and not while it is below the fold).
  const [buyEl, setBuyEl] = useState<HTMLElement | null>(null);
  const [buyGone, setBuyGone] = useState(false);
  useEffect(() => {
    if (!stickyBar || !buyEl || typeof IntersectionObserver === "undefined") { setBuyGone(false); return; }
    const io = new IntersectionObserver(([entry]) => {
      setBuyGone(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(buyEl);
    return () => io.disconnect();
  }, [stickyBar, buyEl]);
  // Oversold stock goes below zero: that is sold out too, not "in stock".
  // An edition with no usable price can't be bought either; treat it like sold out rather than fake an add.
  // Coming soon (Books › Inventory › Coming soon): not for sale yet, so never "sold out" — the buy button opens the signup instead.
  const isComingSoon  = comingSoonActive(book);
  const isOutOfStock  = !isComingSoon && (Number(stockLevel) <= 0 || (!!book && !Number.isFinite(catalogUnitPrice(book, selectedVariant || undefined))));
  const retailPrice   = selectedVariant ? selectedVariant.price : ((book as any)?.retailPrice ?? 0);
  const salePrice     = selectedVariant ? 0 : ((book as any)?.salePrice   ?? 0);
  // Only while the sale is on (inside its optional start/end dates) — the price the server charges.
  const isOnSale      = selectedVariant ? false : (saleActive(book) && salePrice > 0);
  const saleEnds      = isOnSale ? saleEndDate(book) : "";
  const isGiftCard    = isGiftCardProduct(book);
  const isBoxSet      = isBundle(book);
  const addOns        = bookAddOns(book);
  // Loading photos ahead, at the size the main photo uses (same srcset/sizes, so the browser picks the same copy):
  //  • a photo saved without its size is loaded now, so adaptive frames know its shape before it is shown;
  //  • the rest of the gallery loads once the shopper reaches for the photos (pointer over them, a touch or keyboard
  //    focus), so jumping to any photo still shows it at once. The photos either side of the one shown always load
  //    straight away (the strip's eager neighbours). A shopper who never touches the gallery downloads only those.
  const photoUrlsKey = photos.map((p: any) => p?.url || "").join("\n");
  const warmGallery = () => { if (productFrameMode !== "fixed" && warmGalleryKey !== photoUrlsKey) setWarmGalleryKey(photoUrlsKey); };
  useEffect(() => {
    if (productFrameMode === "fixed" || !photoUrlsKey || typeof Image === "undefined") return;
    const all = warmGalleryKey === photoUrlsKey;
    let live = true;
    for (const photo of photos) {
      const url = photo?.url;
      if (!url || (!all && savedRatios[url] !== undefined)) continue;
      const img = new Image();
      img.onload = () => { if (live) notePhotoSize(url, img); };
      img.decoding = "async";
      const { srcSet, sizes } = photoSrcSet(photo, photoSizes(photo));
      if (srcSet && sizes) { img.sizes = sizes; img.srcset = srcSet; }
      img.src = url;
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUrlsKey, productFrameMode, warmGalleryKey]);
  const editionPhotoShown = !!(selectedVariant && selectedVariant.photoUrl && variantPhotoPinned);
  const activeUrl     = editionPhotoShown ? selectedVariant!.photoUrl : (photos[activePhoto]?.url || placeholderImage(settings?.design));
  // The photo actually on screen: a pinned edition photo is one of the gallery photos (or none of them),
  // so the current thumbnail, caption number and alt text follow it rather than the last picked photo.
  const shownIndex    = editionPhotoShown ? photos.findIndex((p: any) => p?.url === activeUrl) : activePhoto;
  const mediaName     = (item: any, i: number) => describedAlt(item?.altText) || getCopy(settings?.design, isVideoItem(item) ? "bookVideoLabel" : "bookPhotoAlt", { title: book?.title ?? "", n: i + 1 });
  const carouselIndex = shownIndex >= 0 ? shownIndex : Math.min(activePhoto, photos.length - 1);
  const shownVideo    = !(editionPhotoShown && shownIndex < 0) && isVideoItem(photos[carouselIndex]) ? photos[carouselIndex] : null;
  // A video stops when the shopper swipes away from it.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.querySelectorAll<HTMLVideoElement>(".fm-pdp-frame video[data-fm-video]").forEach((v) => { if (!v.paused) v.pause(); });
  }, [carouselIndex]);

  const alignCls      = productAlignment === "center" ? "items-center text-center" : "items-start text-left";
  const showThumbRail = photos.length > 1 && pdpThumbPosition !== "hidden";
  // Dots under the photo: "" = only when the thumbnails are hidden (as before), "always", "never".
  const photoDotsMode = storefrontDesign.pdpPhotoDots || "";
  const showPhotoDots = photos.length > 1 && photos.length <= 20 && (photoDotsMode === "always" || (photoDotsMode === "" && !showThumbRail));
  const isLowStock    = stockLevel > 0 && stockLevel !== 999 && stockLevel <= designNumber(settings?.design, "lowStockProductThreshold", 10);
  const isBackorder   = !!(selectedVariant ? (selectedVariant as any).onBackorder : (book as any)?.onBackorder);
  // Pre-order (Books › Inventory › Pre-order): sold before its publication date.
  const isPreorder    = !isComingSoon && preorderActive(book);
  const preorderDate  = isPreorder ? formatReleaseDate(releaseDateOf(book)) : "";
  const comingDate    = isComingSoon ? formatReleaseDate(releaseDateOf(book)) : "";
  const stockText     = isComingSoon
    ? (comingDate ? getCopy(settings?.design, "pdpComingSoonDate", { date: comingDate }) : getCopy(settings?.design, "pdpComingSoon"))
    : isOutOfStock
    ? getCopy(settings?.design, "soldOutLabel")
    : isPreorder ? (preorderDate ? getCopy(settings?.design, "pdpPreorder", { date: preorderDate }) : getCopy(settings?.design, "pdpPreorderTba"))
    : isBackorder ? getCopy(settings?.design, "pdpBackorder")
    : isLowStock ? getCopy(settings?.design, "pdpInStockCount", { count: stockLevel }) : getCopy(settings?.design, "pdpInStock");
  // Books › edit › Publishing details › Details tab rows: the owner's order, wording and own rows.
  const SPEC_ICONS: Record<string, React.ReactNode> = { specLanguage: <Globe size={11} />, specDimensions: <Ruler size={11} />, specIsbn: <Package size={11} />, specWeight: <Weight size={11} /> };
  const specRows = shownDetailRows(bk, (key) => getCopy(settings?.design, key), {
    showEditionFacts: storefrontDesign.showPdpEditionDetails !== false,
    edition: selectedVariant?.name,
  }).map((r) => ({ ...r, icon: SPEC_ICONS[r.key] || <BookOpen size={11} /> }));
  // Books › edit › Search (SEO) › Artist links: the artist's own website, a normal followed link (Studio › Style ›
  // Book page · photos & layout › Show artist website links; label Text & labels › Product page › specArtistLinks).
  const artistLinks = storefrontDesign.showPdpArtistLinks !== false ? creatorLinks(bk) : [];
  const hasSpecs = showSpecs !== false && regionVisible(regionDesign, "productSpecs") && (specRows.length > 0 || artistLinks.length > 0 || isLowStock);
  const artistLink = (l: { name: string; url: string }) => <a href={l.url} target="_blank" rel="noopener" className="underline underline-offset-2">{l.name}</a>;

  const renderSpecs = () => pdpSpecsRecord ? (
    <dl className="fm-pdp-record w-full text-left">
      {specRows.map((r) => (
        <Fragment key={r.key}><dt>{r.label}</dt><dd>{r.value}</dd></Fragment>
      ))}
      {artistLinks.map((l, i) => (
        <Fragment key={`artist-${i}`}><dt>{getCopy(settings?.design, "specArtistLinks")}</dt><dd>{artistLink(l)}</dd></Fragment>
      ))}
      {isLowStock && (
        <><dt>{getCopy(settings?.design, "specAvailability")}</dt><dd style={{ color: lowInventoryColor }}>{getCopy(settings?.design, "specRemaining", { count: stockLevel })}</dd></>
      )}
    </dl>
  ) : (
    <div className="grid grid-cols-2 gap-3 w-full text-left">
      {specRows.map((r) => <SpecItem key={r.key} icon={r.icon} label={r.label} value={r.value} />)}
      {artistLinks.map((l, i) => <SpecItem key={`artist-${i}`} icon={<Globe size={11} />} label={getCopy(settings?.design, "specArtistLinks")} value={artistLink(l)} />)}
      {isLowStock && (
        <SpecItem icon={<Zap size={11} style={{ color: lowInventoryColor }} />} label={getCopy(settings?.design, "specAvailability")} value={getCopy(settings?.design, "specRemaining", { count: stockLevel })} />
      )}
    </div>
  );

  // Shipping & returns tab (off by default): the shop's own policies from Settings › General › Store policies.
  const policyEntries = showPdpPolicyTab && regionVisible(regionDesign, "productPolicies") ? pdpPolicyEntries(settings?.policies, book, selectedVariant) : [];
  const artistBio = showPdpArtistBio && regionVisible(regionDesign, "productArtistBio") && typeof bk.artistBio === "string" ? bk.artistBio.trim() : "";
  const detailTabs: { id: "description" | "artist" | "specs" | "policies" | "reviews"; label: string }[] = orderTabs([
    ...(regionVisible(regionDesign, "productDescription") ? [{ id: "description" as const, label: getCopy(settings?.design, "tabDescription") }] : []),
    ...(artistBio ? [{ id: "artist" as const, label: getCopy(settings?.design, "tabArtistBio") }] : []),
    ...(hasSpecs ? [{ id: "specs" as const, label: getCopy(settings?.design, productDetailsLayout === "accordions" ? "tabSpecs" : "tabDetails") }] : []),
    ...(policyEntries.length ? [{ id: "policies" as const, label: getCopy(settings?.design, "tabShippingReturns") }] : []),
    ...(regionVisible(regionDesign, "productReviews") ? [{ id: "reviews" as const, label: getCopy(settings?.design, "tabReviews") }] : []),
  ], storefrontDesign);
  const activeTab = detailTabs.some((t) => t.id === detailsTab) ? detailsTab : detailTabs[0]?.id;
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const n = detailTabs.length;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    if (detailTabs[next].id !== activeTab) ga4PdpInteract("tab_open", { tab: pdpTabName(detailTabs[next].id) });
    setDetailsTab(detailTabs[next].id);
    document.getElementById(`pdp-tab-${detailTabs[next].id}`)?.focus();
  };
  const detailContent = (id: string) =>
    id === "description" ? (
      <div {...regionProps("productDescription")} className={`fm-pdp-desc fm-pdp-desc-text${ruledCls} text-[15px] leading-[1.75] whitespace-pre-line`}>{bk.description ? <DescriptionFold design={settings?.design} look={storefrontDesign} text={bk.description}><DescriptionText text={bk.description} /></DescriptionFold> : getCopy(settings?.design, "noDescription")}</div>
    ) : id === "artist" ? (
      <div {...regionProps("productArtistBio")} className={`fm-pdp-desc fm-pdp-desc-text${ruledCls} text-[15px] leading-[1.75] whitespace-pre-line`}><DescriptionText text={artistBio} /></div>
    ) : id === "specs" ? <div {...regionProps("productSpecs")}>{renderSpecs()}</div> : id === "policies" ? (
      <div {...regionProps("productPolicies")} className="fm-pdp-policies flex flex-col gap-5 text-left">
        {policyEntries.map((e) => (
          <div key={e.key} className="flex flex-col gap-2">
            {policyEntries.length > 1 && <p className="fm-pdp-meta">{policyTitle(settings?.design, e.key)}</p>}
            <div className={`fm-pdp-desc-text${ruledCls} text-[14px] leading-[1.75] [&_p+p]:mt-3`} dangerouslySetInnerHTML={{ __html: policyHtml(e.text) }} />
            <Link to={`/page/${policySlug(e.key)}`} className="fm-pdp-meta underline underline-offset-2 self-start">
              {getCopy(settings?.design, "pdpPolicyReadMore", { policy: policyTitle(settings?.design, e.key) })}
            </Link>
          </div>
        ))}
      </div>
    ) : book ? (
      <div {...regionProps("productReviews")}><ReviewsSection key={book.id} bookId={book.id} hideHeader={true} /></div>
    ) : null;

  // Inactive tab/accordion text stays in the shop's HTML (hidden) for search engines; Studio's preview leaves it
  // out so its page scan and click-to-edit see each part once.
  const keepHiddenText = !inEditorPreview();
  const detailsBlock = !book || !detailTabs.length ? null : productDetailsLayout === "tabs" ? (
    <div className="fm-pdp-tabs w-full" data-studio-target="style:productCard|copy:Product page" data-studio-label="Product details tabs">
      <div role="tablist" aria-label={getCopy(settings?.design, "pdpDetailsAria")}>
        {detailTabs.map((t, i) => (
          <button
            key={t.id}
            id={`pdp-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls="pdp-tabpanel"
            tabIndex={activeTab === t.id ? 0 : -1}
            onClick={() => { if (activeTab !== t.id) ga4PdpInteract("tab_open", { tab: pdpTabName(t.id) }); setDetailsTab(t.id); }}
            onKeyDown={(e) => onTabKey(e, i)}
            className="fm-pdp-tab"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="pdp-tabpanel" role="tabpanel" aria-labelledby={`pdp-tab-${activeTab}`} className="fm-pdp-panel">
        {detailContent(activeTab)}
        {/* The other text tabs stay in the page, hidden, so search engines (and the prerendered HTML) read the
            description and the Details record whichever tab is open. Reviews load only when opened. */}
        {keepHiddenText && detailTabs.filter((t) => t.id !== activeTab && t.id !== "reviews" && t.id !== "policies").map((t) => (
          <div key={t.id} hidden data-pdp-hidden-tab={t.id}>{detailContent(t.id)}</div>
        ))}
      </div>
    </div>
  ) : productDetailsLayout === "accordions" ? (
    <div className="w-full flex flex-col gap-2.5" data-studio-target="style:productCard|copy:Product page" data-studio-label="Product details tabs">
      {detailTabs.map((t) => (
        <div key={t.id} className="fm-pdp-panel" style={{ padding: 0 }}>
          <button
            type="button"
            aria-expanded={!!openAccordions[t.id]}
            aria-controls={`pdp-acc-${t.id}`}
            onClick={() => { if (!openAccordions[t.id]) ga4PdpInteract("tab_open", { tab: pdpTabName(t.id) }); toggleAccordion(t.id); }}
            className="w-full min-h-[56px] px-5 flex items-center justify-between gap-4 text-[10px] font-black tracking-[0.28em] uppercase text-left"
          >
            <span>{t.label}</span>
            <ChevronDown size={14} className={`shrink-0 transition-transform duration-300 ${openAccordions[t.id] ? "rotate-180" : ""}`} />
          </button>
          {openAccordions[t.id]
            ? <div id={`pdp-acc-${t.id}`} className="px-5 pb-5">{detailContent(t.id)}</div>
            : keepHiddenText && t.id !== "reviews" && t.id !== "policies" && <div id={`pdp-acc-${t.id}`} hidden>{detailContent(t.id)}</div>}
        </div>
      ))}
    </div>
  ) : null;

  // ── could not load ─────────────────────────────────────────────────────────
  // The read failed and there is no book to show: say so and offer Retry, instead of "not found".
  if (!book && loadError) {
    return (
      <div
        data-fm-store data-studio-target="style:productPage|copy:Product page" data-studio-label="Product page"
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ backgroundColor: storefrontBg, color: storefrontText }}
      >
        <p role="alert" className="text-sm tracking-[0.3em] uppercase text-center px-6" style={{ color: `${storefrontText}80` }}>{getCopy(settings?.design, "catalogLoadError")}</p>
        <button
          type="button"
          onClick={retry}
          className="text-[10px] font-black tracking-[0.4em] px-8 py-3 transition-all uppercase custom-btn"
          style={{
            "--btn-bg": buttonStyle === "solid" ? buttonBg : "transparent",
            "--btn-text": buttonStyle === "solid" ? buttonText : buttonBg,
            "--btn-border": buttonStyle !== "solid" ? `1px solid ${buttonBg}` : `1px solid ${borderColor}`,
            borderRadius: buttonRadius,
          } as React.CSSProperties}
        >
          {getCopy(settings?.design, "catalogRetry")}
        </button>
      </div>
    );
  }

  // ── loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: settings?.design?.backgroundColor || "#050508" }}
      >
        <div className="flex flex-col items-center gap-5">
          <m.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-14 h-14 rounded-[1.2rem] bg-white/[0.06] border border-white/10 flex items-center justify-center"
          >
            <Package size={20} className="text-white/50" />
          </m.div>
          <p className="text-white/30 text-[9px] font-black tracking-[0.5em] uppercase">{getCopy(settings?.design, "bookLoading")}</p>
        </div>
      </div>
    );
  }

  // ── not found ──────────────────────────────────────────────────────────────
  if (!book) {
    return (
      <div
        data-fm-store data-studio-target="style:productPage|copy:Product page" data-studio-label="Product page"
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{
          backgroundColor: storefrontBg,
          color: storefrontText,
        }}
      >
        <Package size={48} strokeWidth={1} style={{ color: `${storefrontText}33` }} />
        <p className="text-sm tracking-[0.3em] uppercase" style={{ color: `${storefrontText}80` }}>{getCopy(settings?.design, "bookNotFound")}</p>
        <Link
          to="/"
          className="text-[10px] font-black tracking-[0.4em] px-8 py-3 transition-all uppercase custom-btn"
          style={{
            "--btn-bg": buttonStyle === "solid" ? buttonBg : "transparent",
            "--btn-text": buttonStyle === "solid" ? buttonText : buttonBg,
            "--btn-border": buttonStyle !== "solid" ? `1px solid ${buttonBg}` : `1px solid ${borderColor}`,
            borderRadius: buttonRadius,
          } as React.CSSProperties}
        >
          {getCopy(settings?.design, "bookReturn")}
        </Link>
      </div>
    );
  }

  // ── page ───────────────────────────────────────────────────────────────────
  // Blocks the owner added in Studio (Page layout › Buy box blocks). Their words can be connected to this book's
  // details (2.7); with Hide when empty a block whose connected detail is missing is left out.
  const renderCustomBlock = (block: ProductBlock): React.ReactNode => {
    const resolved = resolveDynamicSettings(block.settings || {}, { book }, { preview: inPreview });
    if (resolved.hidden) return null;
    const v = resolved.settings as Record<string, any>;
    const text = (key: string) => (typeof v[key] === "string" ? v[key].trim() : "");
    const hook = { "data-studio-target": "style:productCard|copy:Product page", "data-studio-label": blockLabel(block), "data-pdp-block": block.id };
    switch (block.type) {
      case "text":
        return text("text") ? <p key={block.id} {...hook} className="fm-pdp-text w-full text-[14px] leading-[1.7] whitespace-pre-line">{text("text")}</p> : null;
      case "collapsible":
        return text("heading") ? (
          <details key={block.id} {...hook} className="fm-pdp-collapsible w-full">
            <summary className="fm-pdp-meta cursor-pointer">{text("heading")}</summary>
            {text("body") && <p className="mt-2 text-[14px] leading-[1.7] whitespace-pre-line">{text("body")}</p>}
          </details>
        ) : null;
      case "badge": {
        const tone = ["accent", "success", "warning", "danger"].includes(v.tone) ? v.tone : "accent";
        return text("label") ? <div key={block.id} {...hook}><span className="fm-pdp-tag fm-pdp-badge" data-style="outline" style={{ color: `var(--${tone}, currentColor)`, borderColor: `var(--${tone}, currentColor)` }}>{text("label")}</span></div> : null;
      }
      case "lookInside": {
        const href = text("link");
        if (!href || !text("label")) return null;
        return /^https?:\/\//i.test(href)
          ? <a key={block.id} {...hook} href={href} target="_blank" rel="noopener noreferrer" className="fm-pdp-meta fm-pdp-look-inside underline underline-offset-4">{text("label")}</a>
          : <Link key={block.id} {...hook} to={href} className="fm-pdp-meta fm-pdp-look-inside underline underline-offset-4">{text("label")}</Link>;
      }
      case "customField": {
        const value = String(bk.custom?.[v.fieldKey] ?? "").trim();
        if (!value) return null;
        return <p key={block.id} {...hook} className="fm-pdp-detail w-full">{text("label") && <span className="fm-pdp-meta mr-2">{text("label")}</span>}<span>{value}</span></p>;
      }
      default: return null;
    }
  };
  const stockLine = pdpShowStock && !isGiftCard ? (
    <span className="fm-pdp-meta fm-pdp-stock" data-state={isComingSoon ? "soon" : isOutOfStock ? "out" : isPreorder ? "preorder" : isLowStock ? "low" : "in"}>
      {isPreorder && !isOutOfStock && preorderDate
        ? <ReleaseCountdownText releaseDate={releaseDateOf(book)} fallback={stockText} design={settings?.design} look={storefrontDesign} />
        : stockText}
    </span>
  ) : null;
  // Ruled rows: the stock line moves up beside the category tag (when the tag row shows).
  const buyBlocks = productBlocks(tokenSource);
  const stockInTagRow = pdpRuledRows && pdpShowTag && buyBlocks.some(b => b.type === "tag" && !b.hidden);
  // ── Buy card blocks (Studio 2.9) ── each built-in returns exactly the JSX the card had before it became a list.
  const renderBlock = (block: ProductBlock): React.ReactNode => {
    switch (block.type) {
      case "tag": {
        if (!pdpShowTag) return null;
        return <Fragment key={block.id}>
                  {pdpShowTag && (
                    <div className={stockInTagRow ? "fm-pdp-tagrow" : undefined}>
                      <span className="fm-pdp-tag" data-style={pdpTagStyle}>
                        <Tag size={10} aria-hidden="true" />
                        {categoryLabel || getCopy(settings?.design, "categoryFallback")}
                      </span>
                      {stockInTagRow && stockLine}
                    </div>
                  )}
        </Fragment>;
      }
      case "heading": {
        return <Fragment key={block.id}>
                  <div className="space-y-3 w-full">
                    <h1
                      className="fm-pdp-title"
                      data-studio-target="style:productCard" data-studio-label="Product title & price"
                      style={titleStyle(titleAutoSize, book.title)}
                    >
                      {book.title}
                    </h1>
                    {bk.subtitle && (
                      <p className={`text-white/40 text-xl leading-snug ${
                        productSubtitleWeight === "bold" ? "font-bold" :
                        productSubtitleWeight === "medium" ? "font-normal" : "font-light"
                      }`}>{bk.subtitle}</p>
                    )}
                    {bk.authorName && (
                      <p className="fm-pdp-meta">{bk.authorName}</p>
                    )}
                  </div>
        </Fragment>;
      }
      case "price": {
        return <Fragment key={block.id}>
                  <div data-section="colors" className={`flex flex-wrap items-end gap-x-5 gap-y-3 w-full ${productAlignment === "center" ? "justify-center" : "justify-between"}`}>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                      {isOnSale ? (
                        <>
                          <span className="fm-pdp-price" translate="no">{formatBookPrice(book)}</span>
                          {regionVisible(regionDesign, "productOldPrice") && <span {...regionProps("productOldPrice")} className="text-white/25 line-through text-xl">{formatBookPrice(book, true)}</span>}
                          {regionVisible(regionDesign, "productSaveBadge") && <span
                            {...regionProps("productSaveBadge")}
                            className="text-[9px] font-black tracking-widest border px-3 py-1.5 uppercase"
                            style={{
                              color: "var(--success)",
                              backgroundColor: "rgba(var(--success-rgb), 0.1)",
                              borderColor: "rgba(var(--success-rgb), 0.2)",
                            }}
                          >
                            {getCopy(settings?.design, "saveAmount", { amount: formatPrice(getBookPrice(book, true) - getBookPrice(book)) })}
                          </span>}
                        </>
                      ) : (
                        <span className="fm-pdp-price" translate={retailPrice > 0 ? "no" : undefined}>
                          {retailPrice > 0 ? (selectedVariant ? formatPrice(selectedVariant.price) : formatBookPrice(book)) : getCopy(settings?.design, "priceOnRequest")}
                        </span>
                      )}
                    </div>
                    {saleEnds && !isOutOfStock && regionVisible(regionDesign, "productSaleEnds") && (
                      <SaleEndsLine endDate={saleEnds} design={settings?.design} look={storefrontDesign} />
                    )}
                    {!stockInTagRow && stockLine}
                    {/* Tax & shipping note (off by default): display only, checkout works both out. */}
                    {showPdpTaxNote && retailPrice > 0 && regionVisible(regionDesign, "productTaxNote") && (
                      <PdpTaxNote design={settings?.design} policies={settings?.policies}
                        physical={!isGiftCard && isPickupItem(book, selectedVariant)}
                        taxed={!isGiftCard && taxCollectionOn(settings)} />
                    )}
                  </div>
        </Fragment>;
      }
      case "formats": {
        if (!(book.variants && book.variants.length > 0)) return null;
        return <Fragment key={block.id}>
                  {book.variants && book.variants.length > 0 && (
                    <div className={`flex flex-col gap-2.5 w-full ${productAlignment === "center" ? "items-center" : "items-start"}`} data-studio-target="style:productCard|copy:Product page" data-studio-label="Edition choices">
                      <span id="pdp-format-label" className="fm-pdp-meta">{getCopy(settings?.design, isGiftCard ? "pdpGiftAmountLabel" : "bookFormatLabel")}</span>
                      {editionDropdown ? (
                        <div className="flex flex-col gap-1.5 w-full max-w-[420px]">
                          <select
                            id="pdp-edition-select"
                            aria-labelledby="pdp-format-label"
                            aria-invalid={!!editionError}
                            aria-describedby={editionError ? "pdp-edition-error" : undefined}
                            value={selectedVariant?.id || ""}
                            onChange={(e) => { setSelectedVariant(book.variants?.find((v: any) => v.id === e.target.value) || null); setEditionError(""); ga4PdpInteract("edition_switch"); }}
                            className="fm-pdp-select"
                          >
                            <option value="" disabled>{getCopy(settings?.design, "pdpEditionChoose")}</option>
                            {book.variants.map((v: any) => (
                              <option key={v.id} value={v.id}>
                                {v.name}{editionShowPrice && Number.isFinite(Number(v.price)) && v.price !== null && v.price !== "" ? ` · ${formatPrice(Number(v.price))}` : ""}{Number(v.stockLevel ?? v.stock ?? 0) <= 0 && !v.onBackorder ? ` · ${getCopy(settings?.design, "pdpEditionSoldOut")}` : ""}
                              </option>
                            ))}
                          </select>
                          {editionError && <span id="pdp-edition-error" role="alert" className="fm-pdp-meta" style={{ color: "var(--danger)" }}>{editionError}</span>}
                        </div>
                      ) : (
                      <div role="group" aria-labelledby="pdp-format-label" className={`flex flex-wrap gap-2 ${productAlignment === "center" ? "justify-center" : "justify-start"}`}>
                        {book.variants.map((v: any) => {
                          const vStock = v.stockLevel ?? v.stock ?? 0;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => { if (selectedVariant?.id !== v.id) ga4PdpInteract("edition_switch"); setSelectedVariant(v); }}
                              aria-pressed={selectedVariant?.id === v.id}
                              data-soldout={Number(vStock) <= 0}
                              className="fm-pdp-chip"
                            >
                              {v.name}{editionShowPrice && Number.isFinite(Number(v.price)) && v.price !== null && v.price !== "" ? ` · ${formatPrice(Number(v.price))}` : ""}
                            </button>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  )}
        </Fragment>;
      }
      case "boxSet": {
        if (!isBoxSet) return null;
        return <Fragment key={block.id}>
                  {isBoxSet && <BoxSetContents design={regionDesign} book={book} books={books} />}
        </Fragment>;
      }
      case "addOns": {
        if (isOutOfStock || !addOns.length) return null;
        return <Fragment key={block.id}>
                  {!isOutOfStock && (
                    <AddOnPicker
                      design={regionDesign}
                      addOns={addOns}
                      picks={addOnPicks}
                      onChange={(next) => { setAddOnPicks(next); setAddOnError(""); }}
                      error={addOnError}
                      formatPrice={formatPrice}
                      unitPrice={catalogUnitPrice(book, selectedVariant || undefined)}
                    />
                  )}
        </Fragment>;
      }
      case "giftCard": {
        if (!(isGiftCard && !isOutOfStock)) return null;
        return <Fragment key={block.id}>
                  {isGiftCard && !isOutOfStock && (
                    <GiftCardForm design={regionDesign} value={giftForm} onChange={(next) => { setGiftForm(next); setGiftError(""); }} error={giftError} />
                  )}
        </Fragment>;
      }
      case "buy": {
        return <Fragment key={block.id}>
                  {/* CTA */}
                  <div
                    className={`flex flex-wrap gap-2.5 w-full ${
                      productCtaWidth === "auto" && productAlignment === "center" ? "justify-center" : "justify-start"
                    }${productCtaWidth === "full" ? " fm-pdp-cta" : ""}`}
                    data-icons={productCtaWidth === "full" ? (showPdpWishlist ? 1 : 0) + (showSocialShare ? 1 : 0) : undefined}
                  >
                    {showQtyStepper && !isOutOfStock && !isComingSoon && (
                      <div className="fm-pdp-qty">
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          aria-label={getCopy(settings?.design, "ariaQtyDown")}
                          disabled={qty <= 1}
                        >
                          <Minus size={14} />
                        </button>
                        <output aria-live="polite">{qty}</output>
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.min(qtyMax, q + 1))}
                          aria-label={getCopy(settings?.design, "ariaQtyUp")}
                          disabled={qty >= qtyMax}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                    <m.button
                      ref={setBuyEl}
                      data-section="buttons"
                      onClick={isComingSoon ? openComingSoon : handleAddToCart}
                      disabled={isOutOfStock || (isComingSoon && !showComingSoonSignup)}
                      aria-expanded={isComingSoon && showComingSoonSignup ? soonOpen : undefined}
                      aria-controls={isComingSoon && showComingSoonSignup && soonOpen ? "pdp-coming-soon-signup" : undefined}
                      whileTap={!isOutOfStock ? { scale: 0.97 } : {}}
                      animate={
                        !isOutOfStock && !added && productCtaAnimation === "pulse"
                          ? { scale: [1, 1.02, 1] }
                          : !isOutOfStock && !added && productCtaAnimation === "glow"
                          // .custom-btn draws box-shadow from --btn-shadow with !important, so the glow animates that variable.
                          ? { "--btn-shadow": [`0 0 0px ${buttonBg}00`, `0 0 20px ${buttonBg}50`, `0 0 0px ${buttonBg}00`] } as any
                          : {}
                      }
                      transition={
                        !isOutOfStock && !added && (productCtaAnimation === "pulse" || productCtaAnimation === "glow")
                          ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
                          : {}
                      }
                      whileHover={
                        !isOutOfStock && !added && productCtaAnimation === "scale"
                          ? { scale: 1.04, y: -2 }
                          : {}
                      }
                      className={`${productCtaWidth === "full" ? "flex-1 min-w-[170px]" : "px-8"} ${
                        // Large (default) keeps the 52px button; Medium is visibly shorter (both used to draw at 52px).
                        productCtaSize === "medium" ? "min-h-[44px]" : "min-h-[52px]"
                      } flex items-center justify-center gap-3 ${
                        productCtaSize === "medium" ? "py-3" : "py-4"
                      } text-[10px] font-black tracking-[0.3em] transition-colors duration-300 ${
                        isOutOfStock
                          ? "bg-white/[0.06] text-white/25 cursor-not-allowed border border-white/[0.06]"
                          : added
                          ? "fm-success-solid"
                          : `custom-btn ${buttonShadow ? "shadow-2xl" : ""} ${buttonUppercase ? "uppercase" : ""}`
                      }`}
                      style={
                        !isOutOfStock && !added
                          ? {
                              "--btn-bg": buttonStyle === "solid" ? buyButton.bg : "transparent",
                              "--btn-text": buttonStyle === "solid" ? buyButton.text : buyButton.bg,
                              "--btn-border": buttonStyle !== "solid" ? `1px solid ${buyButton.bg}` : "none",
                              "--btn-shadow": buttonStyle === "solid" && buttonShadow ? `0 20px 60px ${buyButton.bg}50` : "none",
                              borderRadius: buttonRadius,
                            } as React.CSSProperties
                          : { borderRadius: buttonRadius }
                      }
                    >
                      {isOutOfStock ? (
                        getCopy(settings?.design, "soldOutLabel")
                      ) : isComingSoon ? (
                        <><Bell size={14} /> {getCopy(settings?.design, showComingSoonSignup ? "comingSoonButton" : "pdpComingSoon")}</>
                      ) : added ? (
                        <><Check size={14} strokeWidth={3} /> {getCopy(settings?.design, "bookAdded")}</>
                      ) : (
                        <><ShoppingBag size={14} /> {isPreorder ? getCopy(settings?.design, "preorderButton") : (storefrontDesign.addToBagLabel || settings?.design?.addToBagLabel || getCopy(settings?.design, "addToBagLabel"))}</>
                      )}
                    </m.button>

                    {showPdpWishlist && (
                    <button
                      type="button"
                      data-section="colors"
                      onClick={() => book && toggleWish(book.id)}
                      aria-pressed={wished}
                      aria-label={getCopy(settings?.design, wished ? "wishlistRemoveAria" : "wishlistAddAria")}
                      title={getCopy(settings?.design, wished ? "wishlistInTitle" : "wishlistSaveTitle")}
                      className={`fm-pdp-sq transition-all ${wished ? "fm-favorite-active" : ""}`}
                    >
                      <Heart size={16} fill={wished ? "currentColor" : "none"} />
                    </button>
                    )}

                    {showSocialShare && (
                      <button
                        type="button"
                        onClick={handleShare}
                        aria-label={getCopy(settings?.design, "bookShare")}
                        title={getCopy(settings?.design, "bookShare")}
                        className="fm-pdp-sq transition-all"
                      >
                        <Share2 size={16} />
                      </button>
                    )}
                  </div>
                  {isComingSoon && showComingSoonSignup && soonOpen && book && (
                    <BackInStockForm
                      key={`soon:${book.id}`}
                      id="pdp-coming-soon-signup"
                      comingSoon
                      design={settings?.design}
                      bookId={book.id}
                      bookTitle={book.title}
                    />
                  )}
                  {showBuyNow && !isOutOfStock && !isComingSoon && (
                    <button
                      type="button"
                      onClick={handleBuyNow}
                      className={`fm-pdp-buynow ${buttonUppercase ? "uppercase" : ""}`}
                      style={{ borderRadius: buttonRadius }}
                      data-studio-target="style:productCard"
                      data-studio-label="Buy it now button"
                    >
                      {getCopy(settings?.design, "pdpBuyNow")}
                    </button>
                  )}
                  {/* Payment icons (off by default): the footer's card and wallet logos, while the book can be bought. */}
                  {showPdpPaymentIcons && !isOutOfStock && !isComingSoon && regionVisible(regionDesign, "productPaymentIcons") && (
                    <PdpPaymentIcons badges={resolveFooterBadges(settings?.design, settings)} design={settings?.design} />
                  )}
                  {/* Already in your bag (off by default): copies of the chosen edition the bag holds. */}
                  {showPdpInBag && inBag > 0 && regionVisible(regionDesign, "productInBag") && (
                    <PdpInBag count={inBag} design={settings?.design} onOpenBag={() => setIsCartOpen(true)} />
                  )}
                  {showPdpFreeShipping && !isOutOfStock && !isComingSoon && regionVisible(regionDesign, "productFreeShipping") && (
                    <PdpFreeShipping info={freeShipInfo} design={settings?.design} formatPrice={formatPrice} />
                  )}
                  {/* Ships-by line (off by default): printed copies in stock now only (not pre-orders or backorders). */}
                  {showPdpShipBy && !isOutOfStock && !isComingSoon && !isPreorder && !isBackorder && stockLevel > 0 && book && isPickupItem(book, selectedVariant) && regionVisible(regionDesign, "productShipBy") && (
                    <PdpShipBy design={settings?.design} look={storefrontDesign} />
                  )}
                  {showPdpPickup && !isOutOfStock && !isComingSoon && regionVisible(regionDesign, "productPickup") && (
                    <PickupAvailability
                      spots={pickupSpots(settings?.localFulfillment, book, selectedVariant)}
                      design={settings?.design}
                      formatPrice={formatPrice}
                    />
                  )}
                  {/* Ask a question (off by default): any book, sold out or not; sends to Admin › Messages. */}
                  {showPdpAskQuestion && book && regionVisible(regionDesign, "productAskQuestion") && (
                    <PdpAskQuestion key={book.id} design={settings?.design} title={book.title} edition={selectedVariant?.name} />
                  )}
        </Fragment>;
      }
      case "backInStock": {
        if (!(isOutOfStock && showBackInStock && book)) return null;
        return <Fragment key={block.id}>
                  {isOutOfStock && showBackInStock && book && (
                    <BackInStockForm
                      key={`${book.id}:${selectedVariant?.id || "base"}`}
                      design={settings?.design}
                      bookId={book.id}
                      bookTitle={book.title}
                      variantId={selectedVariant?.id}
                      variantName={selectedVariant?.name}
                    />
                  )}
        </Fragment>;
      }
      case "details": {
        if (!(productDetailsLayout === "sections" && ((bk.description && regionVisible(regionDesign, "productDescription")) || hasSpecs))) return null;
        return <Fragment key={block.id}>
                    {bk.description && regionVisible(regionDesign, "productDescription") && (
                      productDescriptionStyle === "designed" ? (
                        <div {...regionProps("productDescription")} className="w-full">
                          <p className="fm-pdp-meta mb-3" style={{ color: "var(--accent, #e8402a)" }}>
                            {getCopy(settings?.design, "productDescriptionLabel")}
                          </p>
                          <div className={`fm-pdp-desc-text${ruledCls} text-[15px] leading-[1.8] whitespace-pre-line`}><DescriptionFold design={settings?.design} look={storefrontDesign} text={bk.description}><DescriptionText text={bk.description} /></DescriptionFold></div>
                        </div>
                      ) : (
                        <div {...regionProps("productDescription")} className={`fm-pdp-desc-text${ruledCls} text-white/50 text-[14px] leading-[1.8] whitespace-pre-line`}><DescriptionFold design={settings?.design} look={storefrontDesign} text={bk.description}><DescriptionText text={bk.description} /></DescriptionFold></div>
                      )
                    )}
                    {hasSpecs && <div {...regionProps("productSpecs")}>{renderSpecs()}</div>}
        </Fragment>;
      }
      default: return renderCustomBlock(block);
    }
  };

  return (
    <div
      data-fm-store data-studio-target="style:productPage|copy:Product page|style:labels" data-studio-label="Product page"
      data-seo-reviews={reviewsReady && shippingProfiles !== undefined ? "ready" : undefined}
      className="min-h-screen selection:bg-white/20"
      style={{
        fontFamily: font,
        backgroundColor: storefrontBg,
        color: storefrontText,
      }}
    >
      {pageFontNames.map((n) => <link key={n} rel="stylesheet" href={googleFontHref(n)} />)}
      <style>{css}</style>
      <StorefrontOverrides design={tokenSource} />

      {/* ── ambient glow that follows the book cover ── */}
      {showAmbientGlow !== false && (
        <div
          className="fixed inset-0 pointer-events-none z-0 transition-all duration-1000"
          style={{
            background: `radial-gradient(ellipse 70% 55% at 65% 35%, ${productImageGlowColor} 0%, transparent 70%)`,
            opacity: glowOpacity,
          }}
        />
      )}

      {/* ── the same header + footer as the rest of the shop ── */}
      <StoreHeader design={settings?.design} pages={pages} books={books} />

      {/* ── hero layout ── */}
      <main className="relative z-10">
        <div className="mx-auto px-6 pt-2 pb-12 lg:pb-20" style={{ maxWidth: pageMaxWidth }}>
          {/* ── back link (Studio › Style › Product page · "Show Back link") ── */}
          {pdpShowBackLink && (
            <button
              type="button"
              // Arriving straight from a link (search, email, social) has no shop page to go back to.
              onClick={() => (location.key === "default" ? navigate("/") : navigate(-1))}
              aria-label={getCopy(settings?.design, "backToCatalog")}
              data-studio-target="style:productCard|copy:Product page" data-studio-label="Back link"
              className="fm-pdp-meta mt-4 mb-2 inline-flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity"
            >
              {pdpShowBackArrow && <ArrowLeft size={13} aria-hidden="true" />}
              {getCopy(settings?.design, "backToCatalog")}
            </button>
          )}
          {/* ── breadcrumb ── */}
          {pdpShowBreadcrumb && (
            <nav
              aria-label={getCopy(settings?.design, "pdpBreadcrumbAria")}
              data-studio-target="style:productCard|copy:Product page" data-studio-label="Breadcrumb"
              className="fm-pdp-crumb fm-pdp-meta"
            >
              <Link to="/">{getCopy(settings?.design, "pdpCrumbShop")}</Link>
              {categoryLabel && (
                <>
                  {crumbSeparator && <span aria-hidden="true">{crumbSeparator}</span>}
                  <Link to={`/collections/${slugify(categoryLabel)}`}>{categoryLabel}</Link>
                </>
              )}
              {crumbSeparator && <span aria-hidden="true">{crumbSeparator}</span>}
              <span aria-current="page" className="min-w-0 truncate">{book.title}</span>
            </nav>
          )}

          <div className={`mt-8 lg:mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-10 xl:gap-14 items-start ${
            productContentPosition === "left" ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""
          }`}>

            {/* ── PHOTO COLUMN ── */}
            <div
              data-section="products"
              data-studio-target="style:productCard" data-studio-label="Product photos"
              onPointerEnter={warmGallery} onTouchStart={warmGallery} onFocus={warmGallery}
              className="w-full min-w-0 mx-auto lg:mx-0 lg:justify-self-end"
              style={{ maxWidth: productImageMaxWidth + (showThumbRail && pdpThumbPosition === "side" ? thumbRailWidth : 0) }}
            >
              {productImageLayout === "slider" ? (
                <div className="fm-pdp-media" data-thumbs={showThumbRail ? pdpThumbPosition : "none"}>
                  {/* Thumbnail rail */}
                  {showThumbRail && (
                    <ThumbStrip
                      count={photos.length}
                      position={pdpThumbPosition}
                      fill={tokenSource.pdpThumbFill !== false}
                      wrap={tokenSource.pdpThumbWrap === true && !(thumbsPhoneRow && onPhone)}
                      size={Math.min(160, Math.max(40, Number(tokenSource.pdpThumbSize) || 64))}
                      gap={thumbGap}
                      perRow={Math.min(12, Math.max(0, Number(tokenSource.pdpThumbPerRow) || 0))}
                      ratio={aspectNumber(thumbAspect) || 0.75}
                      lastRow={tokenSource.pdpThumbLastRow}
                      ariaLabel={getCopy(settings?.design, "pdpPhotosAria")}
                    >
                      {photos.map((photo: any, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => pickPhoto(i)}
                          aria-current={shownIndex === i}
                          aria-label={getCopy(settings?.design, isVideoItem(photo) ? "ariaGoToVideo" : "ariaGoToPhoto", { n: i + 1 })}
                          className="fm-pdp-thumb relative"
                          style={{ aspectRatio: thumbAspect }}
                        >
                          <img loading="lazy" fetchPriority="low" src={photo.url} {...photoSrcSet(photo, THUMB_PHOTO_SIZES)} alt={mediaName(photo, i)} decoding="async" className="w-full h-full" style={{ objectFit: productImageFit, ...framingStyle(photo) }} onLoad={(e) => notePhotoSize(photo.url, e.currentTarget)} />
                          <PhotoToneDefs photo={photo} />
                          {isVideoItem(photo) && <span className="fm-video-mark absolute inset-0 m-auto w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center pointer-events-none" aria-hidden="true"><Play size={12} fill="currentColor" /></span>}
                        </button>
                      ))}
                    </ThumbStrip>
                  )}

                  <figure className="m-0 min-w-0">
                    {/* Main image */}
                    <div
                      className={`relative overflow-hidden fm-surface fm-pdp-frame fm-photo-frame-pdp transition-all duration-300 ${
                        productImageShadow === "none" ? "shadow-none" :
                        productImageShadow === "sm" ? "shadow-sm" :
                        productImageShadow === "md" ? "shadow-md" :
                        productImageShadow === "xl" ? "shadow-[0_50px_150px_rgba(0,0,0,0.85)]" : "shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
                      }`}
                      style={{ borderRadius: `${productBorderRadius}px`, aspectRatio: frameFor(activeUrl) }}
                    >
                      {/* Still placeholder while the first photo loads (no pulsing: it flashed over the photo). */}
                      {!imageLoaded && (
                        <div className="absolute inset-0 fm-surface-2 pointer-events-none" aria-hidden="true" />
                      )}

                      {/* Instagram-style strip: swipe (phones, trackpads) or drag (mouse) and it snaps to the
                          next photo; arrows, thumbnails and dots glide it there. */}
                      <PhotoCarousel
                        count={photos.length}
                        index={carouselIndex}
                        onIndex={(i) => pickPhoto(i)}
                        onSwipe={gaPhotoSwipe}
                        className="absolute inset-0"
                        label={getCopy(settings?.design, "pdpPhotosAria")}
                        renderSlide={(i) => {
                          const photo = photos[i];
                          const url = photo?.url || placeholderImage(settings?.design);
                          if (isVideoItem(photo)) return (
                            // A video: still frame first, the file downloads only when the shopper presses play.
                            <video
                              src={photo.videoUrl}
                              poster={photo.url}
                              controls
                              muted
                              playsInline
                              preload={i === carouselIndex ? "metadata" : "none"}
                              aria-label={mediaName(photo, i)}
                              data-fm-video
                              className={`w-full h-full bg-black ${productImageFitClass}`}
                              ref={(el) => { muteVideo(el); if (el && i === carouselIndex) setImageLoaded(true); }}
                            />
                          );
                          const framed = motionFraming(photo, productImageHoverScale);
                          return (
                            <PhotoMagnifier on={pdpMagnifier} level={pdpMagnifierLevel}>
                            <PhotoToneDefs photo={photo} />
                            <m.img
                              // `loading` before `src`: React sets attributes in this order, and Chrome loads a new
                              // <img> at once when its src is already in the memory cache, which a lazy photo of the
                              // prerendered page puts there unloaded. Set after src, every gallery photo downloaded
                              // when the app took over (lazyFirst.test.ts).
                              // The photo shown and its neighbours load now, so a swipe never reveals an empty frame;
                              // only the shown one goes first, the rest wait their turn behind it.
                              loading={Math.abs(i - carouselIndex) <= 1 ? "eager" : "lazy"}
                              {...{ fetchpriority: i === carouselIndex ? "high" : "low" }}
                              src={url}
                              {...photoSrcSet(photo, photoSizes(photo))}
                              alt={mediaName(photo, i)}
                              className={`w-full h-full select-none ${productImageFitClass}`}
                              decoding="async"
                              draggable={false}
                              // Books › edit › Images › Crop & edit: placement and quick edits as style, the zoom and
                              // flip as motion values (motion owns `transform`), so the hover zoom grows from the cropped size;
                              // a straightened photo's turn goes in front through transformTemplate.
                              style={framed.style}
                              transformTemplate={framed.transformTemplate}
                              whileHover={framed.hover}
                              transition={{ duration: 0.45 }}
                              // A photo already in the browser cache (or loaded before the page woke up) never
                              // fires onLoad, which left the placeholder over it; check `complete` too.
                              ref={(el: HTMLImageElement | null) => { if (el?.complete && el.naturalWidth) { if (i === carouselIndex) setImageLoaded(true); notePhotoSize(url, el); } }}
                              onLoad={(e: any) => { if (i === carouselIndex) setImageLoaded(true); notePhotoSize(url, e.currentTarget); }}
                              onError={() => { if (i === carouselIndex) setImageLoaded(true); }}
                            />
                            </PhotoMagnifier>
                          );
                        }}
                      />
                      {/* An edition's own photo that isn't one of the book's photos sits on top of the strip. */}
                      {editionPhotoShown && shownIndex < 0 && (
                        <img
                          src={activeUrl}
                          alt={getCopy(settings?.design, "bookPhotoAlt", { title: book.title, n: 1 })}
                          className={`absolute inset-0 w-full h-full ${productImageFitClass}`}
                          decoding="async"
                          ref={(el) => { if (el?.complete) { setImageLoaded(true); notePhotoSize(activeUrl, el); } }}
                          onLoad={(e) => { setImageLoaded(true); notePhotoSize(activeUrl, e.currentTarget); }}
                          onError={() => setImageLoaded(true)}
                        />
                      )}

                      {/* Enlarge: Studio › Style › Product page · buy card & details › Click photo to enlarge */}
                      {storefrontDesign.showPhotoLightbox !== false && activeUrl && (
                        <button
                          type="button"
                          onClick={() => { setLightboxOpen(true); ga4PdpInteract("photo_enlarge"); }}
                          aria-label={getCopy(settings?.design, "ariaEnlargePhoto")}
                          aria-haspopup="dialog"
                          data-fm-enlarge
                          className="fm-lightbox-btn absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 text-white hover:bg-black/80 hover:border-white/20 transition-all"
                        >
                          <Maximize2 size={15} />
                        </button>
                      )}

                      {/* Sold out: Studio › Style › Product cards & grid › Sold-out badge (not over a video's controls) */}
                      {isOutOfStock && !shownVideo && (
                        <>
                          <SoldOutVeil design={settings?.design} />
                          <SoldOutBadge design={settings?.design} label={getCopy(settings?.design, "soldOutLabel")} scale={1.5} />
                        </>
                      )}

                      {/* Sale badge */}
                      {isOnSale && !isOutOfStock && storefrontDesign.showSaleBadge !== false && (
                        <div className="absolute top-5 left-5">
                          <span
                            className="text-[9px] font-black tracking-[0.3em] uppercase px-4 py-2 rounded-full"
                            style={{
                              backgroundColor: badgeBgPrimary,
                              color: badgeTextPrimary,
                            }}
                          >
                            {(() => { const pct = storefrontDesign.showSalePercent ? salePercentOff(book) : 0; const label = getCopy(settings?.design, "saleBadgeLabel"); return pct ? getCopy(settings?.design, "saleBadgePercent", { label, percent: pct }) : label; })()}
                          </span>
                        </div>
                      )}

                      {/* Low stock */}
                      {!shownVideo && stockLevel > 0 && stockLevel !== 999 && stockLevel <= designNumber(settings?.design, "lowStockCardThreshold", 5) && (
                        <div className="absolute bottom-5 left-5 right-5">
                          <div
                            className="bg-black/70 backdrop-blur-md border rounded-2xl px-4 py-3 flex items-center gap-2"
                            style={{ borderColor: `${lowInventoryColor}40` }}
                          >
                            <Zap size={12} className="shrink-0" style={{ color: lowInventoryColor }} />
                            <span className="text-[9px] font-black tracking-widest uppercase" style={{ color: lowInventoryColor }}>
                              {getCopy(settings?.design, "onlyLeft", { count: stockLevel })}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Arrow nav */}
                      {photos.length > 1 && (
                        <>
                          <button
                            onClick={() => pickPhoto(p => Math.max(0, p - 1))}
                            disabled={!editionPhotoShown && activePhoto === 0}
                            aria-label={getCopy(settings?.design, "ariaPrevPhoto")}
                            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 hover:bg-black/80 hover:border-white/20 transition-all disabled:opacity-20"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            onClick={() => pickPhoto(p => Math.min(photos.length - 1, p + 1))}
                            disabled={!editionPhotoShown && activePhoto === photos.length - 1}
                            aria-label={getCopy(settings?.design, "ariaNextPhoto")}
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 hover:bg-black/80 hover:border-white/20 transition-all disabled:opacity-20"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </>
                      )}

                    </div>

                    {/* Dots under the photo, like a social media carousel. Studio › Style › Product page · buy card
                        & details › Photo frame & thumbnails › Dots under the photo. */}
                    {showPhotoDots && (
                      <div className="fm-pdp-dots flex justify-center items-center gap-1.5 pt-3" role="group" aria-label={getCopy(settings?.design, "pdpPhotosAria")}>
                        {photos.map((_: any, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => pickPhoto(i)}
                            aria-label={getCopy(settings?.design, isVideoItem(photos[i]) ? "ariaGoToVideo" : "ariaGoToPhoto", { n: i + 1 })}
                            aria-current={shownIndex === i}
                            className={`rounded-full transition-all duration-300 ${shownIndex === i ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/30"}`}
                          />
                        ))}
                      </div>
                    )}

                    {lightboxOpen && (
                      <PhotoLightbox
                        photos={photos.map((ph: any, i: number) => ({
                          url: ph.url,
                          srcSet: photoSrcSet(ph, "100vw").srcSet,
                          alt: mediaName(ph, i),
                          style: adjustStyle(ph),
                          source: ph,
                          ...(isVideoItem(ph) ? { videoUrl: ph.videoUrl } : {}),
                        }))}
                        start={Math.max(0, shownIndex)}
                        onIndex={(i) => pickPhoto(i)}
                        onSwipe={gaPhotoSwipe}
                        onClose={() => setLightboxOpen(false)}
                        showCount={storefrontDesign.pdpViewerShowCount !== false}
                        labels={{
                          close: getCopy(settings?.design, "ariaClosePhoto"),
                          prev: getCopy(settings?.design, "ariaPrevPhoto"),
                          next: getCopy(settings?.design, "ariaNextPhoto"),
                          dialog: getCopy(settings?.design, "ariaPhotoViewer"),
                          count: getCopy(settings?.design, "pdpCaptionCount"),
                        }}
                      />
                    )}

                    {pdpShowCaption && shownIndex >= 0 && (
                      <figcaption className="fm-pdp-caption fm-pdp-meta">
                        <span>{getCopy(settings?.design, "pdpCaption", { n: shownIndex + 1 })}</span>
                        {photos.length > 1 && <span>{getCopy(settings?.design, "pdpCaptionCount", { n: shownIndex + 1, total: photos.length })}</span>}
                      </figcaption>
                    )}
                  </figure>
                </div>
              ) : (
                <div className={productImageLayout === "grid" ? "grid grid-cols-2 gap-4" : "space-y-4"}>
                  {photos.map((photo: any, i: number) => (
                    <div key={i} className={`${productImageLayout === "grid" && i === 0 ? "col-span-2" : ""} relative fm-surface fm-pdp-frame fm-photo-frame-pdp overflow-hidden`} style={{ aspectRatio: frameFor(photo.url), borderRadius: `${productBorderRadius}px` }}>
                      {isVideoItem(photo)
                        ? <video src={photo.videoUrl} poster={photo.url} controls muted ref={muteVideo} playsInline preload="none" aria-label={mediaName(photo, i)} data-fm-video className={`w-full h-full bg-black ${productImageFitClass}`} />
                        : <img loading={i === 0 ? "eager" : "lazy"} {...(i === 0 ? { fetchpriority: "high" } : {})} onLoad={(e) => notePhotoSize(photo.url, e.currentTarget)} src={photo.url} {...photoSrcSet(photo, photoSizes(photo))} alt={mediaName(photo, i)} decoding="async" className={`w-full h-full ${productImageFitClass}`} style={framingStyle(photo)} />}
                      <PhotoToneDefs photo={photo} />
                      {i === 0 && isOutOfStock && (
                        <>
                          <SoldOutVeil design={settings?.design} />
                          <SoldOutBadge design={settings?.design} label={getCopy(settings?.design, "soldOutLabel")} scale={1.5} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── INFO COLUMN ── */}
            <div data-section="products" className="flex flex-col gap-8 lg:sticky lg:top-[calc(var(--fm-header-offset,0px)+1.5rem)] w-full min-w-0">
              <div className="fm-pdp-card" data-studio-target="style:productCard|copy:Product page" data-studio-label="Buy card">

                {(pdpRuledRows ? ruledSections(cardSections(buyBlocks)) : cardSections(buyBlocks)).map((section, index) => {
                  // A section shows only when something in it does (the description section used to be conditional).
                  const parts = section.map(renderBlock).filter(part => part !== null && part !== false && part !== undefined);
                  return parts.length ? <div key={index} className={`fm-pdp-card-section ${alignCls}`}>{parts}</div> : null;
                })}
              </div>

              {!pdpDetailsBelow && detailsBlock}

              {/* Frequently Bought Together Widget */}
              {showBundleWidget !== false && bundleBook && (
                <div className="mt-8 pt-8 border-t border-white/5 space-y-6">
                  <h4 className="text-[10px] font-black tracking-[0.3em] uppercase text-white/40">{getCopy(settings?.design, "bundleHeading")}</h4>
                  <div className={`flex flex-col sm:flex-row items-center gap-6 rounded-3xl p-6 relative overflow-hidden group/bundle transition-all duration-300 ${
                    productBundleLayout === "glassmorphic"
                      ? "bg-white/[0.01] backdrop-blur-xl border border-white/10 fm-accent-hover-border"
                      : productBundleLayout === "card"
                      ? "fm-surface-2 shadow-2xl border-none"
                      : "bg-white/[0.02] border border-white/5 fm-accent-hover-border"
                  }`}>
                    {/* Cover Art Previews */}
                    <div className="flex items-center gap-4">
                      <div className="w-16 fm-surface rounded-xl border border-white/10 shadow-lg shrink-0 overflow-hidden" style={{ aspectRatio: productImageAspect }}>
                        <img src={smallPhotoUrl(photos[0]) || placeholderImage(settings?.design)} alt={book.title} className="w-full h-full" style={{ objectFit: productImageFit }} />
                      </div>
                      <span className="text-white/20 font-black text-lg">+</span>
                      <div className="w-16 fm-surface rounded-xl border border-white/10 shadow-lg shrink-0 overflow-hidden" style={{ aspectRatio: productImageAspect }}>
                        <img loading="lazy" decoding="async" src={smallPhotoUrl(bundleBook.photos?.[0]) || placeholderImage(settings?.design)} alt={bundleBook.title} className="w-full h-full" style={{ objectFit: productImageFit }} />
                      </div>
                    </div>

                    {/* Bundle Info & CTA */}
                    <div className="flex-1 flex flex-col gap-4 text-center sm:text-left">
                      <div>
                        <p className="text-[11px] font-bold text-white uppercase leading-tight truncate max-w-[200px]">{book.title} + {bundleBook.title}</p>
                        <p className="text-[10px] text-white/40 mt-1.5 font-mono">
                          {getCopy(settings?.design, "bundleTotal")} <span className="text-white font-black">{formatPrice((Number(isOnSale ? salePrice : retailPrice) || 0) + (catalogUnitPrice(bundleBook, quickAddChoice(bundleBook).variant) || 0))}</span>
                        </p>
                      </div>
                      <button
                        onClick={handleAddBothToBag}
                        disabled={addingBoth || isOutOfStock}
                        className={`w-full sm:w-fit text-[9px] font-black tracking-[0.2em] px-6 py-3.5 transition-all active:scale-95 custom-btn ${
                          buttonShadow ? "fm-accent-shadow" : ""
                        } ${buttonUppercase ? "uppercase" : ""}`}
                        style={{
                          "--btn-bg": buttonStyle === "solid" ? buttonBg : "transparent",
                          "--btn-text": buttonStyle === "solid" ? buttonText : buttonBg,
                          "--btn-border": buttonStyle !== "solid" ? `1px solid ${buttonBg}` : "none",
                          borderRadius: buttonRadius,
                        } as React.CSSProperties}
                      >
                        {getCopy(settings?.design, addingBoth ? "bundleAdding" : "bundleAdd")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {pdpDetailsBelow && detailsBlock && <div className="mt-12 lg:mt-16">{detailsBlock}</div>}
        </div>

        {/* ── Related books ── */}
        {showRelatedProducts && otherBooks.length > 0 && (
          <section data-section="products" {...regionProps("relatedBooks")} data-ga-list="Related books" className="relative z-10 mt-16 border-t border-white/[0.06]">
            <div className="mx-auto px-6 py-20" style={{ maxWidth: pageMaxWidth }}>
              <div {...regionProps("relatedHeading")} className="flex items-center gap-6 mb-12">
                <h2 className="text-[10px] font-black tracking-[0.5em] text-white/30 uppercase">
                  {related.artist ? getCopy(settings?.design, "relatedArtistHeading", { artist: related.artist }) : getCopy(settings?.design, "relatedHeading")}
                </h2>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>
              <div {...regionProps("relatedGrid")} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 lg:gap-8">
                {otherBooks.map((rel, i) => {
                  // Link by id when there is no slug (the product page resolves ids too).
                  const relSlug  = (rel as any).slug || rel.id;
                  const relChoice = quickAddChoice(rel);
                  const relStock = relChoice.inStock ? 999 : 0;
                  const relPrice = getBookPrice(rel);
                  return (
                    <m.article
                      key={rel.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className="fm-card group min-w-0"
                    >
                      <Link to={`/books/${relSlug}`}>
                        <div {...regionProps("relatedPhoto")} className="relative fm-surface rounded-[1.5rem] overflow-hidden mb-4 border border-white/[0.05] group-hover:border-white/[0.12] transition-all shadow-xl" style={{ aspectRatio: productImageAspect }}>
                          <img
                            loading="lazy"
                            src={(rel as any).photos?.[0]?.url || placeholderImage(settings?.design)}
                            {...photoSrcSet((rel as any).photos?.[0], gridPhotoSizes([{ from: 0, cols: 2 }, { from: 640, cols: 3 }, { from: 768, cols: 4 }], { photo: (rel as any).photos?.[0], frame: productImageAspect, cover: productImageFit === "cover" }))}
                            alt={rel.title}
                            className="w-full h-full transition-transform duration-700 group-hover:scale-105"
                            style={{ objectFit: productImageFit, ...framingStyle((rel as any).photos?.[0]) }}
                          />
                          <PhotoToneDefs photo={(rel as any).photos?.[0]} />
                          {/* Sold out: same mark as the shop grid (Studio › Style › Product cards & grid › Sold-out badge) */}
                          {relChoice.comingSoon && showSoldOutBadge && (
                            <SoldOutBadge design={settings?.design} label={getCopy(settings?.design, "comingSoonBadge")} />
                          )}
                          {relStock === 0 && !relChoice.comingSoon && showSoldOutBadge && (
                            <>
                              <SoldOutVeil design={settings?.design} />
                              <SoldOutBadge design={settings?.design} label={getCopy(settings?.design, "soldOutLabel")} />
                            </>
                          )}
                          {/* hover shine */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        </div>
                        <p className="fm-card-title text-[10px] font-black tracking-wider text-white/50 group-hover:text-white transition-colors uppercase leading-tight mb-1" data-studio-target="style:products" data-studio-label="Card title & price">
                          {rel.title}
                        </p>
                        {relPrice > 0 && (
                          <p className="fm-card-price-wrap fm-card-price text-[11px] font-medium text-white/25 group-hover:text-white/50 transition-colors" data-studio-target="style:products" data-studio-label="Card title & price">
                            {formatBookPrice(rel)}
                          </p>
                        )}
                      </Link>
                    </m.article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Reviews ── */}
        {productDetailsLayout === "sections" && book && regionVisible(tokenSource, "productReviews") && (
          <div {...regionProps("productReviews")}><ReviewsSection key={book.id} bookId={book.id} /></div>
        )}

        {/* ── Sticky add-to-bag bar ── */}
        {stickyBar && book && !isOutOfStock && !isComingSoon && buyGone && (
          <div
            className={`fm-pdp-sticky${stickyPhoneOnly ? " fm-pdp-sticky-phone" : ""}`}
            role="region"
            aria-label={book.title}
            data-studio-target="style:productCard|copy:Product page"
            data-studio-label="Sticky add-to-bag bar"
          >
            <div className="fm-pdp-sticky-text">
              <span className="fm-pdp-sticky-title">{book.title}</span>
              {retailPrice > 0 || !selectedVariant ? (
                <span className="fm-pdp-sticky-price">
                  {isOnSale ? formatPrice(Number(salePrice)) : selectedVariant ? formatPrice(selectedVariant.price) : formatBookPrice(book)}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="fm-pdp-sticky-btn custom-btn"
              style={{
                "--btn-bg": buyButton.bg,
                "--btn-text": buyButton.text,
                "--btn-border": "none",
                "--btn-shadow": "none",
                borderRadius: buttonRadius,
              } as React.CSSProperties}
              onClick={() => {
                // Choices the bar can't show (edition, add-ons, gift-card form): take the shopper back to the real button.
                const needsChoices = (book.variants?.length && !selectedVariant) || isGiftCard || addOns.length > 0;
                if (needsChoices) { buyEl?.scrollIntoView({ behavior: "smooth", block: "center" }); handleAddToCart(); return; }
                handleAddToCart();
              }}
            >
              {added
                ? <><Check size={14} strokeWidth={3} /> {getCopy(settings?.design, "bookAdded")}</>
                : <><ShoppingBag size={14} /> {isPreorder ? getCopy(settings?.design, "preorderButton") : (storefrontDesign.addToBagLabel || settings?.design?.addToBagLabel || getCopy(settings?.design, "addToBagLabel"))}</>}
            </button>
          </div>
        )}

        {/* ── Recently viewed ── */}
        <RecentlyViewedRow excludeId={book?.id} />

        <SectionPageContext.Provider value={sectionPage}>
          <TemplateSections design={settings?.design} templateId={productSurface} books={books} />

          <GlobalSections design={settings?.design} books={books} />
        </SectionPageContext.Provider>

      </main>
      <StoreFooter settings={settings} pages={pages} />
    </div>
  );
}
