// Section designs (plan "Editable starter websites", step 2, 23 November 2026). Like Squarespace's section picker,
// Add section lists ready-made designs grouped by what the section is for (an opening banner, products, words…), not by
// how it is built. A design is a section type plus some of that section's own settings, so adding one gives an ordinary
// section the owner edits like any other (`settingsWithoutControl` in themeCheck.ts, run on every design by
// sectionDesigns.test.ts). Every section type has its plain design (id = the type), so nothing that could be added
// before is missing; the extra designs follow it. Pure: the registry is passed in.

/** What Add section groups by, in the order a shop page usually reads. */
export const SECTION_KINDS = [
  { id: "opening", label: "Opening banners", blurb: "A big first look: a photo, a headline and a button." },
  { id: "products", label: "Products", blurb: "Grids, carousels and single products from your shop." },
  { id: "words", label: "Words and stories", blurb: "Text, pictures beside text, columns and questions." },
  { id: "pictures", label: "Pictures and video", blurb: "Galleries, collages, video and a map." },
  { id: "trust", label: "Reviews and trust", blurb: "Quotes, reviews, logos and numbers." },
  { id: "offers", label: "Offers and announcements", blurb: "Moving lines, slim strips and countdowns." },
  { id: "signups", label: "Sign-ups and contact", blurb: "Newsletter, contact form and social links." },
  { id: "bookings", label: "Bookings", blurb: "Times, services, your team and opening hours." },
  { id: "build", label: "Build your own", blurb: "Free layouts and your own code." },
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number]["id"];

const KIND_OF: Record<string, SectionKind> = {
  HeroSection: "opening", ImageBannerSection: "opening", VideoHeroSection: "opening", SlideshowSection: "opening",
  ProductGridHeaderSection: "products", ProductShowcaseGridSection: "products", ProductCoverCarouselSection: "products",
  FeaturedProductSection: "products", FeaturedCollectionSection: "products", BookSpotlightSection: "products",
  CollectionListSection: "products", StaffNotesTableSection: "products", PricingTableSection: "products", StickyAddToBagSection: "products",
  ShoppablePhotoSection: "products", LookbookSection: "products",
  PageContentSection: "words", TextContentSection: "words", RichTextSection: "words", ImageWithTextSection: "words", SplitOpeningSection: "opening", PhotoOpeningSection: "opening", BigIntroSection: "words", FeatureDuoSection: "words", StoryOrbitSection: "words",
  MulticolumnSection: "words", FeatureGridSection: "words", FAQSection: "words", CollapsibleSection: "words", BlogPostsSection: "words",
  GallerySection: "pictures", ImageCollageSection: "pictures", VideoSection: "pictures", MapSection: "pictures",
  TestimonialsSection: "trust", PraiseQuotesSection: "trust", ClientReviewsSection: "trust", LogoListSection: "trust", StatsCounterSection: "trust",
  MarqueeSection: "offers", PromoStripSection: "offers", CountdownSection: "offers", EphemeraRowSection: "offers",
  NewsletterSection: "signups", NewsletterPopupSection: "signups", ContactFormSection: "signups", FollowUsSection: "signups",
  BookTimeSection: "bookings", ServiceMenuSection: "bookings", BookingTeamSection: "bookings", BookCallSection: "bookings", BookingHoursSection: "bookings",
  CompositionSection: "build", RowSection: "build", CustomHTMLSection: "build",
};

/** The kind a section type belongs to. A type missing here shows under Build your own (the test lists every type). */
export const kindOf = (type: string): SectionKind => KIND_OF[type] || "build";

export type SectionDesign = { id: string; type: string; kind: SectionKind; label: string; description: string; settings: Record<string, any> };
type Extra = Omit<SectionDesign, "kind" | "id"> & { key: string };

/** Ready-made designs beyond each section's plain one. Settings are only the section's own fields. */
const EXTRA: Extra[] = [
  { type: "HeroSection", key: "centred", label: "Centred headline", description: "Headline and button in the middle of a full photo.", settings: { align: "center" } },
  { type: "HeroSection", key: "left", label: "Headline on the left", description: "Words on the left, the photo filling the rest.", settings: { align: "left" } },
  { type: "HeroSection", key: "short", label: "Short banner", description: "A shorter opening, so products show sooner.", settings: { align: "left", height: "small" } },
  { type: "ImageBannerSection", key: "full", label: "Full-screen photo", description: "The photo fills the screen, words in the lower corner.", settings: { height: "full", contentPosition: "bottom-left", textAlign: "left" } },
  { type: "ImageBannerSection", key: "strip", label: "Photo strip", description: "A slim photo band with a line of words.", settings: { height: "small", contentPosition: "center-center", textAlign: "center" } },
  { type: "ProductShowcaseGridSection", key: "four", label: "Four across", description: "A tight grid, four on computers and two on phones.", settings: { columnsDesktop: 4, columnsMobile: 2, imageAspectRatio: "3:4" } },
  { type: "ProductShowcaseGridSection", key: "two", label: "Two large", description: "Big photos, two at a time.", settings: { columnsDesktop: 2, columnsMobile: 1, imageAspectRatio: "4:5", productLimit: 4 } },
  { type: "ProductShowcaseGridSection", key: "newest", label: "New arrivals", description: "Your newest products, eight of them.", settings: { productSource: "newest", productLimit: 8 } },
  { type: "ProductShowcaseGridSection", key: "sale", label: "On sale", description: "Only products with a sale price.", settings: { productSource: "onSale" } },
  { type: "ImageWithTextSection", key: "left", label: "Picture on the left", description: "A picture with your words beside it.", settings: { layout: "image-left" } },
  { type: "ImageWithTextSection", key: "right", label: "Picture on the right", description: "Your words first, the picture after.", settings: { layout: "text-left" } },
  { type: "FeatureGridSection", key: "four", label: "Four points", description: "Four short points in a row.", settings: { columns: 4, align: "center" } },
  { type: "MulticolumnSection", key: "two", label: "Two columns", description: "Two side-by-side blocks of words.", settings: { columns: 2, align: "left" } },
  { type: "ShoppablePhotoSection", key: "words-left", label: "Words beside the photo", description: "Your words on the left, the shoppable photo on the right.", settings: { layout: "words-left", aspect: "portrait" } },
  { type: "ShoppablePhotoSection", key: "wide", label: "Wide photo", description: "One wide photo across the page, words above it.", settings: { layout: "words-above", aspect: "wide" } },
  { type: "LookbookSection", key: "slider", label: "Lookbook slider", description: "Looks side by side that shoppers swipe through.", settings: { layout: "slider" } },
  { type: "GallerySection", key: "four", label: "Four-photo rows", description: "Smaller photos, four to a row.", settings: { columns: 4 } },
  { type: "TestimonialsSection", key: "left", label: "Quotes on the left", description: "Reviews lined up on the left.", settings: { align: "left" } },
  { type: "PraiseQuotesSection", key: "grid", label: "Quote cards", description: "Press quotes as a grid of cards.", settings: { layout: "grid", align: "left" } },
  { type: "NewsletterSection", key: "left", label: "Sign-up on the left", description: "The sign-up box lined up with your text.", settings: { align: "left" } },
  // Second round (step 2, part 2): every kind gets real choices, including the parts the Juniper starters are made of
  // (big capitals, colour blocks, dark bands, a moving ticker, a staggered collage, quick add). Colours come from the
  // theme's own colour schemes (dark = Noir, bright = Flare), never a fixed colour, so they follow any look.
  { type: "HeroSection", key: "capitals", label: "Big capitals", description: "Huge capital letters over a full photo.", settings: { align: "left", textTransform: "uppercase", headingSize: 120, headingWeight: "800" } },
  { type: "VideoHeroSection", key: "full", label: "Full-screen video", description: "A moving picture that fills the screen.", settings: { minHeight: "100vh", textAlign: "left" } },
  { type: "SlideshowSection", key: "dark", label: "Dark slideshow", description: "Slides on a dark band, changing by themselves.", settings: { colorSchemeId: "scheme-inverse", autoplay: true } },
  { type: "ProductShowcaseGridSection", key: "quick", label: "Quick add", description: "Shoppers add to the bag straight from the grid.", settings: { columnsDesktop: 4, columnsMobile: 2, showQuickAdd: true, showCategoryTag: true } },
  { type: "ProductCoverCarouselSection", key: "tall", label: "Full-screen carousel", description: "One product at a time, filling the screen.", settings: { height: "full" } },
  { type: "FeaturedCollectionSection", key: "three", label: "Three across", description: "Six products from one category, three to a row.", settings: { columnsDesktop: 3, productLimit: 6, align: "left" } },
  { type: "BookSpotlightSection", key: "right", label: "Picture on the right", description: "The product's words first, its photo beside them.", settings: { imagePosition: "right" } },
  { type: "ImageWithTextSection", key: "dark", label: "Dark story band", description: "Your story on a dark band, words beside a picture.", settings: { layout: "text-left", colorSchemeId: "scheme-inverse" } },
  { type: "ImageWithTextSection", key: "colour", label: "Colour block", description: "A picture beside a block of your bright colour.", settings: { layout: "image-left", colorSchemeId: "scheme-accent" } },
  { type: "TextContentSection", key: "narrow", label: "Short note", description: "A few centred lines in a narrow column.", settings: { align: "center", maxWidth: "narrow" } },
  { type: "RichTextSection", key: "statement", label: "Big statement", description: "One large sentence that sets the tone.", settings: { align: "left", headingSize: 64 } },
  { type: "MulticolumnSection", key: "four", label: "Four columns", description: "Four short blocks side by side.", settings: { columns: 4, align: "center" } },
  { type: "FAQSection", key: "plain", label: "Simple questions", description: "Questions and answers without a search box.", settings: { showSearch: false } },
  { type: "BlogPostsSection", key: "two", label: "Two big stories", description: "Your news as two wide cards.", settings: { columns: 2 } },
  { type: "ImageCollageSection", key: "stagger", label: "Staggered photos", description: "Photos set at different heights.", settings: { layout: "stagger" } },
  { type: "ImageCollageSection", key: "strip", label: "Photos edge to edge", description: "A row of photos with no gaps between them.", settings: { layout: "strip", gap: 0 } },
  { type: "GallerySection", key: "two", label: "Two large photos", description: "Big photos, two to a row.", settings: { columns: 2 } },
  { type: "PraiseQuotesSection", key: "big", label: "One big quote", description: "A single quote in large letters.", settings: { quoteSize: "lg", align: "center" } },
  { type: "TestimonialsSection", key: "dark", label: "Quotes on dark", description: "Reviews on a dark band.", settings: { colorSchemeId: "scheme-inverse" } },
  { type: "StatsCounterSection", key: "colour", label: "Numbers on colour", description: "Your numbers on a band of your bright colour.", settings: { colorSchemeId: "scheme-accent" } },
  { type: "MarqueeSection", key: "ticker", label: "Dark ticker", description: "A slim dark strip of small moving words.", settings: { colorSchemeId: "scheme-inverse", fontSize: 14, speed: 30, uppercase: true } },
  { type: "MarqueeSection", key: "still", label: "Still line of short notes", description: "Three short notes spread across one quiet row.", settings: { still: true, separator: "\u2726", fontSize: 10, bold: false, uppercase: true, letterSpacing: 0.12 } },
  { type: "MarqueeSection", key: "big", label: "Big moving words", description: "Large words gliding across the page.", settings: { fontSize: 72, speed: 40 } },
  { type: "PromoStripSection", key: "slim", label: "Slim strip", description: "A very small line, centred.", settings: { size: "xs", align: "center" } },
  { type: "CountdownSection", key: "colour", label: "Countdown on colour", description: "The timer on a band of your bright colour.", settings: { colorSchemeId: "scheme-accent", align: "center" } },
  { type: "NewsletterSection", key: "bright", label: "Bright sign-up band", description: "The sign-up box on a band of your bright colour.", settings: { align: "center", colorSchemeId: "scheme-accent" } },
  { type: "NewsletterSection", key: "dark", label: "Dark sign-up band", description: "The sign-up box on a dark band.", settings: { align: "center", colorSchemeId: "scheme-inverse" } },
  { type: "FollowUsSection", key: "names", label: "Icons with names", description: "Bigger icons with each account's name.", settings: { showNames: true, iconSize: 32 } },
  { type: "ContactFormSection", key: "full", label: "Full contact form", description: "Asks for a phone number and a subject too.", settings: { showPhone: true, showSubject: true } },
  { type: "ServiceMenuSection", key: "left", label: "Price list on the left", description: "Your services lined up with your text.", settings: { align: "left" } },
  { type: "BookingHoursSection", key: "map", label: "Hours with a map", description: "Opening hours beside a map to find you.", settings: { showMap: true } },
  { type: "ClientReviewsSection", key: "three", label: "Three reviews", description: "Your three newest client reviews.", settings: { maxReviews: 3 } },
  { type: "RowSection", key: "wide", label: "Wide and narrow", description: "Two columns, the first twice as wide.", settings: { layout: "67-33" } },
  { type: "RowSection", key: "thirds", label: "Three columns", description: "Three equal columns for your own blocks.", settings: { layout: "thirds" } },
];

/** One plain design per section type (in registry order), each followed by its extra designs. */
export function sectionDesigns(registry: { type: string; label: string; description: string }[]): SectionDesign[] {
  const out: SectionDesign[] = [];
  for (const meta of registry) {
    const kind = kindOf(meta.type);
    out.push({ id: meta.type, type: meta.type, kind, label: meta.label, description: meta.description, settings: {} });
    for (const extra of EXTRA.filter(e => e.type === meta.type)) {
      out.push({ id: `${meta.type}~${extra.key}`, type: meta.type, kind, label: extra.label, description: extra.description, settings: extra.settings });
    }
  }
  return out;
}

/** The type and settings a design adds. An id that is a plain type (older links, tests) is that type's plain design. */
export function designParts(id: string): { type: string; settings: Record<string, any> } {
  const [type, key] = id.split("~");
  const extra = key ? EXTRA.find(e => e.type === type && e.key === key) : undefined;
  return { type, settings: extra?.settings || {} };
}

/** Designs matching a search, grouped by kind in SECTION_KINDS order, optionally one kind only. */
export function designGroups(designs: SectionDesign[], query: string, only?: SectionKind | null, extraText: (d: SectionDesign) => string = () => "") {
  const q = query.trim().toLowerCase();
  const hits = designs.filter(d => (!only || d.kind === only) && (!q || `${d.label} ${d.description} ${kindLabel(d.kind)} ${extraText(d)}`.toLowerCase().includes(q)));
  return SECTION_KINDS.map(k => ({ kind: k.id, label: k.label, blurb: k.blurb, items: hits.filter(d => d.kind === k.id) })).filter(g => g.items.length);
}

export const kindLabel = (kind: SectionKind) => SECTION_KINDS.find(k => k.id === kind)?.label || "";

// ── Try another design (starters rethink, step 6) ──
// Like Squarespace's layout switcher: a section flips to another design of its kind and keeps the owner's words,
// photos, links and chosen products. Different section types name the same thing differently (one says title, another
// headline), so each piece of content has a role and the names that hold it.
const ROLES: Record<string, string[]> = {
  eyebrow: ["eyebrow", "kicker"],
  title: ["title", "headline", "sectionTitle"],
  body: ["body", "subtitle", "subheadline", "description", "content", "tagline"],
  buttonText: ["ctaText", "buttonLabel", "buttonText", "linkText"],
  buttonLink: ["ctaUrl", "ctaLink", "buttonUrl", "linkUrl"],
  image: ["imageUrl", "image", "posterUrl"],
  imageAlt: ["imageAlt"],
  video: ["videoUrl"],
};
/** Content kept under its own name when the new design has a setting of the same name. */
const SAME_NAME = ["mobileImageUrl", "secondaryCtaText", "secondaryCtaUrl", "accentWord", "address", "quote", "quoteSource",
  "productSource", "manualSlugs", "productCategory", "productSort", "productSlug", "collectionSlug"];

type Meta = { type: string; label: string; description: string; defaults?: Record<string, any>; blockType?: string; bestIn?: { group?: string } };
type AnySection = { id: string; type: string; settings: Record<string, any>; [k: string]: any };

const filled = (v: unknown) => v !== undefined && v !== null && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && !v.length);

/** The design a section is now: the extra design whose settings it still has, else its type's plain design. */
export function currentDesignId(section: AnySection): string {
  const match = EXTRA.filter(e => e.type === section.type && Object.entries(e.settings).every(([k, v]) => JSON.stringify(section.settings?.[k]) === JSON.stringify(v)));
  return match.length ? `${section.type}~${match[match.length - 1].key}` : section.type;
}

/** Designs a section can switch to: the same kind, shown in the same place (never a pop-up for a page band). */
export function designsToTry(section: AnySection, registry: Meta[]): SectionDesign[] {
  const meta = registry.find(m => m.type === section.type);
  const kind = kindOf(section.type);
  if (!meta || kind === "build" || section.type === "PageContentSection") return [];
  const group = meta.bestIn?.group || "";
  const okType = new Set(registry.filter(m => (m.bestIn?.group || "") === group && m.type !== "PageContentSection").map(m => m.type));
  return sectionDesigns(registry).filter(d => d.kind === kind && okType.has(d.type));
}

/**
 * The section as another design. The same type keeps everything and takes the design's own settings; another type
 * starts from its defaults and takes over the owner's content by role. Values still equal to the old type's defaults
 * are placeholders, so the new design shows its own. Blocks stay when both types use the same kind of block.
 */
export function withDesign(section: AnySection, designId: string, registry: Meta[], blocksKey: (type: string) => string = () => "items"): AnySection {
  const { type, settings } = designParts(designId);
  const { sample: _sample, ...rest } = section as AnySection & { sample?: boolean };
  if (type === section.type) {
    const plainReset = Object.fromEntries(EXTRA.filter(e => e.type === type).flatMap(e => Object.keys(e.settings))
      .map(k => [k, registry.find(m => m.type === type)?.defaults?.[k]]));
    return { ...rest, settings: { ...section.settings, ...plainReset, ...settings } };
  }
  const from = registry.find(m => m.type === section.type);
  const to = registry.find(m => m.type === type);
  const toDefaults = to?.defaults || {};
  const own = (key: string) => {
    const v = section.settings?.[key];
    return filled(v) && JSON.stringify(v) !== JSON.stringify(from?.defaults?.[key]) ? v : undefined;
  };
  const next: Record<string, any> = { ...JSON.parse(JSON.stringify(toDefaults)), ...settings };
  for (const names of Object.values(ROLES)) {
    const value = names.map(own).find(v => v !== undefined);
    const target = names.find(n => n in toDefaults);
    if (value !== undefined && target) next[target] = value;
  }
  for (const key of SAME_NAME) { const v = own(key); if (v !== undefined && key in toDefaults) next[key] = v; }
  const oldBlocks = section.settings?.[blocksKey(section.type)];
  if (from?.blockType && from.blockType === to?.blockType && Array.isArray(oldBlocks)) next[blocksKey(type)] = oldBlocks;
  const { label: _label, ...base } = rest;
  return { ...base, type, settings: next };
}
