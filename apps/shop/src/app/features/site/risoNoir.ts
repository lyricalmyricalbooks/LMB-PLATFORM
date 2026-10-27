// ─────────────────────────────────────────────────────────────────────────────
// "Lyricalmyrical Riso Noir" — the Riso Press storefront on black with white text.
//
// One token record shared by (a) the THEME_LIBRARY preset, (b) the default design a
// fresh site starts from, and (c) the fallback applied to older saved designs that
// never chose a `themeStyle`. Every value is an ordinary `design` key, so all of it
// stays editable in the theme editor (Colors, Typography, Navigation, Products…).
// ─────────────────────────────────────────────────────────────────────────────
import { applyThemeKeysToSurfaces } from "../../admin/themeScope";

export const RISO_NOIR_ID = "lyricalmyrical-riso-noir";

const FLARE = "#e8402a";
const INK = "#100f0d";

export const RISO_NOIR_TOKENS: Record<string, any> = {
  themeStyle: "riso",
  // Palette: black, white, one flare ink (+ press blue as the second ink).
  backgroundColor: "#000000", textColor: "#ffffff", primaryColor: FLARE,
  secondaryColor: "#3d5bff", surfaceColor: "#0d0d0d", surfaceRaisedColor: "#161616",
  successColor: "#3ddc97", dangerColor: "#ff5a4a", warningColor: "#ffc93c",
  favoriteColor: FLARE, mutedTextColor: "rgba(255,255,255,0.64)", borderColor: "rgba(255,255,255,0.22)",
  linkColorHover: "#ff6b55", overlayColor: "#000000",
  activeControlBg: "#ffffff", activeControlText: "#000000",
  // Riso print treatment (all editable under Colors › Riso print treatment).
  risoOutlineColor: "#ffffff", risoOutlineWidth: 2, risoShadowColor: "rgba(232,64,42,0.9)",
  risoShadowOffset: 3, risoCardRadius: 0, risoUppercaseHeadings: true, risoGrain: 0,
  focusRingColor: FLARE,
  // Type: Anton display, Archivo body.
  headingFont: "Anton", bodyFont: "Archivo", font: "Archivo",
  headingWeight: 400, bodyWeight: 400, letterSpacing: "normal", lineHeight: 1.6,
  // Buttons: flare fill, ink text, square, uppercase.
  buttonColor: FLARE, buttonTextColor: INK, buttonHoverBgColor: "#ff6b55", buttonHoverTextColor: INK,
  buttonStyle: "solid", buttonRadius: 0, buttonUppercase: true, buttonShadow: false,
  badgeBgPrimary: FLARE, badgeTextPrimary: INK, badgeBgSecondary: "#ffffff", badgeTextSecondary: "#000000",
  lowInventoryColor: "#ffc93c",
  // Chrome.
  headerBg: "#000000", headerColor: "#ffffff", footerBg: "#000000", footerLayout: "4col",
  showAnnouncement: true, announcementBg: FLARE, announcementColor: INK, announcementScrolling: true,
  announcementFontSize: 11, announcementWeight: 900, announcementTracking: 0.18, announcementSpeed: 28,
  checkoutAccentColor: FLARE, checkoutBgColor: "#000000", checkoutInputRadius: 0,
  cartDrawerBg: "#000000", cartDrawerText: "#ffffff", cartDrawerMuted: "rgba(255,255,255,0.64)",
  cartDrawerSurface: "#0d0d0d", cartDrawerBorder: "#ffffff", pageChromeStyle: "theme",
  navStyle: "default", wordmarkStyle: "two-part",
  wordmarkPrimary: "Lyricalmyrical", wordmarkSecondary: "Books", wordmarkSecondaryMuted: false,
  wordmarkSize: 1.8, wordmarkWeight: 400, logoColor: "#ffffff",
  // Catalog.
  // Clean grid by default: no heading, category chips, search/sort bar or result count (all switchable on).
  showCategoryChips: false, categoryChipShowCounts: true, catalogHeading: "",
  showCatalogControls: false, showCatalogCount: false,
  productBorderRadius: 0, cardRadius: 0, showQtyStepper: true,
  productDescriptionStyle: "designed",
  // Product page: the "catalogue card" layout (Style › Product page · buy card & details).
  productDetailsLayout: "tabs", productImageShadow: "none",
  pdpShowBackLink: true, pdpShowBackArrow: true, pdpShowBreadcrumb: true, pdpShowTag: true, pdpTagStyle: "filled",
  pdpShowStock: true, pdpShowCaption: true, pdpThumbPosition: "side", pdpDetailsPlacement: "below",
  // Custom pages: Option D "Ruled" (Style › Custom pages).
  pageShowEyebrow: false, pageWidth: "header", pageTitleSize: "xl", pageShowRule: true,
  pageRuleWidth: 2, pageRuleSpacing: 32, pageTextMeasure: "readable",
  pdpSpecsStyle: "record", pdpCardShadowOffset: 8, pdpCardPadding: 24, pdpMetaSize: 11,
  // Optional storefront elements (all on).
  showRecentlyViewed: true, showRelatedProducts: true, showCookieBanner: true, showUnderConstruction: false, showUnderConstructionAdmin: true,
  // Footer extras off by default: payment-badge row and the "Powered by" line.
  showPaymentBadges: false, showPoweredBy: false,
};

/** Surfaces that resolve their own design object before falling back to the root. */
export const RISO_SURFACE_IDS = [
  "heroPage", "storefront", "productPage", "collectionPage", "cartPage", "page", "page404",
];

/**
 * Older saved designs never chose a `themeStyle` (they were violet/black "punk" or a
 * custom look). Give them the Noir treatment so the public site is redesigned without
 * touching sections, menus, copy or any other content. Designs that already declare a
 * `themeStyle` — including an explicit "default" — are left exactly as saved.
 */
export function withRisoNoirDefault<T extends Record<string, any> | null | undefined>(design: T): T {
  if (!design || typeof design !== "object") return design;
  if (design.themeStyle !== undefined && design.themeStyle !== null && design.themeStyle !== "") return design;
  // A merchant who applied any library preset made a deliberate choice — never override it.
  if (design.themeLibraryPreset) return design;
  const existingSurfaces = RISO_SURFACE_IDS.filter((id) => design[id] && typeof design[id] === "object");
  return applyThemeKeysToSurfaces(design, RISO_NOIR_TOKENS, existingSurfaces) as T;
}
