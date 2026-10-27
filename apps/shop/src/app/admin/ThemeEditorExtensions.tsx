import { useRef, useState } from "react";
import { MediaLibraryButton, uploadIntoField, useMediaPicker } from "./studio/mediaPicker";
import { SortableList, SortableRow } from "./dndSortable";
import {
  ChevronDown,
  Plus,
  GripVertical,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import RichTextEditor from "../components/RichTextEditor";
import { uploadErrorMessage } from "./studio/mediaUpload";
import { PHOTO_RATIO_OPTIONS } from "../features/site/photoShapes";
import { IMAGE_FILTER_PRESETS } from "../components/sectionStyleHelpers";
import { isPickerKind, LinkPicker, PickerField, type PickerKind } from "./studio/StudioPickers";

function normalizeHexForColorInput(hex: string): string {
  let clean = (hex || "").trim().toLowerCase();
  if (clean.startsWith("#")) clean = clean.slice(1);
  clean = clean.replace(/[^0-9a-f]/g, "");
  if (clean.length === 3 || clean.length === 4) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  } else if (clean.length === 8) {
    clean = clean.slice(0, 6);
  }
  if (clean.length !== 6) return "#000000";
  return "#" + clean;
}

/**
 * A drop-down whose saved value isn't one of its choices (usually: never set, so the section's own
 * default applies) must not show its first choice as if it were picked: the owner would read the
 * wrong setting and couldn't pick that first choice (no change event). It shows "Default" instead.
 */
const UNSET_OPTION_LABEL = "Default (not set)";
function needsDefaultOption(options: { value: string }[], value: any): boolean {
  return !options.some(o => o.value === String(value ?? ""));
}
function selectValue(options: { value: string }[], value: any): string {
  return needsDefaultOption(options, value) ? "" : String(value ?? "");
}

/** Swatch shown for a colour that isn't set: a white tile with a red diagonal ("none"), never black. */
const UNSET_SWATCH = "linear-gradient(to top right, #fff calc(50% - 1px), #e8402a calc(50% - 1px), #e8402a calc(50% + 1px), #fff calc(50% + 1px))";

/**
 * Colour box shared by section, block, Theme settings and colour-scheme fields. An empty value means
 * "not set" (the section or theme default applies), so it must not look like black: the swatch shows
 * the "none" tile and the text box says so.
 */
function ColorField({ label, value, onChange, tidy = false, size = "w-7 h-7" }: {
  label: string; value: any; onChange: (value: string) => void; tidy?: boolean; size?: string;
}) {
  const text = typeof value === "string" ? value : "";
  const unset = !text.trim();
  return (
    <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-2 py-1.5" data-color-unset={unset ? "true" : undefined}>
      <div className={`${size} flex-shrink-0 rounded-lg border border-neutral-200 relative overflow-hidden`}
        style={{ background: unset ? UNSET_SWATCH : text }} title={unset ? "Not set" : text}>
        <input aria-label={label}
          type="color"
          value={normalizeHexForColorInput(unset ? "#000000" : text)}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer scale-150"
        />
      </div>
      <input aria-label={label}
        value={text}
        placeholder="Not set (uses the default)"
        onChange={(e) => onChange(e.target.value)}
        onBlur={tidy ? (e) => {
          // Only tidy things that are meant to be hex ("abc", "#AABBCC", "aabbcc"). Blank must stay
          // blank (= inherit) and non-hex CSS colors (transparent, rgba(), var(--x)) must survive.
          const typed = e.target.value.trim();
          if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(typed)) onChange(normalizeHexForColorInput(typed));
        } : undefined}
        className="flex-1 min-w-0 bg-transparent outline-none text-[11px] font-bold uppercase placeholder:normal-case placeholder:font-normal placeholder:text-neutral-400"
      />
    </div>
  );
}

export { DEFAULT_COLOR_SCHEMES, type ColorScheme } from "../features/site/colorSchemes";

// ─────────────────────────────────────────────────────────────────────────────
// Section type registry — drives the Add Section library + per-type editor
// ─────────────────────────────────────────────────────────────────────────────

export type SectionTypeMeta = {
  type: string;
  label: string;
  description: string;
  category: "Layout" | "Media" | "Promo" | "Trust" | "Commerce" | "Engagement" | "Advanced";
  defaults: Record<string, any>;
  // List of block kinds (if any). e.g. Slideshow → "slide". Empty = atomic section.
  blockType?: string;
  blockDefaults?: Record<string, any>;
  blockLabel?: string;
  /** Where the section works best (Add section shows it, and offers to add it there). */
  bestIn?: { group?: "headerSections" | "globalSections" | "overlaySections"; template?: string; note: string };
};

export const SECTION_REGISTRY: SectionTypeMeta[] = [
  {
    type: "PageContentSection",
    label: "Page content",
    description: "This page's own title and text (written in Studio › Pages) — move it, restyle it, and add sections around it.",
    category: "Layout",
    defaults: { ownStyle: false, eyebrow: "PAGE", showEyebrow: false, showTitle: true, showBody: true, titleSize: "xl", bodySize: "md", align: "left", maxWidth: "header", showRule: true, ruleWidth: 2, ruleSpacing: 32, textMeasure: "readable" },
  },
  {
    type: "CompositionSection",
    label: "Flexible composition",
    description: "Nested groups, text, images and buttons with responsive grid placement.",
    category: "Layout",
    defaults: {
      title: "Flexible composition",
      gridColumns: 12,
      items: [
        { id: "composition-group", type: "group", title: "Content group", children: [
          { id: "composition-heading", type: "text", title: "A flexible story", body: "Build nested editorial layouts without a bespoke section." },
          { id: "composition-button", type: "button", text: "Explore", url: "#shop" },
        ] },
      ],
    },
    blockType: "composition",
    blockDefaults: { type: "text", title: "New block", body: "Add your content." },
    blockLabel: "Content block",
  },
  {
    type: "HeroSection",
    label: "Hero Banner",
    description: "Full-viewport hero with image, headline and CTA.",
    category: "Layout",
    defaults: {
      title: "NEW HERO",
      subtitle: "Something special",
      ctaText: "EXPLORE",
      overlayOpacity: 0.5,
      align: "center",
    },
  },
  {
    type: "ImageBannerSection",
    label: "Image Banner",
    description: "Responsive editorial image with overlaid copy and calls to action.",
    category: "Media",
    defaults: {
      eyebrow: "NEW COLLECTION",
      title: "Stories worth keeping",
      body: "Pair a strong image with a concise message and a clear next step.",
      imageUrl: "",
      mobileImageUrl: "",
      imageAlt: "",
      height: "large",
      contentPosition: "center-center",
      textAlign: "center",
      overlayOpacity: 0.4,
      ctaText: "Shop the collection",
      ctaUrl: "#shop",
      secondaryCtaText: "Our story",
      secondaryCtaUrl: "#about",
    },
  },
  {
    type: "FeatureGridSection",
    label: "Feature Grid",
    description: "Multi-column highlights with icons or short copy.",
    category: "Promo",
    defaults: {
      title: "FEATURE HIGHLIGHTS",
      columns: 3,
      items: [
        { title: "Free Shipping", description: "On eligible orders" },
        { title: "Curated Catalogue", description: "Handpicked editions" },
        { title: "Worldwide Delivery", description: "Ships internationally" },
      ],
    },
    blockType: "feature",
    blockDefaults: { title: "New feature", description: "Describe it." },
    blockLabel: "Feature",
  },
  {
    type: "TestimonialsSection",
    label: "Testimonials",
    description: "Quote cards with author + role.",
    category: "Trust",
    defaults: {
      title: "WHAT COLLECTORS SAY",
      items: [
        { quote: "Beautiful curation and packaging.", author: "A. Reader", role: "" },
        { quote: "Always find rare gems here.", author: "N. Collector", role: "" },
      ],
    },
    blockType: "testimonial",
    blockDefaults: { quote: "New testimonial", author: "Customer", role: "" },
    blockLabel: "Testimonial",
  },
  {
    type: "FAQSection",
    label: "FAQ",
    description: "Collapsible question and answer list.",
    category: "Trust",
    defaults: {
      title: "FREQUENTLY ASKED QUESTIONS",
      items: [
        { question: "Do you ship internationally?", answer: "Yes, we ship worldwide." },
        { question: "How long is delivery?", answer: "Usually 3–7 business days." },
      ],
    },
    blockType: "faq",
    blockDefaults: { question: "New question?", answer: "New answer." },
    blockLabel: "FAQ item",
  },
  {
    type: "NewsletterSection",
    label: "Newsletter",
    description: "Email capture with custom title and CTA.",
    category: "Engagement",
    defaults: {
      title: "STAY IN TOUCH",
      description: "Get our latest news.",
      placeholder: "email@example.com",
      buttonLabel: "JOIN",
    },
  },
  {
    type: "TextContentSection",
    label: "Text Content",
    description: "Headline plus paragraph copy.",
    category: "Layout",
    defaults: { title: "Our story", content: "Add your mission statement or store introduction here." },
  },
  {
    type: "ImageWithTextSection",
    label: "Image with Text",
    description: "Side-by-side image and rich copy with CTA.",
    category: "Layout",
    defaults: {
      eyebrow: "FEATURED",
      title: "About the collection",
      body: "Pair text with an image to give focus to your chosen product or collection.",
      ctaText: "Read more",
      ctaUrl: "#",
      layout: "image-left",
    },
  },
  {
    type: "RichTextSection",
    label: "Rich Text",
    description: "Free-form HTML / markdown content.",
    category: "Layout",
    defaults: {
      align: "center",
      html: "<h2>Talk to your customers</h2><p>Use this rich text section to share information about your store with your customers.</p>",
    },
  },
  {
    type: "MarqueeSection",
    label: "Scrolling Text",
    description: "Animated marquee strip of repeating text.",
    category: "Promo",
    defaults: {
      text: "Free shipping over $100 · New arrivals weekly · Independent & original",
      separator: "·",
      speed: 20,
      fontSize: 28,
      bold: true,
      uppercase: true,
      background: "",
      color: "",
    },
  },
  {
    type: "MulticolumnSection",
    label: "Multicolumn",
    description: "Reorderable columns with icon, image and link.",
    category: "Layout",
    defaults: {
      title: "Why choose us",
      columns: 3,
      items: [
        { title: "Quality", body: "Crafted with care.", imageUrl: "" },
        { title: "Service", body: "Always responsive.", imageUrl: "" },
        { title: "Story", body: "Independent and original.", imageUrl: "" },
      ],
    },
    blockType: "column",
    blockDefaults: { title: "Column heading", body: "Column body copy.", imageUrl: "", linkText: "", linkUrl: "" },
    blockLabel: "Column",
  },
  {
    type: "SlideshowSection",
    label: "Slideshow",
    description: "Image carousel with optional autoplay and CTAs per slide.",
    category: "Media",
    defaults: {
      autoplay: true,
      autoplaySpeed: 5000,
      slides: [
        { title: "Spring drop", subtitle: "Limited editions", ctaText: "Shop now", ctaUrl: "#", imageUrl: "" },
        { title: "Studio favourites", subtitle: "Hand selected", ctaText: "Explore", ctaUrl: "#", imageUrl: "" },
      ],
    },
    blockType: "slide",
    blockDefaults: {
      eyebrow: "",
      title: "New slide",
      subtitle: "",
      ctaText: "",
      ctaUrl: "#",
      imageUrl: "",
      overlayOpacity: 0.4,
      accentColor: "#ffffff",
    },
    blockLabel: "Slide",
  },
  {
    type: "VideoSection",
    label: "Video",
    description: "Embedded YouTube, Vimeo or self-hosted video.",
    category: "Media",
    defaults: { title: "Watch", videoUrl: "", posterUrl: "" },
  },
  {
    type: "LogoListSection",
    label: "Logo List",
    description: "Press, brands, or partner logos.",
    category: "Trust",
    defaults: {
      title: "AS SEEN IN",
      items: [
        { logoUrl: "", alt: "Brand A" },
        { logoUrl: "", alt: "Brand B" },
        { logoUrl: "", alt: "Brand C" },
        { logoUrl: "", alt: "Brand D" },
      ],
    },
    blockType: "logo",
    blockDefaults: { logoUrl: "", alt: "Logo" },
    blockLabel: "Logo",
  },
  {
    type: "CollapsibleSection",
    label: "Collapsible Rows",
    description: "Stacked accordion (size guide, shipping, etc.).",
    category: "Layout",
    defaults: {
      title: "Details",
      items: [
        { heading: "Materials", content: "<p>Describe materials.</p>" },
        { heading: "Shipping", content: "<p>Describe shipping.</p>" },
      ],
    },
    blockType: "row",
    blockDefaults: { heading: "New row", content: "" },
    blockLabel: "Row",
  },
  {
    type: "CollectionListSection",
    label: "Collection List",
    description: "Linked collection tiles with imagery.",
    category: "Commerce",
    defaults: {
      title: "Shop by collection",
      columns: 3,
      items: [
        { title: "Publications", subtitle: "", imageUrl: "", linkUrl: "/?catalog=true" },
        { title: "Prints", subtitle: "", imageUrl: "", linkUrl: "/?catalog=true" },
        { title: "Editions", subtitle: "", imageUrl: "", linkUrl: "/?catalog=true" },
      ],
    },
    blockType: "tile",
    blockDefaults: { title: "Collection", subtitle: "", imageUrl: "", linkUrl: "#" },
    blockLabel: "Tile",
  },
  {
    type: "FeaturedProductSection",
    label: "Featured Product",
    description: "Highlight one product with a buy CTA.",
    category: "Commerce",
    defaults: { eyebrow: "FEATURED", productSlug: "", ctaText: "View product", accentColor: "#A855F7" },
  },
  {
    type: "ProductGridHeaderSection",
    label: "Reference Product Grid",
    description: "Screenshot-style masthead plus configurable product grid.",
    category: "Commerce",
    defaults: {
      title: "Lyricalmyrical Books",
      navText: "Products · About · Project Submissions · Contact",
      cartLabel: "Cart",
      cartTotalText: "CA$130.00",
      columnsDesktop: 3,
      columnsMobile: 1,
      productLimit: 6,
      imageAspectRatio: "1:1",
      imageFit: "cover",
      focalX: 50,
      focalY: 50,
      gridGap: 18,
      rowGap: 54,
      headerRuleWidth: 4,
      mastheadDesktop: 58,
      mastheadMobile: 38,
      navGap: 40,
      backgroundColor: "#000000",
      textColor: "#ffffff",
      ruleColor: "#B1B1AA",
      titleTransform: "none",
      showPrices: true,
      showBadges: true,
      productSource: "all",
      manualSlugs: "",
    },
  },
  {
    type: "BlogPostsSection",
    label: "Blog Posts",
    description: "Editorial article cards for announcements, release notes, and journal entries.",
    category: "Engagement",
    defaults: {
      eyebrow: "JOURNAL",
      title: "Latest notes",
      subtitle: "Share publishing news, behind-the-scenes updates, and reader resources.",
      columns: 3,
      showDates: true,
      showExcerpts: true,
      ctaText: "Read more",
      accentColor: "#A855F7",
      items: [
        { title: "New seasonal catalogue", date: "2026-06-27", excerpt: "Introduce readers to a new collection, author interview, or shop announcement.", imageUrl: "", linkUrl: "/page/news" },
        { title: "Inside the archive", date: "2026-06-27", excerpt: "Use this card to explain your curation process and build trust before purchase.", imageUrl: "", linkUrl: "/page/news" },
        { title: "Shipping and care notes", date: "2026-06-27", excerpt: "Highlight helpful guidance such as packing, fulfillment windows, or edition care.", imageUrl: "", linkUrl: "/page/shipping" },
      ],
    },
    blockType: "article",
    blockDefaults: { title: "New article", date: "2026-06-27", excerpt: "Write a short article summary.", imageUrl: "", linkUrl: "/page/news" },
    blockLabel: "Article",
  },
  {
    type: "CountdownSection",
    label: "Countdown",
    description: "Timer to a future date with a CTA.",
    category: "Promo",
    defaults: {
      eyebrow: "LIMITED TIME",
      title: "Sale ends soon",
      subtitle: "",
      targetDate: "",
      ctaText: "Shop the sale",
      ctaUrl: "#",
      accentColor: "#A855F7",
    },
  },
  {
    type: "ContactFormSection",
    label: "Contact Form",
    description: "Name, email, message form — messages are emailed to you.",
    category: "Engagement",
    defaults: {
      title: "Get in touch",
      subtitle: "Send us a message and we'll reply soon.",
      buttonLabel: "Send message",
      showPhone: false,
    },
  },
  {
    type: "MapSection",
    label: "Map",
    description: "Embedded Google Map for an address.",
    category: "Engagement",
    defaults: { title: "Visit us", address: "Brooklyn, NY" },
  },
  {
    type: "GallerySection",
    label: "Image Gallery",
    description: "Lightboxable image grid.",
    category: "Media",
    defaults: {
      title: "Gallery",
      columns: 3,
      items: [
        { imageUrl: "", linkUrl: "" },
        { imageUrl: "", linkUrl: "" },
        { imageUrl: "", linkUrl: "" },
      ],
    },
    blockType: "image",
    blockDefaults: { imageUrl: "", linkUrl: "", alt: "" },
    blockLabel: "Image",
  },
  {
    type: "RowSection",
    label: "Row / Columns",
    description: "Pick a column split and fill each column with text, image, button or video.",
    category: "Layout",
    defaults: {
      title: "",
      layout: "50-50",
      gap: 48,
      verticalAlign: "center",
      items: [
        { kind: "text", title: "Tell your story", body: "Combine any blocks side by side — text, images, buttons or video.", buttonText: "", buttonUrl: "#" },
        { kind: "image", imageUrl: "" },
      ],
    },
    blockType: "column",
    blockDefaults: { kind: "text", title: "New column", body: "", imageUrl: "", buttonText: "", buttonUrl: "#", videoUrl: "" },
    blockLabel: "Column",
  },
  {
    type: "CustomHTMLSection",
    label: "Custom HTML / Liquid",
    description: "Drop in raw HTML, embeds or scripts.",
    category: "Advanced",
    defaults: { html: "<!-- Your custom HTML here -->", fullBleed: false },
  },
  {
    type: "VideoHeroSection",
    label: "Video Hero",
    description: "Full-viewport hero with background video and overlay text.",
    category: "Media",
    defaults: {
      videoUrl: "",
      overlayOpacity: 40,
      headline: "Our Story",
      subheadline: "Where passion meets craft",
      ctaText: "Shop Now",
      ctaLink: "/collections/all",
      textAlign: "center",
      minHeight: "80vh",
    },
  },
  {
    type: "StatsCounterSection",
    label: "Stats Counter",
    description: "Animated number counters for key metrics.",
    category: "Promo",
    defaults: {
      sectionTitle: "By The Numbers",
      backgroundColor: "transparent",
      items: [
        { value: "10,000+", label: "Happy Customers", prefix: "", suffix: "+", description: "and counting" },
        { value: "500", label: "Products", prefix: "", suffix: "+", description: "in our catalog" },
        { value: "50", label: "Countries", prefix: "", suffix: "", description: "worldwide shipping" },
      ],
    },
    blockType: "stat-item",
    blockDefaults: { value: "10,000+", label: "Happy Customers", prefix: "", suffix: "+", description: "and counting" },
    blockLabel: "Stat",
  },
  {
    type: "PricingTableSection",
    label: "Pricing Table",
    description: "Side-by-side plan comparison cards.",
    category: "Commerce",
    defaults: {
      sectionTitle: "Choose Your Plan",
      sectionSubtitle: "Simple, transparent pricing",
      highlightPlan: "Pro",
      items: [
        { planName: "Starter", price: "$29", period: "/month", description: "Perfect for getting started", features: "Feature one\nFeature two\nFeature three", ctaText: "Get Started", ctaLink: "/", isHighlighted: false },
        { planName: "Pro", price: "$79", period: "/month", description: "For growing businesses", features: "Everything in Starter\nAdvanced analytics\nPriority support", ctaText: "Get Started", ctaLink: "/", isHighlighted: true },
        { planName: "Enterprise", price: "$199", period: "/month", description: "For large teams", features: "Everything in Pro\nCustom integrations\nDedicated account manager", ctaText: "Contact Us", ctaLink: "/", isHighlighted: false },
      ],
    },
    blockType: "pricing-plan",
    blockDefaults: { planName: "Starter", price: "$29", period: "/month", description: "Perfect for getting started", features: "Feature one\nFeature two\nFeature three", ctaText: "Get Started", ctaLink: "/", isHighlighted: false },
    blockLabel: "Plan",
  },
  {
    type: "ProductCoverCarouselSection",
    label: "Cover Carousel Hero",
    description: "Full-height hero that auto-cycles through your book covers with a serif wordmark overlay.",
    category: "Commerce",
    defaults: {
      title: "Lyricalmyrical Books",
      tagline: "An independent publishing house based in Toronto, specializing in contemporary photography and art books.",
      titleItalic: true,
      productSource: "all",
      manualSlugs: "",
      productLimit: 12,
      autoplayMs: 4000,
      showDots: true,
      scrimOpacity: 0.55,
      colorOverlay: "#A855F7",
      colorOverlayOpacity: 0.3,
      colorOverlayBlend: true,
      grainOpacity: 0.45,
      height: "punk",
      ctaText: "",
      ctaUrl: "",
    },
  },
  {
    type: "ProductShowcaseGridSection",
    label: "Showcase Product Grid",
    description: "Editorial book grid with category tags, quick-add buttons and a film-grain cover treatment.",
    category: "Commerce",
    defaults: {
      title: "Recent Releases",
      eyebrow: "",
      productSource: "all",
      manualSlugs: "",
      productLimit: 12,
      columnsDesktop: 3,
      columnsMobile: 1,
      imageAspectRatio: "4:5",
      showCategoryTag: true,
      showQuickAdd: true,
      showFormatLine: true,
      showPrices: true,
      overlayColor: "#A855F7",
      overlayOpacity: 0.22,
      overlayBlend: true,
      grainOpacity: 0.35,
      tagBg: "rgba(0,0,0,0.7)",
      tagText: "",
    },
  },
  {
    type: "StaffNotesTableSection",
    label: "Staff Notes Table",
    description: "Editorial table of books with a hand-written note per title. Rows link to the product page.",
    category: "Commerce",
    defaults: {
      title: "Staff Notes",
      backgroundColor: "",
      showCategory: true,
      showFormat: true,
      colTitleLabel: "TITLE",
      colCategoryLabel: "CATEGORY",
      colFormatLabel: "FORMAT",
      colNoteLabel: "NOTE",
      fallbackLimit: 8,
      items: [],
    },
    blockType: "note-row",
    blockDefaults: { slug: "", note: "" },
    blockLabel: "Book note",
  },
  {
    type: "EphemeraRowSection",
    label: "Ephemera Row",
    description: "Decorative row of publishing objects — book spine, film negative, wax seal, ribbon, ISBN sticker.",
    category: "Layout",
    defaults: {
      align: "center",
      gap: 24,
      items: [
        { kind: "spine", label: "LYRICALMYRICAL", color: "#A855F7", rotation: -2 },
        { kind: "negative", label: "", color: "#d97706", rotation: 1 },
        { kind: "seal", label: "LM", color: "#9a2c3c", rotation: -3 },
        { kind: "ribbon", label: "", color: "#A855F7", rotation: 2 },
        { kind: "sticker", label: "ISBN 978-1-00-000000-0", color: "#f3f1ee", rotation: -4 },
      ],
    },
    blockType: "object",
    blockDefaults: { kind: "spine", label: "", color: "#A855F7", rotation: -3 },
    blockLabel: "Ephemera object",
  },
  // ── Studio 2.6 section library ──
  {
    type: "FeaturedCollectionSection",
    label: "Featured collection",
    description: "Books from one shop category with a “View all” link to that collection.",
    category: "Commerce",
    defaults: { eyebrow: "", title: "From the collection", productCategory: "", productSort: "", productLimit: 4, columnsDesktop: 4, columnsMobile: 2, showPrices: true, viewAllText: "View all", align: "left" },
  },
  {
    type: "BookSpotlightSection",
    label: "Book spotlight",
    description: "One book, large: cover, a line of praise, price and a button. On a book page it can show that book.",
    category: "Commerce",
    defaults: { eyebrow: "Spotlight", productSlug: "", quote: "", quoteSource: "", showDescription: true, showPrice: true, ctaText: "View the book", imagePosition: "left" },
  },
  {
    type: "PraiseQuotesSection",
    label: "Praise & press quotes",
    description: "Reviews and blurbs from the press or other writers, each with its source.",
    category: "Trust",
    defaults: { eyebrow: "", title: "Praise", layout: "stacked", quoteSize: "lg", align: "center", items: [] },
    blockType: "quote",
    blockDefaults: { quote: "A quote about the book.", source: "Name", publication: "", linkUrl: "" },
    blockLabel: "Quote",
  },
  {
    type: "ImageCollageSection",
    label: "Image collage",
    description: "Three to five pictures arranged as a mosaic, a staggered row or a strip, with optional captions.",
    category: "Media",
    defaults: { title: "", layout: "mosaic", gap: 12, showCaptions: true, items: [] },
    blockType: "image",
    blockDefaults: { imageUrl: "", alt: "", caption: "", linkUrl: "" },
    blockLabel: "Picture",
  },
  {
    type: "PromoStripSection",
    label: "Promo strip",
    description: "A slim line of text with a link — made for the space under the header on every page.",
    category: "Promo",
    defaults: { text: "New releases every month", linkText: "Shop now", linkUrl: "", align: "center", size: "sm" },
    bestIn: { group: "headerSections", note: "Best under the header (every page)" },
  },
  {
    type: "NewsletterPopupSection",
    label: "Newsletter sign-up (pop-up)",
    description: "A picture, a short invitation and an email box that really signs people up — made for the Pop-up group.",
    category: "Engagement",
    defaults: { imageUrl: "", imageAlt: "", eyebrow: "Newsletter", title: "Stay in touch", description: "New books, events and the occasional discount.", placeholder: "Your email", buttonLabel: "Sign up", successMessage: "Almost there — check your inbox and confirm your email to join the list.", errorMessage: "Please check your email address and try again.", smallPrint: "No spam. Unsubscribe any time." },
    bestIn: { group: "overlaySections", note: "Best in the Pop-up group" },
  },
  {
    type: "StickyAddToBagSection",
    label: "Sticky add-to-bag bar",
    description: "On a book page, a bar with the book and an Add to bag button that stays at the bottom of the screen once the buy box scrolls away.",
    category: "Commerce",
    defaults: { ctaText: "Add to bag", optionsText: "Choose options", soldOutText: "Sold out", addedText: "Added to your bag", showPrice: true, showOnPhonesOnly: false },
    bestIn: { template: "productPage", note: "Book pages only" },
  },
];

export function getSectionMeta(type: string): SectionTypeMeta | undefined {
  return SECTION_REGISTRY.find((s) => s.type === type);
}

// ─────────────────────────────────────────────────────────────────────────────
// Block fields — the editable fields of blocks in sections with `items` / `slides` arrays
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Picker kinds (Studio 2.0 › 2.3, `studio/StudioPickers.tsx`). Each stores the same string a
 * plain text field held before, so saved designs render unchanged:
 * `link` an href ("/page/about", "https://…"), `book` a storefront book slug, `books` comma-separated
 * slugs, `category` a shop category name, `page` a custom page slug, `video` a video URL,
 * `font` a Google Fonts family. `empty` = what a blank value means (shown in the picker).
 */
export type PickerFieldSchema = { key: string; label: string; kind: PickerKind; empty?: string };

/** A row field of a `list` block field; `link` rows get the link picker. */
type ListItemField = { key: string; label: string; kind?: "text" | "link" };

type BlockField =
  | { key: string; label: string; kind: "text" }
  | { key: string; label: string; kind: "textarea"; rows?: number }
  | { key: string; label: string; kind: "image" }
  | { key: string; label: string; kind: "html" }
  | { key: string; label: string; kind: "color" }
  | { key: string; label: string; kind: "number"; min?: number; max?: number; step?: number }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: "list"; itemLabel?: string; itemFields?: ListItemField[] }
  | PickerFieldSchema;

const BLOCK_FIELDS: Record<string, BlockField[]> = {
  CompositionSection: [
    { key: "type", label: "Block type", kind: "select", options: [
      { value: "group", label: "Group / container" }, { value: "text", label: "Text" },
      { value: "image", label: "Image" }, { value: "button", label: "Button" },
    ] },
    { key: "title", label: "Heading", kind: "text" },
    { key: "body", label: "Body", kind: "textarea", rows: 4 },
    { key: "imageUrl", label: "Image", kind: "image" },
    { key: "alt", label: "Image description", kind: "text" },
    { key: "text", label: "Button label", kind: "text" },
    { key: "url", label: "Link", kind: "link" },
  ],
  HeroSection: [],
  FeatureGridSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea", rows: 2 },
    { key: "icon", label: "Icon (emoji or symbol)", kind: "text" },
  ],
  TestimonialsSection: [
    { key: "quote", label: "Quote", kind: "textarea", rows: 3 },
    { key: "author", label: "Author", kind: "text" },
    { key: "role", label: "Role / company", kind: "text" },
  ],
  FAQSection: [
    { key: "question", label: "Question", kind: "text" },
    { key: "answer", label: "Answer", kind: "textarea", rows: 3 },
  ],
  MulticolumnSection: [
    { key: "imageUrl", label: "Image", kind: "image" },
    { key: "title", label: "Title", kind: "text" },
    { key: "body", label: "Body", kind: "textarea", rows: 3 },
    { key: "linkText", label: "Link label", kind: "text" },
    { key: "linkUrl", label: "Link", kind: "link" },
    { key: "links", label: "Links", kind: "list", itemLabel: "Link", itemFields: [{ key: "text", label: "Label" }, { key: "url", label: "Link", kind: "link" }] },
  ],
  SlideshowSection: [
    { key: "eyebrow", label: "Eyebrow", kind: "text" },
    { key: "title", label: "Headline", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "text" },
    { key: "ctaText", label: "CTA label", kind: "text" },
    { key: "ctaUrl", label: "CTA link", kind: "link" },
    { key: "imageUrl", label: "Background image", kind: "image" },
    { key: "overlayOpacity", label: "Overlay (0–1)", kind: "number", min: 0, max: 1, step: 0.05 },
    { key: "accentColor", label: "Accent", kind: "color" },
  ],
  LogoListSection: [
    { key: "logoUrl", label: "Logo image", kind: "image" },
    { key: "alt", label: "Alt text / fallback", kind: "text" },
  ],
  CollapsibleSection: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "content", label: "Content (HTML)", kind: "html" },
  ],
  CollectionListSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "text" },
    { key: "imageUrl", label: "Image", kind: "image" },
    { key: "linkUrl", label: "Link", kind: "link" },
  ],

  BlogPostsSection: [
    { key: "imageUrl", label: "Card image", kind: "image" },
    { key: "title", label: "Title", kind: "text" },
    { key: "date", label: "Date", kind: "text" },
    { key: "excerpt", label: "Excerpt", kind: "textarea", rows: 3 },
    { key: "linkUrl", label: "Link", kind: "link" },
    { key: "tag", label: "Tag / category", kind: "text" },
  ],
  GallerySection: [
    { key: "imageUrl", label: "Image", kind: "image" },
    { key: "linkUrl", label: "Link", kind: "link" },
    { key: "alt", label: "Alt text", kind: "text" },
  ],
  RowSection: [
    {
      key: "kind",
      label: "Block type",
      kind: "select",
      options: [
        { value: "text", label: "Text" },
        { value: "image", label: "Image" },
        { value: "button", label: "Button" },
        { value: "video", label: "Video" },
      ],
    },
    { key: "title", label: "Title (text blocks)", kind: "text" },
    { key: "body", label: "Body (text blocks)", kind: "textarea", rows: 3 },
    { key: "imageUrl", label: "Image (image blocks)", kind: "image" },
    { key: "buttonText", label: "Button label", kind: "text" },
    { key: "buttonUrl", label: "Button link", kind: "link" },
    { key: "buttons", label: "Buttons", kind: "list", itemLabel: "Button", itemFields: [{ key: "text", label: "Label" }, { key: "url", label: "Link", kind: "link" }] },
    { key: "videoUrl", label: "Video (video blocks)", kind: "video" },
    { key: "accentColor", label: "Accent", kind: "color" },
  ],
  StatsCounterSection: [
    { key: "value", label: "Value", kind: "text" },
    { key: "label", label: "Label", kind: "text" },
    { key: "prefix", label: "Prefix", kind: "text" },
    { key: "suffix", label: "Suffix", kind: "text" },
    { key: "description", label: "Description", kind: "text" },
  ],
  PricingTableSection: [
    { key: "planName", label: "Plan name", kind: "text" },
    { key: "price", label: "Price", kind: "text" },
    { key: "period", label: "Period", kind: "text" },
    { key: "description", label: "Description", kind: "text" },
    { key: "features", label: "Features", kind: "list", itemLabel: "Feature" },
    { key: "ctaText", label: "CTA label", kind: "text" },
    { key: "ctaLink", label: "CTA link", kind: "link" },
    { key: "isHighlighted", label: "Highlight this plan", kind: "select", options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }] },
  ],
  StaffNotesTableSection: [
    { key: "slug", label: "Book", kind: "book" },
    { key: "note", label: "Staff note", kind: "textarea", rows: 2 },
  ],
  EphemeraRowSection: [
    {
      key: "kind",
      label: "Object",
      kind: "select",
      options: [
        { value: "spine", label: "Book spine" },
        { value: "negative", label: "Film negative" },
        { value: "seal", label: "Wax seal" },
        { value: "ribbon", label: "Ribbon bookmark" },
        { value: "sticker", label: "ISBN sticker" },
      ],
    },
    { key: "label", label: "Label text", kind: "text" },
    { key: "color", label: "Color", kind: "color" },
    { key: "rotation", label: "Rotation (deg)", kind: "number", min: -12, max: 12, step: 1 },
  ],
  PraiseQuotesSection: [
    { key: "quote", label: "Quote", kind: "textarea", rows: 3 },
    { key: "source", label: "Who said it", kind: "text" },
    { key: "publication", label: "Publication or title (optional)", kind: "text" },
    { key: "linkUrl", label: "Link to the review (optional)", kind: "link" },
  ],
  ImageCollageSection: [
    { key: "imageUrl", label: "Picture", kind: "image" },
    { key: "alt", label: "Picture description (for screen readers)", kind: "text" },
    { key: "caption", label: "Caption (optional)", kind: "text" },
    { key: "linkUrl", label: "Link (optional)", kind: "link" },
  ],
};

export function getBlockFields(sectionType: string): BlockField[] {
  return BLOCK_FIELDS[sectionType] || [];
}

// Keys on settings where blocks live, per section type
const BLOCKS_KEY: Record<string, string> = {
  SlideshowSection: "slides",
  // everything else uses "items"
};

export function getBlocksKey(sectionType: string): string {
  return BLOCKS_KEY[sectionType] || "items";
}

// ─────────────────────────────────────────────────────────────────────────────
// Image style controls — focal point, object-fit, filter preset, color overlay,
// hover zoom. Shared by both the section-level and block-level `kind: "image"`
// field renderers below. Reads/writes companion keys named `${fieldKey}__suffix`
// (see sectionStyleHelpers.ts) on whatever `record` object the caller owns
// (section settings or a single block) via `onPatch`, leaving the field's own
// URL string value/onChange untouched.
// ─────────────────────────────────────────────────────────────────────────────

function ImageStyleControls({
  fieldKey,
  record,
  onPatch,
  imageUrl,
}: {
  fieldKey: string;
  record: any;
  onPatch: (patch: Record<string, any>) => void;
  imageUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);

  const k = (suffix: string) => `${fieldKey}__${suffix}`;
  const fit = record?.[k("fit")] || "cover";
  const focalX = record?.[k("focalX")] ?? 50;
  const focalY = record?.[k("focalY")] ?? 50;
  const filter = record?.[k("filter")] || "none";
  const overlayColor = record?.[k("overlayColor")] || "";
  const overlayOpacity = record?.[k("overlayOpacity")] ?? 0;
  const hoverZoom = !!record?.[k("hoverZoom")];

  const setFocalFromEvent = (clientX: number, clientY: number) => {
    const el = dragRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    onPatch({ [k("focalX")]: Math.round(x), [k("focalY")]: Math.round(y) });
  };

  const handleDotMouseDown = (e: any) => {
    e.preventDefault();
    setFocalFromEvent(e.clientX, e.clientY);
    const handleMove = (ev: MouseEvent) => setFocalFromEvent(ev.clientX, ev.clientY);
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-neutral-50 hover:bg-neutral-100 transition-colors"
      >
        <span className="text-[9px] font-black tracking-[0.3em] text-neutral-500 uppercase">Image style</span>
        <ChevronDown size={12} className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-3 space-y-3 bg-white">
          {/* Focal point */}
          <div>
            <label className="text-[9px] font-black tracking-widest text-neutral-400 uppercase block mb-1">
              Focal point
            </label>
            {imageUrl ? (
              <div
                ref={dragRef}
                onMouseDown={handleDotMouseDown}
                className="relative aspect-video w-full rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100 cursor-crosshair select-none"
              >
                <img src={imageUrl} className="w-full h-full object-cover pointer-events-none" alt="" draggable={false} />
                <div
                  className="absolute w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${focalX}%`, top: `${focalY}%` }}
                />
              </div>
            ) : (
              <p className="text-[10px] text-neutral-400">Add an image above to set a focal point.</p>
            )}
            <p className="text-[9px] text-neutral-400 mt-1">{Math.round(focalX)}%, {Math.round(focalY)}%</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black tracking-widest text-neutral-400 uppercase block mb-1">Object fit</label>
              <select
                value={fit}
                onChange={(e) => onPatch({ [k("fit")]: e.target.value })}
                className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black tracking-widest text-neutral-400 uppercase block mb-1">Filter</label>
              <select
                value={filter}
                onChange={(e) => onPatch({ [k("filter")]: e.target.value === "none" ? undefined : e.target.value })}
                className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
              >
                {IMAGE_FILTER_PRESETS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black tracking-widest text-neutral-400 uppercase block mb-1">Color overlay</label>
            <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-2 py-1.5 mb-2">
              <div className="w-5 h-5 rounded-md border border-neutral-200 relative overflow-hidden flex-shrink-0" style={{ background: overlayColor || "transparent" }}>
                <input
                  type="color"
                  value={overlayColor || "#000000"}
                  onChange={(e) => onPatch({ [k("overlayColor")]: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer scale-150"
                />
              </div>
              <input
                value={overlayColor}
                onChange={(e) => onPatch({ [k("overlayColor")]: e.target.value || undefined })}
                placeholder="none"
                className="flex-1 min-w-0 bg-transparent outline-none text-[10px] font-bold uppercase"
              />
              {overlayColor && (
                <button type="button" aria-label="Clear overlay colour" title="Clear overlay colour" onClick={() => onPatch({ [k("overlayColor")]: undefined })} className="text-[9px] text-neutral-400 hover:text-red-400"><span aria-hidden="true">✕</span></button>
              )}
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">Overlay opacity</span>
              <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-lg">{overlayOpacity}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={overlayOpacity}
              onChange={(e) => onPatch({ [k("overlayOpacity")]: Number(e.target.value) })}
              className="w-full accent-blue-600 h-1.5 bg-neutral-200 rounded-full appearance-none cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl px-3 py-2">
            <span className="text-[11px] font-bold text-neutral-700">Hover zoom</span>
            <button
              type="button"
              role="switch"
              aria-checked={!!hoverZoom}
              aria-label="Hover zoom"
              onClick={() => onPatch({ [k("hoverZoom")]: !hoverZoom })}
              className={`w-10 h-5 rounded-full relative transition-all ${hoverZoom ? "bg-blue-600" : "bg-neutral-200"}`}
            >
              <span className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${hoverZoom ? "left-6" : "left-1"}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Normalizes a `kind: "list"` field's stored value. Legacy data (saved before
// this field became a list) is a single "\n"-joined string — fall back to
// splitting it so old content keeps rendering/editing correctly. New data is
// always written as a real array going forward.
//
// When `itemFields` is omitted, behaves exactly as before: returns a plain
// string[] (e.g. pricing table "Features").
//
// When `itemFields` is provided, the field is "structured" — each row is a
// Record<string, string> with one key per itemFields entry. There is no
// meaningful migration from a flat string[]/legacy string for structured
// fields (no prior structured data exists to migrate from), so anything that
// isn't already an array of objects just normalizes to an empty array. Any
// missing keys on an existing row are defensively filled in as "".
function normalizeListFieldValue(value: any): string[];
function normalizeListFieldValue(value: any, itemFields: { key: string; label: string }[]): Record<string, string>[];
function normalizeListFieldValue(
  value: any,
  itemFields?: { key: string; label: string }[]
): string[] | Record<string, string>[] {
  if (itemFields && itemFields.length > 0) {
    if (!Array.isArray(value)) return [];
    return value.map((row) => {
      const safeRow = row && typeof row === "object" ? row : {};
      const out: Record<string, string> = {};
      for (const f of itemFields) out[f.key] = safeRow[f.key] ?? "";
      return out;
    });
  }
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Generic nested add/remove/reorder sub-list editor for `kind: "list"` block
 * fields. Reuses the same SortableList/SortableRow primitives as the outer
 * block list above, so drag-to-reorder behaves identically (pointer +
 * keyboard, 5px activation).
 *
 * Two modes, selected by whether `field.itemFields` is set:
 *  - Plain mode (no `itemFields`, e.g. pricing table "Features"): each row is
 *    a single unlabeled text input, value is a plain string[]. Unchanged from
 *    before this field gained structured-row support.
 *  - Structured mode (`itemFields` set, e.g. Multicolumn "Links"): each row
 *    renders one labeled input per itemFields entry, value is a
 *    Record<string, string>[].
 */
export function BlockListFieldEditor({
  field,
  value,
  onChange,
}: {
  field: BlockField & { kind: "list" };
  value: any;
  onChange: (v: any) => void;
}) {
  const itemLabel = field.itemLabel || "item";
  const itemFields = field.itemFields;

  if (itemFields && itemFields.length > 0) {
    const items = normalizeListFieldValue(value, itemFields);
    const hasLink = itemFields.some((f) => f.kind === "link");

    const updateItem = (idx: number, key: string, text: string) => {
      onChange(items.map((it, i) => (i === idx ? { ...it, [key]: text } : it)));
    };

    const removeItem = (idx: number) => {
      onChange(items.filter((_, i) => i !== idx));
    };

    const addItem = () => {
      const blank: Record<string, string> = {};
      for (const f of itemFields) blank[f.key] = "";
      onChange([...items, blank]);
    };

    return (
      <div>
        <label className="text-[9px] font-black tracking-[0.25em] text-neutral-400 uppercase block mb-1.5">
          {field.label}
        </label>

        <SortableList
          items={items}
          getId={(_item, idx) => `${field.key}-${idx}`}
          className="space-y-1.5"
          onReorder={(next) => onChange(next)}
        >
          {items.map((item, idx) => {
            const id = `${field.key}-${idx}`;
            return (
              <SortableRow
                key={id}
                id={id}
                className="flex items-center gap-1.5"
              >
                {({ handleProps }) => (
                  <>
                    <span
                      {...handleProps}
                      className="text-neutral-300 flex-shrink-0 cursor-grab active:cursor-grabbing"
                    >
                      <GripVertical size={14} />
                    </span>
                    <div className={`flex-1 min-w-0 flex gap-1.5 ${hasLink ? "flex-col items-stretch" : "items-center"}`}>
                      {itemFields.map((f) => f.kind === "link" ? (
                        <LinkPicker
                          key={f.key}
                          label={`${itemLabel} ${idx + 1} · ${f.label}`}
                          value={item[f.key] ?? ""}
                          onChange={(v) => updateItem(idx, f.key, v)}
                        />
                      ) : (
                        <input
                          key={f.key}
                          aria-label={`${itemLabel} ${idx + 1} · ${f.label}`}
                          value={item[f.key] ?? ""}
                          onChange={(e) => updateItem(idx, f.key, e.target.value)}
                          placeholder={f.label}
                          className="flex-1 min-w-0 bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 flex-shrink-0"
                      title={`Remove ${itemLabel.toLowerCase()}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </SortableRow>
            );
          })}
        </SortableList>

        <button
          type="button"
          onClick={addItem}
          className="w-full mt-1.5 flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-400 text-[10px] font-black tracking-[0.2em] uppercase text-blue-600"
        >
          <Plus size={12} strokeWidth={3} />
          Add {itemLabel.toLowerCase()}
        </button>
      </div>
    );
  }

  const items = normalizeListFieldValue(value);

  const updateItem = (idx: number, text: string) => {
    onChange(items.map((it, i) => (i === idx ? text : it)));
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    onChange([...items, ""]);
  };

  return (
    <div>
      <label className="text-[9px] font-black tracking-[0.25em] text-neutral-400 uppercase block mb-1.5">
        {field.label}
      </label>

      <SortableList
        items={items}
        getId={(_item, idx) => `${field.key}-${idx}`}
        className="space-y-1.5"
        onReorder={(next) => onChange(next)}
      >
        {items.map((item, idx) => {
          const id = `${field.key}-${idx}`;
          return (
            <SortableRow
              key={id}
              id={id}
              className="flex items-center gap-1.5"
            >
              {({ handleProps }) => (
                <>
                  <span
                    {...handleProps}
                    className="text-neutral-300 flex-shrink-0 cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical size={14} />
                  </span>
                  <input
                    value={item}
                    onChange={(e) => updateItem(idx, e.target.value)}
                    placeholder={itemLabel}
                    className="flex-1 min-w-0 bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 flex-shrink-0"
                    title={`Remove ${itemLabel.toLowerCase()}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </SortableRow>
          );
        })}
      </SortableList>

      <button
        type="button"
        onClick={addItem}
        className="w-full mt-1.5 flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-400 text-[10px] font-black tracking-[0.2em] uppercase text-blue-600"
      >
        <Plus size={12} strokeWidth={3} />
        Add {itemLabel.toLowerCase()}
      </button>
    </div>
  );
}

export function BlockFieldEditor({
  field,
  value,
  onChange,
  uploadFile,
  block,
  onPatchBlock,
}: {
  field: BlockField;
  value: any;
  onChange: (v: any) => void;
  uploadFile?: (file: File) => Promise<string>;
  // Full block record + a sibling-key patcher, used only by `kind: "image"` for
  // the companion `${field.key}__suffix` image-style keys (focal point,
  // fit, filter, overlay, hover zoom). Optional — omitting them just hides
  // the "Image style" panel, the plain URL field still works.
  block?: any;
  onPatchBlock?: (patch: Record<string, any>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const media = useMediaPicker();

  const labelEl = (
    <label className="text-[9px] font-black tracking-[0.25em] text-neutral-400 uppercase block mb-1.5">
      {field.label}
    </label>
  );

  if (isPickerKind(field.kind)) {
    const picker = field as PickerFieldSchema;
    return <PickerField kind={picker.kind} label={picker.label} value={value} onChange={onChange} emptyText={picker.empty} />;
  }

  if (field.kind === "text") {
    return (
      <div>
        {labelEl}
        <input aria-label={field.label}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
        />
      </div>
    );
  }

  if (field.kind === "textarea") {
    return (
      <div>
        {labelEl}
        <textarea aria-label={field.label}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={field.rows || 3}
          className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400 resize-none"
        />
      </div>
    );
  }

  if (field.kind === "html") {
    return (
      <div>
        {labelEl}
        <textarea aria-label={field.label}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400 resize-none font-mono"
          placeholder="<p>Your HTML here</p>"
        />
      </div>
    );
  }

  if (field.kind === "color") {
    return (
      <div>
        {labelEl}
        <ColorField label={field.label} value={value} onChange={onChange} tidy />
      </div>
    );
  }

  if (field.kind === "number") {
    return (
      <div>
        {labelEl}
        <input aria-label={field.label}
          type="number"
          value={value ?? ""}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
        />
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <div>
        {labelEl}
        <select aria-label={field.label}
          value={selectValue(field.options, value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
        >
          {needsDefaultOption(field.options, value) && <option value="" disabled>{UNSET_OPTION_LABEL}</option>}
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // image
  return (
    <div>
      {labelEl}
      {value && (
        <div className="aspect-video w-full mb-2 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100">
          <img src={value} className="w-full h-full object-cover" alt="" />
        </div>
      )}
      <input aria-label={field.label}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://… or upload"
        className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400 mb-1.5"
      />
      <input aria-label={field.label}
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || (!uploadFile && !media)) return;
          setUploading(true);
          setUploadError("");
          try {
            await uploadIntoField(media, f, { fieldKey: field.key, record: block, onPatch: onPatchBlock, onChange, uploadFile });
          } catch (err) {
            setUploadError(uploadErrorMessage(err));
          } finally {
            setUploading(false);
          }
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        className="w-full text-[10px] font-bold uppercase tracking-widest py-2 border border-neutral-200 rounded-xl hover:bg-neutral-50 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
      >
        <ImageIcon size={11} />
        {uploading ? "Uploading…" : "Upload image"}
      </button>
      <MediaLibraryButton fieldKey={field.key} label={field.label} record={block} onPatch={onPatchBlock} onChange={onChange} />
      {uploadError && <p role="alert" className="studio-upload-error mt-1 text-[11px]">{uploadError}</p>}
      {onPatchBlock && (
        <div className="mt-2">
          <ImageStyleControls fieldKey={field.key} record={block} onPatch={onPatchBlock} imageUrl={value} />
        </div>
      )}
    </div>
  );
}

// Per-section look & layout settings live in studio/sectionStyleSchema.ts (rendered by StudioInspector).


// ─────────────────────────────────────────────────────────────────────────────
// Universal section editor — drives editing for every type via field schema
// ─────────────────────────────────────────────────────────────────────────────

type SectionFieldSchema =
  | { key: string; label: string; kind: "text" }
  | { key: string; label: string; kind: "textarea"; rows?: number }
  | { key: string; label: string; kind: "image" }
  | { key: string; label: string; kind: "html" }
  | { key: string; label: string; kind: "richtext" }
  | { key: string; label: string; kind: "color" }
  | { key: string; label: string; kind: "number"; min?: number; max?: number; step?: number; suffix?: string }
  | { key: string; label: string; kind: "range"; min: number; max: number; step?: number; suffix?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] }
  /** `defaultValue: true` = the storefront treats an unset value as on, so the switch shows on. */
  | { key: string; label: string; kind: "toggle"; defaultValue?: boolean }
  | { key: string; label: string; kind: "date" }
  | PickerFieldSchema;

/** Which books a catalog section shows (`features/site/merchandising.ts` selectBooks). Missing = "all". */
const BOOK_SOURCE_OPTIONS = [
  { value: "all", label: "All published books" },
  { value: "featured", label: "Featured books" },
  { value: "manual", label: "Books I pick" },
  { value: "category", label: "Books in a shop category" },
  { value: "newest", label: "Newest books" },
  { value: "onSale", label: "Books on sale" },
  { value: "preorder", label: "Pre-orders" },
];
const BOOK_SORT_OPTIONS = [
  { value: "", label: "Shop order (as in the catalog)" },
  { value: "picked", label: "The order I picked them" },
  { value: "newest", label: "Newest first" },
  { value: "title", label: "Title A–Z" },
  { value: "priceLow", label: "Price, low to high" },
  { value: "priceHigh", label: "Price, high to low" },
];
/** The shared "Which books" fields of every catalog section (same keys as before, plus category and sort). */
const bookSourceFields = (sourceLabel: string): SectionFieldSchema[] => [
  { key: "productSource", label: sourceLabel, kind: "select", options: BOOK_SOURCE_OPTIONS },
  { key: "manualSlugs", label: "Books to show (for “Books I pick”)", kind: "books" },
  { key: "productCategory", label: "Shop category (for “Books in a shop category”)", kind: "category", empty: "Blank = every book" },
  { key: "productSort", label: "Order", kind: "select", options: BOOK_SORT_OPTIONS },
];

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const SECTION_FIELDS: Record<string, SectionFieldSchema[]> = {
  PageContentSection: [
    { key: "ownStyle", label: "Style this page on its own (off = match every page via Style › Custom pages)", kind: "toggle" },
    { key: "showEyebrow", label: "Show small label above title", kind: "toggle", defaultValue: true },
    { key: "eyebrow", label: "Small label", kind: "text" },
    { key: "showTitle", label: "Show page title", kind: "toggle", defaultValue: true },
    { key: "titleOverride", label: "Title (blank = the page's name)", kind: "text" },
    { key: "titleSize", label: "Title size", kind: "select", options: [{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }, { value: "xl", label: "Extra large" }] },
    { key: "titleUppercase", label: "Uppercase title", kind: "toggle" },
    { key: "showBody", label: "Show page text", kind: "toggle", defaultValue: true },
    { key: "bodyOverride", label: "Text (blank = the text from Pages)", kind: "textarea", rows: 6 },
    { key: "bodySize", label: "Text size", kind: "select", options: [{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }] },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "maxWidth", label: "Column width", kind: "select", options: [{ value: "header", label: "Line up with header" }, { value: "narrow", label: "Narrow" }, { value: "normal", label: "Medium" }, { value: "wide", label: "Wide" }, { value: "full", label: "Full width" }] },
    { key: "textColor", label: "Text color", kind: "color" },
    { key: "topSpacing", label: "Space above the title", kind: "range", min: 0, max: 160, step: 4, suffix: "px" },
    { key: "titleFont", label: "Title font (Google Fonts)", kind: "font", empty: "Same as heading font" },
    { key: "titleSizePx", label: "Title size · desktop (0 = use Title size)", kind: "range", min: 0, max: 200, step: 2, suffix: "px" },
    { key: "titleSizePxMobile", label: "Title size · phone (0 = same as desktop)", kind: "range", min: 0, max: 120, step: 2, suffix: "px" },
    { key: "titleWeight", label: "Title weight (blank = extra bold)", kind: "select", options: [{ value: "", label: "Automatic" }, ...["300", "400", "500", "600", "700", "800", "900"].map((w) => ({ value: w, label: w }))] },
    { key: "showRule", label: "Line under the title", kind: "toggle" },
    { key: "ruleColor", label: "Line colour", kind: "color" },
    { key: "ruleWidth", label: "Line thickness", kind: "range", min: 0, max: 8, step: 1, suffix: "px" },
    { key: "ruleSpacing", label: "Space above and below the line", kind: "range", min: 0, max: 96, step: 2, suffix: "px" },
    { key: "textMeasure", label: "Text width (line length)", kind: "select", options: [{ value: "readable", label: "Readable (about 62 characters)" }, { value: "comfortable", label: "Comfortable (about 75 characters)" }, { value: "wide", label: "Wide (about 90 characters)" }, { value: "full", label: "Full width (as wide as the column)" }] },
    { key: "textWidthPx", label: "Exact text width (0 = use Text width above)", kind: "range", min: 0, max: 1600, step: 20, suffix: "px" },
  ],
  CompositionSection: [
    { key: "title", label: "Section heading", kind: "text" },
    { key: "gridColumns", label: "Desktop grid columns", kind: "range", min: 1, max: 24, step: 1 },
    { key: "gridGap", label: "Grid gap", kind: "range", min: 0, max: 80, step: 2, suffix: "px" },
  ],
  HeroSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Headline", kind: "text" },
    { key: "titleItalic", label: "Italic headline", kind: "toggle" },
    { key: "subtitle", label: "Subtitle", kind: "text" },
    { key: "imageUrl", label: "Background image", kind: "image" },
    { key: "sideImageUrl", label: "Floating cover card (optional)", kind: "image" },
    { key: "overlayOpacity", label: "Overlay darkness", kind: "range", min: 0, max: 1, step: 0.05 },
    { key: "accentColor", label: "Accent color", kind: "color" },
    { key: "ctaText", label: "CTA label", kind: "text" },
    { key: "ctaUrl", label: "CTA link (optional)", kind: "link" },
    { key: "secondaryCtaText", label: "Secondary CTA", kind: "text" },
    { key: "secondaryCtaUrl", label: "Secondary CTA link (shoppers see the button only once it has a link)", kind: "link" },
    { key: "metaText", label: "Meta text next to CTA (e.g. format · pages)", kind: "text" },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
  ],
  ImageBannerSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Headline", kind: "text" },
    { key: "body", label: "Body", kind: "textarea", rows: 3 },
    { key: "imageUrl", label: "Desktop image", kind: "image" },
    { key: "mobileImageUrl", label: "Mobile image (optional)", kind: "image" },
    { key: "imageAlt", label: "Image alt text", kind: "text" },
    { key: "height", label: "Banner height", kind: "select", options: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
      { value: "full", label: "Full screen" },
    ] },
    { key: "contentPosition", label: "Content position", kind: "select", options: [
      { value: "top-left", label: "Top left" },
      { value: "top-center", label: "Top center" },
      { value: "top-right", label: "Top right" },
      { value: "center-left", label: "Center left" },
      { value: "center-center", label: "Center" },
      { value: "center-right", label: "Center right" },
      { value: "bottom-left", label: "Bottom left" },
      { value: "bottom-center", label: "Bottom center" },
      { value: "bottom-right", label: "Bottom right" },
    ] },
    { key: "textAlign", label: "Text alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "overlayOpacity", label: "Overlay darkness", kind: "range", min: 0, max: 0.9, step: 0.05 },
    { key: "ctaText", label: "Primary CTA label", kind: "text" },
    { key: "ctaUrl", label: "Primary CTA link", kind: "link" },
    { key: "secondaryCtaText", label: "Secondary CTA label", kind: "text" },
    { key: "secondaryCtaUrl", label: "Secondary CTA link", kind: "link" },
    { key: "accentColor", label: "Accent color", kind: "color" },
  ],
  FeatureGridSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "columns", label: "Columns", kind: "range", min: 2, max: 4 },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "accentColor", label: "Accent color", kind: "color" },
  ],
  TestimonialsSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "accentColor", label: "Accent color", kind: "color" },
  ],
  FAQSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "accentColor", label: "Accent color", kind: "color" },
  ],
  NewsletterSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea", rows: 3 },
    { key: "placeholder", label: "Input placeholder", kind: "text" },
    { key: "buttonLabel", label: "Button label", kind: "text" },
    { key: "successMessage", label: "Message after signing up", kind: "text" },
    { key: "errorMessage", label: "Message when the email isn't valid", kind: "text" },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
  ],
  TextContentSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "text" },
    { key: "content", label: "Content", kind: "richtext" },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    {
      key: "maxWidth",
      label: "Max width",
      kind: "select",
      options: [
        { value: "narrow", label: "Narrow" },
        { value: "normal", label: "Normal" },
        { value: "wide", label: "Wide" },
        { value: "full", label: "Full" },
      ],
    },
    { key: "accentColor", label: "Accent color", kind: "color" },
  ],
  ImageWithTextSection: [
    { key: "imageAlt", label: "Image description (alt text)", kind: "text" },
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "body", label: "Body", kind: "textarea", rows: 4 },
    { key: "imageUrl", label: "Image", kind: "image" },
    {
      key: "layout",
      label: "Layout",
      kind: "select",
      options: [
        { value: "image-left", label: "Image left" },
        { value: "text-left", label: "Text left" },
      ],
    },
    { key: "ctaText", label: "CTA label", kind: "text" },
    { key: "ctaUrl", label: "CTA link", kind: "link" },
    { key: "accentColor", label: "Accent", kind: "color" },
  ],
  RichTextSection: [
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "html", label: "Content", kind: "richtext" },
  ],
  MarqueeSection: [
    { key: "text", label: "Text", kind: "text" },
    { key: "separator", label: "Separator", kind: "text" },
    { key: "speed", label: "Scroll duration", kind: "range", min: 5, max: 120, step: 1, suffix: "s" },
    { key: "fontSize", label: "Font size", kind: "range", min: 10, max: 120, step: 1, suffix: "px" },
    { key: "bold", label: "Bold", kind: "toggle", defaultValue: true },
    { key: "fontWeight", label: "Font weight override", kind: "number", min: 100, max: 900, step: 100 },
    { key: "letterSpacing", label: "Letter spacing (em)", kind: "number", min: 0, max: 0.5, step: 0.02 },
    { key: "uppercase", label: "Uppercase", kind: "toggle", defaultValue: true },
    { key: "background", label: "Background color", kind: "color" },
    { key: "color", label: "Text color", kind: "color" },
  ],
  MulticolumnSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "columns", label: "Columns", kind: "range", min: 2, max: 6 },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
  ],
  SlideshowSection: [
    { key: "slideTextColor", label: "Slide text & dots colour", kind: "color" },
    { key: "prevAria", label: "Previous-slide button label (screen readers)", kind: "text" },
    { key: "nextAria", label: "Next-slide button label (screen readers)", kind: "text" },
    { key: "dotAria", label: "Slide dot label (screen readers, {n} = slide number)", kind: "text" },
    { key: "autoplay", label: "Autoplay", kind: "toggle" },
    { key: "autoplaySpeed", label: "Autoplay speed (ms)", kind: "number", min: 2000, max: 15000, step: 250 },
  ],
  VideoSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "videoUrl", label: "Video (YouTube, Vimeo, MP4)", kind: "video" },
    { key: "posterUrl", label: "Poster image", kind: "image" },
    { key: "accentColor", label: "Accent color", kind: "color" },
  ],
  LogoListSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "text" },
  ],
  CollapsibleSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
  ],
  CollectionListSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "columns", label: "Columns", kind: "range", min: 2, max: 5 },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
  ],
  FeaturedProductSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "productSlug", label: "Book", kind: "book", empty: "Blank = the first book in the shop" },
    { key: "ctaText", label: "CTA label", kind: "text" },
    { key: "accentColor", label: "Accent", kind: "color" },
  ],
  ProductGridHeaderSection: [
    { key: "title", label: "Masthead title", kind: "text" },
    { key: "navText", label: "Navigation text", kind: "text" },
    { key: "cartLabel", label: "Cart label", kind: "text" },
    { key: "cartTotalText", label: "Cart total text", kind: "text" },
    ...bookSourceFields("Which books"),
    { key: "productLimit", label: "Product limit", kind: "range", min: 1, max: 24, step: 1 },
    { key: "columnsDesktop", label: "Desktop columns", kind: "range", min: 2, max: 6, step: 1 },
    { key: "columnsMobile", label: "Mobile columns", kind: "range", min: 1, max: 3, step: 1 },
    { key: "gridGap", label: "Column gap", kind: "range", min: 8, max: 72, step: 2, suffix: "px" },
    { key: "rowGap", label: "Row gap", kind: "range", min: 24, max: 120, step: 2, suffix: "px" },
    { key: "imageAspectRatio", label: "Image aspect ratio", kind: "select", options: PHOTO_RATIO_OPTIONS },
    { key: "imageFit", label: "Image fit", kind: "select", options: [
      { value: "cover", label: "Cover" },
      { value: "contain", label: "Contain" },
    ] },
    { key: "focalX", label: "Image focal X", kind: "range", min: 0, max: 100, step: 1, suffix: "%" },
    { key: "focalY", label: "Image focal Y", kind: "range", min: 0, max: 100, step: 1, suffix: "%" },
    { key: "mastheadDesktop", label: "Masthead desktop", kind: "range", min: 28, max: 96, step: 1, suffix: "px" },
    { key: "mastheadMobile", label: "Masthead mobile", kind: "range", min: 24, max: 72, step: 1, suffix: "px" },
    { key: "navGap", label: "Navigation gap", kind: "range", min: 8, max: 80, step: 2, suffix: "px" },
    { key: "headerRuleWidth", label: "Rule thickness", kind: "range", min: 0, max: 8, step: 1, suffix: "px" },
    { key: "backgroundColor", label: "Background", kind: "color" },
    { key: "textColor", label: "Text color", kind: "color" },
    { key: "ruleColor", label: "Rule color", kind: "color" },
    { key: "badgeColor", label: "Badge color", kind: "color" },
    { key: "badgeTextColor", label: "Badge text color", kind: "color" },
    { key: "titleTransform", label: "Product title case", kind: "select", options: [
      { value: "none", label: "Natural" },
      { value: "uppercase", label: "Uppercase" },
      { value: "capitalize", label: "Capitalize" },
    ] },
    { key: "showPrices", label: "Show prices", kind: "toggle", defaultValue: true },
    { key: "showBadges", label: "Show sale/new badges", kind: "toggle", defaultValue: true },
    { key: "saleLabel", label: "Sale badge text", kind: "text" },
  ],

  BlogPostsSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "columns", label: "Columns", kind: "range", min: 1, max: 4, step: 1 },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "showDates", label: "Show dates", kind: "toggle", defaultValue: true },
    { key: "showExcerpts", label: "Show excerpts", kind: "toggle", defaultValue: true },
    { key: "ctaText", label: "CTA label", kind: "text" },
    { key: "accentColor", label: "Accent color", kind: "color" },
  ],
  CountdownSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "text" },
    { key: "targetDate", label: "Ends at (shop time, Toronto)", kind: "date" },
    { key: "ctaText", label: "CTA label", kind: "text" },
    { key: "ctaUrl", label: "CTA link", kind: "link" },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "accentColor", label: "Accent", kind: "color" },
    { key: "labelDays", label: "Label: days", kind: "text" },
    { key: "labelHours", label: "Label: hours", kind: "text" },
    { key: "labelMinutes", label: "Label: minutes", kind: "text" },
    { key: "labelSeconds", label: "Label: seconds", kind: "text" },
  ],
  ContactFormSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "text" },
    { key: "buttonLabel", label: "Button label", kind: "text" },
    { key: "sendingLabel", label: "Button label while sending", kind: "text" },
    { key: "successMessage", label: "Thank-you message", kind: "text" },
    { key: "errorMessage", label: "Error message (if sending fails)", kind: "text" },
    { key: "showPhone", label: "Show phone field", kind: "toggle" },
    { key: "showSubject", label: "Show subject field", kind: "toggle" },
    { key: "namePlaceholder", label: "Name field placeholder", kind: "text" },
    { key: "emailPlaceholder", label: "Email field placeholder", kind: "text" },
    { key: "phonePlaceholder", label: "Phone field placeholder", kind: "text" },
    { key: "subjectPlaceholder", label: "Subject field placeholder", kind: "text" },
    { key: "messagePlaceholder", label: "Message field placeholder", kind: "text" },
    { key: "accentColor", label: "Accent", kind: "color" },
  ],
  MapSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "address", label: "Address", kind: "text" },
  ],
  GallerySection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle / Description", kind: "textarea", rows: 2 },
    { key: "columns", label: "Columns", kind: "range", min: 2, max: 6 },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
  ],
  CustomHTMLSection: [
    { key: "html", label: "HTML", kind: "html" },
    { key: "fullBleed", label: "Full bleed (no padding)", kind: "toggle" },
  ],
  RowSection: [
    { key: "title", label: "Title (optional)", kind: "text" },
    {
      key: "layout",
      label: "Column layout",
      kind: "select",
      options: [
        { value: "50-50", label: "50 / 50" },
        { value: "33-67", label: "33 / 67" },
        { value: "67-33", label: "67 / 33" },
        { value: "thirds", label: "3 columns" },
        { value: "quarters", label: "4 columns" },
      ],
    },
    { key: "gap", label: "Column gap", kind: "range", min: 8, max: 120, step: 4, suffix: "px" },
    {
      key: "verticalAlign",
      label: "Vertical alignment",
      kind: "select",
      options: [
        { value: "top", label: "Top" },
        { value: "center", label: "Center" },
        { value: "bottom", label: "Bottom" },
      ],
    },
  ],
  VideoHeroSection: [
    { key: "videoUrl", label: "Video (YouTube, Vimeo or MP4)", kind: "video" },
    { key: "overlayOpacity", label: "Overlay opacity", kind: "range", min: 0, max: 90, step: 5, suffix: "%" },
    { key: "headline", label: "Headline", kind: "text" },
    { key: "subheadline", label: "Subheadline", kind: "text" },
    { key: "ctaText", label: "CTA label", kind: "text" },
    { key: "ctaLink", label: "CTA link", kind: "link" },
    {
      key: "textAlign",
      label: "Text alignment",
      kind: "select",
      options: [
        { value: "center", label: "Center" },
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ],
    },
    {
      key: "minHeight",
      label: "Min height",
      kind: "select",
      options: [
        { value: "50vh", label: "50vh" },
        { value: "60vh", label: "60vh" },
        { value: "70vh", label: "70vh" },
        { value: "80vh", label: "80vh" },
        { value: "100vh", label: "100vh (full screen)" },
      ],
    },
  ],
  StatsCounterSection: [
    { key: "sectionTitle", label: "Section title", kind: "text" },
    { key: "backgroundColor", label: "Background color", kind: "color" },
  ],
  PricingTableSection: [
    { key: "sectionTitle", label: "Section title", kind: "text" },
    { key: "sectionSubtitle", label: "Section subtitle", kind: "text" },
    { key: "highlightPlan", label: "Highlighted plan name", kind: "text" },
    { key: "highlightLabel", label: "Highlight badge text", kind: "text" },
  ],
  ProductCoverCarouselSection: [
    { key: "title", label: "Wordmark headline", kind: "text" },
    { key: "tagline", label: "Tagline", kind: "textarea", rows: 2 },
    { key: "titleItalic", label: "Italic headline", kind: "toggle" },
    ...bookSourceFields("Which book covers"),
    { key: "productLimit", label: "Max covers", kind: "range", min: 1, max: 24, step: 1 },
    { key: "autoplayMs", label: "Auto-advance speed (ms)", kind: "number", min: 2000, max: 15000, step: 250 },
    { key: "showDots", label: "Show dots", kind: "toggle", defaultValue: true },
    { key: "scrimOpacity", label: "Bottom scrim darkness", kind: "range", min: 0, max: 1, step: 0.05 },
    { key: "taglineColor", label: "Tagline color", kind: "color" },
    { key: "colorOverlay", label: "Color overlay", kind: "color" },
    { key: "colorOverlayOpacity", label: "Color overlay opacity", kind: "range", min: 0, max: 1, step: 0.05 },
    { key: "colorOverlayBlend", label: "Blend overlay into covers (duotone)", kind: "toggle" },
    { key: "grainOpacity", label: "Film grain", kind: "range", min: 0, max: 1, step: 0.05 },
    { key: "height", label: "Height", kind: "select", options: [
      { value: "punk", label: "Tall (88vh, capped)" },
      { value: "full", label: "Full screen" },
      { value: "medium", label: "70vh" },
    ] },
    { key: "ctaText", label: "CTA label (optional)", kind: "text" },
    { key: "ctaUrl", label: "CTA link", kind: "link" },
  ],
  ProductShowcaseGridSection: [
    { key: "eyebrow", label: "Eyebrow label", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    ...bookSourceFields("Which books"),
    { key: "productLimit", label: "Product limit", kind: "range", min: 1, max: 24, step: 1 },
    { key: "columnsDesktop", label: "Desktop columns", kind: "range", min: 1, max: 4, step: 1 },
    { key: "columnsMobile", label: "Mobile columns", kind: "range", min: 1, max: 2, step: 1 },
    { key: "imageAspectRatio", label: "Cover aspect ratio", kind: "select", options: PHOTO_RATIO_OPTIONS },
    { key: "showCategoryTag", label: "Show category tag", kind: "toggle", defaultValue: true },
    { key: "showQuickAdd", label: "Show quick-add button", kind: "toggle", defaultValue: true },
    { key: "showPrices", label: "Show prices", kind: "toggle", defaultValue: true },
    { key: "showFormatLine", label: "Show format line", kind: "toggle", defaultValue: true },
    { key: "overlayColor", label: "Cover color overlay", kind: "color" },
    { key: "overlayOpacity", label: "Overlay opacity", kind: "range", min: 0, max: 1, step: 0.02 },
    { key: "overlayBlend", label: "Blend overlay into covers (duotone)", kind: "toggle" },
    { key: "grainOpacity", label: "Film grain", kind: "range", min: 0, max: 1, step: 0.05 },
    { key: "tagBg", label: "Tag background", kind: "color" },
    { key: "tagText", label: "Tag text color", kind: "color" },
  ],
  StaffNotesTableSection: [
    { key: "title", label: "Title", kind: "text" },
    { key: "backgroundColor", label: "Background color", kind: "color" },
    { key: "showCategory", label: "Show category column", kind: "toggle", defaultValue: true },
    { key: "showFormat", label: "Show format column", kind: "toggle", defaultValue: true },
    { key: "colTitleLabel", label: "Title column label", kind: "text" },
    { key: "colCategoryLabel", label: "Category column label", kind: "text" },
    { key: "colFormatLabel", label: "Format column label", kind: "text" },
    { key: "colNoteLabel", label: "Note column label", kind: "text" },
    { key: "fallbackLimit", label: "Books shown when no notes are added", kind: "range", min: 1, max: 24, step: 1 },
  ],
  FeaturedCollectionSection: [
    { key: "eyebrow", label: "Small label above the title", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "productCategory", label: "Shop category", kind: "category", empty: "Blank = every book" },
    { key: "productSort", label: "Order", kind: "select", options: BOOK_SORT_OPTIONS },
    { key: "productLimit", label: "How many books", kind: "range", min: 1, max: 12, step: 1 },
    { key: "columnsDesktop", label: "Columns · desktop", kind: "range", min: 2, max: 6, step: 1 },
    { key: "columnsMobile", label: "Columns · phone", kind: "range", min: 1, max: 3, step: 1 },
    { key: "showPrices", label: "Show prices", kind: "toggle", defaultValue: true },
    { key: "viewAllText", label: "“View all” link text (blank = no link)", kind: "text" },
    { key: "align", label: "Title alignment", kind: "select", options: ALIGN_OPTIONS },
  ],
  BookSpotlightSection: [
    { key: "eyebrow", label: "Small label above the title", kind: "text" },
    { key: "productSlug", label: "Book", kind: "book", empty: "Blank = the book on a book page, else the first book" },
    { key: "quote", label: "Line of praise (optional)", kind: "textarea", rows: 3 },
    { key: "quoteSource", label: "Who said it", kind: "text" },
    { key: "showDescription", label: "Show the book's description", kind: "toggle", defaultValue: true },
    { key: "showPrice", label: "Show the price", kind: "toggle", defaultValue: true },
    { key: "ctaText", label: "Button text", kind: "text" },
    { key: "imagePosition", label: "Cover position", kind: "select", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] },
    { key: "accentColor", label: "Accent colour", kind: "color" },
  ],
  PraiseQuotesSection: [
    { key: "eyebrow", label: "Small label above the title", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "layout", label: "Layout", kind: "select", options: [{ value: "stacked", label: "One under another" }, { value: "grid", label: "Grid of cards" }] },
    { key: "quoteSize", label: "Quote size", kind: "select", options: [{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }] },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "accentColor", label: "Quote mark colour", kind: "color" },
  ],
  ImageCollageSection: [
    { key: "title", label: "Title (optional)", kind: "text" },
    { key: "layout", label: "Layout", kind: "select", options: [{ value: "mosaic", label: "Mosaic (one big, the rest small)" }, { value: "stagger", label: "Staggered row" }, { value: "strip", label: "Even strip" }] },
    { key: "gap", label: "Space between pictures", kind: "range", min: 0, max: 48, step: 2, suffix: "px" },
    { key: "showCaptions", label: "Show captions", kind: "toggle", defaultValue: true },
  ],
  PromoStripSection: [
    { key: "text", label: "Text", kind: "text" },
    { key: "linkText", label: "Link text (optional)", kind: "text" },
    { key: "linkUrl", label: "Link", kind: "link" },
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "size", label: "Text size", kind: "select", options: [{ value: "xs", label: "Extra small" }, { value: "sm", label: "Small" }, { value: "md", label: "Medium" }] },
  ],
  NewsletterPopupSection: [
    { key: "imageUrl", label: "Picture (optional)", kind: "image" },
    { key: "imageAlt", label: "Picture description", kind: "text" },
    { key: "eyebrow", label: "Small label above the title", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Invitation text", kind: "textarea", rows: 3 },
    { key: "placeholder", label: "Email box hint", kind: "text" },
    { key: "buttonLabel", label: "Button text", kind: "text" },
    { key: "successMessage", label: "Message after signing up", kind: "text" },
    { key: "errorMessage", label: "Message when the email isn't valid", kind: "text" },
    { key: "smallPrint", label: "Small print (optional)", kind: "text" },
  ],
  StickyAddToBagSection: [
    { key: "ctaText", label: "Button text", kind: "text" },
    { key: "optionsText", label: "Button text when the shopper must choose an edition or option", kind: "text" },
    { key: "soldOutText", label: "Text when sold out", kind: "text" },
    { key: "addedText", label: "Message after adding (read aloud by screen readers)", kind: "text" },
    { key: "showPrice", label: "Show the price", kind: "toggle", defaultValue: true },
    { key: "showOnPhonesOnly", label: "Only on phones and tablets", kind: "toggle" },
  ],
  EphemeraRowSection: [
    { key: "align", label: "Alignment", kind: "select", options: ALIGN_OPTIONS },
    { key: "gap", label: "Object gap", kind: "range", min: 8, max: 80, step: 4, suffix: "px" },
    { key: "ephemeraInkColor", label: "Ink colour (barcodes, spine shading)", kind: "color" },
    { key: "ephemeraFilmColor", label: "Film negative base colour", kind: "color" },
    { key: "ephemeraPaperColor", label: "Ticket colour (when a block has none)", kind: "color" },
  ],
};

/** A field's numeric limits: its own min/max for number and range fields, else the fallback (0–240 px spacing). */
export function fieldBounds(field: SectionFieldSchema, fallback = { min: 0, max: 240 }): { min: number; max: number } {
  if (field.kind !== "number" && field.kind !== "range") return fallback;
  return { min: field.min ?? fallback.min, max: field.max ?? fallback.max };
}

export function getSectionFields(type: string): SectionFieldSchema[] {
  return SECTION_FIELDS[type] || [];
}

export function SectionFieldEditor({
  field,
  value,
  onChange,
  uploadFile,
  settings,
  onPatch,
}: {
  field: SectionFieldSchema;
  value: any;
  onChange: (v: any) => void;
  uploadFile?: (file: File) => Promise<string>;
  // Full section settings + a sibling-key patcher, used only by `kind: "image"`
  // for the companion `${field.key}__suffix` image-style keys (focal point,
  // fit, filter, overlay, hover zoom). Optional — omitting them just hides
  // the "Image style" panel, the plain URL field still works.
  settings?: any;
  onPatch?: (patch: Record<string, any>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const media = useMediaPicker();

  const labelEl = (
    <label className="text-[9px] font-black tracking-[0.25em] text-neutral-400 uppercase block mb-1.5">
      {field.label}
    </label>
  );

  if (isPickerKind(field.kind)) {
    const picker = field as PickerFieldSchema;
    return <PickerField kind={picker.kind} label={picker.label} value={value} onChange={onChange} emptyText={picker.empty} />;
  }

  switch (field.kind) {
    case "text":
      return (
        <div>
          {labelEl}
          <input aria-label={field.label}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
          />
        </div>
      );
    case "textarea":
    case "html":
      return (
        <div>
          {labelEl}
          <textarea aria-label={field.label}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={field.kind === "html" ? 6 : (field as any).rows || 3}
            className={`w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400 resize-none ${
              field.kind === "html" ? "font-mono" : ""
            }`}
          />
        </div>
      );
    case "richtext":
      return (
        <div>
          {labelEl}
          <RichTextEditor
            value={value || ""}
            onChange={onChange}
            uploadFile={uploadFile}
            placeholder="Write content here..."
          />
        </div>
      );
    case "color":
      return (
        <div>
          {labelEl}
          <ColorField label={field.label} value={value} onChange={onChange} tidy />
        </div>
      );
    case "number":
      return (
        <div>
          {labelEl}
          <input aria-label={field.label}
            type="number"
            value={value ?? ""}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
          />
        </div>
      );
    case "range": {
      // Unset = the theme/section default applies; show that instead of pretending it is the minimum.
      const unset = value === undefined || value === null || value === "";
      const current = unset ? field.min : value;
      return (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            {labelEl}
            <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-lg mb-1.5">
              {unset ? "Default" : <>{current}{field.suffix || ""}</>}
            </span>
          </div>
          <input aria-label={field.label}
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={current}
            onChange={(e) => onChange(Number(e.target.value))}
            className={`w-full accent-blue-600 h-1.5 bg-neutral-200 rounded-full appearance-none cursor-pointer${unset ? " opacity-50" : ""}`}
          />
        </div>
      );
    }
    case "select":
      return (
        <div>
          {labelEl}
          <select aria-label={field.label}
            value={selectValue(field.options, value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
          >
            {needsDefaultOption(field.options, value) && <option value="" disabled>{UNSET_OPTION_LABEL}</option>}
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case "toggle": {
      const on = Boolean(value ?? (field as any).defaultValue);
      return (
        <div className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl px-3 py-2">
          <span className="text-[11px] font-bold text-neutral-700">{field.label}</span>
          <button
            type="button"
            role="switch" aria-checked={on} aria-label={field.label}
            onClick={() => onChange(!on)}
            className={`w-10 h-5 rounded-full relative transition-all ${on ? "bg-blue-600" : "bg-neutral-200"}`}
          >
            <span
              className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${on ? "left-6" : "left-1"}`}
            />
          </button>
        </div>
      );
    }
    case "date":
      return (
        <div>
          {labelEl}
          <input aria-label={field.label}
            type="datetime-local"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400"
          />
        </div>
      );
    case "image":
      return (
        <div>
          {labelEl}
          {value && (
            <div className="aspect-video w-full mb-2 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100">
              <img src={value} className="w-full h-full object-cover" alt="" />
            </div>
          )}
          <input aria-label={field.label}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://… or upload"
            className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-blue-400 mb-1.5"
          />
          <input aria-label={field.label}
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || (!uploadFile && !media)) return;
              setUploading(true);
              setUploadError("");
              try {
                await uploadIntoField(media, f, { fieldKey: field.key, record: settings, onPatch, onChange, uploadFile });
              } catch (err) {
                setUploadError(uploadErrorMessage(err));
              } finally {
                setUploading(false);
              }
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full text-[10px] font-bold uppercase tracking-widest py-2 border border-neutral-200 rounded-xl hover:bg-neutral-50 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
          >
            <ImageIcon size={11} />
            {uploading ? "Uploading…" : "Upload image"}
          </button>
          <MediaLibraryButton fieldKey={field.key} label={field.label} record={settings} onPatch={onPatch} onChange={onChange} />
          {uploadError && <p role="alert" className="studio-upload-error mt-1 text-[11px]">{uploadError}</p>}
          {onPatch && (
            <div className="mt-2">
              <ImageStyleControls fieldKey={field.key} record={settings} onPatch={onPatch} imageUrl={value} />
            </div>
          )}
        </div>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Templates registry
// ─────────────────────────────────────────────────────────────────────────────

export type PreviewModeId =
  | "homepage"
  | "shop"
  | "product"
  | "collection"
  | "page"
  | "cart"
  | "wishlist"
  | "account"
  | "tracking";

export type PageTemplateMeta = {
  id: string;
  label: string;
  description: string;
  previewMode: PreviewModeId;
  /** Set on per-page templates ("page:<slug>") so the preview opens that page. */
  pageSlug?: string;
};

export const PAGE_TEMPLATES: PageTemplateMeta[] = [
  { id: "heroPage", label: "Home", description: "Sections shown on the storefront homepage.", previewMode: "homepage" },
  { id: "storefront", label: "Catalog / Shop", description: "Sections for the product catalog page.", previewMode: "shop" },
  { id: "productPage", label: "Product", description: "Sections shown on individual product pages.", previewMode: "product" },
  { id: "collectionPage", label: "Collection", description: "Sections for category/collection pages.", previewMode: "collection" },
  { id: "cartPage", label: "Cart", description: "Sections shown on the cart drawer/page.", previewMode: "cart" },
  { id: "page", label: "Custom Pages", description: "Default sections for editorial/custom pages.", previewMode: "page" },
  { id: "page404", label: "404", description: "Sections shown when a URL is not found.", previewMode: "homepage" },
  { id: "wishlistPage", label: "Wishlist", description: "Saved books and wishlist sections.", previewMode: "wishlist" },
  { id: "accountPage", label: "Customer account", description: "Sign-in, profile and order-history sections.", previewMode: "account" },
  { id: "trackingPage", label: "Order tracking", description: "Order lookup and tracking sections.", previewMode: "tracking" },
];

/**
 * Static page templates plus one dynamic template per published custom page
 * ("page:<slug>"). A per-page template's sections are stored at
 * `design["page:<slug>"].sections`; the storefront (`PageView`) renders them
 * when present and falls back to the shared `design.page.sections` otherwise —
 * fully backward compatible.
 */
export function buildPageTemplates(pages: any[], options: { includeDrafts?: boolean } = {}): PageTemplateMeta[] {
  // Studio also lists unpublished pages, so their sections can be designed before they go live.
  const pageTemplates = (pages || [])
    .filter((p: any) => p?.slug && (p?.status === "published" || options.includeDrafts))
    .map((p: any) => ({
      id: `page:${p.slug}`,
      label: p.status === "published" ? p.title || p.slug : `${p.title || p.slug} (draft)`,
      description: `Sections for the "${p.title || p.slug}" page (overrides Custom Pages when set).`,
      previewMode: "page" as PreviewModeId,
      pageSlug: p.slug,
    }));
  return [...PAGE_TEMPLATES, ...pageTemplates];
}
