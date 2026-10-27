// How Studio presents its (very many) controls to a shop owner — a pure, UI-free map.
//
// Nothing here adds or removes a control: it only decides WHERE each existing Theme setting and
// Text & labels group appears (task-based headings, sub-sections inside big groups) and which values
// differ from the defaults ("changed" badges, "What I've changed", Reset to default). Every
// STYLE_GROUPS / COPY_SCHEMA group must sit under exactly one heading (settingsMap.test.ts), and any
// field not listed in a sub-section still shows under "More settings", so editing power is unchanged.

import { REGION_GROUPS } from "../../features/site/storefrontRegions";
import type { StudioOverlay } from "../../features/site/studioOverlay";
import { readStyle, type StyleField, type StyleGroup } from "./styleSchema";
import { withFeatureSubsections } from "../../features/site/extras/featureKit";
import { STOREFRONT_FEATURES } from "../../features/site/extras/registry";

/** Studio-only categories that are not STYLE_GROUPS (they have bespoke panels in StudioEditor). */
export const EXTRA_STYLE_CATEGORIES: Record<string, { title: string; blurb: string }> = {
  themeLook: { title: "Theme presets & saved themes", blurb: "One-click looks, the Riso Noir style, and designs you've saved or downloaded." },
  paymentIcons: { title: "Payment icons", blurb: "Which card and wallet logos the footer shows." },
};

export type SettingsHeading = {
  id: string; title: string; blurb: string; groups: string[]; advanced?: boolean;
  /** Starts a band of headings ("Site-wide design", "Parts of your shop"). */
  band?: string;
};

const REGION_IDS = REGION_GROUPS.map((g) => g.id);

/**
 * Theme settings home, in the order a shopper meets the shop: the top of every page, the shop and
 * book pages, the bag and checkout, custom pages, the bottom of every page, pop-ups — then the
 * whole-site look (colours, fonts, buttons: one change restyles everything) and the advanced tools.
 * Each part is also editable by clicking it in the preview.
 */
export const THEME_HEADINGS: SettingsHeading[] = [
  { id: "top", band: "Parts of your shop, top to bottom", title: "Top of every page",
    blurb: "What shoppers see first: the announcement bar, logo and menu. Tip: click one in the preview to edit it there.",
    groups: ["header", "logo", "navlinks"] },
  { id: "shop", title: "Shop & book pages", blurb: "The grid of books, each book card, and each book's own page.",
    groups: ["products", "catalog", "catalogLayout", "labels", "productPage", "productCard"] },
  { id: "buy", title: "Bag, checkout & accounts", blurb: "Everything after a shopper presses Add to bag.",
    groups: ["cartDrawer", "checkout", "accounts"] },
  { id: "pages", title: "Custom pages & features", blurb: "Pages like About or Journal, and switching whole features on or off.",
    groups: ["customPages", "elements"] },
  { id: "bottom", title: "Bottom of every page", blurb: "The footer: links, social icons and small print.",
    groups: ["footer", "paymentIcons"] },
  { id: "popups", title: "Pop-ups & notices", blurb: "Windows and little messages that appear on top of the page.",
    groups: ["popup", "toasts"] },
  { id: "system", band: "Whole-site look", title: "", blurb: "Presets, colours, fonts, buttons and spacing used on every page. One change restyles the whole shop.",
    groups: ["themeLook", "colors", "schemes", "type", "buttons", "layout", "effects", "riso", "tokens", "smallPrint"] },
  { id: "elements", band: "Advanced", title: "Fine-tune one element at a time", advanced: true,
    blurb: "Spacing, size, borders and visibility for a single element, per screen size. Quicker: click the element in the preview.",
    groups: REGION_IDS },
  { id: "code", title: "Custom code", advanced: true, blurb: "Your own CSS or scripts (public pages only).", groups: ["code"] },
];

/**
 * The little shop drawing at the top of Theme settings: each block names a heading above and jumps
 * to it. `shape` only decides how the block is drawn. Pure data so the test can check every
 * block points at a real heading.
 */
export type ShopMapBlock = { heading: string; label: string; note: string; shape: "bar" | "body" | "foot" | "float" | "look" };
export const SHOP_MAP: ShopMapBlock[] = [
  { heading: "top", label: "Top of every page", note: "Announcement bar · logo · menu", shape: "bar" },
  { heading: "shop", label: "Shop & book pages", note: "Book grid · book page", shape: "body" },
  { heading: "buy", label: "Bag & checkout", note: "Bag · checkout · accounts", shape: "body" },
  { heading: "pages", label: "Custom pages", note: "About · Journal · features", shape: "body" },
  { heading: "bottom", label: "Bottom of every page", note: "Footer links · social", shape: "foot" },
  { heading: "popups", label: "Pop-ups & notices", note: "Pop-up · “Added to bag”", shape: "float" },
  { heading: "system", label: "Whole-site look", note: "Colours · fonts · buttons", shape: "look" },
];

/**
 * Where each part-of-the-shop category can be seen, for "Show on page": the page to open (none =
 * stay on the current page) and a pop-over to open first. Studio then selects the first part on that
 * page linked to the category, in the inspector.
 */
export const CATEGORY_PAGES: Record<string, { template?: string; overlay?: StudioOverlay }> = {
  header: {}, logo: {}, navlinks: {}, footer: {}, paymentIcons: {}, popup: { overlay: "popup" },
  products: { template: "storefront" }, catalog: { template: "storefront" }, labels: { template: "productPage" },
  catalogLayout: { template: "storefront" }, productPage: { template: "productPage" }, productCard: { template: "productPage" },
  cartDrawer: { overlay: "cart" }, checkout: { template: "cartPage" }, accounts: { template: "accountPage" },
  customPages: { template: "page" },
};

/** One plain-English line under each category name (falls back to the group's own hint). */
export const GROUP_BLURBS: Record<string, string> = {
  colors: "The main colours of every page: background, text, buttons and links.",
  schemes: "Ready-made colour pairs you can give to a section, book cards, the buy box or the bag.",
  toasts: "The little message that pops up after “Added to bag” or “Removed · Undo”: where, how big, what colour.",
  popup: "The window that opens over the page (a welcome or offer): when it opens, how often, where and how wide.",
  type: "The fonts and text sizes used on every page.",
  buttons: "How buttons look everywhere: style, colours and rounded corners.",
  logo: "Your logo or shop name at the top, plus the picture shown when someone shares your shop.",
  riso: "The printed-paper grain and ink-style effects of the Riso look.",
  effects: "Animations when the page loads or scrolls, and what happens when you hover.",
  header: "The strip at the very top: its layout and colours, the announcement bar, and the search, wishlist and bag icons.",
  navlinks: "The menu links in the header: their size, colour and spacing, and the drop-down menus.",
  footer: "The bottom of every page: its layout, link groups, social icons and what it shows.",
  products: "The book cards in the shop: columns, photo shape, title, price and badges.",
  catalog: "The heading, category buttons and search bar above the book grid.",
  labels: "The small tags on books: Sale, New, Pre-order, Coming soon and Sold out.",
  productPage: "A book's own page: photo layout, the Add to bag button and extras.",
  productCard: "The bordered box with the price and Add to bag, plus the Description and Details tabs.",
  catalogLayout: "The big title at the top of the shop page, how covers are cropped, and menu spacing.",
  cartDrawer: "The bag that slides in from the side: size, colours, book rows and the checkout button.",
  checkout: "The checkout page: colours, fonts, form fields and what the order summary shows.",
  accounts: "Turn customer accounts (sign-in and order history) on or off.",
  customPages: "One look for every page you create (About, Journal…): title, text, width and the line under the title.",
  layout: "How wide your content is and the space around it.",
  tokens: "Shop-wide scales for text size, spacing, rounded corners and the keyboard focus ring.",
  smallPrint: "The tiny labels and captions across the shop, all at once.",
  elements: "Switch whole parts on or off: Recently viewed, breadcrumbs, the cookie banner and the under-construction page.",
  code: "Your own CSS or scripts (public pages only).",
};

export const blurbFor = (group: StyleGroup | undefined, id: string): string =>
  EXTRA_STYLE_CATEGORIES[id]?.blurb ?? GROUP_BLURBS[id] ?? group?.hint ?? "";

/**
 * Sub-sections inside the bigger categories, so 20–45 controls read as a few short lists.
 * Keys not listed land in a final "More settings" sub-section — nothing can disappear.
 */
export const STYLE_SUBSECTIONS: Record<string, { title: string; keys: string[] }[]> = withFeatureSubsections({
  catalog: [
    { title: "Heading", keys: ["catalogHeading", "catalogHeadingFont", "catalogHeadingSize", "catalogHeadingSizeMobile", "catalogHeadingCase", "catalogHeadingColor", "showCatalogCount"] },
    { title: "Shop filter bar", keys: ["showShopFilterBar", "shopFilterBarCounts", "shopFilterBarInStock", "shopFilterBarFont", "shopFilterBarBorderColor", "shopFilterBarActiveColor"] },
    { title: "Category chips", keys: ["showCategoryChips", "categoryChipShowCounts"] },
    { title: "Book order", keys: ["soldOutLast", "catalogStateInUrl"] },
    { title: "Show more button", keys: ["catalogPageSize", "catalogAutoLoad"] },
    { title: "Search, sort & in-stock bar", keys: ["showCatalogControls", "searchResultLimit", "searchNewInCount", "searchArtistLimit", "searchCategoryLimit", "searchTryLimit", "showSearchSeeAll", "showRecentSearches", "searchSuggestions"] },
  ],
  tokens: [
    { title: "Type scale", keys: ["typeScale", "typeScaleBase", "typeScaleFluid"] },
    { title: "Spacing", keys: ["spaceUnit", "phoneSpaceScale"] },
    { title: "Corners", keys: ["radiusScale"] },
    { title: "Focus & pressed states", keys: ["focusRingWidth", "inputFocusColor", "buttonPress"] },
  ],
  schemes: [
    { title: "Parts of the shop that follow a scheme", keys: ["elementSchemes.cards", "elementSchemes.buyCard", "elementSchemes.cartDrawer", "elementSchemes.header", "elementSchemes.footer"] },
  ],
  colors: [
    { title: "Main colours", keys: ["backgroundColor", "textColor", "primaryColor", "secondaryColor", "borderColor", "mutedTextColor"] },
    { title: "Panels, links & overlays", keys: ["surfaceColor", "surfaceRaisedColor", "overlayColor", "activeControlBg", "activeControlText", "linkColorHover"] },
    { title: "Status colours", keys: ["successColor", "warningColor", "dangerColor", "favoriteColor"] },
  ],
  type: [
    { title: "Fonts", keys: ["headingFont", "bodyFont", "navFont", "wordmarkFont", "font"] },
    { title: "Sizes & weights", keys: ["baseFontSize", "lineHeight", "headingWeight", "bodyWeight", "letterSpacing"] },
  ],
  logo: [
    { title: "Logo image", keys: ["logoUrl", "logoTint", "logoColor", "logoHoverColor", "shareImageUrl", "faviconUrl"] },
    { title: "Text wordmark", keys: ["logoText", "wordmarkStyle", "wordmarkPrimary", "wordmarkSecondary", "wordmarkSecondaryMuted", "wordmarkSecondaryColor", "wordmarkSize", "wordmarkWeight"] },
  ],
  header: [
    { title: "Header layout", keys: ["headerStyle", "logoPosition", "logoHeight", "stickyHeader", "stickyHeaderHideOnScroll", "transparentHeader", "navStyle", "showMobileNavigation", "phoneCompactHeader", "mobileNavStyle", "mobileNavTabSize", "showSecondaryNavigation", "showStoreChromeOnUtilityPages"] },
    { title: "Header colours", keys: ["headerBg", "headerColor"] },
    { title: "Announcement bar", keys: ["showAnnouncement", "announcementText", "announcementBg", "announcementColor", "announcementScrolling", "announcementFontSize", "announcementWeight", "announcementTracking", "announcementSpeed", "announcementRotateSeconds", "announcementCountdown", "announcementCountdownWithin", "announcementDismissible"] },
    { title: "Icons & buttons in the header", keys: ["hideHeaderSearch", "hideHeaderWishlist", "hideHeaderAccount", "hideCurrencySelector", "hideThemeToggle", "hideAdminLink", "hideCartButton"] },
  ],
  navlinks: [
    { title: "Link look", keys: ["navLinkColor", "navLinkActiveColor", "navLinkSize", "navLinkWeight", "navLinkSpacing", "navLinkTransform", "navLinkOpacity"] },
    { title: "Placement & fitting on one line", keys: ["navPlacement", "navGap", "navLineMode", "navFitMin"] },
    { title: "Drop-down menus", keys: ["navFlatSubcategories", "navDropdownHideAll", "navDropdownBg", "navDropdownTextColor", "navDropdownBorderColor", "navDropdownBorderWidth", "navDropdownTransform", "headerMenuPanelBg", "headerMenuPanelTextColor", "headerMenuPanelBorderColor", "headerMenuPanelRadius"] },
    { title: "Sticker pills", keys: ["navPillRadius", "navPillRotate", "navPillActivePalette"] },
  ],
  footer: [
    { title: "Footer layout", keys: ["footerNavigationLayout", "footerLinksAlign", "footerBrandAlign", "footerBrandVAlign", "footerBrandCenterMobile", "showFooterBrandDivider", "footerColumns", "footerLayout", "footerBg"] },
    { title: "Footer spacing", keys: ["footerPaddingY", "footerPaddingYMobile", "footerBarPaddingY", "footerColumnGap", "footerLinkGap"] },
    { title: "Footer text & lines", keys: ["footerTextSize", "footerTextColor", "footerHeadingColor", "footerLinkHoverColor", "showFooterDividers", "footerDividerColor"] },
    { title: "Footer accent", keys: ["showFooterAccentLine", "footerAccentLineWidth", "footerAccentColor", "footerGroupHeadingsAccent", "footerSocialBoxes", "footerSocialHoverColor"] },
    { title: "Footer logo", keys: ["footerLogo", "footerLogoUrl", "footerLogoWidth"] },
    { title: "What the footer shows", keys: ["showFooterExplore", "showFooterConnect", "showFooterLegalHeading", "showFooterLocation", "hideNewsletter", "hideRecentlyViewed", "showSocialInFooter", "showPaymentBadges", "footerPaymentIconOpacity", "footerPaymentIconHoverOpacity", "footerPaymentIconColor", "showPoweredBy", "showFooterAdminLink"] },
    { title: "Social links", keys: ["social.instagram", "social.twitter", "social.facebook", "social.tiktok"] },
  ],
  products: [
    { title: "Grid & columns", keys: ["productCardStyle", "productColumnsDesktop", "productColumnsMobile", "catalogGridGap", "productHoverEffect", "showCardHoverPhoto", "showCardCreator", "showCardRating", "showCardFormats"] },
    { title: "Book photos", keys: ["imageAspectRatio", "photoOutline", "placeholderImageUrl"] },
    { title: "Title & price", keys: ["productTitleColor", "cardTitleSize", "cardTitleSizeMobile", "cardTitlePhoneMin", "cardTitleWeight", "cardTitleFont", "cardTitleTracking", "productPriceColor", "cardPriceSize", "cardPriceSizeMobile", "cardPriceStackPhone", "cardPriceWeight", "cardPriceFont", "cardPriceTagBg", "cardPriceOldColor", "catalogPriceStyle", "catalogCardRuleWidth", "showPriceOnHover", "showQuickAdd", "showQuickView", "showCardWishlist", "showWishlistShare"] },
    { title: "Author, formats & stars under the title", keys: ["cardCreatorColor", "cardCreatorSize", "cardFormatsColor", "cardRatingStarColor"] },
    { title: "Sold-out badge", keys: ["showSoldOutBadge", "soldOutBadgeStyle", "soldOutBadgeBg", "soldOutBadgeText", "soldOutBadgeSize", "soldOutBadgePosition", "soldOutPhotoFade"] },
    { title: "Badges & stock", keys: ["badgeBgPrimary", "badgeTextPrimary", "badgeBgSecondary", "badgeTextSecondary", "lowInventoryColor", "lowStockCardThreshold", "showCollectionMeta"] },
    { title: "Card button & product-page extras", keys: ["productCTA", "showQtyStepper", "productDescriptionStyle", "productBorderRadius"] },
  ],
  productPage: [
    { title: "Page layout", keys: ["productImageLayout", "productContentPosition", "productAlignment", "productDetailsLayout"] },
    { title: "Photos", keys: ["productImageMaxWidth", "productImageAspect", "productImageFrameMode", "productImageAspectLandscape", "productPhotoOutline", "productImageFit", "productImageShadow", "productImageHoverScale", "showZoom", "showPdpMagnifier", "pdpMagnifierLevel", "showPhotoLightbox", "showProductVideos", "showAmbientGlow", "glowIntensity", "productImageGlowColor"] },
    { title: "Title & add-to-bag button", keys: ["productTitleSize", "productSubtitleWeight", "addToBagLabel", "productCtaWidth", "productCtaSize", "productCtaAnimation"] },
    { title: "Extras on the page", keys: ["showSpecs", "showPdpEditionDetails", "showPdpArtistLinks", "showSocialShare", "showPdpWishlist", "showBackInStock", "showComingSoonSignup", "pdpDescriptionFold", "pdpDescriptionFoldLines", "showPdpPickup", "showPdpArtistBio", "showPdpPolicyTab", "pdpTabOrder1", "pdpTabOrder2", "pdpTabOrder3", "pdpTabOrder4", "pdpTabOrder5", "showBundleWidget", "productBundleLayout", "showRelatedProducts", "relatedByArtist", "recentlyViewedCount", "lowStockProductThreshold"] },
  ],
  productCard: [
    { title: "Buy card box", keys: ["pdpCardBg", "pdpCardBorderColor", "pdpCardBorderWidth", "pdpCardShadowColor", "pdpCardShadowOffset", "pdpCardPadding", "pdpCardDividerColor"] },
    { title: "Title, price & stock", keys: ["pdpEditionPicker", "pdpStickyBar", "pdpStickyPhoneOnly", "pdpShowBuyNow", "pdpRuledRows", "pdpShowTag", "pdpTagStyle", "pdpTitleFont", "pdpTitleSize", "pdpTitleSizeMobile", "pdpTitleColor", "pdpTitleCase", "pdpPriceFont", "pdpPriceSize", "pdpPriceSizeMobile", "pdpPriceColor", "pdpShowStock", "pdpStockColor"] },
    { title: "Edition choices", keys: ["pdpChipShowPrice", "pdpChipTextSize", "pdpChipCase", "pdpChipTextColor", "pdpChipBorderColor", "pdpChipBorderWidth", "pdpChipRadius", "pdpChipActiveBg", "pdpChipActiveText", "pdpChipSoldOutStrike"] },
    { title: "“Notify me” signup box", keys: ["pdpAlertBg", "pdpAlertBorderColor", "pdpAlertBorderWidth", "pdpAlertRadius", "pdpAlertPadding", "pdpAlertHeadingColor", "pdpAlertFieldBorderColor", "pdpAlertButtonBg", "pdpAlertButtonText", "pdpAlertButtonBorderColor"] },
    { title: "Extras & gift card fields", keys: ["pdpFieldBg", "pdpFieldText", "pdpFieldBorderColor", "pdpFieldBorderWidth", "pdpFieldRadius", "pdpFieldFocusColor"] },
    { title: "Enlarged photo viewer", keys: ["pdpViewerButtonBg", "pdpViewerButtonIcon", "pdpViewerButtonBorderColor", "pdpViewerButtonShape", "pdpViewerShade", "pdpViewerShowCount", "pdpViewerCountColor"] },
    { title: "Photo frame & thumbnails", keys: ["pdpThumbPosition", "pdpThumbWrap", "pdpThumbsPhone", "pdpThumbFill", "pdpThumbPerRow", "pdpThumbLastRow", "pdpThumbSize", "pdpThumbGap", "pdpThumbShape", "pdpThumbActiveColor", "pdpPhotoBorderColor", "pdpPhotoBorderWidth", "pdpShowCaption", "pdpPhotoDots"] },
    { title: "Description / Details tabs", keys: ["pdpDetailsPlacement", "pdpSpecsStyle", "pdpTabActiveBg", "pdpTabActiveText", "pdpPanelBorderColor", "pdpPanelTextWidth"] },
    { title: "Description text", keys: ["pdpDescFont", "pdpDescSize", "pdpDescSizeMobile", "pdpDescLineHeight", "pdpDescColor", "pdpDescAlign", "pdpDescLinkColor", "pdpDescLinkUnderline", "pdpRuledText", "pdpRuledEveryLine", "pdpDescHeadingFont", "pdpDescHeadingSize", "pdpDescHeadingColor", "pdpDescQuoteColor", "pdpDescBlockGap"] },
    { title: "Breadcrumb & small labels", keys: ["pdpShowBackLink", "pdpShowBackArrow", "pdpShowBreadcrumb", "pdpMetaFont", "pdpMetaSize", "pdpMetaColor"] },
  ],
  catalogLayout: [
    { title: "Masthead", keys: ["catalogLayoutStyle", "catalogMastheadText", "brandTransform", "catalogMastheadDesktop", "catalogMastheadMobile", "catalogHeaderWidth", "catalogHeaderRuleWidth"] },
    { title: "Navigation & cart button", keys: ["catalogNavGapDesktop", "catalogNavGapMobile", "referenceCategoryLimit", "catalogCartPlacement", "catalogCartTotalPlaceholder"] },
    { title: "Book covers", keys: ["catalogTitleTransform", "catalogImageFit", "catalogImageFocalX", "catalogImageFocalY"] },
  ],
  cartDrawer: [
    { title: "Size & position", keys: ["cartDrawerSide", "cartDrawerWidth", "cartDrawerPadding"] },
    { title: "After adding a book", keys: ["cartAddAction", "cartAddNoticeSeconds"] },
    { title: "Colours & outline", keys: ["cartDrawerBg", "cartDrawerText", "cartDrawerMuted", "cartDrawerSurface", "cartDrawerBorder", "cartDrawerEdgeColor", "cartDrawerEdgeWidth", "cartDrawerShadowColor", "cartDrawerShadowOffset", "cartDrawerBackdropColor", "cartDrawerBackdropBlur"] },
    { title: "Heading & fonts", keys: ["cartDrawerTitleFont", "cartDrawerTitleSize", "cartDrawerTitleCase", "cartDrawerMetaFont", "cartDrawerMetaSize", "cartDrawerShowCount"] },
    { title: "Free-shipping bar", keys: ["showFreeShipBar", "cartDrawerProgressColor", "cartDrawerProgressTrack", "cartDrawerProgressHeight"] },
    { title: "Book rows", keys: ["cartDrawerShowItemNumbers", "cartDrawerShowThumbs", "cartDrawerThumbWidth", "cartDrawerThumbOutline", "cartDrawerGrayscaleThumbs", "cartDrawerItemTitleSize", "cartDrawerShowUnitPrice", "cartDrawerShowLineTotal", "cartDrawerShowPreorder", "cartDrawerShowLineOptions", "cartDrawerQtyStyle", "cartDrawerRemoveStyle", "cartDrawerShowSaveForLater", "cartDrawerShowSavings"] },
    { title: "Suggestion card", keys: ["cartDrawerShowUpsell", "cartDrawerUpsellShadow"] },
    { title: "Total & checkout button", keys: ["cartDrawerShowSummary", "cartDrawerShowShippingPreview", "cartDrawerShowDiscountCode", "cartDrawerShowOrderNote", "cartDrawerShowShipBy", "cartDrawerTotalSize", "showCartTrustBadges", "cartDrawerShowSecureBadge", "cartDrawerShowTrackedBadge", "cartDrawerShowReturnsBadge", "cartDrawerCheckoutBg", "cartDrawerCheckoutText", "cartDrawerCheckoutHeight", "cartDrawerCheckoutShadow", "cartDrawerShowCheckoutArrow", "cartDrawerShowTermsCheckbox", "cartDrawerShowDeliveryNote"] },
    { title: "Empty bag", keys: ["cartDrawerShowEmptyIcon", "cartDrawerShowEmptyButton", "cartDrawerEmptyLink", "cartDrawerEmptyPicks", "cartDrawerEmptyPicksCount"] },
  ],
  checkout: [
    { title: "What shoppers see", keys: ["showOrderNote", "hideCheckoutAddressUnit", "hideCheckoutPaymentTotal", "hideCheckoutExpressWallets", "hideAddressSuggestions", "checkoutPinnedCountries", "hideCountryFlags", "checkoutSummaryOpenOnPhones", "hidePayButtonTotal", "showCheckoutDiscountBox", "alwaysShowDiscountBox", "showCheckoutGiftCardBox", "showCheckoutAutoDiscountHint", "hideCheckoutFreeShipNudge", "hideCheckoutLowStock", "hideCheckoutPolicyLinks", "requireCheckoutTerms"] },
    { title: "Colours", keys: ["checkoutAccentColor", "checkoutBgColor"] },
    { title: "Fonts & form fields", keys: ["checkoutHeadingFont", "checkoutFont", "checkoutFieldFont", "checkoutMetaFont", "checkoutLabelStyle", "checkoutFieldHeight", "checkoutFieldBg", "checkoutFieldText", "checkoutFieldBorder", "checkoutInputRadius"] },
    { title: "Header & sections", keys: ["checkoutBrandAccent", "checkoutHeaderRuleWidth", "checkoutShowPageTitle", "checkoutPageTitleSize", "showCheckoutProgress", "checkoutSectionMarker", "checkoutMarkerColor", "checkoutSectionTitleSize", "checkoutRuleColor", "showCheckoutTrustRow"] },
    { title: "Pay button & payment choices", keys: ["checkoutPayTabs", "checkoutPayBg", "checkoutPayText", "checkoutPayHeight", "checkoutPayShadow", "checkoutPayShadowColor", "checkoutPhonePayBar"] },
    { title: "Order slip", keys: ["checkoutSlipBg", "checkoutSlipOutline", "checkoutSlipOutlineWidth", "checkoutSlipShadowColor", "checkoutSlipShadowOffset", "checkoutSlipTitleSize", "checkoutSlipShowDate", "checkoutSlipNumbers", "checkoutSlipThumbWidth", "checkoutSlipPerforation", "checkoutSlipTotalSize", "showCheckoutReassurance", "checkoutSlipShowFooter", "checkoutSlipFooterBg", "checkoutSlipFooterText"] },
    { title: "Card payment form", keys: ["stripeFormBg", "stripeFormPadding"] },
  ],
  customPages: [
    { title: "What custom pages show", keys: ["showPageFooter", "showNotFoundMessage", "showNotFoundBack", "pageShowEyebrow"] },
    { title: "Page title", keys: ["pageTitleSize", "pageTitleUppercase", "pageTitleColor", "pageTitleFont", "pageTitleSizePx", "pageTitleSizePxMobile", "pageTitleWeight", "pageTopSpacing"] },
    { title: "Text & column", keys: ["pageChromeStyle", "pageBodySize", "pageTextColor", "pageAlign", "pageWidth", "pageTextMeasure", "pageTextWidthPx"] },
    { title: "Line under the title", keys: ["pageShowRule", "pageRuleColor", "pageRuleWidth", "pageRuleSpacing"] },
  ],
}, STOREFRONT_FEATURES);

export const MORE_SETTINGS = "More settings";

/** A group's fields split into its sub-sections (unlisted fields → "More settings"); one section when unmapped. */
export function subsectionsFor(group: StyleGroup): { title: string; fields: StyleField[] }[] {
  const map = STYLE_SUBSECTIONS[group.id];
  if (!map) return [{ title: "", fields: group.fields }];
  const byKey = new Map(group.fields.map((f) => [f.key, f]));
  const used = new Set<string>();
  const out = map.map((s) => ({
    title: s.title,
    fields: s.keys.flatMap((k) => { const f = byKey.get(k); if (!f) return []; used.add(k); return [f]; }),
  })).filter((s) => s.fields.length);
  const rest = group.fields.filter((f) => !used.has(f.key));
  if (rest.length) out.push({ title: MORE_SETTINGS, fields: rest });
  return out;
}

// ── "Changed from default" ────────────────────────────────────────────────

const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The value Reset to default restores: the site's default design, else nothing (= storefront default). */
export const defaultFor = (field: StyleField, defaults: any) => readStyle(defaults, field.key);

/** True when the owner (or a theme preset) set this control to something other than its default. */
export function isChanged(field: StyleField, design: any, defaults: any): boolean {
  const value = readStyle(design, field.key);
  if (value === undefined || value === null) return false;
  const base = defaultFor(field, defaults) ?? field.defaultValue;
  if (value === "" && (base === undefined || base === null || base === "")) return false;
  return !same(value, base);
}

export function changedFields(group: StyleGroup, design: any, defaults: any): StyleField[] {
  return group.fields.filter((f) => isChanged(f, design, defaults));
}

/** Changed-field counts for every category, plus the total (for badges and "What I've changed"). */
export function changedCounts(groups: StyleGroup[], design: any, defaults: any): { byGroup: Record<string, number>; total: number } {
  const byGroup: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    const n = changedFields(g, design, defaults).length;
    if (n) { byGroup[g.id] = n; total += n; }
  }
  return { byGroup, total };
}

// ── Text & labels ─────────────────────────────────────────────────────────

export const TEXT_HEADINGS: { id: string; title: string; groups: string[] }[] = [
  { id: "everywhere", title: "Across the whole shop", groups: ["Site & sharing", "Header", "Footer", "Newsletter", "Cookie banner", "Sections"] },
  { id: "shop", title: "Shop & book pages", groups: ["Catalog & empty states", "Collection & wishlist pages", "Search & filters", "Product page", "Reviews"] },
  { id: "buy", title: "Bag, checkout & accounts", groups: ["Cart", "Checkout", "Order tracking", "Customer account"] },
  { id: "special", title: "Special pages & messages", groups: ["Custom pages & 404", "Loading screen", "Under construction", "Maintenance page"] },
];

export const TEXT_BLURBS: Record<string, string> = {
  "Site & sharing": "Your shop name, default page title and description for search and sharing.",
  Header: "Menu words, the phone menu button and header labels.",
  Footer: "Footer headings, policy links and small print.",
  Newsletter: "The email sign-up box.",
  "Cookie banner": "The cookie consent message and its buttons.",
  Sections: "Fallback words used inside page sections.",
  "Catalog & empty states": "Shop heading and the message when nothing matches.",
  "Collection & wishlist pages": "Category pages and the saved-books page.",
  "Search & filters": "The search box, filter and sort words.",
  "Product page": "Add to bag, stock lines, tabs and other book-page words.",
  Reviews: "Review form, ratings and moderation messages.",
  Cart: "The bag: heading, totals, buttons and empty-bag message.",
  Checkout: "Every checkout step, field, error and the payment area.",
  "Order tracking": "The order-tracking page and its status messages.",
  "Customer account": "Sign-in, account pages and their messages.",
  "Custom pages & 404": "Missing-page message and custom-page helper words.",
  "Loading screen": "Words on the loading splash.",
  "Under construction": "The 'coming soon' page.",
  "Maintenance page": "The page shown while the shop is paused.",
};

/**
 * Sub-sections inside the long text groups. Each key goes to the first sub-section (in `order`)
 * whose pattern matches; keys no pattern matches land in "More words", so nothing can disappear.
 */
type TextSub = { title: string; match: RegExp; order?: number };
export const TEXT_SUBSECTIONS: Record<string, TextSub[]> = {
  "Site & sharing": [
    { title: "Preview banners & checks", match: /^(themePreview|draftPreview|appVerification|googleSiteVerification)/ },
    { title: "Shop name & search listings", match: /^(site|seo)/ },
  ],
  "Search & filters": [
    { title: "Sorting", match: /^(sort_|filterSortAria)/ },
    { title: "Filters (stock, sale, format, price)", match: /^filter(InStock|OnSale|Format|Price|Clear|Results)/ },
    { title: "Search box & search window", match: /^(filterSearch|search)/ },
  ],
  Checkout: [
    { title: "Steps & headings", match: /^co(Brand|Return|Secure|Progress|Step|PageTitle|Contact$|YourLocation|Delivery$|DeliveryTag|Payment$)/ },
    { title: "Order slip", match: /^co(Summary|ShowSummary|HideSummary|ItemCount|LineQty|Slip)/ },
    { title: "Contact & address fields", match: /^co(SignedIn|Google|Email|Name|Address|Country|City|State|Zip|Phone|Bill|EnterAddress)/ },
    { title: "Shipping, pickup & delivery", match: /^co(Ship|Fulfillment|Rates|ArrivesBy|FreeShip|Packed|Pickup|Carrier|Estimated|Free$|NoShipping|Preorder|TaxLater)/ },
    { title: "Payment & the Pay button", match: /^co(Payment|Card|Pay|PayPal|Paypal|PlaceOrder|Processing|Stripe|Trust|Guarantee|TestMode|NoPayment|PrivacyNote|Policy|Terms|OnlyLeft|Express|OrderNote|Rates)/ },
    { title: "Discount codes", match: /^co(HaveCode|Discount|Apply)/ },
    { title: "Gift cards, automatic offers & free gifts", match: /^co(GiftCard|Auto|FreeGift|Line)/ },
    { title: "After the order", match: /^co(Thanks|Account|Pending|Continue|OrderPlaced|OrderConfirmed|Finalizing|CheckEmail|OrderNumber|ConfirmationSent|Confirming|Success|TrackOrder)/ },
    { title: "Empty bag", match: /^coEmpty/ },
    { title: "Error messages", order: -1, match: /^co(Err|ServerRefused|TotalChanged|BelowMinimum|BagUpdated|Catalog|PaymentCanceled|PaymentNotFinished|DiscountInvalid|DiscountExpired|DiscountRejected|CheckoutFailed)|Error$|Failed$/ },
  ],
  "Order tracking": [
    { title: "Find your order", match: /^track(Eyebrow|Title|Subtitle|Order|Email|Submit|Loading|Link|Found|Back|Another|Created|Help)/ },
    { title: "Order status & timeline", match: /^track(Timeline|Step|InTransit|Shipment|Paid|Unpaid|Awaiting|Cancelled|Refunded|StillUnpaid|Recheck|Preorder)/ },
    { title: "Delivery & pickup", match: /^track(Fulfillment|Pickup|LocalDelivery|Collected|ReadyFor|OutFor|Logistics|Carrier|Shipping|ShipTo|Expected)/ },
    { title: "Items & totals", match: /^(track(Items|TotalPayable|Digital|Download|AddOn|GiftCard|FreeGift|BoxSet)|qtyLine|summary)/ },
    { title: "Cancel, return & privacy requests", match: /^track(Req|Return|Privacy)/ },
    { title: "Errors & email links", order: -1, match: /^track(Err|Error|Unsub)/ },
  ],
  "Customer account": [
    { title: "Signing in", match: /^account(Title|Subtitle|SignIn|Email|Magic|CheckInbox|Resend|UseDifferent|Or$|Google|ConfirmEmail|SignedIn|LinkSent|Off)/ },
    { title: "Account pages", match: /^account(Storefront|Portal|SignOut|Wishlist|Saved|Orders|Transacted|Shipping|BackToStore)/ },
    { title: "Saved address", match: /^account(Address|Field|Phone|Street|SaveAddress|Abort|Cancel$|Unconfigured)/ },
    { title: "Order history", match: /^(account(History|Items|AddOn|GiftCard|FreeGift|BoxSet|Dispatch|ShipTo|Logistics|Manage|Close|Delivered|Cancelled|Awaiting|Track|Unfulfilled|Shipped|Processing|Paid|Unpaid|Refunded|PartiallyRefunded|BookCount)|carrierLabel|trackingCodeLabel)/ },
    { title: "Downloads", match: /^account(Digital|Ebook|Download$)/ },
    { title: "Error messages", order: -1, match: /^account.*Error$/ },
  ],
  "Product page": [
    { title: "Photos & breadcrumb", match: /^(pdpCrumb|pdpBreadcrumb|pdpCaption|pdpPhotos|ariaGoToPhoto|ariaPrevPhoto|ariaNextPhoto|ariaEnlargePhoto|ariaClosePhoto|ariaPhotoViewer|bookPhotoAlt|bookVideoLabel|ariaGoToVideo|backToCatalog|categoryFallback)/ },
    { title: "Buy box, stock, pre-orders & coming soon", match: /^(pdpInStock|pdpBackorder|pdpPreorder|pdpComingSoon|comingSoon|pdpSaleEnds|pdpSaleCountdown|pdpTaxNote|pdpReleaseCountdown|pdpPaymentIcons|pdpInBag|pdpFreeShip|pdpShipBy|pdpPickup|saleBadge|preorder|addToBag|pdpBuyNow|quickAdd|onlyLeft|saveAmount|priceOnRequest|ariaQty|bookAdded|bookFormat|wishlist|bookShare|bookLinkCopied)/ },
    { title: "Extras, questions, box sets & gift cards", match: /^(pdpAddOn|pdpBoxSet|pdpGift|pdpAsk)/ },
    { title: "Description, details & tabs", match: /^(tab|spec|productDescriptionLabel|pdpDescription|noDescription|pdpDetailsAria|pdpPolicy)/ },
    { title: "Back-in-stock alert", match: /^alert/ },
    { title: "Related books & bundles", match: /^(related|bundle)/ },
  ],
  Footer: [
    { title: "Headings, about & copyright", match: /^footer(About|ExploreHeading|ConnectHeading|NavHeading|Wordmark|LegalHeading|LocationHeading|Location|Copyright)$/ },
    { title: "Footer links & icons", match: /^footer(Link\w+|\w+Aria|Admin)$/ },
    { title: "Policy link titles", match: /^policyTitle/ },
    { title: "Currency picker & Back to top", match: /^(footerCurrency|backToTop)/ },
  ],
  Cart: [
    { title: "Bag heading, rows & total", match: /^cart(Title|Empty|Count|Close|Each|Remove|Subtotal|Shipping|Total|Checkout|Delivery|Continue|OnlyAvailable|Qty|Decrease|Increase|Preorder|AddOn|GiftCard|BoxSet)/ },
    { title: "Free-shipping bar & suggestion", match: /^cart(FreeShip|Upsell)/ },
    { title: "Shipping cost preview", match: /^cartEstimate/ },
    { title: "“Added to your bag” notice", match: /^cartAdded/ },
    { title: "Discount code box", match: /^cartCode/ },
    { title: "Order note box", match: /^cartNote/ },
    { title: "Terms checkbox", match: /^cartTerms/ },
    { title: "Save for later", match: /^cartSave/ },
    { title: "Sale savings", match: /^cartYouSave/ },
    { title: "Trust badges", match: /^trust/ },
  ],
};

export const MORE_WORDS = "More words";

/** A text group's fields split into its sub-sections (unmatched → "More words"); one section when unmapped. */
export function textSubsectionsFor<T extends { key: string }>(group: { group: string; fields: T[] }): { title: string; fields: T[] }[] {
  const subs = TEXT_SUBSECTIONS[group.group];
  if (!subs) return [{ title: "", fields: group.fields }];
  const byPriority = [...subs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const home = new Map<string, string>();
  for (const f of group.fields) {
    const sub = byPriority.find(x => x.match.test(f.key));
    home.set(f.key, sub ? sub.title : MORE_WORDS);
  }
  const out = subs.map(x => ({ title: x.title, fields: group.fields.filter(f => home.get(f.key) === x.title) })).filter(x => x.fields.length);
  const rest = group.fields.filter(f => home.get(f.key) === MORE_WORDS);
  if (rest.length) out.push({ title: MORE_WORDS, fields: rest });
  return out;
}

/** Labels the owner rewrote (including deliberately blank ones). */
export function changedCopyCount(fields: { key: string }[], design: any): number {
  return fields.filter((f) => typeof design?.copy?.[f.key] === "string").length;
}
