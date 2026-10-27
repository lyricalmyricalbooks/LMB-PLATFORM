// Homepage layout templates — full curated section arrangements, one click.

export type HomeLayoutTemplate = {
  id: string;
  name: string;
  description: string;
  sections: { type: string; settings?: Record<string, any> }[];
};

export const HOME_LAYOUT_TEMPLATES: HomeLayoutTemplate[] = [
  {
    id: "lyricalmyrical-riso-noir",
    name: "Lyricalmyrical Riso Noir",
    description: "Black-and-white print-shop homepage: cover carousel, flare marquee, product grid, print-room notes and newsletter.",
    sections: [
      { type: "ProductCoverCarouselSection", settings: { title: "Books for looking / books for keeping", tagline: "Independent photography and art publishing from Toronto." } },
      { type: "MarqueeSection", settings: { text: "SMALL RUNS  /  LOUD INK  /  INDEPENDENT PUBLISHING", separator: "✦", speed: 28, fontSize: 13, bold: true, fontWeight: 900, letterSpacing: 0.18, uppercase: true, background: "#e8402a", color: "#100f0d" } },
      { type: "ProductShowcaseGridSection", settings: { title: "Fresh off the press" } },
      { type: "StaffNotesTableSection", settings: { title: "From the print room", backgroundColor: "#0d0d0d" } },
      { type: "NewsletterSection", settings: { title: "Ink in your inbox", description: "New books, studio notes and edition alerts. No filler." } },
    ],
  },
  {
    id: "lyricalmyrical-riso",
    name: "Lyricalmyrical Riso",
    description: "A print-led storefront with a bold cover carousel, overprint-colored marquee, catalog grid and editorial notes.",
    sections: [
      { type: "ProductCoverCarouselSection", settings: { title: "Books for looking / books for keeping", tagline: "Independent photography and art publishing from Toronto." } },
      { type: "MarqueeSection", settings: { text: "SMALL RUNS  /  LOUD INK  /  INDEPENDENT PUBLISHING", separator: "✦", speed: 28, fontSize: 13, bold: true, fontWeight: 900, letterSpacing: 0.18, uppercase: true, background: "#100f0d", color: "#faf6ec" } },
      { type: "ProductShowcaseGridSection", settings: { title: "Fresh off the press" } },
      { type: "StaffNotesTableSection", settings: { title: "From the print room", backgroundColor: "#f0e9da" } },
      { type: "NewsletterSection", settings: { title: "Ink in your inbox", description: "New books, studio notes and edition alerts. No filler." } },
    ],
  },
  {
    id: "lyricalmyrical-punk",
    name: "Lyricalmyrical Punk",
    description: "Book-cover carousel hero, scrolling marquee, releases grid, staff notes table and a featured release banner.",
    sections: [
      // The homepage header is fixed/transparent, so the full-bleed carousel
      // leads and the marquee strip sits below it (a first-section marquee
      // would collide with the header).
      { type: "ProductCoverCarouselSection", settings: {
        title: "Lyricalmyrical Books",
        tagline: "An independent publishing house based in Toronto, specializing in contemporary photography and art books.",
      } },
      { type: "MarqueeSection", settings: {
        text: "INDEPENDENT PUBLISHING HOUSE SPECIALIZING IN CONTEMPORARY PHOTOGRAPHY AND EPHEMERA",
        separator: "", speed: 24, fontSize: 11, bold: false, fontWeight: 600, letterSpacing: 0.14, uppercase: true,
        background: "#141219", color: "rgba(243,241,238,0.56)",
      } },
      { type: "ProductShowcaseGridSection", settings: { title: "Recent Releases" } },
      { type: "StaffNotesTableSection", settings: { title: "Staff Notes", backgroundColor: "#0c0b12" } },
      { type: "HeroSection", settings: {
        eyebrow: "FEATURED RELEASE", title: "Roadkill", titleItalic: true,
        subtitle: "Photographs taken along secondary highways — a document of what gets left behind.",
        ctaText: "SHOP NOW", metaText: "Softcover · 112pp", height: "medium", align: "left",
        overlayOpacity: 0.55, textTransform: "none", headingWeight: 600,
      } },
    ],
  },
  {
    id: "lyricalmyrical-about",
    name: "Lyricalmyrical About",
    description: "Jumbo centered headline, ephemera object row, 'Why this exists' columns and a photo + contact block — apply on an About page template.",
    sections: [
      { type: "TextContentSection", settings: {
        title: "About", align: "center", headingSize: 96, headingWeight: 800, content: "",
      } },
      { type: "EphemeraRowSection", settings: { align: "center" } },
      { type: "RowSection", settings: { layout: "33-67", gap: 48, verticalAlign: "top", items: [
        { kind: "text", title: "WHY THIS EXISTS", body: "" },
        { kind: "text", title: "", body: "Lyricalmyrical Books is an independent imprint publishing contemporary photography and art books in small, considered runs. We care more about ink, paper, and sequence than trends. Independently run out of Toronto, and updated whenever there's something worth printing." },
      ] } },
      { type: "ImageWithTextSection", settings: {
        eyebrow: "CONTACT", title: "Got a manuscript, a proposal, or a question about an order?",
        body: "Toronto, Canada", ctaText: "Email us", ctaUrl: "mailto:lyricalmyricalbooks@gmail.com", layout: "image-left",
      } },
    ],
  },
  {
    id: "lyricalmyrical-journal",
    name: "Lyricalmyrical Journal",
    description: "Jumbo centered headline plus editorial article cards — apply on a Journal page template.",
    sections: [
      { type: "TextContentSection", settings: {
        title: "Journal", align: "center", headingSize: 96, headingWeight: 800,
        content: "Essays, studio notes, and press.",
      } },
      { type: "BlogPostsSection", settings: { eyebrow: "", title: "", columns: 3 } },
    ],
  },
  {
    id: "editorial-launch",
    name: "Editorial Launch",
    description: "Hero, story, featured title, social proof and email capture — a classic publisher homepage.",
    sections: [
      { type: "HeroSection", settings: { title: "THE NEW COLLECTION", subtitle: "Photography & art books", ctaText: "EXPLORE", align: "center", overlayOpacity: 0.5 } },
      { type: "ImageWithTextSection", settings: { eyebrow: "OUR STORY", title: "Independent by design", body: "Tell the story behind your imprint — what you publish and why it matters.", ctaText: "Read more", layout: "image-left" } },
      { type: "FeaturedProductSection", settings: { eyebrow: "FEATURED", ctaText: "View product" } },
      { type: "TestimonialsSection", settings: { title: "WHAT COLLECTORS SAY" } },
      { type: "NewsletterSection", settings: { title: "JOIN THE ARCHIVE", description: "Occasional dispatches about new publications." } },
    ],
  },
  {
    id: "conversion-focused",
    name: "Conversion Focused",
    description: "Promo marquee, collections, benefits and a countdown — built to sell.",
    sections: [
      { type: "HeroSection", settings: { title: "SHOP THE DROP", subtitle: "Limited editions, while they last", ctaText: "SHOP NOW", height: "medium", align: "center" } },
      { type: "MarqueeSection", settings: { text: "Free shipping over $100 · New arrivals weekly", speed: 20, fontSize: 24 } },
      { type: "CollectionListSection", settings: { title: "Shop by collection", columns: 3 } },
      { type: "FeatureGridSection", settings: { title: "WHY SHOP WITH US", columns: 3 } },
      { type: "CountdownSection", settings: { eyebrow: "LIMITED TIME", title: "Sale ends soon", ctaText: "Shop the sale" } },
      { type: "NewsletterSection", settings: { title: "10% OFF YOUR FIRST ORDER", description: "Join the list for the code." } },
    ],
  },
  {
    id: "storyteller",
    name: "Storyteller",
    description: "Slideshow, long-form copy, side-by-side columns, gallery and FAQ — editorial depth.",
    sections: [
      { type: "SlideshowSection", settings: { autoplay: true, autoplaySpeed: 5000 } },
      { type: "TextContentSection", settings: { title: "Our story", content: "Add your mission statement or store introduction here." } },
      { type: "RowSection", settings: { layout: "50-50", gap: 48, items: [
        { kind: "text", title: "Crafted with care", body: "Use rows to pair copy with imagery.", buttonText: "Discover", buttonUrl: "#" },
        { kind: "image", imageUrl: "" },
      ] } },
      { type: "GallerySection", settings: { title: "Gallery", columns: 3 } },
      { type: "FAQSection", settings: { title: "FREQUENTLY ASKED QUESTIONS" } },
      { type: "ContactFormSection", settings: { title: "Get in touch" } },
    ],
  },
  {
    id: "minimal-gallery",
    name: "Minimal Gallery",
    description: "A quiet, image-first page: hero, gallery, one paragraph, email capture.",
    sections: [
      { type: "HeroSection", settings: { title: "F✶M", subtitle: "Photography & art books", ctaText: "ENTER", overlayOpacity: 0.35, align: "center" } },
      { type: "GallerySection", settings: { columns: 3 } },
      { type: "TextContentSection", settings: { title: "", content: "A short statement about your practice." } },
      { type: "NewsletterSection", settings: { title: "STAY IN TOUCH" } },
    ],
  },
];

