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
  PageContentSection: "words", TextContentSection: "words", RichTextSection: "words", ImageWithTextSection: "words",
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
  { type: "GallerySection", key: "four", label: "Four-photo rows", description: "Smaller photos, four to a row.", settings: { columns: 4 } },
  { type: "TestimonialsSection", key: "left", label: "Quotes on the left", description: "Reviews lined up on the left.", settings: { align: "left" } },
  { type: "PraiseQuotesSection", key: "grid", label: "Quote cards", description: "Press quotes as a grid of cards.", settings: { layout: "grid", align: "left" } },
  { type: "NewsletterSection", key: "left", label: "Sign-up on the left", description: "The sign-up box lined up with your text.", settings: { align: "left" } },
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
