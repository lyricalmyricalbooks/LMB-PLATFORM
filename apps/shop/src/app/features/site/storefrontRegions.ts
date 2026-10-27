import { DEVICE_MEDIA, UP_TO } from "./breakpoints";
import { withFeatureRegions } from "./extras/featureKit";
import { STOREFRONT_FEATURES } from "./extras/registry";
// One public-region contract shared by Studio's controls and the live CSS layer.
// Defaults stay in the existing layouts; unset controls emit no overrides.
export type Region = { id: string; label: string; required?: boolean; grid?: boolean; image?: boolean; copy?: string };
export type RegionGroup = { id: string; title: string; copy: string; files: string[]; regions: Region[] };
export const REGION_GROUPS: RegionGroup[] = withFeatureRegions<RegionGroup>([
  { id: "catalogElements", title: "Catalog & shared content · layout", copy: "Search & filters", files: ["features/site/CatalogControls.tsx", "features/site/RecentlyViewedRow.tsx", "components/MainSite.tsx", "features/site/StoreFooter.tsx"], regions: [
    { id: "catalogSearch", label: "Catalog search field" }, { id: "catalogSort", label: "Catalog sort selector" },
    { id: "catalogStock", label: "In-stock filter" }, { id: "catalogSale", label: "On-sale filter" }, { id: "catalogResults", label: "Filter result count" },
    { id: "catalogFormat", label: "Format filter" }, { id: "catalogPrice", label: "Price filter" },
    { id: "catalogClear", label: "Clear filters button" },
    { id: "catalogShowMore", label: "Show more books button", copy: "Catalog & empty states" },
    { id: "categoryBanner", label: "Category banner" },
    { id: "categoryBannerImage", label: "Category banner picture", image: true },
    { id: "categoryBannerTitle", label: "Category banner name", copy: "Collection & wishlist pages" },
    { id: "categoryBannerText", label: "Category banner description", copy: "Collection & wishlist pages" },
    { id: "catalogEmptyMessage", label: "No books match message", copy: "Catalog & empty states" },
    { id: "catalogLoadNotice", label: "Catalog couldn't load notice", required: true, copy: "Header" },
    { id: "recentRow", label: "Recently viewed row", copy: "Collection & wishlist pages" },
    { id: "recentHeading", label: "Recently viewed heading & line", copy: "Collection & wishlist pages" },
    { id: "recentGrid", label: "Recently viewed grid", grid: true, copy: "Collection & wishlist pages" },
    { id: "recentPhoto", label: "Recently viewed book photo", image: true, copy: "Collection & wishlist pages" },
    { id: "newsletterPanel", label: "Newsletter box", copy: "Newsletter" },
    { id: "newsletterHeading", label: "Newsletter heading", copy: "Newsletter" }, { id: "newsletterText", label: "Newsletter description", copy: "Newsletter" },
    { id: "newsletterForm", label: "Newsletter form", copy: "Newsletter" }, { id: "newsletterButton", label: "Newsletter button", copy: "Newsletter", required: true },
    { id: "newsletterStatus", label: "Newsletter success & error", copy: "Newsletter" },
    { id: "footerPanel", label: "Footer layout", required: true, copy: "Footer" },
    { id: "footerBrand", label: "Footer brand (logo & blurb)", copy: "Footer" },
    { id: "footerLinks", label: "Footer link groups", copy: "Footer" },
    { id: "footerLegal", label: "Footer legal row", copy: "Footer" },
    { id: "footerBottom", label: "Footer bottom bar", copy: "Footer" },
    { id: "footerAdmin", label: "Footer admin link", copy: "Footer" },
  ] },
  { id: "productContent", title: "Product details · content layout", copy: "Product page", files: ["features/site/BookDetail.tsx", "features/site/ProductOptions.tsx", "features/site/PickupAvailability.tsx"], regions: [
    { id: "productDescription", label: "Book description" }, { id: "productSpecs", label: "Book specifications" },
    { id: "productReviews", label: "Book reviews" },
    { id: "productOldPrice", label: "Old price (crossed out during a sale)" },
    { id: "productSaveBadge", label: "Sale savings badge (Save …)" },
    { id: "productAddOns", label: "Extras (signed copy, inscription, gift wrap)" },
    { id: "productBoxSet", label: "Box set contents" },
    { id: "productPickup", label: "Pickup availability (under the buy buttons)" },
    { id: "productArtistBio", label: "Artist bio tab" },
    { id: "productPolicies", label: "Shipping & returns tab" },
    { id: "productGiftCardForm", label: "Gift card recipient form" },
    { id: "relatedBooks", label: "Recommended books row" },
    { id: "relatedHeading", label: "Recommended books heading & line" },
    { id: "relatedGrid", label: "Recommended books grid", grid: true },
    { id: "relatedPhoto", label: "Recommended book photo", image: true },
  ] },
  { id: "wishlistLayout", title: "Wishlist · layout & elements", copy: "Collection & wishlist pages", files: ["features/site/Wishlist.tsx"], regions: [
    { id: "wishlistHeader", label: "Wishlist header" }, { id: "wishlistTitle", label: "Wishlist title" },
    { id: "wishlistCount", label: "Saved-book count" }, { id: "wishlistEmpty", label: "Empty wishlist" },
    { id: "wishlistGrid", label: "Saved-book grid", grid: true }, { id: "wishlistPhoto", label: "Saved-book photo", image: true },
    { id: "wishlistActions", label: "Saved-book actions" },
    { id: "wishlistShareBar", label: "Share wishlist / shared list bar" },
  ] },
  { id: "accountLayout", title: "Customer account · layout & elements", copy: "Customer account", files: ["features/site/Account.tsx"], regions: [
    { id: "accountLogin", label: "Sign-in panel", required: true }, { id: "accountIntro", label: "Sign-in heading & description" },
    { id: "accountHeader", label: "Account navigation", required: true }, { id: "accountProfile", label: "Customer profile" },
    { id: "accountVitals", label: "Account cards", grid: true }, { id: "accountSaved", label: "Wishlist card" },
    { id: "accountOrders", label: "Order count card" }, { id: "accountAddress", label: "Address card", required: true },
    { id: "accountAddressForm", label: "Address form", required: true }, { id: "accountHistory", label: "Order history", required: true },
    { id: "accountDownloads", label: "Purchased downloads", required: true }, { id: "accountShipment", label: "Shipment information", required: true },
    { id: "accountTrackOrder", label: "Track order link" }, { id: "accountBuyAgain", label: "Buy again button" },
    { id: "accountLineDetails", label: "Extras, gift cards & box sets under ordered books" },
    { id: "accountGlow", label: "Account background glow" },
  ] },
  { id: "trackingLayout", title: "Order tracking · layout & elements", copy: "Order tracking", files: ["features/site/OrderTracking.tsx", "features/site/OrderRequests.tsx"], regions: [
    { id: "trackingHeader", label: "Tracking navigation" }, { id: "trackingForm", label: "Order lookup form", required: true },
    { id: "trackingIntro", label: "Lookup heading & description" }, { id: "trackingSummary", label: "Order summary", required: true },
    { id: "trackingTimeline", label: "Fulfillment timeline" }, { id: "trackingFulfillment", label: "Pickup and delivery details", required: true, copy: "Order tracking" }, { id: "trackingShipment", label: "Carrier information", required: true },
    { id: "trackingDownloads", label: "Purchased downloads", required: true }, { id: "trackingItems", label: "Order items & totals", required: true },
    { id: "trackingStatusBanner", label: "Payment, cancelled & refunded notice", required: true }, { id: "trackingShipping", label: "Shipping method & estimate" },
    { id: "trackingHelp", label: "Help line" },
    { id: "trackingLineDetails", label: "Extras, gift cards & box sets under ordered books" },
    { id: "trackingPreorder", label: "Pre-order shipping note" },
    { id: "trackingRequests", label: "Cancel & return requests" }, { id: "trackingPrivacy", label: "Privacy request form (copy / delete my data)", required: true },
    { id: "trackingGlow", label: "Tracking background glow" },
  ] },
  { id: "stripePaymentLayout", title: "Checkout · Stripe payment section", copy: "Checkout", files: ["features/site/StripePaymentSection.tsx"], regions: [
    { id: "stripePaymentPanel", label: "Stripe payment panel", required: true },
    { id: "stripePaymentHeader", label: "Stripe payment method selector", required: true },
    { id: "stripeBrands", label: "Accepted card badges" },
    { id: "stripePaymentRecovery", label: "Stripe payment recovery", required: true },
  ] },
  { id: "checkoutLayout", title: "Checkout · layout & elements", copy: "Checkout", files: ["Checkout.tsx", "features/site/CheckoutAddressStep.tsx", "features/site/CheckoutDeliveryStep.tsx", "features/site/CheckoutPaymentStep.tsx", "features/site/CheckoutOrderSummary.tsx", "features/site/FulfillmentMethodPicker.tsx"], regions: [
    { id: "checkoutHeader", label: "Checkout header" }, { id: "checkoutProgress", label: "Checkout step labels (switch: Style › Checkout page › Header & sections)", required: true },
    { id: "checkoutPageTitle", label: "Checkout heading" },
    { id: "checkoutSlipHead", label: "Order slip heading & date" },
    { id: "checkoutSlipFooter", label: "Order slip footer strip" },
    { id: "checkoutPayBar", label: "Phone Pay bar (pinned to the bottom)", required: true },
    { id: "checkoutForm", label: "Checkout form", required: true }, { id: "checkoutSummary", label: "Order summary", required: true },
    { id: "checkoutFulfillment", label: "Shipping, pickup & local delivery choices", required: true, copy: "Checkout" },
    { id: "checkoutPreorder", label: "Pre-order shipping notice" },
    { id: "checkoutHoldWarning", label: "Large-order limit warning (above Pay)" },
    { id: "checkoutDiscount", label: "Discount code box" },
    { id: "checkoutGiftCard", label: "Gift card box" },
    { id: "checkoutReassurance", label: "Packed & tracked note (switch: Style › Checkout page › Order slip)", required: true },
    { id: "checkoutPromise", label: "Message under Pay button" }, { id: "checkoutSuccess", label: "Order confirmation", required: true }, { id: "checkoutAccountOffer", label: "Order confirmation: sign-in box", copy: "Checkout" },
    { id: "checkoutSuccessSummary", label: "Order confirmation: order summary", copy: "Checkout" }, { id: "checkoutTrackOrder", label: "Order confirmation: track order button", required: true, copy: "Checkout" },
    { id: "checkoutSuccessHeader", label: "Order confirmation: thank-you card", required: true, copy: "Checkout" },
    { id: "checkoutSuccessHeading", label: "Order confirmation: Thank you heading", copy: "Checkout" },
    { id: "checkoutSuccessDelivery", label: "Order confirmation: delivery details (method, ship to, tracking note)", copy: "Checkout" },
    { id: "checkoutPaymentInstructions", label: "Order confirmation: payment instructions", required: true, copy: "Checkout" },
    { id: "checkoutContinue", label: "Order confirmation: continue shopping button", copy: "Checkout" },
    { id: "checkoutEmpty", label: "Empty cart", required: true },
  ] },
  { id: "searchLayout", title: "Search · layout & elements", copy: "Search & filters", files: ["features/site/SearchOverlay.tsx"], regions: [
    { id: "searchPanel", label: "Search panel", required: true },
    { id: "searchField", label: "Search input", required: true }, { id: "searchClose", label: "Close search button", required: true },
    { id: "searchResult", label: "Search result row", required: true }, { id: "searchPrompt", label: "Search label" }, { id: "searchSuggestions", label: "Popular searches" }, { id: "searchRecent", label: "Recent searches" },
    { id: "searchEmpty", label: "No search results" }, { id: "searchSeeAll", label: "See all results link" }, { id: "searchPhoto", label: "Result cover", image: true },
    { id: "searchAuthor", label: "Result author" }, { id: "searchStock", label: "Result stock word" },
    { id: "searchArtists", label: "Matching artists" }, { id: "searchCategories", label: "Matching categories" },
    { id: "searchNewIn", label: "New in the shop" }, { id: "searchBrowse", label: "Browse categories" },
    { id: "searchKeys", label: "Keyboard hints" }, { id: "searchTry", label: "No results: category suggestions" },
  ] },
  { id: "reviewsLayout", title: "Reviews · layout & elements", copy: "Reviews", files: ["features/site/ReviewsSection.tsx"], regions: [
    { id: "reviewsHeading", label: "Reviews heading" }, { id: "reviewsList", label: "Published reviews" }, { id: "reviewsMore", label: "Show more reviews button" },
    { id: "reviewsEmpty", label: "Reviews loading & empty state" }, { id: "reviewsTitle", label: "Review title" },
    { id: "reviewsBody", label: "Review body" }, { id: "reviewsAuthor", label: "Review author" }, { id: "reviewsDate", label: "Review date" },
    { id: "reviewsVerified", label: "Verified purchase badge" }, { id: "reviewsFeatured", label: "Featured review label" },
    { id: "reviewsForm", label: "Write a review" }, { id: "reviewsReply", label: "Publisher replies" },
    { id: "reviewsGuidance", label: "Review moderation note" },
  ] },
  { id: "recoveryLayout", title: "404 & error · layout & elements", copy: "Custom pages & 404", files: ["features/site/NotFoundPage.tsx", "components/ErrorBoundary.tsx"], regions: [
    { id: "notFoundPanel", label: "Not-found layout", required: true }, { id: "notFoundCode", label: "Not-found code" },
    { id: "notFoundHeading", label: "Not-found heading" }, { id: "errorPanel", label: "Error layout", required: true },
    { id: "errorHeading", label: "Error heading" },
  ] },
  { id: "overlayLayout", title: "Loading, cookies & construction · layout", copy: "Loading screen", files: ["components/BootSplash.tsx", "components/CookieConsent.tsx", "components/UnderConstructionWall.tsx"], regions: [
    { id: "loadingArtwork", label: "Loading artwork" }, { id: "loadingTag", label: "Loading tag" },
    { id: "loadingWordmark", label: "Loading wordmark" }, { id: "loadingSubtitle", label: "Loading subtitle" },
    { id: "loadingProgress", label: "Loading animation" }, { id: "loadingStatus", label: "Loading status" },
    { id: "cookiePanel", label: "Cookie panel", required: true, copy: "Cookie banner" }, { id: "cookieTag", label: "Cookie tag", copy: "Cookie banner" },
    { id: "cookieHeading", label: "Cookie heading", copy: "Cookie banner" }, { id: "cookieBody", label: "Cookie explanation", required: true, copy: "Cookie banner" },
    { id: "cookieChoices", label: "Cookie choices (necessary, analytics, marketing)", required: true, copy: "Cookie banner" },
    { id: "cookieActions", label: "Cookie buttons (accept, reject, customize)", required: true, copy: "Cookie banner" },
    { id: "constructionArtwork", label: "Construction background" }, { id: "constructionPanel", label: "Construction panel", required: true },
    { id: "constructionTag", label: "Construction tag" }, { id: "constructionHeading", label: "Construction heading" },
    { id: "constructionBody", label: "Construction explanation" }, { id: "constructionFootnote", label: "Construction footnote" },
  ] },
], STOREFRONT_FEATURES);

export function regionProps(id: string) {
  const group = REGION_GROUPS.find(g => g.regions.some(r => r.id === id));
  const region = group?.regions.find(r => r.id === id);
  const copy = region?.copy || (id.startsWith("construction") ? "Under construction" : group?.copy);
  return { "data-store-region": id, "data-studio-target": `style:${group?.id}|copy:${copy}`,
    "data-studio-label": region?.label || id };
}

export function regionVisible(design: any, id: string): boolean {
  const region = REGION_GROUPS.flatMap(g => g.regions).find(r => r.id === id);
  return Boolean(region?.required) || REGION_DEVICES.some(device => regionValue(design?.regions, id, "Visible", device) !== false);
}

export const REGION_DEVICES = ["desktop", "tablet", "mobile"] as const;
export type RegionDevice = typeof REGION_DEVICES[number];
export const REGION_DEVICE_LABELS = { desktop: "Desktop", tablet: "Tablet", mobile: "Phone" };
export const REGION_SUFFIXES = ["Visible", "Padding", "PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft",
  "MarginTop", "MarginRight", "MarginBottom", "MarginLeft", "Gap", "Radius", "Width", "ElementWidth", "Height", "BorderWidth", "ImageFit", "ImagePositionX", "ImagePositionY",
  "Background", "Border", "Color", "Size", "LineHeight", "LetterSpacing", "Font", "Weight", "Case", "Align", "Columns"];

export function regionKey(id: string, suffix: string, device: RegionDevice = "desktop") {
  return id + (device === "desktop" ? "" : device === "tablet" ? "Tablet" : "Mobile") + suffix;
}

/** Phone inherits tablet, tablet inherits desktop; missing values preserve the existing layout. */
export function regionValue(values: any, id: string, suffix: string, device: RegionDevice = "desktop"): any {
  const chain: RegionDevice[] = device === "mobile" ? ["mobile", "tablet", "desktop"] : device === "tablet" ? ["tablet", "desktop"] : ["desktop"];
  for (const size of chain) {
    const value = values?.[regionKey(id, suffix, size)];
    if (value != null && value !== "") return value;
    if (/^Padding(Top|Right|Bottom|Left)$/.test(suffix)) {
      const shorthand = values?.[regionKey(id, "Padding", size)];
      if (shorthand != null && shorthand !== "") return shorthand;
    }
  }
  return undefined;
}

export function regionFieldDevice(key: string): RegionDevice {
  return /(?:Mobile)[A-Z]/.test(key) ? "mobile" : /(?:Tablet)[A-Z]/.test(key) ? "tablet" : "desktop";
}

const numeric = (value: unknown, max: number, min = 0) => value !== "" && value != null && Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : undefined;
const safe = (value: unknown) => typeof value === "string" && !/[;{}<>]/.test(value) ? value : "";

/** CSS targets the same existing DOM elements in the iframe and published storefront. */
export function storefrontRegionCss(design: any): string {
  const values = design?.regions || {};
  // Every setting key starts with its element's id; elements with none produce no CSS. Skipping them
  // keeps this (run on every storefront render) from building thousands of keys on a phone.
  const keys = Object.keys(values);
  return REGION_GROUPS.flatMap(group => group.regions.map(region => {
    if (!keys.some(key => key.startsWith(region.id))) return "";
    const selector = '[data-fm-store] [data-store-region="' + region.id + '"], [data-fm-store][data-store-region="' + region.id + '"]';
    const textSelector = selector + ',[data-fm-store] [data-store-region="' + region.id + '"] :where(h1,h2,h3,h4,h5,h6,p,span,label,input,textarea,select,button,a,dt,dd,li,code)';
    let css = "";
    // Visibility uses disjoint media ranges so showing a phone element restores its original
    // flex/grid display, and never replaces that display with the browser's block default.
    if (!region.required) {
      const responsive = ["tablet", "mobile"].some(d => values[regionKey(region.id, "Visible", d as RegionDevice)] != null);
      if (!responsive && values[region.id + "Visible"] === false) css += selector + '{display:none !important;}';
      else if (responsive) {
        const ranges = [DEVICE_MEDIA.desktop, DEVICE_MEDIA.tablet, DEVICE_MEDIA.mobile];
        REGION_DEVICES.forEach((device, i) => {
          if (regionValue(values, region.id, "Visible", device) === false) css += '@media' + ranges[i] + '{' + selector + '{display:none !important;}}';
        });
      }
    }
    for (const device of REGION_DEVICES) {
      const value = (suffix: string) => values[regionKey(region.id, suffix, device)];
      const rules: string[] = [], text: string[] = [];
      const add = (property: string, v: any, unit = "", target = rules) => { if (v !== undefined && v !== "") target.push(property + ':' + v + unit + ' !important;'); };
      add("padding", numeric(value("Padding"), 120), "px");
      for (const side of ["Top", "Right", "Bottom", "Left"]) {
        add("padding-" + side.toLowerCase(), numeric(value("Padding" + side), 120), "px");
        add("margin-" + side.toLowerCase(), numeric(value("Margin" + side), 240), "px");
      }
      add("gap", numeric(value("Gap"), 120), "px");
      add("border-radius", numeric(value("Radius"), 120), "px");
      add("max-width", numeric(value("Width"), 2400), "px");
      add("width", numeric(value("ElementWidth"), 2400), "px");
      add("height", numeric(value("Height"), 2400), "px");
      add("background-color", safe(value("Background")));
      add("border-color", safe(value("Border")));
      if (safe(value("Border")) || value("BorderWidth") != null) {
        add("border-style", "solid");
        add("border-width", numeric(regionValue(values, region.id, "BorderWidth", device), 20) ?? 1, "px");
      }
      if (region.grid && numeric(value("Columns"), 6)) add("grid-template-columns", 'repeat(' + Math.round(numeric(value("Columns"), 6)!) + ', minmax(0, 1fr))');
      const size = numeric(value("Size"), 180);
      if (size != null && size > 0) add("font-size", size, "px", text);
      add("line-height", numeric(value("LineHeight"), 3, 0.5), "", text);
      add("letter-spacing", numeric(value("LetterSpacing"), 20, -5), "px", text);
      add("color", safe(value("Color")), "", text);
      if (safe(value("Font"))) add("font-family", "'" + safe(value("Font")).replace(/'/g, "") + "',sans-serif", "", text);
      if (["300", "400", "500", "600", "700", "800", "900"].includes(String(value("Weight")))) add("font-weight", value("Weight"), "", text);
      if (["inherit", "none", "uppercase", "lowercase", "capitalize"].includes(value("Case"))) add("text-transform", value("Case"), "", text);
      if (["left", "center", "right"].includes(value("Align"))) add("text-align", value("Align"), "", text);
      let imageCss = "";
      if (region.image) {
        const imageRules: string[] = [];
        if (["cover", "contain", "fill", "none", "scale-down"].includes(value("ImageFit"))) add("object-fit", value("ImageFit"), "", imageRules);
        if (value("ImagePositionX") != null || value("ImagePositionY") != null) {
          const x = numeric(regionValue(values, region.id, "ImagePositionX", device), 100) ?? 50;
          const y = numeric(regionValue(values, region.id, "ImagePositionY", device), 100) ?? 50;
          add("object-position", x + '% ' + y + '%', "", imageRules);
        }
        if (imageRules.length) imageCss = '[data-fm-store] [data-store-region="' + region.id + '"] img{' + imageRules.join("") + '}';
      }
      const body = imageCss + (rules.length ? selector + '{' + rules.join("") + '}' : "") + (text.length ? textSelector + '{' + text.join("") + '}' : "");
      if (body) css += device === "desktop" ? body : '@media' + UP_TO[device] + '{' + body + '}';
    }
    return css;
  })).join("\n").trim();
}

export function regionFontNames(design: any): string[] {
  return [...new Set(REGION_GROUPS.flatMap(g => g.regions.flatMap(r => REGION_DEVICES.map(device => safe(design?.regions?.[regionKey(r.id, "Font", device)])))).filter(Boolean))];
}
