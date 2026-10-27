import { CATEGORIES } from "../features/site/constants";
import { RISO_NOIR_ID, RISO_NOIR_TOKENS } from "../features/site/risoNoir";

/** The shop's settings before the owner has changed anything (merged under `settings/website`). */
export const defaultSettings = (): any => ({
  localFulfillment: { enabled: false, pickupLocations: [], deliveryZones: [] },
  announcements: [{ message: "INDEPENDENT PUBLISHING HOUSE SPECIALIZING IN CONTEMPORARY PHOTOGRAPHY AND EPHEMERA" }],
  // Settings › General › Checkout stock holds: most copies one shopper can have set aside while checking out.
  stockHolds: { perBook: 10, units: 50, orders: 3 },
  maintenance: { enabled: false, message: "WE ARE UPDATING OUR ARCHIVE. PLEASE CHECK BACK SOON." },
  domain: { subdomain: "lyricalmyrical", custom: "lyricalmyricalbooks.com" },
  info: { 
    name: "Lyricalmyrical Books", 
    description: "Lyricalmyrical Books is an independent publishing house based in Toronto with roots in Italy, specializing in publishing photography and art books, photobooks and artists' books.",
    website: "https://lyricalmyricalbooks.com"
  },
  inventory: { tracking: true, overselling: false },
  checkout: { requirePhone: true },
  assets: { 
    profileUrl: "https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=100&h=100&fit=crop", 
    faviconUrl: "https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?w=50&h=50&fit=crop" 
  },
  location: { street: "456 Montrose Avenue", city: "Toronto", state: "Ontario", zip: "M6G3H1", country: "Canada" },
  localization: { timezone: "(GMT-05:00) Eastern Time (US & Canada)", currency: "Canadian Dollar (CAD $)" },
  aiShield: { blockTraining: false, blockShopping: false },
  policies: { shipping: "", returns: "", privacy: "", terms: "", legal: "" },
  communications: {
    orderReceipts: true,
    shippingStatus: true,
    abandonedCart: false,
    receiptMessage: "",
    newOrderNotifications: true
  },
  // Providers default to disconnected; flip these only once the
  // corresponding integration is actually live.
  payments: {
    testMode: false,
    stripe: {
      connected: false,
      email: "",
      publicKey: "",
      secretKey: "",
      testPublicKey: "",
      testSecretKey: "",
      applePay: false,
      googlePay: false,
      afterpay: false,
      affirm: false,
      klarna: false,
      subscriptions: false
    },
    paypal: {
      connected: false,
      email: "",
      clientId: "",
      testClientId: "",
      venmo: false,
      buyNowPayLater: false
    },
    manualMethods: [],
    footerBadges: ["visa", "mastercard", "paypal", "applepay", "googlepay"]
  },
  taxes: {
    rates: []
  },
  design: {
    // On by default on the product page (Style › Product page layout / Storefront elements).
    showRelatedProducts: true,
    showRecentlyViewed: true,
    // Custom pages (Studio › Style › Custom pages): on by default, so the toggles show as on.
    pageShowEyebrow: true, pageTitleUppercase: true,
    primaryColor: "#e8402a",
    font: "Archivo",
    palettePreset: "dark",
    categories: CATEGORIES,
    // Navigation & Layout
    headerStyle: "minimal",
    stickyHeader: true,
    showSocialInFooter: true,
    footerColumns: true,
    logoHeight: 24,
    headerBg: "",
    headerColor: "",
    // Homepage
    heroLayout: "fullscreen",
    showFeaturedCarousel: true,
    showBookStrip: true,
    // Products
    productCardStyle: "editorial",
    imageAspectRatio: "3:4",
    showPriceOnHover: false,
    showQuickAdd: false,
    showCollectionMeta: true,
    showSoldOutBadge: true,
    productCTA: "VIEW",
    productColumnsDesktop: 4,
    productColumnsMobile: 1,
    containerWidth: 1200,
    sectionSpacing: 64,
    cardRadius: 8,
    buttonStyle: "solid",
    buttonRadius: 999,
    buttonUppercase: true,
    buttonShadow: true,
    backgroundColor: "#030213",
    textColor: "#ffffff",
    linkColorHover: "#F61515",
    borderColor: "#B1B1AA",
    buttonColor: "#FBFBFB",
    buttonTextColor: "#020202",
    buttonHoverTextColor: "#FFFFFF",
    buttonHoverBgColor: "#C1BBBB",
    badgeTextPrimary: "#000000",
    badgeBgPrimary: "#F63737",
    badgeTextSecondary: "#000000",
    badgeBgSecondary: "#E0E0E0",
    lowInventoryColor: "#056FFA",
    customCss: "",
    customHeadHtml: "",
    customFooterScripts: "",
    // Announcements
    showAnnouncement: true,
    announcementText: "INDEPENDENT PUBLISHING HOUSE SPECIALIZING IN CONTEMPORARY PHOTOGRAPHY AND EPHEMERA",
    announcementBg: "#63BDEF",
    announcementColor: "#221717",
    announcementScrolling: false,
    // Social
    social: {
      instagram: "https://www.instagram.com/lyricalmyricalbooks",
      twitter: "",
      facebook: "",
      tiktok: "",
    },
    // Typography
    fontSize: "md",
    headingScale: "regular",
    letterSpacing: "wide",
    // Translations
    cartLabel: "BAG",
    soldOutLabel: "SOLD OUT",
    currencyPosition: "before",
    shopButtonLabel: "SHOP NOW",
    // Additional
    enableAnimations: true,
    showZoom: true,
    showPhotoLightbox: true,
    showProductVideos: true,
    showBackToTop: false,
    showFooterCurrency: false,
    showPoweredBy: false,
    headerLinks: {
      showEnterArchive: true,
      showBag: true,
      showSys: true,
    },
    // Hero (Shopify Style)
    hero: {
      enabled: true,
      height: "fullscreen", // fullscreen, tall, medium
      align: "center", // left, center, right
      overlayOpacity: 0.4,
      autoRotate: true,
      slides: [
        {
          id: "default-slide-1",
          imageUrl: "https://images.unsplash.com/photo-1513001900722-370f803f498d?w=1600&h=900&fit=crop",
          title: "F✶M",
          subtitle: "PHOTOGRAPHY & ART BOOKS",
          ctaText: "ENTER SHOP",
          ctaLink: "/shop"
        }
      ]
    },
    // Riso Noir last so its tokens win over the legacy literals above.
    ...RISO_NOIR_TOKENS,
    themeLibraryPreset: RISO_NOIR_ID,
  }
});
